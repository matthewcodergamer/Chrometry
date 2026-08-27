(() => {
  'use strict';

  // Replace the original AI button node so legacy app.js listeners cannot also fire.
  const legacyBtn = document.getElementById('aiBtn');
  if (!legacyBtn) return;
  const aiBtn = legacyBtn.cloneNode(true);
  legacyBtn.replaceWith(aiBtn);

  const aiBadge = document.getElementById('aiBadge');
  const aiOutput = document.getElementById('aiOutput');
  const roleGrid = document.getElementById('roleGrid');
  const roleMode = document.getElementById('roleMode');
  const roleHint = document.getElementById('roleHint');
  const paletteStatus = document.getElementById('paletteStatus');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const logEl = document.getElementById('log');
  const exportCode = document.getElementById('exportCode');
  const previewCanvas = document.getElementById('previewCanvas');
  const fileInput = document.getElementById('fileInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const exportTabs = [...document.querySelectorAll('.export-tab')];

  let refined = null;
  let running = false;
  let activeModel = '';

  const style = document.createElement('style');
  style.textContent = `
    .look-grid{display:grid;gap:10px;margin-top:10px}
    .look-row{padding:12px;border-radius:14px;background:var(--soft)}
    .look-row b{display:block;font-size:12px;line-height:1.3;color:var(--ink)}
    .look-row small{display:block;margin-top:4px;font-size:10.5px;line-height:1.5;color:var(--muted)}
    .look-gradient{height:40px;border-radius:12px;margin-top:9px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
    .look-color{display:inline-flex;align-items:center;gap:6px;margin:7px 8px 0 0;font-size:9.5px;color:var(--muted)}
    .look-color i{width:16px;height:16px;border-radius:5px;display:inline-block;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
    .look-badge{display:inline-flex;align-items:center;min-height:25px;padding:0 9px;border-radius:999px;background:var(--soft);font-size:9px;font-weight:800;margin:5px 5px 0 0}
    .look-materials{display:grid;gap:8px;margin-top:9px}
    .look-material{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;align-items:center;padding:10px;border-radius:13px;background:var(--soft)}
    .look-material-swatch{width:38px;height:38px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
    .look-material b{display:block;font-size:11.5px}.look-material small{display:block;margin-top:3px;font-size:9.7px;line-height:1.45;color:var(--muted)}
  `;
  document.head.appendChild(style);

  const clamp = (v,min=0,max=1) => Math.max(min,Math.min(max,Number(v)||0));
  const validHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());
  const hex = (v,fallback=null) => validHex(v) ? v.toUpperCase() : fallback;
  const escapeHtml = value => String(value ?? '').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const safeName = value => String(value||'material').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'') || 'material';

  function errorMessage(error) {
    if (error == null) return 'Unknown AI error';
    if (typeof error === 'string') return error;
    const candidates=[error.message,error.error?.message,error.error,error.response?.message,error.statusText,error.code,error.details?.message];
    for(const item of candidates) if(typeof item==='string'&&item.trim()) return item.trim();
    try { const s=JSON.stringify(error); if(s&&s!=='{}') return s; } catch {}
    return String(error);
  }

  function log(message) {
    if(!logEl) return;
    const row=document.createElement('div'); row.className='log-row';
    const time=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    row.innerHTML=`<time>${escapeHtml(time)}</time><span>${escapeHtml(message)}</span>`;
    logEl.prepend(row);
  }
  function progress(value,label){
    if(progressBar) progressBar.style.width=`${clamp(value,0,100)}%`;
    if(progressLabel) progressLabel.textContent=label;
  }

  function readMeasuredPalette(){
    return [...document.querySelectorAll('#swatches .swatch')].map(sw=>{
      const h=sw.querySelector('b')?.textContent?.trim()?.toUpperCase();
      const meta=sw.querySelector('small')?.textContent||'';
      const coverage=Number(meta.match(/([\d.]+)%/)?.[1]||0);
      return validHex(h)?{hex:h,coverage}:null;
    }).filter(Boolean);
  }

  function visionFile(){
    return new Promise((resolve,reject)=>{
      if(!previewCanvas?.width||!previewCanvas?.height) return reject(new Error('No screenshot is loaded.'));
      previewCanvas.toBlob(blob=>{
        if(!blob) return reject(new Error('Safari could not prepare the screenshot for AI vision.'));
        resolve(new File([blob],'chrometry-scene.jpg',{type:'image/jpeg',lastModified:Date.now()}));
      },'image/jpeg',0.95);
    });
  }

  function extractText(r){
    if(typeof r==='string') return r;
    if(typeof r?.message?.content==='string') return r.message.content;
    if(Array.isArray(r?.message?.content)) return r.message.content.map(x=>x?.text||x?.content||'').join('');
    if(typeof r?.text==='string') return r.text;
    if(typeof r?.content==='string') return r.content;
    try{return JSON.stringify(r);}catch{return String(r);}
  }
  function parseJson(text){
    const cleaned=String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/i,'').trim();
    try{return JSON.parse(cleaned);}catch{}
    const a=cleaned.indexOf('{'), b=cleaned.lastIndexOf('}');
    if(a>=0&&b>a) return JSON.parse(cleaned.slice(a,b+1));
    throw new Error('The vision model answered, but the scene-look plan was not readable JSON.');
  }

  function normalizeRegion(r){
    if(!r||typeof r!=='object') return null;
    const x=clamp(r.x),y=clamp(r.y),w=clamp(r.w),h=clamp(r.h);
    const cw=Math.min(w,1-x),ch=Math.min(h,1-y);
    return cw>.005&&ch>.005?{x,y,w:cw,h:ch}:null;
  }
  function sliceRegion(r,part){
    const n=normalizeRegion(r); if(!n) return null;
    if(part==='top') return {x:n.x,y:n.y,w:n.w,h:n.h*.34};
    if(part==='middle') return {x:n.x,y:n.y+n.h*.33,w:n.w,h:n.h*.34};
    return {x:n.x,y:n.y+n.h*.66,w:n.w,h:n.h*.34};
  }
  function hexToRgb(h){const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h||''));return m?{r:parseInt(m[1],16),g:parseInt(m[2],16),b:parseInt(m[3],16)}:null;}
  function rgbToHex(r,g,b){return'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();}
  function rgbToLab(r,g,b){let R=r/255,G=g/255,B=b/255;R=R>.04045?Math.pow((R+.055)/1.055,2.4):R/12.92;G=G>.04045?Math.pow((G+.055)/1.055,2.4):G/12.92;B=B>.04045?Math.pow((B+.055)/1.055,2.4):B/12.92;let x=(R*.4124+G*.3576+B*.1805)/.95047,y=(R*.2126+G*.7152+B*.0722),z=(R*.0193+G*.1192+B*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;x=f(x);y=f(y);z=f(z);return[116*y-16,500*(x-y),200*(y-z)];}
  function labDist2(a,b){const l=a[0]-b[0],x=a[1]-b[1],y=a[2]-b[2];return l*l+x*x+y*y;}
  function snapHex(target,region){
    if(!validHex(target)||!previewCanvas?.width) return hex(target);
    const rgb=hexToRgb(target),t=rgbToLab(rgb.r,rgb.g,rgb.b),ctx=previewCanvas.getContext('2d',{willReadFrequently:true});
    const {width:w,height:h}=previewCanvas,data=ctx.getImageData(0,0,w,h).data,r=normalizeRegion(region)||{x:0,y:0,w:1,h:1};
    const x0=Math.max(0,Math.floor(r.x*w)),y0=Math.max(0,Math.floor(r.y*h)),x1=Math.min(w-1,Math.ceil((r.x+r.w)*w)),y1=Math.min(h-1,Math.ceil((r.y+r.h)*h));
    const step=Math.max(1,Math.round(Math.max(x1-x0,y1-y0)/180)); let best=null,dBest=Infinity;
    for(let y=y0;y<=y1;y+=step)for(let x=x0;x<=x1;x+=step){const i=(y*w+x)*4;if(data[i+3]<220)continue;const d=labDist2(t,rgbToLab(data[i],data[i+1],data[i+2]));if(d<dBest){dBest=d;best={r:data[i],g:data[i+1],b:data[i+2]};}}
    return best?rgbToHex(best.r,best.g,best.b):target.toUpperCase();
  }

  function buildPrompt(palette){
    const p=palette.map((c,i)=>`${i+1}. ${c.hex} (${c.coverage.toFixed(1)}%)`).join(', ');
    return `You are Chrometry Scene Look, a visual reverse-engineering assistant for recreating the APPEARANCE of a game screenshot in Three.js. Local CIELAB colors: ${p||'none'}.

Analyze the image as a rendering/look-development problem, not merely a color list. First classify whether it is a game screenshot and identify the game only when reasonably confident. A single screenshot cannot reveal proprietary source shaders, exact textures, LUTs, engine settings, or hidden lights. Treat those as estimates and say so through confidence/reason fields. Your goal is the closest practical visual recreation from what is observable.

OBSERVE ALL OF THESE WHEN VISIBLE:
- sky/atmosphere vertical gradient: zenith, mid-sky/horizon, lower horizon; do not reduce a gradient to one color
- key/directional light color, apparent azimuth and elevation, hardness/softness, intensity relationship, highlight behavior
- sky fill, ambient fill, ground bounce, cool/warm shadow tint, contact-shadow/AO strength
- fog, haze, aerial perspective, horizon fade and atmosphere color
- exposure, contrast, saturation, color temperature/tint, black lift, highlight rolloff, bloom/glow and vignette as visual estimates
- likely tone-mapping character (ACES-like/filmic/neutral/linear/unknown), but never claim the exact original pipeline as fact
- visible material behavior: roughness, metalness, opacity, specular feel, texture/albedo variation, whether the observed color is texture-dominant, lighting-dominant, mixed or unknown
- each useful visible object/material (grass, sky, road, gate, concrete, dirt, building, vehicle, clothing, water, props etc.) with normalized region and base/lit/shadow colors
- capture artifacts/HUD separately so they do not contaminate environment reconstruction
- approximate camera FOV/perspective only when visually inferable

For realistic grass specifically, discuss whether the variation appears baked in the albedo/texture, created by blade/normal geometry and directional light, ambient/sky fill, shadows, or a mixture. For Minecraft or stylized games, account for flat texture colors, directional face shading, AO, fog and biome/lighting tint when visible.

Return ONLY strict JSON using this schema:
{
 "content_type":"game_screenshot|app_ui|photo|illustration|3d_render|webpage|other",
 "is_game":true,
 "game":"Grand Theft Auto V|Minecraft|Unknown|other game name",
 "confidence":0,
 "scene":"description",
 "visual_style":"render/look description",
 "capture_artifacts":[{"name":"HUD/browser edge/etc","region":{"x":0,"y":0,"w":0,"h":0},"confidence":0}],
 "sky":{"present":true,"region":{"x":0,"y":0,"w":1,"h":0.5},"zenith_hex":"#RRGGBB","mid_hex":"#RRGGBB","horizon_hex":"#RRGGBB","gradient_strength":0.0,"analysis":"why it looks this way"},
 "lighting":{"key_hex":"#RRGGBB","key_intensity":2.0,"key_azimuth_deg":45,"key_elevation_deg":55,"key_softness":0.35,"fill_hex":"#RRGGBB","fill_intensity":0.65,"ground_bounce_hex":"#RRGGBB","ground_bounce_intensity":0.25,"shadow_tint_hex":"#RRGGBB","ao_strength":0.5,"time_of_day":"midday/etc","analysis":"observable lighting behavior"},
 "atmosphere":{"fog_hex":"#RRGGBB","fog_density":0.002,"haze_strength":0.25,"aerial_perspective_strength":0.2,"analysis":"haze/fog/horizon behavior"},
 "grading":{"tone_mapping":"aces_like|filmic|neutral|linear|unknown","exposure":1.0,"contrast":1.0,"saturation":1.0,"temperature":0.0,"tint":0.0,"black_lift":0.0,"highlight_rolloff":0.5,"bloom_strength":0.0,"vignette_strength":0.0,"analysis":"look/color-grade estimate"},
 "camera":{"fov_deg":60,"perspective":"wide/normal/telephoto/orthographic-like/unknown","depth_of_field":"none/subtle/strong/unknown","analysis":"camera estimate"},
 "elements":[{"name":"grass","category":"vegetation","region":{"x":0,"y":0,"w":0,"h":0},"confidence":0,"base_hex":"#RRGGBB","lit_hex":"#RRGGBB","shadow_hex":"#RRGGBB","color_source":"texture_dominant|lighting_dominant|mixed|unknown","color_source_confidence":0,"material":"description","texture_detail":"what is likely texture/albedo vs illumination/geometry","normal_detail":"flat/subtle/strong normal or geometric breakup","recreation":"specific Three.js recreation advice","threejs":{"roughness":0.8,"metalness":0,"opacity":1,"emissive_intensity":0}}],
 "recreation_notes":["specific steps that matter most for matching the scene"]
}

Use colors actually present in the screenshot. Keep regions normalized 0..1. Prioritize 6-14 useful scene elements. Make settings coherent as one scene look, not independent guesses.`;
  }

  async function callVision(prompt,file){
    if(!window.puter?.ai?.chat) throw new Error('Puter.js AI did not load. Check the connection and reopen Chrometry.');
    const attempts=[
      ['GPT-5.6 Luna',()=>window.puter.ai.chat(prompt,file,{model:'gpt-5.6-luna',temperature:.12,max_tokens:9000})],
      ['GPT-5.6 Luna compatibility',()=>window.puter.ai.chat(prompt,file,false,{model:'gpt-5.6-luna',temperature:.12,max_tokens:9000})]
    ];
    const errors=[];
    for(const [name,run] of attempts){try{log(`Scene AI: trying ${name}…`);return {result:await run(),model:name};}catch(e){errors.push(`${name}: ${errorMessage(e)}`);}}
    throw new Error(errors.join(' | '));
  }

  function normalize(raw){
    const skyRaw=raw?.sky&&typeof raw.sky==='object'?raw.sky:{};
    const skyRegion=normalizeRegion(skyRaw.region);
    const lighting=raw?.lighting&&typeof raw.lighting==='object'?raw.lighting:{};
    const atmosphere=raw?.atmosphere&&typeof raw.atmosphere==='object'?raw.atmosphere:{};
    const grading=raw?.grading&&typeof raw.grading==='object'?raw.grading:{};
    const camera=raw?.camera&&typeof raw.camera==='object'?raw.camera:{};
    const out={
      content_type:String(raw?.content_type||'other'),is_game:Boolean(raw?.is_game),game:String(raw?.game||'Unknown'),confidence:clamp(raw?.confidence,0,100),scene:String(raw?.scene||''),visual_style:String(raw?.visual_style||''),
      capture_artifacts:Array.isArray(raw?.capture_artifacts)?raw.capture_artifacts.slice(0,10):[],recreation_notes:Array.isArray(raw?.recreation_notes)?raw.recreation_notes.map(String).slice(0,10):[],
      sky:{present:skyRaw.present!==false,region:skyRegion,zenith_hex:hex(skyRaw.zenith_hex),mid_hex:hex(skyRaw.mid_hex),horizon_hex:hex(skyRaw.horizon_hex),gradient_strength:clamp(skyRaw.gradient_strength),analysis:String(skyRaw.analysis||'')},
      lighting:{key_hex:hex(lighting.key_hex,'#FFF4E5'),key_intensity:Math.max(0,Number(lighting.key_intensity)||2),key_azimuth_deg:Number.isFinite(Number(lighting.key_azimuth_deg))?Number(lighting.key_azimuth_deg):45,key_elevation_deg:clamp(lighting.key_elevation_deg,2,88)||55,key_softness:clamp(lighting.key_softness),fill_hex:hex(lighting.fill_hex,'#90A9C4'),fill_intensity:Math.max(0,Number(lighting.fill_intensity)||.65),ground_bounce_hex:hex(lighting.ground_bounce_hex,'#5A5146'),ground_bounce_intensity:Math.max(0,Number(lighting.ground_bounce_intensity)||.25),shadow_tint_hex:hex(lighting.shadow_tint_hex,'#303844'),ao_strength:clamp(lighting.ao_strength),time_of_day:String(lighting.time_of_day||'unknown'),analysis:String(lighting.analysis||'')},
      atmosphere:{fog_hex:hex(atmosphere.fog_hex),fog_density:clamp(atmosphere.fog_density,0,.08),haze_strength:clamp(atmosphere.haze_strength),aerial_perspective_strength:clamp(atmosphere.aerial_perspective_strength),analysis:String(atmosphere.analysis||'')},
      grading:{tone_mapping:String(grading.tone_mapping||'aces_like'),exposure:clamp(grading.exposure,.2,3)||1,contrast:clamp(grading.contrast,.4,2)||1,saturation:clamp(grading.saturation,0,2)||1,temperature:clamp(grading.temperature,-1,1),tint:clamp(grading.tint,-1,1),black_lift:clamp(grading.black_lift,-.3,.5),highlight_rolloff:clamp(grading.highlight_rolloff),bloom_strength:clamp(grading.bloom_strength,0,2),vignette_strength:clamp(grading.vignette_strength),analysis:String(grading.analysis||'')},
      camera:{fov_deg:clamp(camera.fov_deg,20,120)||60,perspective:String(camera.perspective||'unknown'),depth_of_field:String(camera.depth_of_field||'unknown'),analysis:String(camera.analysis||'')},
      elements:[]
    };
    if(out.sky.present&&skyRegion){
      if(out.sky.zenith_hex) out.sky.zenith_hex=snapHex(out.sky.zenith_hex,sliceRegion(skyRegion,'top'));
      if(out.sky.mid_hex) out.sky.mid_hex=snapHex(out.sky.mid_hex,sliceRegion(skyRegion,'middle'));
      if(out.sky.horizon_hex) out.sky.horizon_hex=snapHex(out.sky.horizon_hex,sliceRegion(skyRegion,'bottom'));
    }
    out.elements=(Array.isArray(raw?.elements)?raw.elements:[]).slice(0,16).map((e,i)=>{
      const region=normalizeRegion(e?.region),base=hex(e?.base_hex),lit=hex(e?.lit_hex,base),shadow=hex(e?.shadow_hex,base);
      return {id:i+1,name:String(e?.name||`Element ${i+1}`),category:String(e?.category||'other'),region,confidence:clamp(e?.confidence,0,100),base_hex:base?snapHex(base,region):null,lit_hex:lit?snapHex(lit,region):null,shadow_hex:shadow?snapHex(shadow,region):null,color_source:String(e?.color_source||'unknown'),color_source_confidence:clamp(e?.color_source_confidence,0,100),material:String(e?.material||''),texture_detail:String(e?.texture_detail||''),normal_detail:String(e?.normal_detail||''),recreation:String(e?.recreation||''),threejs:{roughness:clamp(e?.threejs?.roughness??.75),metalness:clamp(e?.threejs?.metalness??0),opacity:clamp(e?.threejs?.opacity??1),emissive_intensity:Math.max(0,Number(e?.threejs?.emissive_intensity)||0)}};
    }).filter(e=>e.base_hex||e.lit_hex||e.shadow_hex);
    return out;
  }

  function lit(h,fallback='0x808080'){return validHex(h)?`0x${h.slice(1)}`:fallback;}
  function toneMapCode(name){const n=String(name).toLowerCase();if(n.includes('linear'))return'THREE.LinearToneMapping';if(n.includes('neutral'))return'THREE.NeutralToneMapping';return'THREE.ACESFilmicToneMapping';}

  function buildThree(a){
    const s=a.sky,l=a.lighting,atm=a.atmosphere,g=a.grading;
    const objectColors=a.elements.map((e,i)=>`  ${JSON.stringify(safeName(e.name)+(i?`_${i+1}`:''))}: { base:${lit(e.base_hex)}, lit:${lit(e.lit_hex,lit(e.base_hex))}, shadow:${lit(e.shadow_hex,lit(e.base_hex))} }`).join(',\n');
    const materials=a.elements.map((e,i)=>{const id=safeName(e.name)+(i?`_${i+1}`:'');return `// ${e.name} — ${e.color_source} (${Math.round(e.color_source_confidence)}% inferred)\n// Texture/albedo: ${e.texture_detail||'unknown'}\n// Normal/geometry: ${e.normal_detail||'unknown'}\n// Recreation: ${e.recreation||'Match screenshot-observed base/lit/shadow response.'}\nconst ${id}Material = new THREE.MeshStandardMaterial({\n  color: ${lit(e.base_hex)},\n  roughness: ${e.threejs.roughness.toFixed(2)},\n  metalness: ${e.threejs.metalness.toFixed(2)},\n  transparent: ${e.threejs.opacity<.999},\n  opacity: ${e.threejs.opacity.toFixed(2)}\n});`;}).join('\n\n');
    return `// Chrometry Scene Look — practical Three.js reconstruction\n// Detected: ${a.is_game?a.game:a.content_type} · ${Math.round(a.confidence)}% confidence\n// IMPORTANT: settings below are screenshot-based visual estimates, not extracted proprietary engine values.\n\nconst CHROMETRY_LOOK = {\n  sky: { zenith:${lit(s.zenith_hex,'0x6E92BD')}, mid:${lit(s.mid_hex,'0x93B3D1')}, horizon:${lit(s.horizon_hex,'0xC2CFD6')}, strength:${s.gradient_strength.toFixed(3)} },\n  lighting: { key:${lit(l.key_hex,'0xFFF4E5')}, keyIntensity:${l.key_intensity.toFixed(3)}, azimuth:${l.key_azimuth_deg.toFixed(1)}, elevation:${l.key_elevation_deg.toFixed(1)}, softness:${l.key_softness.toFixed(3)}, fill:${lit(l.fill_hex,'0x90A9C4')}, fillIntensity:${l.fill_intensity.toFixed(3)}, groundBounce:${lit(l.ground_bounce_hex,'0x5A5146')}, groundBounceIntensity:${l.ground_bounce_intensity.toFixed(3)}, shadowTint:${lit(l.shadow_tint_hex,'0x303844')}, aoStrength:${l.ao_strength.toFixed(3)} },\n  atmosphere: { fog:${lit(atm.fog_hex,'0xB8C2C8')}, fogDensity:${atm.fog_density.toFixed(5)}, haze:${atm.haze_strength.toFixed(3)}, aerialPerspective:${atm.aerial_perspective_strength.toFixed(3)} },\n  grading: { exposure:${g.exposure.toFixed(3)}, contrast:${g.contrast.toFixed(3)}, saturation:${g.saturation.toFixed(3)}, temperature:${g.temperature.toFixed(3)}, tint:${g.tint.toFixed(3)}, blackLift:${g.black_lift.toFixed(3)}, highlightRolloff:${g.highlight_rolloff.toFixed(3)}, bloom:${g.bloom_strength.toFixed(3)}, vignette:${g.vignette_strength.toFixed(3)} },\n  camera: { fov:${a.camera.fov_deg.toFixed(1)} },\n  elements: {\n${objectColors}\n  }\n};\n\nrenderer.outputColorSpace = THREE.SRGBColorSpace;\nrenderer.toneMapping = ${toneMapCode(g.tone_mapping)};\nrenderer.toneMappingExposure = CHROMETRY_LOOK.grading.exposure;\nrenderer.shadowMap.enabled = true;\nrenderer.shadowMap.type = THREE.PCFSoftShadowMap;\n\n// Vertical sky/horizon gradient sampled from the screenshot.\nfunction makeChrometrySkyTexture(top, mid, bottom, height=512) {\n  const canvas=document.createElement('canvas'); canvas.width=4; canvas.height=height;\n  const ctx=canvas.getContext('2d'); const grad=ctx.createLinearGradient(0,0,0,height);\n  grad.addColorStop(0,new THREE.Color(top).getStyle()); grad.addColorStop(.58,new THREE.Color(mid).getStyle()); grad.addColorStop(1,new THREE.Color(bottom).getStyle());\n  ctx.fillStyle=grad; ctx.fillRect(0,0,canvas.width,canvas.height);\n  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture;\n}\nscene.background = makeChrometrySkyTexture(CHROMETRY_LOOK.sky.zenith, CHROMETRY_LOOK.sky.mid, CHROMETRY_LOOK.sky.horizon);\n\n// Sky fill + ground bounce approximate broad environment lighting.\nconst hemi=new THREE.HemisphereLight(CHROMETRY_LOOK.lighting.fill, CHROMETRY_LOOK.lighting.groundBounce, CHROMETRY_LOOK.lighting.fillIntensity);\nscene.add(hemi);\nconst bounce=new THREE.AmbientLight(CHROMETRY_LOOK.lighting.groundBounce, CHROMETRY_LOOK.lighting.groundBounceIntensity);\nscene.add(bounce);\n\n// Directional key light reconstructed from apparent azimuth/elevation.\nconst az=THREE.MathUtils.degToRad(CHROMETRY_LOOK.lighting.azimuth);\nconst el=THREE.MathUtils.degToRad(CHROMETRY_LOOK.lighting.elevation);\nconst radius=12;\nconst sun=new THREE.DirectionalLight(CHROMETRY_LOOK.lighting.key, CHROMETRY_LOOK.lighting.keyIntensity);\nsun.position.set(Math.sin(az)*Math.cos(el)*radius, Math.sin(el)*radius, Math.cos(az)*Math.cos(el)*radius);\nsun.castShadow=true;\nsun.shadow.mapSize.set(2048,2048);\nsun.shadow.bias=-0.00015;\nscene.add(sun);\n\n${atm.fog_density>0?`scene.fog = new THREE.FogExp2(CHROMETRY_LOOK.atmosphere.fog, CHROMETRY_LOOK.atmosphere.fogDensity);`:'// AI did not find meaningful fog; leave scene.fog disabled.'}\n\n${materials}\n\n// POST / COLOR-GRADE NOTES\n// Contrast ${g.contrast.toFixed(2)}, saturation ${g.saturation.toFixed(2)}, temperature ${g.temperature.toFixed(2)}, tint ${g.tint.toFixed(2)}.\n// Bloom ${g.bloom_strength.toFixed(2)} and vignette ${g.vignette_strength.toFixed(2)} require post-processing (EffectComposer/ShaderPass/UnrealBloomPass).\n// Apply those values in your post stack rather than baking them into material base colors.\n// Haze/aerial-perspective strength ${atm.aerial_perspective_strength.toFixed(2)} can be refined with depth-based fog if simple FogExp2 is not enough.`;
  }

  function buildCSS(a){const vars=[];const push=(k,v)=>{if(validHex(v))vars.push(`  --chrometry-${k}: ${v};`);};push('sky-zenith',a.sky.zenith_hex);push('sky-mid',a.sky.mid_hex);push('sky-horizon',a.sky.horizon_hex);push('key-light',a.lighting.key_hex);push('fill-light',a.lighting.fill_hex);push('ground-bounce',a.lighting.ground_bounce_hex);push('shadow-tint',a.lighting.shadow_tint_hex);push('fog',a.atmosphere.fog_hex);a.elements.forEach((e,i)=>{const n=safeName(e.name)+(i?`-${i+1}`:'');push(`${n}-base`,e.base_hex);push(`${n}-lit`,e.lit_hex);push(`${n}-shadow`,e.shadow_hex);});return `/* Chrometry Scene Look · ${a.game||a.content_type} */\n:root {\n${vars.join('\n')}\n}`;}
  function renderExport(){if(!refined||!exportCode)return;const f=document.querySelector('.export-tab.active')?.dataset.format||'json';exportCode.textContent=f==='three'?buildThree(refined):f==='css'?buildCSS(refined):JSON.stringify(refined,null,2);}

  function roleLabel(e){const m={sky:'Sky / atmosphere',vegetation:'Vegetation / grass',grass:'Vegetation / grass',terrain:'Earth / terrain',ground:'Earth / terrain',road:'Road / asphalt',architecture:'Architecture / structure',metal:'Metal / gate',vehicle:'Vehicle',water:'Water',character:'Character / clothing',prop:'Prop / object'};return m[e.category]||e.name;}
  function renderRoles(a){if(!roleGrid)return;roleGrid.innerHTML='';a.elements.slice(0,14).forEach(e=>{const c=e.base_hex||e.lit_hex||e.shadow_hex||'#808080',card=document.createElement('div');card.className='role-card';card.tabIndex=0;card.setAttribute('role','button');card.title=e.recreation||e.texture_detail||'';card.innerHTML=`<span class="role-dot" style="background:${c}"></span><span><b>${escapeHtml(roleLabel(e))}</b><small>${c} · AI · ${escapeHtml(e.name)}</small></span>`;roleGrid.appendChild(card);});if(roleMode)roleMode.textContent=a.is_game?'AI · SCENE':'AI · VISION';if(roleHint)roleHint.textContent=a.is_game?`Scene Look identified ${a.game||'a game'} and mapped materials plus lighting. Tap any role to locate its sampled color in the screenshot.`:'Scene Look analyzed the image without forcing game-specific assumptions.';}

  function colorBadge(name,value){return validHex(value)?`<span class="look-color"><i style="background:${value}"></i>${escapeHtml(name)} ${value}</span>`:'';}
  function renderAI(a){if(!aiOutput)return;const s=a.sky,l=a.lighting,atm=a.atmosphere,g=a.grading;const skyGrad=`linear-gradient(to bottom,${s.zenith_hex||'#6E92BD'},${s.mid_hex||s.zenith_hex||'#93B3D1'} 58%,${s.horizon_hex||s.mid_hex||'#C2CFD6'})`;aiOutput.className='ai-output';aiOutput.innerHTML=`<div class="ai-grid">
    <div class="ai-card"><b>${escapeHtml(a.is_game?(a.game||'Game screenshot'):a.content_type)} · ${Math.round(a.confidence)}%</b><span>${escapeHtml(a.scene||'Scene analyzed')}</span><div><span class="look-badge">${escapeHtml(activeModel)}</span><span class="look-badge">${a.elements.length} materials</span><span class="look-badge">Scene Look v2</span></div></div>
    ${a.visual_style?`<div class="ai-card"><b>Rendering character</b><span>${escapeHtml(a.visual_style)}</span></div>`:''}
    <div class="ai-card"><b>Sky & atmosphere</b><span>${escapeHtml(s.analysis||atm.analysis||'Visible environment gradient analyzed.')}</span><div class="look-gradient" style="background:${skyGrad}"></div>${colorBadge('Zenith',s.zenith_hex)}${colorBadge('Mid',s.mid_hex)}${colorBadge('Horizon',s.horizon_hex)}${colorBadge('Fog',atm.fog_hex)}</div>
    <div class="ai-card"><b>Directional lighting</b><span>${escapeHtml(l.analysis||'Key/fill/bounce relationship estimated from visible shading.')}</span><div class="look-grid"><div class="look-row"><b>Key direction</b><small>Azimuth ${l.key_azimuth_deg.toFixed(0)}° · elevation ${l.key_elevation_deg.toFixed(0)}° · intensity ${l.key_intensity.toFixed(2)} · softness ${l.key_softness.toFixed(2)}</small></div><div class="look-row"><b>Fill / bounce</b><small>Fill ${l.fill_intensity.toFixed(2)} · ground bounce ${l.ground_bounce_intensity.toFixed(2)} · AO ${l.ao_strength.toFixed(2)}</small></div></div>${colorBadge('Key',l.key_hex)}${colorBadge('Fill',l.fill_hex)}${colorBadge('Bounce',l.ground_bounce_hex)}${colorBadge('Shadow',l.shadow_tint_hex)}</div>
    <div class="ai-card"><b>Color grade / render finish</b><span>${escapeHtml(g.analysis||'Global look estimated from screenshot output.')}</span><div class="look-grid"><div class="look-row"><b>${escapeHtml(g.tone_mapping)} tone character</b><small>Exposure ${g.exposure.toFixed(2)} · contrast ${g.contrast.toFixed(2)} · saturation ${g.saturation.toFixed(2)} · temperature ${g.temperature.toFixed(2)} · tint ${g.tint.toFixed(2)}</small></div><div class="look-row"><b>Finish</b><small>Highlight rolloff ${g.highlight_rolloff.toFixed(2)} · bloom ${g.bloom_strength.toFixed(2)} · vignette ${g.vignette_strength.toFixed(2)} · haze ${atm.haze_strength.toFixed(2)}</small></div></div></div>
    <div class="ai-card"><b>Materials & visible response</b><span>Base/lit/shadow colors are snapped back to real screenshot pixels inside each AI-located region.</span><div class="look-materials">${a.elements.map(e=>`<div class="look-material"><span class="look-material-swatch" style="background:${e.base_hex||'#808080'}"></span><span><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.material||e.category)} · base ${e.base_hex||'—'} · lit ${e.lit_hex||'—'} · shadow ${e.shadow_hex||'—'}<br>${escapeHtml(e.color_source)} · ${Math.round(e.color_source_confidence)}% inferred<br>${escapeHtml(e.texture_detail||'')}<br>${escapeHtml(e.recreation||'')}</small></span></div>`).join('')}</div></div>
    ${a.recreation_notes.length?`<div class="ai-card"><b>Closest-match priorities</b><span>${a.recreation_notes.map(n=>`• ${escapeHtml(n)}`).join('<br>')}</span></div>`:''}
    <div class="look-row"><b>Interpretation limit</b><small>Chrometry estimates the visible rendering recipe from one image. It does not claim to recover the original game's private shaders, source textures, LUTs or engine settings.</small></div>
  </div>`;}

  async function run(){
    if(running)return;const palette=readMeasuredPalette();if(!palette.length||!previewCanvas?.width){if(aiOutput)aiOutput.textContent='Load and analyze a screenshot first.';return;}
    running=true;aiBtn.disabled=true;if(analyzeBtn)analyzeBtn.disabled=true;if(aiBadge){aiBadge.textContent='Scene scan';aiBadge.className='status-pill';}if(aiOutput){aiOutput.className='ai-output';aiOutput.textContent='AI is reconstructing the scene look: gradients, light direction, atmosphere, grading, materials and object colors…';}progress(8,'Scene vision');log('Scene Look refinement requested.');
    try{const file=await visionFile(),prompt=buildPrompt(palette);progress(20,'Vision upload');const {result,model}=await callVision(prompt,file);activeModel=model;progress(58,'Reconstructing look');refined=normalize(parseJson(extractText(result)));progress(82,'Mapping pixels');renderRoles(refined);renderAI(refined);renderExport();if(paletteStatus)paletteStatus.textContent='Scene look refined';if(aiBadge){aiBadge.textContent='Applied';aiBadge.className='status-pill';}progress(100,'Scene matched');log(`Scene Look applied: ${refined.is_game?refined.game:refined.content_type}.`);}catch(e){const msg=errorMessage(e);console.error(e);if(aiBadge){aiBadge.textContent='Unavailable';aiBadge.className='status-pill neutral';}if(aiOutput)aiOutput.textContent=`Scene Look could not complete: ${msg}\n\nYour local measured palette is unchanged.`;progress(0,'AI error');log(`Scene Look unavailable: ${msg}`);}finally{running=false;aiBtn.disabled=false;if(analyzeBtn)analyzeBtn.disabled=false;}
  }

  aiBtn.addEventListener('click',e=>{e.preventDefault();run();});
  exportTabs.forEach(tab=>tab.addEventListener('click',()=>requestAnimationFrame(renderExport)));
  fileInput?.addEventListener('change',()=>{refined=null;activeModel='';});
})();
