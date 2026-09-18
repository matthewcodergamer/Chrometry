(() => {
  'use strict';

  const API = window.CHROMETRY_API_BASE_URL || localStorage.getItem('chrometry-api-base') || '';
  const WEB_URL = window.CHROMETRY_WEB_URL || 'https://matthewcodergamer.github.io/Chrometry/';
  const LICENSE_KEY = 'chrometry-pro-license-v1';
  const state = { token: null, pro: false, busy: false };

  const $ = (id) => document.getElementById(id);
  const api = (path) => API ? `${API.replace(/\/$/, '')}${path}` : path;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function readToken() {
    try { return localStorage.getItem(LICENSE_KEY); } catch { return null; }
  }

  function saveToken(value) {
    try { localStorage.setItem(LICENSE_KEY, value); } catch {}
  }

  function clearToken() {
    try { localStorage.removeItem(LICENSE_KEY); } catch {}
  }

  function setStatus(message, error = false) {
    const el = $('billingStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = error ? '#ff453a' : '';
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .chrometry-pro-card{position:relative;overflow:hidden}
      .chrometry-pro-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 90% 0%,rgba(111,214,255,.15),transparent 38%)}
      .chrometry-pro-copy{font-size:11px;line-height:1.55;color:var(--muted)}
      .chrometry-pro-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .chrometry-pro-actions .action-btn{margin-top:0;flex:1 1 150px}
      .chrometry-pro-actions .quiet-btn{margin-top:0;min-height:40px;font-size:10px}
      .chrometry-billing-status{min-height:18px;margin-top:8px;font-size:9px;color:var(--muted)}
      .chrometry-license{display:grid;gap:7px;margin-top:10px}.chrometry-license input{min-height:40px;border-radius:12px;border:1px solid rgba(127,127,127,.22);padding:0 10px;background:rgba(127,127,127,.06);color:inherit;font:inherit;font-size:10px}.chrometry-code{display:grid;gap:6px;margin-top:10px;padding:10px;border-radius:12px;background:rgba(127,127,127,.07);font-size:9px}.chrometry-code code{font-size:8px;line-height:1.4;word-break:break-all;user-select:all}
      .chrometry-pro-card.pro-active{box-shadow:inset 0 0 0 1px rgba(114,220,147,.28),0 12px 30px rgba(0,0,0,.05)}
      .chrometry-lock{margin-left:6px;font-size:9px;font-weight:800;color:var(--muted)}
      .chrometry-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.46);backdrop-filter:blur(18px)}
      .chrometry-modal-card{width:min(440px,100%);padding:22px;border-radius:24px;background:var(--surface-solid,#fff);color:var(--ink,#111);box-shadow:0 24px 80px rgba(0,0,0,.25)}
      .chrometry-modal-card h3{font-size:22px;margin:0 0 7px}
      .chrometry-modal-card p{font-size:12px;line-height:1.55;color:var(--muted);margin:0 0 16px}
      .chrometry-ad{margin:10px 0;padding:12px 13px;border:1px solid rgba(127,127,127,.18);border-radius:15px;background:rgba(127,127,127,.055);font-size:10px;line-height:1.45}
      .chrometry-ad-label{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:800;margin-bottom:5px}
      .chrometry-ad a{display:block;color:inherit;text-decoration:none}
      .chrometry-ad strong{display:block;font-size:11px;margin-bottom:3px}
      .chrometry-ad small{display:block;color:var(--muted)}
      .chrometry-ad img{width:100%;max-height:86px;object-fit:cover;border-radius:9px;margin-bottom:8px}
    `;
    document.head.appendChild(style);
  }

  function createPlanCard() {
    if (document.getElementById('chrometryProCard')) return;
    const card = document.createElement('section');
    card.id = 'chrometryProCard';
    card.className = 'card chrometry-pro-card';
    card.innerHTML = `
      <div class="section-head">
        <div><span class="section-kicker">CHROMETRY PRO</span><h2 id="planTitle">Free plan</h2></div>
        <span id="planBadge" class="status-pill neutral">FREE</span>
      </div>
      <div id="planCopy" class="chrometry-pro-copy">Local palette extraction stays free. The web version is free to use and may show Google AdSense ads. Pro unlocks Scene Look AI and removes web ads. The extension local analyzer remains available without payment.</div>
      <div class="chrometry-pro-actions">
        <button id="upgrade" class="action-btn" type="button">Upgrade to Pro</button>
        <button id="manage" class="quiet-btn" type="button" hidden>Manage subscription</button>\n        <a id="freeWeb" class="quiet-btn" href="#" target="_blank" rel="noopener">Use free web version</a>
      </div>
      <div class="chrometry-license"><input id="licenseInput" type="text" placeholder="Paste Pro activation code" autocomplete="off" spellcheck="false"><button id="activateBtn" class="quiet-btn" type="button">Activate existing Pro</button></div>\n      <div id="billingStatus" class="chrometry-billing-status" aria-live="polite"></div><div class="chrometry-code" hidden><b>Activation code</b><code id="activationCode"></code><small>Copy this code into the extension after purchasing on the web.</small></div>`;
    document.querySelector('.workspace aside')?.prepend(card);
    const freeWeb = $('freeWeb'); if (freeWeb) freeWeb.href = WEB_URL;
    $('upgrade')?.addEventListener('click', checkout);
    $('manage')?.addEventListener('click', openPortal);
    $('activateBtn')?.addEventListener('click', activateCode);
  }

  function setPro(active) {
    state.pro = Boolean(active);
    const card = $('chrometryProCard');
    const title = $('planTitle');
    const badge = $('planBadge');
    const copy = $('planCopy');
    const upgrade = $('upgrade');
    const manage = $('manage');

    card?.classList.toggle('pro-active', state.pro);

    if (state.pro) {
      if (title) title.textContent = 'Chrometry Pro';
      if (badge) { badge.textContent = 'PRO'; badge.className = 'status-pill'; }
      if (copy) copy.textContent = 'Pro is active. Pro is active. Scene Look AI is unlocked. On the web version, Google AdSense is disabled for this Pro session.';
      if (upgrade) upgrade.hidden = true;
      if (manage) manage.hidden = false;
    } else {
      if (title) title.textContent = 'Free plan';
      if (badge) { badge.textContent = 'FREE'; badge.className = 'status-pill neutral'; }
      if (copy) copy.textContent = 'The web version is free to use and may show Google AdSense ads. Pro unlocks Scene Look AI and removes web ads. The extension local analyzer remains available without payment.';
      if (upgrade) upgrade.hidden = false;
      if (manage) manage.hidden = true;
    }

    if (window.ChrometryWebAds) window.ChrometryWebAds.setEnabled(!state.pro);
  }

  async function verify() {
    state.token = readToken();
    if (!state.token) {
      setPro(false);
      return false;
    }

    try {
      const response = await fetch(api('/api/verify'), {
        headers: { Authorization: 'Bearer ' + state.token }
      });
      const data = await response.json();
      if (data.token) { saveToken(data.token); state.token = data.token; }
      if (!response.ok || !data.active) throw new Error(data.error || 'Subscription is not active.');
      setPro(true);
      setStatus('Active subscription');
      return true;
    } catch (error) {
      clearToken();
      state.token = null;
      setPro(false);
      setStatus(error.message || 'Could not verify Pro.', true);
      return false;
    }
  }

  async function activateCode() {
    const input = $('licenseInput'); const value = input?.value?.trim();
    if (!value) { setStatus('Paste your activation code first.', true); return; }
    saveToken(value); const active = await verify(); if (active && input) input.value = '';
  }

  async function checkout() {
    if (state.busy) return;
    state.busy = true;
    setStatus('Opening secure Stripe Checkout…');

    try {
      const response = await fetch(api('/api/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'monthly' })
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout failed.');
      window.location.href = data.url;
    } catch (error) {
      setStatus(error.message || 'Checkout failed.', true);
    } finally {
      state.busy = false;
    }
  }

  async function activateFromCheckout() {
    const sessionId = new URLSearchParams(window.location.search).get('checkout_session_id');
    if (!sessionId) return;

    setStatus('Verifying Stripe purchase…');

    try {
      const response = await fetch(api('/api/activate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || 'Purchase verification failed.');

      saveToken(data.token);
      state.token = data.token;
      const code = $('activationCode'); if (code) { code.textContent = data.token; code.parentElement.hidden = false; }
      window.history.replaceState({}, '', window.location.pathname);
      await verify();
      setStatus('Pro activated. Your activation code is available below.');
    } catch (error) {
      setStatus(error.message || 'Purchase activation failed.', true);
    }
  }

  async function openPortal() {
    if (!state.token) return checkout();

    try {
      const response = await fetch(api('/api/portal'), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + state.token,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Billing portal failed.');
      window.location.href = data.url;
    } catch (error) {
      setStatus(error.message || 'Unable to open billing portal.', true);
    }
  }

  function palette() {
    return [...document.querySelectorAll('#swatches .swatch')]
      .map((swatch) => {
        const hex = swatch.querySelector('b')?.textContent?.trim();
        const text = swatch.querySelector('small')?.textContent || '';
        const coverage = Number(text.match(/([\d.]+)%/)?.[1] || 0);
        return /^#[0-9a-f]{6}$/i.test(hex || '') ? { hex: hex.toUpperCase(), coverage } : null;
      })
      .filter(Boolean);
  }

  function showUpgradeModal() {
    if (document.querySelector('.chrometry-modal')) return;

    const modal = document.createElement('div');
    modal.className = 'chrometry-modal';
    modal.innerHTML = `
      <div class="chrometry-modal-card">
        <h3>Unlock Chrometry Pro</h3>
        <p>Pro removes sponsored ads and adds secure visual AI, game identification, material reconstruction guidance and research-backed rendering notes.</p>
        <div class="chrometry-pro-actions">
          <button id="modalUpgrade" class="action-btn" type="button">Continue to Stripe</button>
          <button id="modalClose" class="quiet-btn" type="button">Not now</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    $('modalClose')?.addEventListener('click', () => modal.remove());
    $('modalUpgrade')?.addEventListener('click', () => {
      modal.remove();
      checkout();
    });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
  }

  function renderAI(data) {
    const output = $('aiOutput');
    if (!output) return;

    const analysis = data.analysis || data;
    const lighting = analysis.lighting || {};
    const elements = Array.isArray(analysis.elements) ? analysis.elements.slice(0, 14) : [];
    const notes = Array.isArray(analysis.recreation_notes) ? analysis.recreation_notes : [];

    output.className = 'ai-output';
    output.innerHTML = `
      <div class="ai-grid">
        <div class="ai-card"><b>${esc(analysis.game || 'Unknown')}${analysis.is_game ? ' · ' + Math.round(Number(analysis.confidence || 0)) + '% confidence' : ''}</b><span>${esc(analysis.scene || '')}</span></div>
        <div class="ai-card"><b>Visual style</b><span>${esc(analysis.visual_style || '')}</span></div>
        <div class="ai-card"><b>Lighting</b><span>${esc(lighting.analysis || 'No lighting summary returned.')}</span></div>
        ${elements.map((element) => `
          <div class="ai-card">
            <b>${esc(element.name || 'Element')} · ${esc(element.color_source || 'unknown')}</b>
            <span>${esc(element.recreation || element.material || '')}${element.base_hex ? ' · ' + esc(element.base_hex) : ''}</span>
          </div>`).join('')}
        ${notes.length ? `<div class="ai-card"><b>Recreation notes</b><span>${notes.map(esc).join(' • ')}</span></div>` : ''}
      </div>`;

    const badge = $('aiBadge');
    if (badge) {
      badge.textContent = 'PRO AI';
      badge.className = 'status-pill';
    }
  }

  async function runAI() {
    if (!state.pro) {
      showUpgradeModal();
      return;
    }

    if (state.busy) return;

    const canvas = $('previewCanvas');
    if (!canvas?.width) {
      setStatus('Load an image first.', true);
      return;
    }

    state.busy = true;
    const button = $('aiBtn');
    const oldLabel = button?.innerHTML;

    if (button) {
      button.disabled = true;
      button.textContent = 'Analyzing with Pro AI…';
    }

    try {
      const response = await fetch(api('/api/ai'), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + state.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: canvas.toDataURL('image/jpeg', 0.9),
          palette: palette()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pro AI failed.');

      renderAI(data);
      setStatus('Pro AI analysis complete.');
    } catch (error) {
      if (/license|subscription|expired|unauthorized/i.test(error.message || '')) {
        await verify();
      }
      const output = $('aiOutput');
      if (output) {
        output.className = 'ai-output';
        output.textContent = error.message || 'Pro AI failed.';
      }
      setStatus(error.message || 'Pro AI failed.', true);
    } finally {
      state.busy = false;
      if (button) {
        button.disabled = false;
        button.innerHTML = oldLabel || 'Reconstruct scene look with AI <span class="chrometry-lock">PRO</span>';
      }
    }
  }

  function interceptAIButton() {
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('#aiBtn');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      runAI();
    }, true);
  }

  async function init() {
    addStyles();
    createPlanCard();
    interceptAIButton();

    if (!API) {
      setStatus('Set CHROMETRY_API_BASE_URL to enable checkout and Pro AI.');
    }

    await activateFromCheckout();
    await verify();

    if (window.ChrometryWebAds) {
      window.ChrometryWebAds.setEnabled(!state.pro);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();