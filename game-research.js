(() => {
  'use strict';

  const aiOutput = document.getElementById('aiOutput');
  const aiBadge = document.getElementById('aiBadge');
  const roleMode = document.getElementById('roleMode');
  const exportCode = document.getElementById('exportCode');
  const exportTabs = [...document.querySelectorAll('.export-tab')];
  const fileInput = document.getElementById('fileInput');
  const logEl = document.getElementById('log');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');

  if (!aiOutput || !aiBadge) return;

  let running = false;
  let lastGame = '';
  let research = null;
  let exportGuard = false;
  const EXPORT_MARKER = '/* CHROMETRY_GAME_RESEARCH */';

  const style = document.createElement('style');
  style.textContent = `
    .game-research-card{margin-top:10px}
    .research-source-list{display:grid;gap:8px;margin-top:10px}
    .research-source{padding:10px 12px;border-radius:13px;background:var(--soft)}
    .research-source b{display:block;font-size:11px;line-height:1.35;color:var(--ink)}
    .research-source small{display:block;margin-top:4px;font-size:9.7px;line-height:1.5;color:var(--muted)}
    .research-source a{color:#6f99ff;text-decoration:none;word-break:break-word}
    .research-badge{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;background:var(--soft);font-size:9px;font-weight:800;margin:5px 5px 0 0}
  `;
  document.head.appendChild(style);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v,min=0,max=100) => Math.max(min,Math.min(max,Number(v)||0));

  function log(message) {
    if (!logEl) return;
    const row = document.createElement('div');
    row.className = 'log-row';
    const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    row.innerHTML = `<time>${esc(time)}</time><span>${esc(message)}</span>`;
    logEl.prepend(row);
  }

  function progress(value,label) {
    if (progressBar) progressBar.style.width = `${clamp(value)}%`;
    if (progressLabel) progressLabel.textContent = label;
  }

  function errorMessage(error) {
    if (error == null) return 'Unknown research error';
    if (typeof error === 'string') return error;
    const candidates=[error.message,error.error?.message,error.error,error.response?.message,error.statusText,error.code,error.details?.message];
    for(const item of candidates) if(typeof item==='string'&&item.trim()) return item.trim();
    try { const s=JSON.stringify(error); if(s&&s!=='{}') return s; } catch {}
    return String(error);
  }

  function extractText(response) {
    if (typeof response === 'string') return response;
    if (typeof response?.message?.content === 'string') return response.message.content;
    if (Array.isArray(response?.message?.content)) return response.message.content.map(x=>x?.text||x?.content||'').join('');
    if (typeof response?.text === 'string') return response.text;
    if (typeof response?.content === 'string') return response.content;
    try { return JSON.stringify(response); } catch { return String(response); }
  }

  function parseJson(text) {
    const cleaned=String(text||'').replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/i,'').trim();
    try { return JSON.parse(cleaned); } catch {}
    const a=cleaned.indexOf('{'),b=cleaned.lastIndexOf('}');
    if(a>=0&&b>a) return JSON.parse(cleaned.slice(a,b+1));
    throw new Error('Web research returned an unreadable result.');
  }

  function safeUrl(value) {
    try {
      const u=new URL(String(value||''));
      return /^https?:$/.test(u.protocol) ? u.href : null;
    } catch { return null; }
  }

  function normalizeResearch(raw, game) {
    const findings=(Array.isArray(raw?.findings)?raw.findings:[]).slice(0,12).map(f=>({
      topic:String(f?.topic||'Technical finding'),
      claim:String(f?.claim||''),
      confidence:clamp(f?.confidence),
      evidence_level:String(f?.evidence_level||'secondary'),
      practical_use:String(f?.practical_use||''),
      source_title:String(f?.source_title||''),
      source_url:safeUrl(f?.source_url)
    })).filter(f=>f.claim);
    const adjustments=(Array.isArray(raw?.threejs_adjustments)?raw.threejs_adjustments:[]).slice(0,12).map(a=>({
      setting:String(a?.setting||''),value:String(a?.value||''),reason:String(a?.reason||''),evidence_level:String(a?.evidence_level||'research-informed')
    })).filter(a=>a.setting||a.reason);
    return {
      game:String(raw?.game||game),
      engine:String(raw?.engine||'Unknown'),
      platform_scope:String(raw?.platform_scope||'Unspecified'),
      confidence:clamp(raw?.confidence),
      summary:String(raw?.summary||''),
      findings,
      threejs_adjustments:adjustments,
      caveats:(Array.isArray(raw?.caveats)?raw.caveats:[]).map(String).slice(0,8),
      researched_at:new Date().toISOString()
    };
  }

  function detectedGame() {
    if (!String(roleMode?.textContent||'').includes('SCENE')) return null;
    const heading=aiOutput.querySelector('.ai-card b')?.textContent?.trim() || '';
    const match=heading.match(/^(.+?)\s*[·•]\s*(\d{1,3})%/);
    if (!match) return null;
    const game=match[1].trim();
    const confidence=Number(match[2]);
    if (!game || /^unknown$/i.test(game) || confidence < 55) return null;
    return {game,confidence};
  }

  function researchPrompt(game, confidence) {
    const visualSummary=aiOutput.innerText.replace(/\s+/g,' ').slice(0,6500);
    return `You are the public technical-research stage for Chrometry. The vision stage tentatively identified the screenshot as ${game} with ${confidence}% confidence. Its image-only observations are below:\n\n${visualSummary}\n\nUse web search to research RELIABLE PUBLIC TECHNICAL INFORMATION about how ${game} produces its visual look. The goal is to strengthen a Three.js visual recreation, not to copy proprietary assets or pretend hidden engine values are known.\n\nResearch topics when reliable sources exist:\n- engine/rendering architecture and renderer/API where publicly documented\n- direct/key lighting, shadow techniques and softness\n- ambient occlusion/contact shadow behavior\n- sky, fog, haze, aerial perspective, weather/time-of-day systems\n- HDR/exposure, tone mapping, bloom, glare, lens flare, depth of field and other post FX\n- vegetation/grass rendering, alpha-tested foliage, normals, tessellation, wind, density or shading\n- material/shader quality, reflections, water and anisotropic filtering where relevant\n- platform/version differences that materially change the look\n\nSOURCE RULES:\n1. Prefer official developer/publisher documentation, GPU-vendor technical guides, developer presentations, respected graphics analyses, and primary technical sources.\n2. Distinguish verified documented facts from reasonable inference. Do not turn forum guesses or mod settings into facts.\n3. Do not override screenshot-measured colors simply because a webpage describes the game. Web research should explain HOW to reproduce the rendering behavior and validate or challenge the visual inference.\n4. If the detected game identity looks inconsistent with the research, say so in caveats rather than forcing it.\n5. Give direct source URLs for claims whenever possible.\n\nReturn ONLY strict JSON:\n{\n  \"game\":\"${game}\",\n  \"engine\":\"engine name or Unknown\",\n  \"platform_scope\":\"PC/console/version scope of the findings\",\n  \"confidence\":0,\n  \"summary\":\"how public research strengthens or qualifies the screenshot analysis\",\n  \"findings\":[{\n    \"topic\":\"grass|lighting|shadows|post_fx|ao|atmosphere|materials|renderer|etc\",\n    \"claim\":\"concise technical finding\",\n    \"confidence\":0,\n    \"evidence_level\":\"official|vendor_technical|technical_analysis|inference\",\n    \"practical_use\":\"specific way to use this when recreating the look in Three.js\",\n    \"source_title\":\"source title\",\n    \"source_url\":\"https://...\"\n  }],\n  \"threejs_adjustments\":[{\"setting\":\"setting or technique\",\"value\":\"suggested implementation/value/range\",\"reason\":\"why it helps match this game\",\"evidence_level\":\"documented|research-informed|visual-estimate\"}],\n  \"caveats\":[\"what remains unknown or platform-dependent\"]\n}`;
  }

  async function doResearch(game, confidence) {
    if (!window.puter?.ai?.chat) throw new Error('Puter AI is unavailable.');
    const prompt=researchPrompt(game,confidence);
    const response=await window.puter.ai.chat(prompt, {
      model:'openai/gpt-5.6-luna',
      temperature:.1,
      max_tokens:6500,
      tools:[{type:'web_search'}]
    });
    return normalizeResearch(parseJson(extractText(response)),game);
  }

  function renderResearch() {
    aiOutput.querySelector('.game-research-card')?.remove();
    if (!research) return;
    const card=document.createElement('div');
    card.className='ai-card game-research-card';
    const sources=research.findings.filter(f=>f.source_url).slice(0,8);
    card.innerHTML=`<b>Game-specific web research</b><span>${esc(research.summary||`Public technical sources were checked for ${research.game}.`)}</span>
      <div><span class="research-badge">${esc(research.engine)}</span><span class="research-badge">${Math.round(research.confidence)}% research confidence</span><span class="research-badge">${esc(research.platform_scope)}</span></div>
      <div class="research-source-list">${research.findings.slice(0,8).map(f=>`<div class="research-source"><b>${esc(f.topic)} · ${esc(f.evidence_level)} · ${Math.round(f.confidence)}%</b><small>${esc(f.claim)}${f.practical_use?`<br><strong>Three.js:</strong> ${esc(f.practical_use)}`:''}${f.source_url?`<br><a href="${esc(f.source_url)}" target="_blank" rel="noopener noreferrer">${esc(f.source_title||f.source_url)}</a>`:''}</small></div>`).join('')}</div>
      ${research.caveats.length?`<small style="display:block;margin-top:10px">${research.caveats.map(c=>`• ${esc(c)}`).join('<br>')}</small>`:''}`;
    aiOutput.querySelector('.ai-grid')?.appendChild(card);
  }

  function stripResearchBlock(text) {
    const i=String(text||'').indexOf(EXPORT_MARKER);
    return i>=0 ? String(text).slice(0,i).trimEnd() : String(text||'');
  }

  function enrichExport() {
    if (!research || !exportCode || exportGuard) return;
    exportGuard=true;
    try {
      const format=document.querySelector('.export-tab.active')?.dataset.format||'json';
      const base=stripResearchBlock(exportCode.textContent);
      if(format==='json') {
        try {
          const obj=JSON.parse(base);
          obj.web_research=research;
          exportCode.textContent=JSON.stringify(obj,null,2);
        } catch {
          exportCode.textContent=base;
        }
      } else if(format==='three') {
        const concise={game:research.game,engine:research.engine,platform_scope:research.platform_scope,confidence:research.confidence,findings:research.findings.map(f=>({topic:f.topic,claim:f.claim,evidence_level:f.evidence_level,practical_use:f.practical_use,source_url:f.source_url})),threejs_adjustments:research.threejs_adjustments,caveats:research.caveats};
        exportCode.textContent=`${base}\n\n${EXPORT_MARKER}\n// Public web research supplements the screenshot analysis; it does not replace measured colors.\nconst CHROMETRY_GAME_RESEARCH = ${JSON.stringify(concise,null,2)};\n\n// RESEARCH-INFORMED RECREATION ADJUSTMENTS\n${research.threejs_adjustments.map(a=>`// ${a.setting}: ${a.value} — ${a.reason} [${a.evidence_level}]`).join('\n')}`;
      } else {
        exportCode.textContent=`${base}\n\n${EXPORT_MARKER}\n/* Public research for ${research.game} (${research.engine})\n${research.findings.slice(0,8).map(f=>`- ${f.topic}: ${f.claim}${f.source_url?` — ${f.source_url}`:''}`).join('\n')}\n*/`;
      }
    } finally {
      exportGuard=false;
    }
  }

  async function maybeResearch() {
    if(running || aiBadge.textContent.trim()!=='Applied') return;
    const detected=detectedGame();
    if(!detected || detected.game===lastGame) return;
    running=true;
    lastGame=detected.game;
    log(`Researching ${detected.game} rendering techniques on the web…`);
    progress(92,'Game research');
    try {
      research=await doResearch(detected.game,detected.confidence);
      window.__chrometryGameResearch=research;
      renderResearch();
      enrichExport();
      progress(100,'Scene + research');
      log(`Game research applied: ${research.game} · ${research.findings.length} sourced findings.`);
    } catch(error) {
      console.warn('Chrometry game research unavailable:',error);
      log(`Game-specific web research unavailable: ${errorMessage(error)}`);
      progress(100,'Scene matched');
    } finally {
      running=false;
    }
  }

  const observer=new MutationObserver(()=>{
    window.clearTimeout(observer._t);
    observer._t=window.setTimeout(maybeResearch,80);
  });
  observer.observe(aiBadge,{childList:true,characterData:true,subtree:true});

  exportTabs.forEach(tab=>tab.addEventListener('click',()=>window.setTimeout(enrichExport,70)));
  const exportObserver=new MutationObserver(()=>{
    if(research&&!exportGuard) window.setTimeout(enrichExport,20);
  });
  if(exportCode) exportObserver.observe(exportCode,{childList:true,characterData:true,subtree:true});

  fileInput?.addEventListener('change',()=>{
    research=null;
    lastGame='';
    window.__chrometryGameResearch=null;
  });
})();