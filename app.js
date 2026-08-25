(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    intro:$('intro'), workspace:$('workspace'), appScroll:$('appScroll'), dropzone:$('dropzone'), fileInput:$('fileInput'), replaceBtn:$('replaceBtn'),
    themeIndicator:$('themeIndicator'), previewCanvas:$('previewCanvas'), canvasStage:$('canvasStage'), sampleBubble:$('sampleBubble'),
    imageName:$('imageName'), imageSize:$('imageSize'), colorCount:$('colorCount'), colorCountValue:$('colorCountValue'), detail:$('detail'), detailValue:$('detailValue'),
    analyzeBtn:$('analyzeBtn'), paletteStatus:$('paletteStatus'), paletteStrip:$('paletteStrip'), swatches:$('swatches'), roleGrid:$('roleGrid'), roleMode:$('roleMode'), roleHint:$('roleHint'),
    progressBar:$('progressBar'), progressLabel:$('progressLabel'), log:$('log'), aiBtn:$('aiBtn'), aiBadge:$('aiBadge'), aiOutput:$('aiOutput'),
    exportCode:$('exportCode'), copyBtn:$('copyBtn'), downloadBtn:$('downloadBtn')
  };

  const state = {
    file:null, image:null, imageUrl:null, sourceCanvas:null,
    rawSamples:[], localPalette:[], palette:[], roles:[], exportFormat:'json',
    ai:null, refinement:null, analysisMode:'local'
  };
  const detailNames = {1:'Fast',2:'Balanced',3:'Fine'};
  const roleDefinitions = {
    sky:{name:'Sky / atmosphere', exportKey:'sky_atmosphere'},
    grass_vegetation:{name:'Vegetation / grass', exportKey:'vegetation_grass'},
    terrain_earth:{name:'Earth / terrain', exportKey:'earth_terrain'},
    sunlight_highlight:{name:'Sunlight / highlight', exportKey:'sunlight_highlight'},
    shadow:{name:'Shadow / AO', exportKey:'shadow_ao'},
    water:{name:'Water / cool material', exportKey:'water_cool_material'},
    architecture:{name:'Architecture / structure', exportKey:'architecture_structure'},
    accent:{name:'Accent / signage', exportKey:'accent_signage'}
  };

  function nowTime(){ return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}); }
  function escapeHtml(s){ return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function log(message){ const row=document.createElement('div'); row.className='log-row'; row.innerHTML=`<time>${nowTime()}</time><span>${escapeHtml(message)}</span>`; els.log.prepend(row); }
  function progress(value,label){ els.progressBar.style.width=`${Math.max(0,Math.min(100,value))}%`; els.progressLabel.textContent=label; }
  function waitFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }
  function clamp(v,min=0,max=1){ return Math.max(min,Math.min(max,Number(v))); }

  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  function syncSystemAppearance(){
    const dark=systemTheme.matches;
    document.documentElement.dataset.appearance=dark?'dark':'light';
    els.themeIndicator.textContent='◐';
    els.themeIndicator.setAttribute('aria-label',`Appearance follows iOS: ${dark?'dark':'light'} mode`);
  }
  syncSystemAppearance();
  systemTheme.addEventListener?.('change',syncSystemAppearance);
  els.themeIndicator.addEventListener('click',()=>{
    els.themeIndicator.animate?.([{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
  });

  document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
  document.addEventListener('selectstart',e=>e.preventDefault());

  ['dragenter','dragover'].forEach(evt=>els.dropzone.addEventListener(evt,e=>{e.preventDefault();els.dropzone.classList.add('dragging');}));
  ['dragleave','drop'].forEach(evt=>els.dropzone.addEventListener(evt,e=>{e.preventDefault();els.dropzone.classList.remove('dragging');}));
  els.dropzone.addEventListener('drop',e=>{const f=e.dataTransfer.files?.[0];if(f)loadFile(f);});
  els.fileInput.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)loadFile(f);});
  els.replaceBtn.addEventListener('click',()=>els.fileInput.click());
  els.colorCount.addEventListener('input',()=>els.colorCountValue.textContent=els.colorCount.value);
  els.detail.addEventListener('input',()=>els.detailValue.textContent=detailNames[els.detail.value]);
  els.analyzeBtn.addEventListener('click',()=>analyzeLocal());
  els.aiBtn.addEventListener('click',()=>analyzeWithAI());

  document.querySelectorAll('.export-tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.export-tab').forEach(b=>b.classList.toggle('active',b===btn));
    state.exportFormat=btn.dataset.format;
    renderExport();
  }));
  els.copyBtn.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(els.exportCode.textContent);els.copyBtn.textContent='Copied';setTimeout(()=>els.copyBtn.textContent='Copy',1100);}catch{log('Clipboard permission was unavailable.');}
  });
  els.downloadBtn.addEventListener('click',downloadExport);

  async function loadFile(file){
    if(!file.type.startsWith('image/')){log('That file is not recognized as an image.');return;}
    resetAIState();
    state.file=file;
    if(state.imageUrl)URL.revokeObjectURL(state.imageUrl);
    state.imageUrl=URL.createObjectURL(file);
    const img=new Image();img.decoding='async';img.src=state.imageUrl;
    try{await img.decode();}catch{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});}
    state.image=img;state.sourceCanvas=drawSourceCanvas(img);drawPreview(img);
    els.imageName.textContent=file.name;els.imageSize.textContent=`${img.naturalWidth} × ${img.naturalHeight} · ${formatBytes(file.size)}`;
    els.intro.classList.add('hidden');els.workspace.classList.remove('hidden');
    log(`Loaded ${file.name} (${img.naturalWidth}×${img.naturalHeight}).`);
    await analyzeLocal();
    els.appScroll.scrollTo({top:0,behavior:'smooth'});
  }

  function resetAIState(){
    state.ai=null;state.refinement=null;state.analysisMode='local';
    els.aiBadge.textContent='Optional';els.aiBadge.className='status-pill neutral';
    els.aiOutput.textContent='No AI refinement yet. Local palette extraction works without it.';els.aiOutput.className='ai-output empty-state';
    els.roleMode.textContent='LOCAL';els.roleHint.textContent='Local labels use color + screenshot position heuristics. AI Refinement can remove borders/HUD artifacts and rebuild the palette around the actual game scene.';
  }

  function drawSourceCanvas(img){const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0);return c;}
  function drawPreview(img){const maxW=1000,maxH=600,scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight);const c=els.previewCanvas;c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,c.width,c.height);}
  function formatBytes(n){if(n<1024*1024)return`${(n/1024).toFixed(0)} KB`;return`${(n/1024/1024).toFixed(1)} MB`;}

  els.previewCanvas.addEventListener('pointerdown',e=>{
    const rect=els.previewCanvas.getBoundingClientRect();
    const x=Math.floor((e.clientX-rect.left)*els.previewCanvas.width/rect.width),y=Math.floor((e.clientY-rect.top)*els.previewCanvas.height/rect.height);
    const d=els.previewCanvas.getContext('2d',{willReadFrequently:true}).getImageData(x,y,1,1).data,hex=rgbToHex(d[0],d[1],d[2]);
    const stageRect=els.canvasStage.getBoundingClientRect();
    els.sampleBubble.textContent=`${hex} · rgb(${d[0]}, ${d[1]}, ${d[2]})`;els.sampleBubble.style.left=`${e.clientX-stageRect.left}px`;els.sampleBubble.style.top=`${e.clientY-stageRect.top}px`;els.sampleBubble.classList.remove('hidden');
    clearTimeout(els.sampleBubble._timer);els.sampleBubble._timer=setTimeout(()=>els.sampleBubble.classList.add('hidden'),2200);
  });

  async function analyzeLocal(){
    if(!state.image)return;
    const k=Number(els.colorCount.value),detail=Number(els.detail.value);
    els.analyzeBtn.disabled=true;els.paletteStatus.textContent='Analyzing';
    state.analysisMode='local';state.refinement=null;
    try{
      progress(5,'Sampling');log('Sampling screenshot pixels…');await waitFrame();
      const data=sampleImage(state.image,detail);state.rawSamples=data;
      progress(30,'Converting');log(`Collected ${data.length.toLocaleString()} pixel samples.`);await waitFrame();
      const labSamples=toLabSamples(data);progress(43,'Clustering');log(`Running perceptual k-means with ${k} target colors in CIELAB.`);await waitFrame();
      const clusters=kmeansLab(labSamples,k,11);progress(76,'Classifying');log('Measuring coverage and assigning local scene-role heuristics.');await waitFrame();
      state.palette=clusters.map((c,i)=>decorateCluster(c,i)).sort((a,b)=>b.coverage-a.coverage);state.localPalette=state.palette.map(c=>({...c}));state.roles=inferRoles(state.palette);
      renderAll();progress(100,'Complete');els.paletteStatus.textContent='Measured';els.roleMode.textContent='LOCAL';
      log(`Finished. ${state.palette.length} perceptual colors extracted.`);
    }catch(err){console.error(err);progress(0,'Error');els.paletteStatus.textContent='Error';log(`Analysis failed: ${err.message||err}`);}finally{els.analyzeBtn.disabled=false;}
  }

  function sampleImage(img,detail){
    const maxSide={1:180,2:280,3:380}[detail]||280,scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const d=ctx.getImageData(0,0,w,h).data,out=[];
    const step=detail===1?2:1;
    for(let y=0;y<h;y+=step){for(let x=0;x<w;x+=step){const i=(y*w+x)*4;if(d[i+3]<220)continue;const r=d[i],g=d[i+1],b=d[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);if(max>252&&min>252)continue;out.push({r,g,b,x:x/(w-1||1),y:y/(h-1||1)});}}
    if(out.length>50000){const stride=Math.ceil(out.length/50000);return out.filter((_,i)=>i%stride===0);}return out;
  }
  function toLabSamples(samples){return samples.map(p=>({...p,lab:rgbToLab(p.r,p.g,p.b)}));}

  function kmeansLab(samples,k,iterations){
    if(!samples.length)return[];k=Math.min(k,samples.length);const centers=[];centers.push(samples[Math.floor(samples.length*.37)].lab.slice());
    while(centers.length<k){let best=null,bestD=-1;const stride=Math.max(1,Math.floor(samples.length/5000));for(let i=0;i<samples.length;i+=stride){const s=samples[i];let md=Infinity;for(const c of centers)md=Math.min(md,labDist2(s.lab,c));if(md>bestD){bestD=md;best=s.lab;}}centers.push(best.slice());}
    const assignments=new Int16Array(samples.length);
    for(let it=0;it<iterations;it++){
      const sums=Array.from({length:k},()=>[0,0,0,0]);
      for(let i=0;i<samples.length;i++){const lab=samples[i].lab;let bi=0,bd=Infinity;for(let j=0;j<k;j++){const dd=labDist2(lab,centers[j]);if(dd<bd){bd=dd;bi=j;}}assignments[i]=bi;const s=sums[bi];s[0]+=lab[0];s[1]+=lab[1];s[2]+=lab[2];s[3]++;}
      for(let j=0;j<k;j++){const s=sums[j];if(s[3])centers[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]];}
    }
    const stats=Array.from({length:k},(_,j)=>({lab:centers[j],count:0,r:0,g:0,b:0,top:0,bottom:0}));
    for(let i=0;i<samples.length;i++){const s=samples[i],c=stats[assignments[i]];c.count++;c.r+=s.r;c.g+=s.g;c.b+=s.b;if(s.y<.38)c.top++;if(s.y>.58)c.bottom++;}
    return stats.filter(c=>c.count).map(c=>({lab:c.lab,count:c.count,coverage:c.count/samples.length,r:Math.round(c.r/c.count),g:Math.round(c.g/c.count),b:Math.round(c.b/c.count),topRatio:c.top/c.count,bottomRatio:c.bottom/c.count}));
  }
  function labDist2(a,b){const dl=a[0]-b[0],da=a[1]-b[1],db=a[2]-b[2];return dl*dl+da*da+db*db;}

  function decorateCluster(c,index){const hsl=rgbToHsl(c.r,c.g,c.b);return{...c,index,hex:rgbToHex(c.r,c.g,c.b),hsl,label:genericColorLabel(hsl,c.lab[0])};}
  function genericColorLabel(hsl,L){const[h,s,l]=hsl;if(L<19)return'Near black';if(s<9)return l>78?'Highlight':l<30?'Charcoal':'Neutral';if(h>=185&&h<=250)return l>63?'Sky blue':'Blue';if(h>=80&&h<170)return l<30?'Forest green':'Green';if(h>=35&&h<80)return l>68?'Warm light':'Yellow / sand';if(h<35||h>=345)return l>65?'Warm highlight':'Red / earth';if(h>=170&&h<200)return'Teal';if(h>=250&&h<310)return'Violet';return'Accent';}

  function inferRoles(palette){
    const candidates=palette.slice(),used=new Set(),pick=(scoreFn)=>{let best=null,score=-Infinity;for(const c of candidates){if(used.has(c.hex))continue;const s=scoreFn(c);if(s>score){score=s;best=c;}}if(best)used.add(best.hex);return best;};
    const roles=[];
    const sky=pick(c=>{const[h,s,l]=c.hsl;return(c.topRatio*3)+(h>=175&&h<=250?s/45:0)+(l/100)-Math.max(0,c.bottomRatio-.3);});if(sky)roles.push(makeRole('sky',sky,'Local top-region + blue/cyan likelihood','local'));
    const vegetation=pick(c=>{const[h,s,l]=c.hsl;return(h>=70&&h<=165?s/38:0)+(c.bottomRatio*1.4)+(l<72?.3:0);});if(vegetation)roles.push(makeRole('grass_vegetation',vegetation,'Local green hue + lower-scene likelihood','local'));
    const earth=pick(c=>{const[h,s,l]=c.hsl;return(((h>=15&&h<=70)||h>=340)?s/55:0)+(c.bottomRatio*1.2)+(l<65?.35:0);});if(earth)roles.push(makeRole('terrain_earth',earth,'Local warm terrain + lower-scene likelihood','local'));
    const light=pick(c=>{const[h,s,l]=c.hsl;return(l/50)+(h>=25&&h<=75?s/90:0)+(c.lab[0]/100);});if(light)roles.push(makeRole('sunlight_highlight',light,'Local highest perceptual lightness','local'));
    const shadow=pick(c=>2.2-(c.lab[0]/40)+(c.hsl[2]<35?.5:0));if(shadow)roles.push(makeRole('shadow',shadow,'Local lowest perceptual lightness','local'));
    const water=pick(c=>{const[h,s,l]=c.hsl;return(h>=165&&h<=235?s/45:0)+(c.bottomRatio*.7)+(l<70?.2:0);});if(water)roles.push(makeRole('water',water,'Local cool hue + scene position','local'));
    const neutral=pick(c=>1.5-(c.hsl[1]/25)+(c.coverage*2));if(neutral)roles.push(makeRole('architecture',neutral,'Local low saturation + coverage','local'));
    const accent=pick(c=>(c.hsl[1]/35)+(1-c.coverage));if(accent)roles.push(makeRole('accent',accent,'Local high saturation + low coverage','local'));
    return roles;
  }
  function makeRole(key,color,reason,source='local',confidence=null){const def=roleDefinitions[key]||{name:key,exportKey:slug(key)};return{key,name:def.name,exportKey:def.exportKey,color,reason,source,confidence};}

  function renderAll(){renderPalette();renderRoles();renderExport();}
  function renderPalette(){
    els.paletteStrip.innerHTML='';els.swatches.innerHTML='';
    state.palette.forEach(c=>{
      const seg=document.createElement('button');seg.className='palette-segment';seg.style.background=c.hex;seg.style.flex=Math.max(.035,c.coverage);seg.title=`${c.hex} — ${(c.coverage*100).toFixed(1)}%`;seg.innerHTML=`<span>${(c.coverage*100).toFixed(0)}%</span>`;seg.onclick=()=>copyText(c.hex);els.paletteStrip.appendChild(seg);
      const sw=document.createElement('button');sw.className='swatch';sw.innerHTML=`<div class="swatch-color" style="background:${c.hex}"></div><b>${c.hex}</b><small>${escapeHtml(c.label)} · ${(c.coverage*100).toFixed(1)}%</small>`;sw.onclick=()=>copyText(c.hex);els.swatches.appendChild(sw);
    });
  }
  function renderRoles(){
    els.roleGrid.innerHTML='';
    state.roles.forEach(r=>{const d=document.createElement('div');d.className='role-card';d.title=r.reason;d.innerHTML=`<span class="role-dot" style="background:${r.color.hex}"></span><span><b>${escapeHtml(r.name)}</b><small>${r.color.hex} · ${r.source==='ai'?'AI refined':'local'}${r.confidence!=null?` · ${Math.round(r.confidence)}%`:''}</small></span>`;els.roleGrid.appendChild(d);});
  }
  async function copyText(text){try{await navigator.clipboard.writeText(text);log(`Copied ${text}.`);}catch{log(`Color: ${text}`);}}

  function exportObject(){
    return{
      app:'Chrometry',version:'1.2',mode:state.analysisMode,source:state.file?.name||null,
      image:state.image?{width:state.image.naturalWidth,height:state.image.naturalHeight}:null,
      palette:state.palette.map((c,i)=>({id:i+1,hex:c.hex,rgb:[c.r,c.g,c.b],hsl:c.hsl.map(v=>Math.round(v*10)/10),coverage:Number((c.coverage*100).toFixed(2)),label:c.label})),
      roles:Object.fromEntries(state.roles.map(r=>[r.exportKey,{hex:r.color.hex,source:r.source,confidence:r.confidence??undefined}])),
      refinement:state.refinement||undefined,
      ai:state.ai?{game:state.ai.game,confidence:state.ai.confidence,scene:state.ai.scene,visual_style:state.ai.visual_style,lighting:state.ai.lighting,notes:state.ai.notes}:undefined
    };
  }
  function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
  function renderExport(){
    if(!state.palette.length)return;
    const obj=exportObject();
    if(state.exportFormat==='json'){
      els.exportCode.textContent=JSON.stringify(obj,null,2);
      return;
    }
    if(state.exportFormat==='css'){
      els.exportCode.textContent=`/* Chrometry ${state.analysisMode==='ai-refined'?'AI-refined':'local'} game palette */\n:root {\n${state.roles.map(r=>`  --game-${r.exportKey.replaceAll('_','-')}: ${r.color.hex};`).join('\n')}\n\n${state.palette.map((c,i)=>`  --palette-${i+1}: ${c.hex};`).join('\n')}\n}`;
      return;
    }
    const roleLines=state.roles.map(r=>`  ${r.exportKey}: 0x${r.color.hex.slice(1)},`).join('\n');
    els.exportCode.textContent=`// Chrometry ${state.analysisMode==='ai-refined'?'AI-refined':'local'} palette — Three.js\n// Generated from ${state.file?.name||'screenshot'}\nconst GAME_PALETTE = {\n${roleLines}\n};\n\n// Color-management baseline\nrenderer.outputColorSpace = THREE.SRGBColorSpace;\n\n// Scene environment colors are driven directly by Chrometry roles.\nif (GAME_PALETTE.sky_atmosphere != null) {\n  scene.background = new THREE.Color(GAME_PALETTE.sky_atmosphere);\n}\n\nconst hemi = new THREE.HemisphereLight(\n  GAME_PALETTE.sky_atmosphere ?? 0x87CEEB,\n  GAME_PALETTE.earth_terrain ?? 0x444444,\n  1.35\n);\nscene.add(hemi);\n\nif (GAME_PALETTE.sunlight_highlight != null) {\n  const sun = new THREE.DirectionalLight(GAME_PALETTE.sunlight_highlight, 2.0);\n  sun.position.set(4, 8, 5);\n  scene.add(sun);\n}\n\n// Example material assignment\nconst grassMaterial = new THREE.MeshStandardMaterial({\n  color: GAME_PALETTE.vegetation_grass ?? 0x5F8F45\n});\nconst terrainMaterial = new THREE.MeshStandardMaterial({\n  color: GAME_PALETTE.earth_terrain ?? 0x7A654A\n});`;
  }
  function downloadExport(){if(!state.palette.length)return;const ext=state.exportFormat==='json'?'json':state.exportFormat==='css'?'css':'js',blob=new Blob([els.exportCode.textContent],{type:'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`chrometry-${state.analysisMode}-palette.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  async function analyzeWithAI(){
    if(!state.file||!state.palette.length)return;
    if(!window.puter?.ai?.chat){els.aiOutput.textContent='Puter.js did not load. Check your internet connection and try again.';return;}
    els.aiBtn.disabled=true;els.analyzeBtn.disabled=true;els.aiBadge.textContent='Inspecting';els.aiBadge.className='status-pill';els.aiOutput.className='ai-output';els.aiOutput.textContent='AI is locating the real game scene, checking for borders/HUD contamination, and mapping semantic targets…';
    log('AI Refinement requested. The screenshot will be sent through Puter for scene understanding.');progress(8,'AI vision');
    const paletteText=state.palette.map((c,i)=>`${i+1}. ${c.hex} (${(c.coverage*100).toFixed(1)}%)`).join(', ');
    const prompt=`You are the semantic vision/refinement engine for Chrometry, a game colorimetry tool. Inspect the attached screenshot carefully. The local CIELAB engine measured: ${paletteText}.

Your job is NOT merely to describe the image. You must tell Chrometry which pixels belong to the actual game-world palette and which areas should be ignored before reclustering.

Rules:
1. Identify the actual gameplay/content frame. Black letterbox bars, device/browser borders, accidental screenshot edges, gallery chrome, menus outside the game frame, and obvious capture artifacts are NOT game-world colors.
2. HUD/minimap/subtitle/menu overlays may be visually part of the game but should usually be excluded from the ENVIRONMENT palette unless they are the intended target. Mark them as exclude_regions when they materially contaminate colors.
3. Never remove a dark/black color merely because it is black if it is a real shadow, night sky, object, road, clothing, or world material.
4. Use normalized coordinates 0..1 relative to the full screenshot. Be conservative: if unsure, do not exclude the region.
5. For semantic role colors, sample/estimate actual visible scene colors. A role may be absent; do not invent water, grass, etc.
6. Return ONLY strict JSON. No markdown.

Schema:
{
  "game":"name or Unknown",
  "confidence":0-100,
  "scene":"short description",
  "visual_style":"short description",
  "lighting":"short description",
  "content_region":{"x":0,"y":0,"w":1,"h":1,"confidence":0-100,"reason":"why"},
  "exclude_regions":[{"x":0,"y":0,"w":0,"h":0,"confidence":0-100,"reason":"black border | HUD | menu | capture artifact | other"}],
  "roles":{
    "sky":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""},
    "grass_vegetation":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""},
    "terrain_earth":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""},
    "sunlight_highlight":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""},
    "shadow":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""},
    "water":{"present":false,"hex":null,"confidence":0-100,"reason":""},
    "architecture":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""},
    "accent":{"present":true,"hex":"#RRGGBB","confidence":0-100,"reason":""}
  },
  "notes":["3-5 concise palette recreation notes"]
}`;

    try{
      const result=await puter.ai.chat(prompt,state.file,false);
      progress(45,'Parsing AI');
      const obj=parseAIObject(extractAIText(result));state.ai=normalizeAIPlan(obj);
      await applyAIRefinement(state.ai);
      renderAI(state.ai);renderAll();
      els.aiBadge.textContent='Applied';els.paletteStatus.textContent='AI refined';els.roleMode.textContent='AI REFINED';
      els.roleHint.textContent='AI-guided regions were applied to the pixel sample, the CIELAB palette was rebuilt, and semantic roles now drive the generated export.';
      progress(100,'AI refined');log(`AI refinement applied${state.ai.game?`: ${state.ai.game}`:''}. Export regenerated from refined colors.`);
    }catch(err){
      console.error(err);els.aiBadge.textContent='Unavailable';els.aiBadge.className='status-pill neutral';els.aiOutput.textContent=`AI refinement could not complete: ${err.message||err}\n\nThe local Chrometry palette is still usable and has not been overwritten.`;progress(0,'AI error');log(`AI refinement unavailable: ${err.message||err}`);
    }finally{els.aiBtn.disabled=false;els.analyzeBtn.disabled=false;}
  }

  function extractAIText(r){if(typeof r==='string')return r;if(typeof r?.message?.content==='string')return r.message.content;if(Array.isArray(r?.message?.content))return r.message.content.map(x=>x.text||'').join('');if(typeof r?.content==='string')return r.content;return JSON.stringify(r);}
  function parseAIObject(text){
    const cleaned=String(text).replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
    try{return JSON.parse(cleaned);}catch{
      const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(cleaned.slice(a,b+1));throw new Error('AI returned an unreadable refinement plan.');
    }
  }
  function normalizeRegion(r){
    if(!r||typeof r!=='object')return null;
    const x=clamp(r.x),y=clamp(r.y),w=clamp(r.w),h=clamp(r.h),confidence=clamp((Number(r.confidence)||0)/100,0,1);
    const cw=Math.min(w,1-x),ch=Math.min(h,1-y);if(cw<=.005||ch<=.005)return null;
    return{x,y,w:cw,h:ch,confidence,reason:String(r.reason||'AI region')};
  }
  function normalizeAIPlan(o){
    const plan={...o};plan.confidence=clamp(Number(o?.confidence)||0,0,100);plan.content_region=normalizeRegion(o?.content_region)||{x:0,y:0,w:1,h:1,confidence:0,reason:'Full screenshot'};
    plan.exclude_regions=(Array.isArray(o?.exclude_regions)?o.exclude_regions:[]).map(normalizeRegion).filter(Boolean).filter(r=>r.confidence>=.55).slice(0,12);
    plan.roles={};
    for(const key of Object.keys(roleDefinitions)){
      const r=o?.roles?.[key];if(!r||typeof r!=='object'){plan.roles[key]={present:null,hex:null,confidence:0,reason:'Not classified'};continue;}
      plan.roles[key]={present:r.present===false?false:r.present===true?true:null,hex:isHex(r.hex)?String(r.hex).toUpperCase():null,confidence:clamp(Number(r.confidence)||0,0,100),reason:String(r.reason||'AI semantic match')};
    }
    plan.notes=Array.isArray(o?.notes)?o.notes.map(String).slice(0,6):[];return plan;
  }
  function isHex(v){return typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v.trim());}
  function inRegion(p,r){return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;}

  async function applyAIRefinement(plan){
    progress(55,'Filtering pixels');await waitFrame();
    const raw=state.rawSamples.length?state.rawSamples:sampleImage(state.image,Number(els.detail.value));
    const content=plan.content_region;
    let accepted=raw;
    const useContent=content&&content.confidence>=.55&&(content.w*content.h)>=.18;
    if(useContent)accepted=accepted.filter(p=>inRegion(p,content));
    if(plan.exclude_regions.length)accepted=accepted.filter(p=>!plan.exclude_regions.some(r=>inRegion(p,r)));

    const ratio=accepted.length/Math.max(1,raw.length);
    if(accepted.length<900||ratio<.18){
      accepted=raw.slice();
      plan._maskRejected=true;
      log('AI mask looked too aggressive, so Chrometry kept the full pixel sample and only applied semantic role mapping.');
    }

    progress(68,'Re-clustering');log(`AI accepted ${accepted.length.toLocaleString()} of ${raw.length.toLocaleString()} samples (${(accepted.length/raw.length*100).toFixed(1)}%). Rebuilding palette…`);await waitFrame();
    const k=Number(els.colorCount.value),lab=toLabSamples(accepted),clusters=kmeansLab(lab,k,12);
    state.palette=clusters.map((c,i)=>decorateCluster(c,i)).sort((a,b)=>b.coverage-a.coverage);
    state.roles=rolesFromAI(plan,state.palette);
    state.analysisMode='ai-refined';
    state.refinement={
      acceptedPixelPercent:Number((accepted.length/raw.length*100).toFixed(2)),
      contentRegion:useContent?content:null,
      excludedRegions:plan.exclude_regions,
      maskSafetyFallback:Boolean(plan._maskRejected)
    };
    progress(88,'Applying roles');await waitFrame();
  }

  function rolesFromAI(plan,palette){
    const out=[],localFallback=inferRoles(palette),fallbackByKey=Object.fromEntries(localFallback.map(r=>[r.key,r]));
    for(const key of Object.keys(roleDefinitions)){
      const target=plan.roles?.[key];
      if(target?.present===false)continue;
      if(target?.hex&&target.confidence>=45){
        const color=nearestPaletteColor(target.hex,palette);if(color){out.push(makeRole(key,color,target.reason||'AI semantic color target','ai',target.confidence));continue;}
      }
      if(target?.present===true&&fallbackByKey[key]){const f=fallbackByKey[key];out.push(makeRole(key,f.color,'AI confirmed role; nearest local semantic fallback','ai',target.confidence||null));continue;}
      if(target?.present==null&&fallbackByKey[key])out.push(fallbackByKey[key]);
    }
    return out;
  }
  function nearestPaletteColor(hex,palette){
    const rgb=hexToRgb(hex);if(!rgb)return null;const lab=rgbToLab(rgb.r,rgb.g,rgb.b);let best=null,dist=Infinity;
    for(const c of palette){const d=labDist2(lab,c.lab);if(d<dist){dist=d;best=c;}}return best;
  }
  function hexToRgb(hex){const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:null;}

  function renderAI(o){
    const activeRegions=o.exclude_regions?.length||0,roleEntries=Object.entries(o.roles||{}).filter(([,r])=>r?.present!==false&&r?.hex);
    const refined=state.refinement;
    els.aiOutput.className='ai-output';
    els.aiOutput.innerHTML=`<div class="ai-grid">
      <div class="ai-card"><b>${escapeHtml(o.game||'Unknown game')}${o.confidence!=null?` · ${Math.round(o.confidence)}% confidence`:''}</b><span>${escapeHtml(o.scene||'Scene analyzed')}</span><div class="ai-badge-row"><span class="mini-badge">${refined?.acceptedPixelPercent??100}% pixels kept</span><span class="mini-badge">${activeRegions} region${activeRegions===1?'':'s'} ignored</span><span class="mini-badge">export rebuilt</span></div></div>
      ${o.visual_style?`<div class="ai-card"><b>Visual style</b><span>${escapeHtml(o.visual_style)}</span></div>`:''}
      ${o.lighting?`<div class="ai-card"><b>Lighting</b><span>${escapeHtml(o.lighting)}</span></div>`:''}
      ${activeRegions?`<div class="ai-card"><b>Ignored screenshot areas</b><span>${o.exclude_regions.map(r=>`${escapeHtml(r.reason)} · ${Math.round(r.confidence*100)}%`).join('<br>')}</span></div>`:''}
      ${roleEntries.length?`<div class="ai-card"><b>Semantic targets used</b><span>${roleEntries.map(([k,r])=>`${escapeHtml(roleDefinitions[k]?.name||k)}: ${escapeHtml(r.hex)} · ${Math.round(r.confidence)}%`).join('<br>')}</span></div>`:''}
      ${o.notes?.length?`<div class="ai-card"><b>Recreation notes</b><span>${o.notes.map(n=>`• ${escapeHtml(n)}`).join('<br>')}</span></div>`:''}
      ${o._maskRejected?`<div class="ai-card"><b>Safety guardrail</b><span>The proposed crop removed too much of the image, so Chrometry rejected that mask instead of damaging the palette.</span></div>`:''}
    </div>`;
  }

  function rgbToHex(r,g,b){return'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();}
  function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0;const l=(max+min)/2;if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}return[h*360,s*100,l*100];}
  function rgbToLab(r,g,b){let R=r/255,G=g/255,B=b/255;R=R>.04045?Math.pow((R+.055)/1.055,2.4):R/12.92;G=G>.04045?Math.pow((G+.055)/1.055,2.4):G/12.92;B=B>.04045?Math.pow((B+.055)/1.055,2.4):B/12.92;let x=(R*.4124+G*.3576+B*.1805)/.95047,y=(R*.2126+G*.7152+B*.0722),z=(R*.0193+G*.1192+B*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;x=f(x);y=f(y);z=f(z);return[116*y-16,500*(x-y),200*(y-z)];}

  if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
})();
