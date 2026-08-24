(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    intro: $('intro'), workspace: $('workspace'), dropzone: $('dropzone'), fileInput: $('fileInput'), replaceBtn: $('replaceBtn'),
    themeBtn: $('themeBtn'), previewCanvas: $('previewCanvas'), canvasStage: $('canvasStage'), sampleBubble: $('sampleBubble'),
    imageName: $('imageName'), imageSize: $('imageSize'), colorCount: $('colorCount'), colorCountValue: $('colorCountValue'),
    detail: $('detail'), detailValue: $('detailValue'), analyzeBtn: $('analyzeBtn'), paletteStatus: $('paletteStatus'),
    paletteStrip: $('paletteStrip'), swatches: $('swatches'), roleGrid: $('roleGrid'), progressBar: $('progressBar'),
    progressLabel: $('progressLabel'), log: $('log'), aiBtn: $('aiBtn'), aiBadge: $('aiBadge'), aiOutput: $('aiOutput'),
    exportCode: $('exportCode'), copyBtn: $('copyBtn'), downloadBtn: $('downloadBtn')
  };

  const state = { file:null, image:null, imageUrl:null, sourceCanvas:null, palette:[], roles:[], exportFormat:'json', ai:null };
  const detailNames = {1:'Fast',2:'Balanced',3:'Fine'};

  function nowTime(){ return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}); }
  function log(message){ const row=document.createElement('div'); row.className='log-row'; row.innerHTML=`<time>${nowTime()}</time><span>${escapeHtml(message)}</span>`; els.log.prepend(row); }
  function progress(value, label){ els.progressBar.style.width=`${Math.max(0,Math.min(100,value))}%`; els.progressLabel.textContent=label; }
  function waitFrame(){ return new Promise(r=>requestAnimationFrame(()=>r())); }
  function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function setTheme(mode){
    const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('chrometry-theme', dark ? 'dark' : 'light');
    const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.content=dark?'#09090b':'#f5f5f7';
  }
  setTheme(localStorage.getItem('chrometry-theme') || 'auto');
  els.themeBtn.addEventListener('click',()=>setTheme(document.documentElement.classList.contains('dark')?'light':'dark'));

  ['dragenter','dragover'].forEach(evt=>els.dropzone.addEventListener(evt,e=>{e.preventDefault();els.dropzone.classList.add('dragging');}));
  ['dragleave','drop'].forEach(evt=>els.dropzone.addEventListener(evt,e=>{e.preventDefault();els.dropzone.classList.remove('dragging');}));
  els.dropzone.addEventListener('drop',e=>{ const f=e.dataTransfer.files?.[0]; if(f) loadFile(f); });
  els.fileInput.addEventListener('change',e=>{const f=e.target.files?.[0]; if(f) loadFile(f);});
  els.replaceBtn.addEventListener('click',()=>els.fileInput.click());
  els.colorCount.addEventListener('input',()=>els.colorCountValue.textContent=els.colorCount.value);
  els.detail.addEventListener('input',()=>els.detailValue.textContent=detailNames[els.detail.value]);
  els.analyzeBtn.addEventListener('click',()=>analyze());
  els.aiBtn.addEventListener('click',()=>analyzeWithAI());

  document.querySelectorAll('.export-tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.export-tab').forEach(b=>b.classList.toggle('active',b===btn)); state.exportFormat=btn.dataset.format; renderExport();
  }));
  els.copyBtn.addEventListener('click', async()=>{try{await navigator.clipboard.writeText(els.exportCode.textContent); els.copyBtn.textContent='Copied'; setTimeout(()=>els.copyBtn.textContent='Copy',1200);}catch{log('Clipboard permission was unavailable.');}});
  els.downloadBtn.addEventListener('click', downloadExport);

  async function loadFile(file){
    if(!file.type.startsWith('image/')){ log('That file is not recognized as an image.'); return; }
    state.file=file; state.ai=null; els.aiOutput.textContent='No AI analysis yet. Local palette extraction works without it.'; els.aiOutput.className='ai-output empty-state';
    if(state.imageUrl) URL.revokeObjectURL(state.imageUrl); state.imageUrl=URL.createObjectURL(file);
    const img=new Image(); img.decoding='async'; img.src=state.imageUrl;
    try{ await img.decode(); }catch{ await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;}); }
    state.image=img; state.sourceCanvas=drawSourceCanvas(img); drawPreview(img);
    els.imageName.textContent=file.name; els.imageSize.textContent=`${img.naturalWidth} × ${img.naturalHeight} · ${formatBytes(file.size)}`;
    els.intro.classList.add('hidden'); els.workspace.classList.remove('hidden');
    log(`Loaded ${file.name} (${img.naturalWidth}×${img.naturalHeight}).`);
    await analyze(); window.scrollTo({top:0,behavior:'smooth'});
  }

  function drawSourceCanvas(img){ const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0); return c; }
  function drawPreview(img){ const maxW=1000,maxH=600,scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight); const c=els.previewCanvas;c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,c.width,c.height); }
  function formatBytes(n){ if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`; return `${(n/1024/1024).toFixed(1)} MB`; }

  els.previewCanvas.addEventListener('pointerdown',e=>{
    const rect=els.previewCanvas.getBoundingClientRect(); const x=Math.floor((e.clientX-rect.left)*els.previewCanvas.width/rect.width); const y=Math.floor((e.clientY-rect.top)*els.previewCanvas.height/rect.height);
    const d=els.previewCanvas.getContext('2d',{willReadFrequently:true}).getImageData(x,y,1,1).data; const hex=rgbToHex(d[0],d[1],d[2]);
    const stageRect=els.canvasStage.getBoundingClientRect(); els.sampleBubble.textContent=`${hex} · rgb(${d[0]}, ${d[1]}, ${d[2]})`; els.sampleBubble.style.left=`${e.clientX-stageRect.left}px`; els.sampleBubble.style.top=`${e.clientY-stageRect.top}px`; els.sampleBubble.classList.remove('hidden'); clearTimeout(els.sampleBubble._timer); els.sampleBubble._timer=setTimeout(()=>els.sampleBubble.classList.add('hidden'),2200);
  });

  async function analyze(){
    if(!state.image)return; const k=Number(els.colorCount.value),detail=Number(els.detail.value); els.analyzeBtn.disabled=true; els.paletteStatus.textContent='Analyzing';
    try{
      progress(5,'Sampling'); log('Sampling screenshot pixels…'); await waitFrame();
      const data=sampleImage(state.image,detail); progress(30,'Converting'); log(`Collected ${data.length.toLocaleString()} weighted pixel samples.`); await waitFrame();
      const labSamples=data.map(p=>({...p,lab:rgbToLab(p.r,p.g,p.b)})); progress(43,'Clustering'); log(`Running perceptual k-means with ${k} target colors in CIELAB.`); await waitFrame();
      const clusters=kmeansLab(labSamples,k,11); progress(76,'Classifying'); log('Measuring coverage and assigning local scene-role heuristics.'); await waitFrame();
      state.palette=clusters.map((c,i)=>decorateCluster(c,i)).sort((a,b)=>b.coverage-a.coverage); state.roles=inferRoles(state.palette,labSamples);
      progress(94,'Rendering'); renderPalette(); renderRoles(); renderExport(); await waitFrame();
      progress(100,'Complete'); els.paletteStatus.textContent='Measured'; log(`Finished. ${state.palette.length} perceptual colors extracted.`);
    }catch(err){console.error(err);progress(0,'Error');els.paletteStatus.textContent='Error';log(`Analysis failed: ${err.message||err}`);}finally{els.analyzeBtn.disabled=false;}
  }

  function sampleImage(img,detail){
    const maxSide={1:180,2:260,3:360}[detail]||260; const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight)); const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)); const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);const d=ctx.getImageData(0,0,w,h).data;const out=[];
    const step=detail===3?1:detail===2?1:2; for(let y=0;y<h;y+=step){for(let x=0;x<w;x+=step){const i=(y*w+x)*4;if(d[i+3]<220)continue;const r=d[i],g=d[i+1],b=d[i+2];const max=Math.max(r,g,b),min=Math.min(r,g,b);if(max>250&&min>250)continue;out.push({r,g,b,x:x/(w-1||1),y:y/(h-1||1)});}}
    if(out.length>42000){const stride=Math.ceil(out.length/42000);return out.filter((_,i)=>i%stride===0);} return out;
  }

  function kmeansLab(samples,k,iterations){ if(!samples.length)return[]; k=Math.min(k,samples.length); const centers=[]; centers.push(samples[Math.floor(samples.length*.37)].lab.slice());
    while(centers.length<k){let best=null,bestD=-1;const stride=Math.max(1,Math.floor(samples.length/5000));for(let i=0;i<samples.length;i+=stride){const s=samples[i];let md=Infinity;for(const c of centers)md=Math.min(md,labDist2(s.lab,c));if(md>bestD){bestD=md;best=s.lab;}}centers.push(best.slice());}
    const assignments=new Int16Array(samples.length);
    for(let it=0;it<iterations;it++){const sums=Array.from({length:k},()=>[0,0,0,0]);for(let i=0;i<samples.length;i++){const lab=samples[i].lab;let bi=0,bd=Infinity;for(let j=0;j<k;j++){const dd=labDist2(lab,centers[j]);if(dd<bd){bd=dd;bi=j;}}assignments[i]=bi;const s=sums[bi];s[0]+=lab[0];s[1]+=lab[1];s[2]+=lab[2];s[3]++;}for(let j=0;j<k;j++){const s=sums[j];if(s[3])centers[j]=[s[0]/s[3],s[1]/s[3],s[2]/s[3]];}}
    const stats=Array.from({length:k},(_,j)=>({lab:centers[j],count:0,r:0,g:0,b:0,top:0,bottom:0}));for(let i=0;i<samples.length;i++){const s=samples[i],c=stats[assignments[i]];c.count++;c.r+=s.r;c.g+=s.g;c.b+=s.b;if(s.y<.38)c.top++;if(s.y>.58)c.bottom++;}
    return stats.filter(c=>c.count).map(c=>({lab:c.lab,count:c.count,coverage:c.count/samples.length,r:Math.round(c.r/c.count),g:Math.round(c.g/c.count),b:Math.round(c.b/c.count),topRatio:c.top/c.count,bottomRatio:c.bottom/c.count})); }
  function labDist2(a,b){const dl=a[0]-b[0],da=a[1]-b[1],db=a[2]-b[2];return dl*dl+da*da+db*db;}

  function decorateCluster(c,index){const hsl=rgbToHsl(c.r,c.g,c.b);return {...c,index,hex:rgbToHex(c.r,c.g,c.b),hsl,label:genericColorLabel(hsl,c.lab[0])};}
  function genericColorLabel(hsl,L){const [h,s,l]=hsl;if(L<19)return'Near black';if(s<9)return l>78?'Highlight':l<30?'Charcoal':'Neutral';if(h>=185&&h<=250)return l>63?'Sky blue':'Blue';if(h>=80&&h<170)return l<30?'Forest green':'Green';if(h>=35&&h<80)return l>68?'Warm light':'Yellow / sand';if(h<35||h>=345)return l>65?'Warm highlight':'Red / earth';if(h>=170&&h<200)return'Teal';if(h>=250&&h<310)return'Violet';return'Accent';}

  function inferRoles(palette){
    const candidates=palette.slice(); const used=new Set(); const pick=(scoreFn)=>{let best=null,score=-Infinity;for(const c of candidates){if(used.has(c.hex))continue;const s=scoreFn(c);if(s>score){score=s;best=c;}}if(best)used.add(best.hex);return best;};
    const roles=[];
    const sky=pick(c=>{const[h,s,l]=c.hsl;return (c.topRatio*3)+(h>=175&&h<=250?s/45:0)+(l/100)-Math.max(0,c.bottomRatio-.3);}); if(sky)roles.push(role('Sky / atmosphere',sky,'Top-region + blue/cyan likelihood'));
    const vegetation=pick(c=>{const[h,s,l]=c.hsl;return (h>=70&&h<=165?s/38:0)+(c.bottomRatio*1.4)+(l<72?.3:0);}); if(vegetation)roles.push(role('Vegetation / grass',vegetation,'Green hue + lower-scene likelihood'));
    const earth=pick(c=>{const[h,s,l]=c.hsl;return (((h>=15&&h<=70)||h>=340)?s/55:0)+(c.bottomRatio*1.2)+(l<65?.35:0);}); if(earth)roles.push(role('Earth / terrain',earth,'Warm terrain + lower-scene likelihood'));
    const light=pick(c=>{const[h,s,l]=c.hsl;return (l/50)+(h>=25&&h<=75?s/90:0)+(c.lab[0]/100);}); if(light)roles.push(role('Sunlight / highlight',light,'Highest perceptual lightness'));
    const shadow=pick(c=>2.2-(c.lab[0]/40)+(c.hsl[2]<35?.5:0)); if(shadow)roles.push(role('Shadow / AO',shadow,'Lowest perceptual lightness'));
    const water=pick(c=>{const[h,s,l]=c.hsl;return (h>=165&&h<=235?s/45:0)+(c.bottomRatio*.7)+(l<70?.2:0);}); if(water)roles.push(role('Water / cool material',water,'Cool hue + scene position'));
    const neutral=pick(c=>1.5-(c.hsl[1]/25)+(c.coverage*2)); if(neutral)roles.push(role('Neutral / structure',neutral,'Low saturation + coverage'));
    const accent=pick(c=>(c.hsl[1]/35)+(1-c.coverage)); if(accent)roles.push(role('Accent / UI / signage',accent,'High saturation + low coverage'));
    return roles;
  }
  function role(name,color,reason){return{name,color,reason};}

  function renderPalette(){els.paletteStrip.innerHTML='';els.swatches.innerHTML='';state.palette.forEach((c,i)=>{const seg=document.createElement('button');seg.className='palette-segment';seg.style.background=c.hex;seg.style.flex=Math.max(.035,c.coverage);seg.title=`${c.hex} — ${(c.coverage*100).toFixed(1)}%`;seg.innerHTML=`<span>${(c.coverage*100).toFixed(0)}%</span>`;seg.onclick=()=>copyText(c.hex);els.paletteStrip.appendChild(seg);const sw=document.createElement('button');sw.className='swatch';sw.innerHTML=`<div class="swatch-color" style="background:${c.hex}"></div><b>${c.hex}</b><small>${c.label} · ${(c.coverage*100).toFixed(1)}%</small>`;sw.onclick=()=>copyText(c.hex);els.swatches.appendChild(sw);});}
  function renderRoles(){els.roleGrid.innerHTML='';state.roles.forEach(r=>{const d=document.createElement('div');d.className='role-card';d.title=r.reason;d.innerHTML=`<span class="role-dot" style="background:${r.color.hex}"></span><span><b>${escapeHtml(r.name)}</b><small>${r.color.hex} · ${(r.color.coverage*100).toFixed(1)}%</small></span>`;els.roleGrid.appendChild(d);});}

  async function copyText(text){try{await navigator.clipboard.writeText(text);log(`Copied ${text}.`);}catch{log(`Color: ${text}`);}}

  function exportObject(){return{app:'Chrometry',version:'1.0',source:state.file?.name||null,image:state.image?{width:state.image.naturalWidth,height:state.image.naturalHeight}:null,palette:state.palette.map((c,i)=>({id:i+1,hex:c.hex,rgb:[c.r,c.g,c.b],hsl:c.hsl.map(v=>Math.round(v*10)/10),coverage:Number((c.coverage*100).toFixed(2)),label:c.label})),roles:Object.fromEntries(state.roles.map(r=>[slug(r.name),r.color.hex])),ai:state.ai||undefined};}
  function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
  function renderExport(){if(!state.palette.length)return;const obj=exportObject();if(state.exportFormat==='json')els.exportCode.textContent=JSON.stringify(obj,null,2);else if(state.exportFormat==='css'){els.exportCode.textContent=`:root {\n${state.roles.map(r=>`  --game-${slug(r.name).replaceAll('_','-')}: ${r.color.hex};`).join('\n')}\n\n${state.palette.map((c,i)=>`  --palette-${i+1}: ${c.hex};`).join('\n')}\n}`;}else{els.exportCode.textContent=`// Chrometry palette — Three.js\nconst GAME_PALETTE = {\n${state.roles.map(r=>`  ${slug(r.name)}: 0x${r.color.hex.slice(1)},`).join('\n')}\n};\n\n// Example:\nscene.background = new THREE.Color(GAME_PALETTE.sky_atmosphere ?? 0x87ceeb);\nconst hemi = new THREE.HemisphereLight(\n  GAME_PALETTE.sky_atmosphere ?? 0xffffff,\n  GAME_PALETTE.earth_terrain ?? 0x444444,\n  1.5\n);\nscene.add(hemi);`;}}
  function downloadExport(){if(!state.palette.length)return;const ext=state.exportFormat==='json'?'json':state.exportFormat==='css'?'css':'js';const blob=new Blob([els.exportCode.textContent],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`chrometry-palette.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  async function analyzeWithAI(){
    if(!state.file||!state.palette.length)return; if(!window.puter?.ai?.chat){els.aiOutput.textContent='Puter.js did not load. Check your internet connection and try again.';return;}
    els.aiBtn.disabled=true;els.aiBadge.textContent='Looking';els.aiOutput.className='ai-output';els.aiOutput.textContent='AI is inspecting the screenshot and comparing it with the measured palette…';log('AI Vision requested. Screenshot will be sent to the selected AI service through Puter.');
    const paletteText=state.palette.map((c,i)=>`${i+1}. ${c.hex} (${(c.coverage*100).toFixed(1)}%)`).join(', ');
    const prompt=`You are the semantic vision layer for Chrometry, a game colorimetry tool. Inspect this game screenshot. The local engine measured these dominant colors: ${paletteText}. Return ONLY valid JSON, no markdown fences, with this shape: {"game":"name or Unknown","confidence":0-100,"scene":"short scene description","visual_style":"short description","lighting":"short description","roles":{"sky":"#HEX or null","grass_vegetation":"#HEX or null","terrain_earth":"#HEX or null","sunlight_highlight":"#HEX or null","shadow":"#HEX or null","water":"#HEX or null","architecture":"#HEX or null","accent":"#HEX or null"},"notes":["3-5 concise useful palette recreation notes"]}. Use measured palette HEX values whenever they plausibly match. Do not claim a specific game unless visually supported.`;
    try{
      const result=await puter.ai.chat(prompt,state.file,false,{model:'gpt-5-nano'});const text=extractAIText(result);const cleaned=text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();let obj;try{obj=JSON.parse(cleaned);}catch{obj={game:'AI result',confidence:null,scene:cleaned,roles:{},notes:[]};}
      state.ai=obj;renderAI(obj);renderExport();els.aiBadge.textContent='Complete';log(`AI Vision complete${obj.game?`: ${obj.game}`:''}.`);
    }catch(err){console.error(err);els.aiBadge.textContent='Unavailable';els.aiOutput.textContent=`AI analysis could not complete: ${err.message||err}\n\nYour local Chrometry palette is still fully usable.`;log(`AI Vision unavailable: ${err.message||err}`);}finally{els.aiBtn.disabled=false;}
  }
  function extractAIText(r){if(typeof r==='string')return r;if(typeof r?.message?.content==='string')return r.message.content;if(Array.isArray(r?.message?.content))return r.message.content.map(x=>x.text||'').join('');if(typeof r?.content==='string')return r.content;return JSON.stringify(r);}
  function renderAI(o){const roles=Object.entries(o.roles||{}).filter(([,v])=>v);els.aiOutput.className='ai-output';els.aiOutput.innerHTML=`<div class="ai-grid"><div class="ai-card"><b>${escapeHtml(o.game||'Unknown game')}${o.confidence!=null?` · ${escapeHtml(o.confidence)}% confidence`:''}</b><span>${escapeHtml(o.scene||'Scene analyzed')}</span></div>${o.visual_style?`<div class="ai-card"><b>Visual style</b><span>${escapeHtml(o.visual_style)}</span></div>`:''}${o.lighting?`<div class="ai-card"><b>Lighting</b><span>${escapeHtml(o.lighting)}</span></div>`:''}${roles.length?`<div class="ai-card"><b>Semantic colors</b><span>${roles.map(([k,v])=>`${escapeHtml(k.replaceAll('_',' '))}: ${escapeHtml(v)}`).join('<br>')}</span></div>`:''}${o.notes?.length?`<div class="ai-card"><b>Recreation notes</b><span>${o.notes.map(n=>`• ${escapeHtml(n)}`).join('<br>')}</span></div>`:''}</div>`;}

  function rgbToHex(r,g,b){return'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();}
  function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b);let h=0,s=0;const l=(max+min)/2;if(max!==min){const d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}return[h*360,s*100,l*100];}
  function rgbToLab(r,g,b){let R=r/255,G=g/255,B=b/255;R=R>.04045?Math.pow((R+.055)/1.055,2.4):R/12.92;G=G>.04045?Math.pow((G+.055)/1.055,2.4):G/12.92;B=B>.04045?Math.pow((B+.055)/1.055,2.4):B/12.92;let x=(R*.4124+G*.3576+B*.1805)/.95047,y=(R*.2126+G*.7152+B*.0722),z=(R*.0193+G*.1192+B*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;x=f(x);y=f(y);z=f(z);return[116*y-16,500*(x-y),200*(y-z)];}

  if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
})();
