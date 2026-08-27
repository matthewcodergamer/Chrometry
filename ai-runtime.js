(() => {
  'use strict';

  const aiBtn = document.getElementById('aiBtn');
  const aiBadge = document.getElementById('aiBadge');
  const aiOutput = document.getElementById('aiOutput');
  const aiShell = document.querySelector('.ai-card-shell');
  const logEl = document.getElementById('log');

  if (!aiBtn || !window.puter) return;

  const style = document.createElement('style');
  style.textContent = `
    .chrometry-ai-account{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 10px;padding:10px 12px;border-radius:14px;background:var(--soft)}
    .chrometry-ai-account-copy{min-width:0;display:grid;gap:2px}.chrometry-ai-account-copy b{font-size:10.5px;line-height:1.2;color:var(--ink)}.chrometry-ai-account-copy small{font-size:9px;line-height:1.35;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .chrometry-ai-account-btn{min-width:76px;min-height:36px;padding:0 12px;border:0;border-radius:12px;background:var(--control-glass,var(--soft));color:var(--ink);font:inherit;font-size:10px;font-weight:800;white-space:nowrap;-webkit-tap-highlight-color:transparent}
    .chrometry-ai-account-btn:active{transform:scale(.98)}
  `;
  document.head.appendChild(style);

  const accountRow = document.createElement('div');
  accountRow.className = 'chrometry-ai-account';
  accountRow.innerHTML = `
    <span class="chrometry-ai-account-copy"><b>AI account</b><small id="chrometryAiAccountState">Checking Puter sign-in…</small></span>
    <button id="chrometryAiAccountBtn" class="chrometry-ai-account-btn" type="button">Sign in</button>`;
  aiBtn.before(accountRow);

  const stateEl = accountRow.querySelector('#chrometryAiAccountState');
  const accountBtn = accountRow.querySelector('#chrometryAiAccountBtn');
  let authRunning = false;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function log(message) {
    if (!logEl) return;
    const row = document.createElement('div');
    row.className = 'log-row';
    const time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    row.innerHTML = `<time>${escapeHtml(time)}</time><span>${escapeHtml(message)}</span>`;
    logEl.prepend(row);
  }

  function isSignedIn() {
    try { return Boolean(window.puter?.auth?.isSignedIn?.()); }
    catch { return false; }
  }

  function authErrorMessage(error) {
    if (!error) return 'Sign-in did not complete.';
    if (typeof error === 'string') return error;
    for (const value of [error.msg,error.message,error.error?.message,error.error,error.code]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    try { const json=JSON.stringify(error); if(json && json!=='{}') return json; } catch {}
    return 'Sign-in did not complete.';
  }

  async function refreshAccountUI() {
    const signed = isSignedIn();
    if (!signed) {
      stateEl.textContent = 'Sign in once to use vision + game web research.';
      accountBtn.textContent = 'Sign in';
      if (['Optional','Unavailable','Sign in'].includes(aiBadge?.textContent?.trim())) {
        aiBadge.textContent = 'Sign in';
        aiBadge.className = 'status-pill neutral';
      }
      return;
    }

    accountBtn.textContent = 'Switch';
    let label = 'Puter account connected · AI ready';
    try {
      const user = await window.puter.auth.getUser?.();
      const name = user?.username || user?.name;
      if (name) label = `${name} · AI ready`;
    } catch {}
    stateEl.textContent = label;
    if (['Optional','Unavailable','Sign in'].includes(aiBadge?.textContent?.trim())) {
      aiBadge.textContent = 'AI ready';
      aiBadge.className = 'status-pill neutral';
    }
  }

  function presentAuthCancelled(message) {
    if (aiBadge) {
      aiBadge.textContent = 'Sign in';
      aiBadge.className = 'status-pill neutral';
    }
    if (aiOutput) {
      aiOutput.className = 'ai-output';
      aiOutput.innerHTML = `<b>AI sign-in is required.</b><br><br>${escapeHtml(message)}<br><br>Your local measured palette is unchanged. Tap <b>Sign in</b> or tap <b>Reconstruct scene look with AI</b> again to open the account window.`;
    }
  }

  async function signIn({switchAccount=false}={}) {
    if (authRunning) return false;
    if (isSignedIn() && !switchAccount) return true;
    authRunning = true;
    accountBtn.disabled = true;
    stateEl.textContent = switchAccount ? 'Opening account chooser…' : 'Opening secure Puter sign-in…';
    try {
      if (!window.puter?.auth?.signIn) throw new Error('Puter authentication did not load. Refresh Chrometry and try again.');
      await window.puter.auth.signIn(switchAccount ? {request_auth:true} : undefined);
      await refreshAccountUI();
      log('AI account connected.');
      return true;
    } catch (error) {
      const msg = authErrorMessage(error);
      stateEl.textContent = /closed|cancel/i.test(msg) ? 'Sign-in was canceled. Tap Sign in to try again.' : msg;
      presentAuthCancelled(msg);
      log(`AI sign-in did not complete: ${msg}`);
      return false;
    } finally {
      authRunning = false;
      accountBtn.disabled = false;
    }
  }

  accountBtn.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    await signIn({switchAccount:isSignedIn()});
  });

  // Puter requires popup authentication to begin directly from a user gesture.
  // Intercept the AI button in capture phase BEFORE the Scene Look listener. If the
  // user is not signed in, authenticate now; only after success do we replay the click.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('#aiBtn');
    if (!target || isSignedIn() || authRunning) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    signIn().then(ok => {
      if (ok) window.setTimeout(() => document.getElementById('aiBtn')?.click(), 0);
    });
  }, true);

  // Strengthen the two existing AI stages without duplicating them. Scene Look keeps
  // using the screenshot model; Game Research keeps using OpenAI web_search. This
  // wrapper adds explicit UI/texture instructions and a documented research-model
  // fallback while preserving the original argument signatures.
  if (!window.puter.ai.__chrometryWrapped) {
    const originalChat = window.puter.ai.chat.bind(window.puter.ai);

    window.puter.ai.chat = async (...inputArgs) => {
      const args = [...inputArgs];
      const promptIndex = typeof args[0] === 'string' ? 0 : -1;
      const prompt = promptIndex === 0 ? args[0] : '';
      let optionsIndex = -1;
      for (let i=args.length-1;i>=0;i--) {
        const value=args[i];
        if (value && typeof value==='object' && !Array.isArray(value) && !(value instanceof Blob) && !(value instanceof File)) { optionsIndex=i; break; }
      }
      const options = optionsIndex >= 0 ? args[optionsIndex] : null;

      if (promptIndex === 0 && /Chrometry Scene Look/i.test(prompt)) {
        args[0] = `${prompt}\n\nCHROMETRY IMPLEMENTATION ADDENDUM:\n- If the image is primarily an in-game HUD, pause/menu, map, inventory, phone, weapon wheel, subtitle layout, or other intentional game UI reference, treat that UI as intended content instead of a capture artifact. Describe anchoring, spacing, margins, alignment, panel opacity, corner radius, typography scale/weight, icon sizing, hierarchy and safe-area positioning in recreation_notes.\n- For every material, make texture_detail useful as a texture recipe: base color variation, approximate scale/frequency, macro vs micro breakup, roughness variation, normal/height character, edge wear/dirt when visible, and how lighting modifies it. Do not claim you recovered an original proprietary texture.\n- Do NOT generate an image or texture. Provide a reconstruction recipe only; Chrometry will use the user's own texture assets unless they explicitly choose a future texture-generation feature.`;
      }

      if (promptIndex === 0 && /public technical-research stage for Chrometry/i.test(prompt)) {
        args[0] = `${prompt}\n\nAlso research game-specific UI/rendering references when relevant: HUD scaling/placement, UI safe-zone behavior, color treatment, post-processing, sky/weather and material/vegetation techniques. Prefer primary/official or respected graphics-analysis sources. If sources disagree, preserve the disagreement rather than inventing certainty.`;
      }

      try {
        return await originalChat(...args);
      } catch (error) {
        const msg = authErrorMessage(error);
        if (/auth|sign.?in|cancel|consent|window_closed/i.test(msg)) throw error;

        // Puter's documented web-search examples support OpenAI models. If the newest
        // model route is temporarily unavailable, use the documented GPT-5.2 search
        // route rather than losing the research stage altogether.
        if (options && Array.isArray(options.tools) && options.tools.some(t=>t?.type==='web_search')) {
          const fallbackArgs=[...args];
          fallbackArgs[optionsIndex] = {...options, model:'openai/gpt-5.2-chat'};
          log('Web research model unavailable; retrying with OpenAI GPT-5.2 web search…');
          return originalChat(...fallbackArgs);
        }

        // Normalize the explicit provider route for the documented image-analysis model.
        if (options && options.model === 'gpt-5.6-luna') {
          const fallbackArgs=[...args];
          fallbackArgs[optionsIndex] = {...options, model:'openai/gpt-5.6-luna'};
          log('Vision route unavailable; retrying the OpenAI-prefixed GPT-5.6 Luna route…');
          return originalChat(...fallbackArgs);
        }
        throw error;
      }
    };
    window.puter.ai.__chrometryWrapped = true;
  }

  window.addEventListener('focus', refreshAccountUI);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAccountUI(); });
  refreshAccountUI();
})();