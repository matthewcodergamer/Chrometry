(() => {
  'use strict';

  const aiBtn = document.getElementById('aiBtn');
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

  let refined = null;
  let running = false;

  const style = document.createElement('style');
  style.textContent = `
    .ai-object-grid{display:grid;gap:10px;margin-top:10px}
    .ai-object{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;align-items:center;padding:12px;border-radius:14px;background:var(--soft)}
    .ai-object-color{width:42px;height:42px;border-radius:11px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.10)}
    .ai-object b{display:block;font-size:13px;line-height:1.25}.ai-object small{display:block;margin-top:4px;color:var(--muted);font-size:10.5px;line-height:1.45}
    .ai-tech-note{margin-top:10px;padding:12px;border-radius:14px;background:var(--soft);font-size:11px;line-height:1.55;color:var(--muted)}
    .ai-tech-note b{color:var(--ink)}
    .ai-model-badge{display:inline-flex;align-items:center;min-height:25px;padding:0 9px;border-radius:999px;background:var(--soft);font-size:9px;font-weight:800;margin:4px 5px 0 0}
  `;
  document.head.appendChild(style);

  function setProgress(value, label) {
    if (progressBar) progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
    if (progressLabel) progressLabel.textContent = label;
  }

  function log(message) {
    if (!logEl) return;
    const row = document.createElement('div');
    row.className = 'log-row';
    const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    row.innerHTML = `<time>${escapeHtml(time)}</time><span>${escapeHtml(message)}</span>`;
    logEl.prepend(row);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  }

  function errorMessage(error) {
    if (error == null) return 'Unknown AI error';
    if (typeof error === 'string') return error;
    if (error instanceof Error && error.message) return error.message;
    const candidates = [error.message, error.error?.message, error.error, error.response?.message, error.statusText, error.code];
    for (const item of candidates) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {}
    return String(error);
  }

  function readMeasuredPalette() {
    return [...document.querySelectorAll('#swatches .swatch')].map(sw => {
      const hex = sw.querySelector('b')?.textContent?.trim()?.toUpperCase();
      const meta = sw.querySelector('small')?.textContent || '';
      const coverage = Number(meta.match(/([\d.]+)%/)?.[1] || 0);
      return /^#[0-9A-F]{6}$/.test(hex || '') ? {hex, coverage} : null;
    }).filter(Boolean);
  }

  function canvasToVisionFile() {
    return new Promise((resolve, reject) => {
      if (!previewCanvas?.width || !previewCanvas?.height) return reject(new Error('No screenshot is loaded.'));
      previewCanvas.toBlob(blob => {
        if (!blob) return reject(new Error('Safari could not prepare the screenshot for AI vision.'));
        resolve(new File([blob], 'chrometry-vision.jpg', {type:'image/jpeg', lastModified:Date.now()}));
      }, 'image/jpeg', 0.94);
    });
  }

  function extractText(response) {
    if (typeof response === 'string') return response;
    if (typeof response?.message?.content === 'string') return response.message.content;
    if (Array.isArray(response?.message?.content)) return response.message.content.map(x => x?.text || x?.content || '').join('');
    if (typeof response?.text === 'string') return response.text;
    if (typeof response?.content === 'string') return response.content;
    try { return JSON.stringify(response); } catch { return String(response); }
  }

  function parseJson(text) {
    const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return JSON.parse(cleaned); } catch {}
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('The vision model answered, but did not return a readable analysis plan.');
  }

  function validHex(v) {
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());
  }

  function clamp(v, min=0, max=1) {
    return Math.max(min, Math.min(max, Number(v) || 0));
  }

  function normalizeRegion(r) {
    if (!r || typeof r !== 'object') return null;
    const x = clamp(r.x), y = clamp(r.y), w = clamp(r.w), h = clamp(r.h);
    const cw = Math.min(w, 1-x), ch = Math.min(h, 1-y);
    if (cw < .01 || ch < .01) return null;
    return {x, y, w:cw, h:ch};
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    return m ? {r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16)} : null;
  }

  function rgbToHex(r,g,b) {
    return `#${[r,g,b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase()}`;
  }

  function rgbToLab(r,g,b) {
    let R=r/255,G=g/255,B=b/255;
    R=R>.04045?Math.pow((R+.055)/1.055,2.4):R/12.92;
    G=G>.04045?Math.pow((G+.055)/1.055,2.4):G/12.92;
    B=B>.04045?Math.pow((B+.055)/1.055,2.4):B/12.92;
    let x=(R*.4124+G*.3576+B*.1805)/.95047;
    let y=(R*.2126+G*.7152+B*.0722);
    let z=(R*.0193+G*.1192+B*.9505)/1.08883;
    const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;
    x=f(x);y=f(y);z=f(z);
    return [116*y-16,500*(x-y),200*(y-z)];
  }

  function labDistance2(a,b) {
    const dl=a[0]-b[0], da=a[1]-b[1], db=a[2]-b[2];
    return dl*dl+da*da+db*db;
  }

  function refineHexInRegion(targetHex, region) {
    if (!previewCanvas?.width || !previewCanvas?.height || !validHex(targetHex)) return validHex(targetHex) ? targetHex.toUpperCase() : null;
    const rgb = hexToRgb(targetHex);
    const targetLab = rgbToLab(rgb.r,rgb.g,rgb.b);
    const ctx = previewCanvas.getContext('2d', {willReadFrequently:true});
    const {width:w,height:h} = previewCanvas;
    const data = ctx.getImageData(0,0,w,h).data;
    const r = normalizeRegion(region) || {x:0,y:0,w:1,h:1};
    const x0 = Math.max(0, Math.floor(r.x*w));
    const y0 = Math.max(0, Math.floor(r.y*h));
    const x1 = Math.min(w-1, Math.ceil((r.x+r.w)*w));
    const y1 = Math.min(h-1, Math.ceil((r.y+r.h)*h));
    const step = Math.max(1, Math.round(Math.max(x1-x0,y1-y0)/180));
    let best = null, bestD = Infinity;
    for (let y=y0; y<=y1; y+=step) {
      for (let x=x0; x<=x1; x+=step) {
        const i=(y*w+x)*4;
        if (data[i+3] < 220) continue;
        const d = labDistance2(targetLab, rgbToLab(data[i],data[i+1],data[i+2]));
        if (d < bestD) { bestD=d; best={r:data[i],g:data[i+1],b:data[i+2]}; }
      }
    }
    return best ? rgbToHex(best.r,best.g,best.b) : targetHex.toUpperCase();
  }

  function normalizeAnalysis(raw) {
    const out = {
      content_type:String(raw?.content_type || 'other'),
      is_game:Boolean(raw?.is_game),
      game:String(raw?.game || 'Unknown'),
      confidence:clamp(raw?.confidence,0,100),
      scene:String(raw?.scene || ''),
      visual_style:String(raw?.visual_style || ''),
      lighting:raw?.lighting && typeof raw.lighting === 'object' ? raw.lighting : {},
      elements:Array.isArray(raw?.elements) ? raw.elements.slice(0,16) : [],
      capture_artifacts:Array.isArray(raw?.capture_artifacts) ? raw.capture_artifacts.slice(0,10) : [],
      recreation_notes:Array.isArray(raw?.recreation_notes) ? raw.recreation_notes.map(String).slice(0,8) : []
    };
    out.elements = out.elements.map((e,index) => {
      const region = normalizeRegion(e?.region);
      const baseAI = validHex(e?.base_hex) ? e.base_hex.toUpperCase() : null;
      const litAI = validHex(e?.lit_hex) ? e.lit_hex.toUpperCase() : baseAI;
      const shadowAI = validHex(e?.shadow_hex) ? e.shadow_hex.toUpperCase() : baseAI;
      return {
        id:index+1,
        name:String(e?.name || `Element ${index+1}`),
        category:String(e?.category || 'other'),
        region,
        confidence:clamp(e?.confidence,0,100),
        base_hex:baseAI ? refineHexInRegion(baseAI,region) : null,
        lit_hex:litAI ? refineHexInRegion(litAI,region) : null,
        shadow_hex:shadowAI ? refineHexInRegion(shadowAI,region) : null,
        color_source:String(e?.color_source || 'unknown'),
        color_source_confidence:clamp(e?.color_source_confidence,0,100),
        material:String(e?.material || ''),
        texture_detail:String(e?.texture_detail || ''),
        recreation:String(e?.recreation || ''),
        threejs:{
          roughness:clamp(e?.threejs?.roughness ?? .75,0,1),
          metalness:clamp(e?.threejs?.metalness ?? 0,0,1),
          opacity:clamp(e?.threejs?.opacity ?? 1,0,1),
          emissive_intensity:Math.max(0,Number(e?.threejs?.emissive_intensity)||0)
        }
      };
    }).filter(e => e.base_hex || e.lit_hex || e.shadow_hex);

    for (const key of ['sun_hex','sky_fill_hex','ambient_hex','shadow_tint_hex']) {
      if (validHex(out.lighting[key])) out.lighting[key] = out.lighting[key].toUpperCase();
      else out.lighting[key] = null;
    }
    out.lighting.sun_intensity = Math.max(0, Number(out.lighting.sun_intensity)||1.8);
    out.lighting.ambient_intensity = Math.max(0, Number(out.lighting.ambient_intensity)||.7);
    out.lighting.hemisphere_intensity = Math.max(0, Number(out.lighting.hemisphere_intensity)||1.0);
    out.lighting.exposure = Math.max(.1, Number(out.lighting.exposure)||1.0);
    out.lighting.time_of_day = String(out.lighting.time_of_day || 'unknown');
    out.lighting.direction = String(out.lighting.direction || 'unknown');
    out.lighting.analysis = String(out.lighting.analysis || '');
    return out;
  }

  function buildPrompt(palette) {
    const paletteText = palette.map((p,i)=>`${i+1}. ${p.hex} (${p.coverage.toFixed(1)}%)`).join(', ');
    return `You are Chrometry Vision, a game-art reverse-engineering assistant. Analyze the attached screenshot for a developer who wants to reproduce the visible LOOK in Three.js. The local CIELAB palette measured: ${paletteText || 'not available'}.

Your job is not merely to name colors. First decide whether this is a video-game screenshot. If it is, identify the game when reasonably confident (for example GTA V or Minecraft), identify visible scene objects/materials, separate real game content from HUD/capture artifacts, and explain how each observed color is probably produced.

IMPORTANT: A single screenshot cannot prove the exact original shader, texture/albedo, LUT, or lighting pipeline. Never present guesses as facts. For each object, classify the visible color source as texture_dominant, lighting_dominant, mixed, or unknown, and include a confidence score. For grass in a realistic game, distinguish the likely base/albedo texture from sunlight/sky fill/shadow tint when the image supports that inference.

For each useful visible element (sky, grass/vegetation, dirt/terrain, road, concrete, gate/fence/metal, building, vehicle, character/clothing, water, props, etc.), provide a normalized bounding region and three observed colors: representative/base, directly lit, and shadowed. Do not invent elements that are absent. Ignore browser borders, phone chrome, gallery UI, black capture bars, or unrelated screenshot artifacts. Game HUD may be listed as an artifact unless it is intentionally being analyzed.

Return ONLY strict JSON, no markdown, using this schema:
{
  "content_type":"game_screenshot|app_ui|photo|illustration|3d_render|webpage|other",
  "is_game":true,
  "game":"Grand Theft Auto V or Minecraft or Unknown",
  "confidence":0,
  "scene":"short scene description",
  "visual_style":"short description of rendering/color style",
  "capture_artifacts":[{"name":"HUD/minimap/browser edge/etc","region":{"x":0,"y":0,"w":0,"h":0},"confidence":0}],
  "lighting":{
    "sun_hex":"#RRGGBB or null",
    "sky_fill_hex":"#RRGGBB or null",
    "ambient_hex":"#RRGGBB or null",
    "shadow_tint_hex":"#RRGGBB or null",
    "sun_intensity":1.8,
    "ambient_intensity":0.7,
    "hemisphere_intensity":1.0,
    "exposure":1.0,
    "time_of_day":"midday/golden hour/night/etc",
    "direction":"where key light appears to come from",
    "analysis":"explain how lighting appears to alter the visible palette"
  },
  "elements":[{
    "name":"grass",
    "category":"vegetation",
    "region":{"x":0,"y":0,"w":0,"h":0},
    "confidence":0,
    "base_hex":"#RRGGBB",
    "lit_hex":"#RRGGBB",
    "shadow_hex":"#RRGGBB",
    "color_source":"texture_dominant|lighting_dominant|mixed|unknown",
    "color_source_confidence":0,
    "material":"grass blades / painted metal / asphalt / etc",
    "texture_detail":"what appears baked into the texture/albedo versus caused by light",
    "recreation":"specific practical advice for recreating this element in Three.js",
    "threejs":{"roughness":0.9,"metalness":0,"opacity":1,"emissive_intensity":0}
  }],
  "recreation_notes":["concise practical notes for reproducing the image's color/lighting aesthetic"]
}

Use colors actually visible in the image. Keep regions normalized 0..1. Prioritize the 6-14 most useful scene elements. If this is not a game, still analyze the visual palette intelligently but do not invent game-world objects.`;
  }

  async function callPuterVision(prompt, file) {
    if (!window.puter?.ai?.chat) throw new Error('Puter.js AI did not load. Check the connection and reopen Chrometry.');
    const attempts = [
      {name:'GPT-5.6 Luna', run:()=>window.puter.ai.chat(prompt, file, {model:'gpt-5.6-luna', temperature:.15, max_tokens:7000})},
      {name:'GPT-5.6 Luna compatibility mode', run:()=>window.puter.ai.chat(prompt, file, false, {model:'gpt-5.6-luna', temperature:.15, max_tokens:7000})}
    ];
    const errors=[];
    for (const attempt of attempts) {
      try {
        log(`AI vision: trying ${attempt.name}…`);
        const result = await attempt.run();
        return {result, model:attempt.name};
      } catch (error) {
        errors.push(`${attempt.name}: ${errorMessage(error)}`);
      }
    }
    throw new Error(errors.join(' | '));
  }

  function safeName(name) {
    const out = String(name || 'material').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    return out || 'material';
  }

  function colorLiteral(hex, fallback='0x808080') {
    return validHex(hex) ? `0x${hex.slice(1)}` : fallback;
  }

  function buildThreeJS(a) {
    const light = a.lighting || {};
    const gameName = a.is_game ? a.game : 'Non-game image';
    const materialLines = a.elements.map((e,i) => {
      const id = safeName(e.name) + (i ? `_${i+1}` : '');
      return `// ${e.name}: ${e.color_source} (${Math.round(e.color_source_confidence)}% inferred)\n// ${e.recreation || 'Match this material to the sampled screenshot colors.'}\nconst ${id}Material = new THREE.MeshStandardMaterial({\n  color: ${colorLiteral(e.base_hex)},\n  roughness: ${e.threejs.roughness.toFixed(2)},\n  metalness: ${e.threejs.metalness.toFixed(2)},\n  transparent: ${e.threejs.opacity < .999},\n  opacity: ${e.threejs.opacity.toFixed(2)}\n});`;
    }).join('\n\n');

    const elementObject = a.elements.map(e => `  ${JSON.stringify(safeName(e.name))}: { base:${colorLiteral(e.base_hex)}, lit:${colorLiteral(e.lit_hex,colorLiteral(e.base_hex))}, shadow:${colorLiteral(e.shadow_hex,colorLiteral(e.base_hex))} }`).join(',\n');

    return `// Chrometry AI Vision — Three.js recreation recipe\n// Detected: ${gameName} · ${Math.round(a.confidence)}% confidence\n// NOTE: texture-vs-lighting conclusions are image-based inferences, not extracted game shader data.\n\nconst CHROMETRY_LOOK = {\n  game: ${JSON.stringify(gameName)},\n  lighting: {\n    sun: ${colorLiteral(light.sun_hex,'0xFFFFFF')},\n    skyFill: ${colorLiteral(light.sky_fill_hex,'0x87A7C7')},\n    ambient: ${colorLiteral(light.ambient_hex,'0x404050')},\n    shadowTint: ${colorLiteral(light.shadow_tint_hex,'0x303844')},\n    sunIntensity: ${Number(light.sun_intensity||1.8).toFixed(2)},\n    ambientIntensity: ${Number(light.ambient_intensity||.7).toFixed(2)},\n    hemisphereIntensity: ${Number(light.hemisphere_intensity||1).toFixed(2)},\n    exposure: ${Number(light.exposure||1).toFixed(2)}\n  },\n  elements: {\n${elementObject}\n  }\n};\n\nrenderer.outputColorSpace = THREE.SRGBColorSpace;\nrenderer.toneMapping = THREE.ACESFilmicToneMapping;\nrenderer.toneMappingExposure = CHROMETRY_LOOK.lighting.exposure;\n\nconst hemi = new THREE.HemisphereLight(\n  CHROMETRY_LOOK.lighting.skyFill,\n  CHROMETRY_LOOK.lighting.shadowTint,\n  CHROMETRY_LOOK.lighting.hemisphereIntensity\n);\nscene.add(hemi);\n\nconst ambient = new THREE.AmbientLight(\n  CHROMETRY_LOOK.lighting.ambient,\n  CHROMETRY_LOOK.lighting.ambientIntensity\n);\nscene.add(ambient);\n\nconst sun = new THREE.DirectionalLight(\n  CHROMETRY_LOOK.lighting.sun,\n  CHROMETRY_LOOK.lighting.sunIntensity\n);\nsun.position.set(5, 9, 4); // Adjust direction to match the screenshot.\nsun.castShadow = true;\nscene.add(sun);\n\n${materialLines}`;
  }

  function buildCSS(a) {
    const lines=[];
    const l=a.lighting||{};
    if(validHex(l.sun_hex)) lines.push(`  --chrometry-sun: ${l.sun_hex};`);
    if(validHex(l.sky_fill_hex)) lines.push(`  --chrometry-sky-fill: ${l.sky_fill_hex};`);
    if(validHex(l.ambient_hex)) lines.push(`  --chrometry-ambient: ${l.ambient_hex};`);
    if(validHex(l.shadow_tint_hex)) lines.push(`  --chrometry-shadow-tint: ${l.shadow_tint_hex};`);
    a.elements.forEach((e,i)=>{
      const key=safeName(e.name)+(i?`-${i+1}`:'');
      if(e.base_hex) lines.push(`  --${key}-base: ${e.base_hex};`);
      if(e.lit_hex) lines.push(`  --${key}-lit: ${e.lit_hex};`);
      if(e.shadow_hex) lines.push(`  --${key}-shadow: ${e.shadow_hex};`);
    });
    return `/* Chrometry AI Vision · ${a.game || a.content_type} */\n:root {\n${lines.join('\n')}\n}`;
  }

  function renderExport() {
    if (!refined || !exportCode) return;
    const format = document.querySelector('.export-tab.active')?.dataset.format || 'json';
    if (format === 'three') exportCode.textContent = buildThreeJS(refined);
    else if (format === 'css') exportCode.textContent = buildCSS(refined);
    else exportCode.textContent = JSON.stringify(refined, null, 2);
  }

  function roleName(e) {
    const map={sky:'Sky / atmosphere',vegetation:'Vegetation / grass',grass:'Vegetation / grass',terrain:'Earth / terrain',ground:'Earth / terrain',road:'Road / asphalt',architecture:'Architecture / structure',metal:'Metal / gate',vehicle:'Vehicle',water:'Water',character:'Character / clothing',prop:'Prop / object'};
    return map[e.category] || e.name;
  }

  function renderRoles(a) {
    if (!roleGrid) return;
    roleGrid.innerHTML='';
    a.elements.slice(0,12).forEach(e => {
      const card=document.createElement('div');
      card.className='role-card';
      card.tabIndex=0;
      card.setAttribute('role','button');
      const hex=e.base_hex||e.lit_hex||e.shadow_hex||'#808080';
      card.title=e.recreation||e.texture_detail||'';
      card.innerHTML=`<span class="role-dot" style="background:${hex}"></span><span><b>${escapeHtml(roleName(e))}</b><small>${hex} · AI · ${escapeHtml(e.name)}</small></span>`;
      roleGrid.appendChild(card);
    });
    if (roleMode) roleMode.textContent = a.is_game ? 'AI · GAME' : 'AI · VISION';
    if (roleHint) roleHint.textContent = a.is_game
      ? `AI identified ${a.game || 'a game'} and mapped visible objects/materials to screenshot-measured colors. Tap any role to locate that color in the image.`
      : 'AI classified this as non-game imagery and mapped visible elements without forcing game-specific labels.';
  }

  function renderAI(a, modelName) {
    if (!aiOutput) return;
    const l=a.lighting||{};
    const lightingColors=[['Sun',l.sun_hex],['Sky fill',l.sky_fill_hex],['Ambient',l.ambient_hex],['Shadow tint',l.shadow_tint_hex]].filter(([,v])=>validHex(v));
    aiOutput.className='ai-output';
    aiOutput.innerHTML=`
      <div class="ai-grid">
        <div class="ai-card"><b>${escapeHtml(a.is_game ? (a.game||'Game screenshot') : a.content_type)} · ${Math.round(a.confidence)}%</b><span>${escapeHtml(a.scene||'Scene analyzed')}</span><div><span class="ai-model-badge">${escapeHtml(modelName)}</span><span class="ai-model-badge">${a.elements.length} mapped elements</span></div></div>
        ${a.visual_style?`<div class="ai-card"><b>Rendering / visual style</b><span>${escapeHtml(a.visual_style)}</span></div>`:''}
        <div class="ai-card"><b>Lighting reconstruction</b><span>${escapeHtml(l.analysis||'Lighting colors and intensities inferred from the screenshot.')}</span>${lightingColors.length?`<div class="ai-object-grid">${lightingColors.map(([name,hex])=>`<div class="ai-object"><span class="ai-object-color" style="background:${hex}"></span><span><b>${name}</b><small>${hex}</small></span></div>`).join('')}</div>`:''}</div>
        <div class="ai-card"><b>Objects & materials</b><span>These are AI-located objects with their colors snapped back to real screenshot pixels.</span><div class="ai-object-grid">${a.elements.map(e=>`<div class="ai-object"><span class="ai-object-color" style="background:${e.base_hex||'#808080'}"></span><span><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.material||e.category)} · base ${e.base_hex||'—'} · lit ${e.lit_hex||'—'} · shadow ${e.shadow_hex||'—'}<br>${escapeHtml(e.color_source)} · ${Math.round(e.color_source_confidence)}% confidence<br>${escapeHtml(e.recreation||'')}</small></span></div>`).join('')}</div></div>
        ${a.recreation_notes.length?`<div class="ai-card"><b>Recreation notes</b><span>${a.recreation_notes.map(n=>`• ${escapeHtml(n)}`).join('<br>')}</span></div>`:''}
        <div class="ai-tech-note"><b>Important:</b> Chrometry can infer whether a visible color is probably texture/albedo, lighting, or a mix from the screenshot, but it cannot recover GTA V's exact internal shaders or source textures from one image. The export is a practical visual reconstruction recipe.</div>
      </div>`;
  }

  async function runRefinement() {
    if (running) return;
    const palette=readMeasuredPalette();
    if (!palette.length || !previewCanvas?.width) {
      if (aiOutput) aiOutput.textContent='Load and analyze a screenshot first.';
      return;
    }
    running=true;
    aiBtn.disabled=true;
    if (analyzeBtn) analyzeBtn.disabled=true;
    if (aiBadge) { aiBadge.textContent='Inspecting'; aiBadge.className='status-pill'; }
    if (aiOutput) { aiOutput.className='ai-output'; aiOutput.textContent='AI is identifying the game, objects, materials, lighting, and screenshot artifacts…'; }
    setProgress(8,'AI vision');
    log('AI Vision refinement requested with an explicit multimodal model.');
    try {
      const file=await canvasToVisionFile();
      const prompt=buildPrompt(palette);
      setProgress(20,'Uploading vision');
      const {result,model}=await callPuterVision(prompt,file);
      setProgress(58,'Understanding scene');
      const raw=parseJson(extractText(result));
      refined=normalizeAnalysis(raw);
      setProgress(82,'Mapping real pixels');
      renderRoles(refined);
      renderAI(refined,model);
      renderExport();
      if (paletteStatus) paletteStatus.textContent='AI vision refined';
      if (aiBadge) { aiBadge.textContent='Applied'; aiBadge.className='status-pill'; }
      setProgress(100,'AI refined');
      log(`AI Vision applied: ${refined.is_game ? refined.game : refined.content_type}; ${refined.elements.length} scene elements mapped.`);
    } catch (error) {
      const message=errorMessage(error);
      console.error('Chrometry AI Vision error:',error);
      if (aiBadge) { aiBadge.textContent='Unavailable'; aiBadge.className='status-pill neutral'; }
      if (aiOutput) aiOutput.innerHTML=`<div class="ai-card"><b>AI refinement could not complete</b><span>${escapeHtml(message)}</span></div><div class="ai-tech-note">The local palette remains unchanged. If Puter asks you to sign in or approve AI usage, complete that step and tap Refine again.</div>`;
      setProgress(0,'AI error');
      log(`AI Vision error: ${message}`);
    } finally {
      running=false;
      aiBtn.disabled=false;
      if (analyzeBtn) analyzeBtn.disabled=false;
    }
  }

  // Capture the button before the legacy handler in app.js. The legacy call used the
  // default chat model, which may be text-only; this path explicitly uses a vision model.
  document.addEventListener('click', event => {
    const button=event.target.closest?.('#aiBtn');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    runRefinement();
  }, true);

  // Keep AI-generated exports active when the user switches JSON/CSS/Three.js tabs.
  document.addEventListener('click', event => {
    if (!event.target.closest?.('.export-tab')) return;
    if (!refined) return;
    requestAnimationFrame(renderExport);
  });

  fileInput?.addEventListener('change',()=>{ refined=null; });
  analyzeBtn?.addEventListener('click',()=>{ refined=null; });
})();
