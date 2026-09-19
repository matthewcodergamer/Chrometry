(() => {
  'use strict';

  const STRIPE = 'https://buy.stripe.com/test_aFadRb9XR7WD60d4Ic14404';
  const KEY = 'chrometry-quota-v1';
  const LIMITS = { analysis: 3, ai: 1 };

  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function isPro() {
    try {
      return localStorage.getItem('chrometry-pro') === '1' || /[?&]pro=1/.test(location.search);
    } catch {
      return false;
    }
  }

  function readQuota() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (raw && raw.day === today()) {
        return {
          day: raw.day,
          analysis: Number(raw.analysis) || 0,
          ai: Number(raw.ai) || 0
        };
      }
    } catch {}
    return { day: today(), analysis: 0, ai: 0 };
  }

  function writeQuota(q) {
    try { localStorage.setItem(KEY, JSON.stringify(q)); } catch {}
  }

  function remaining(kind) {
    if (isPro()) return Infinity;
    return Math.max(0, LIMITS[kind] - readQuota()[kind]);
  }

  function allow(kind) {
    if (isPro()) return true;
    if (remaining(kind) > 0) return true;
    showPaywall(kind);
    return false;
  }

  function consume(kind) {
    if (isPro()) return;
    const q = readQuota();
    q[kind] = (q[kind] || 0) + 1;
    writeQuota(q);
    refreshUI();
  }

  function refund(kind) {
    if (isPro()) return;
    const q = readQuota();
    q[kind] = Math.max(0, (q[kind] || 0) - 1);
    writeQuota(q);
    refreshUI();
  }

  function copyFor(kind) {
    if (kind === 'ai') {
      return {
        kicker: 'DAILY LIMIT',
        title: 'Today’s Scene Look is used up.',
        body: 'Free gets one AI reconstruction a day. That’s the itch. Pro is unlimited Scene Looks, every day.'
      };
    }
    return {
      kicker: 'DAILY LIMIT',
      title: 'That’s all three free palettes.',
      body: 'You still have this image. Sampling and copies still work. New palette reads reset at midnight — or never stop with Pro.'
    };
  }

  function ensureSheet() {
    if (document.getElementById('limitSheet')) return;
    const wrap = document.createElement('div');
    wrap.id = 'limitSheet';
    wrap.className = 'limit-sheet';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="limit-sheet-card" role="dialog" aria-modal="true" aria-labelledby="limitTitle">' +
        '<span class="limit-kicker"></span>' +
        '<h3 id="limitTitle"></h3>' +
        '<p class="limit-body"></p>' +
        '<a class="limit-upgrade" href="' + STRIPE + '" target="_blank" rel="noopener noreferrer">Upgrade to Pro</a>' +
        '<button type="button" class="limit-dismiss">Not now — resets tonight</button>' +
      '</div>';
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('.limit-dismiss')) hideSheet();
    });
    document.body.appendChild(wrap);
  }

  function showPaywall(kind) {
    ensureSheet();
    const sheet = document.getElementById('limitSheet');
    const copy = copyFor(kind);
    sheet.querySelector('.limit-kicker').textContent = copy.kicker;
    sheet.querySelector('#limitTitle').textContent = copy.title;
    sheet.querySelector('.limit-body').textContent = copy.body;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  function hideSheet() {
    const sheet = document.getElementById('limitSheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    setTimeout(() => { sheet.hidden = true; }, 220);
  }

  function chipText(kind) {
    if (isPro()) return 'Unlimited';
    const left = remaining(kind);
    const max = LIMITS[kind];
    if (kind === 'ai') {
      if (left <= 0) return '0 left today';
      return '1 free today';
    }
    if (left <= 0) return '0 left today';
    if (left === 1) return 'Last free look today';
    return left + ' of ' + max + ' left today';
  }

  function refreshUI() {
    const analysisChip = document.getElementById('quotaChip');
    const aiChip = document.getElementById('aiQuotaChip');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const aiBtn = document.getElementById('aiBtn');
    const pro = isPro();

    if (analysisChip) {
      analysisChip.textContent = chipText('analysis');
      analysisChip.classList.toggle('tight', !pro && remaining('analysis') <= 1);
      analysisChip.classList.toggle('empty', !pro && remaining('analysis') <= 0);
      analysisChip.hidden = false;
    }
    if (aiChip) {
      aiChip.textContent = chipText('ai');
      aiChip.classList.toggle('tight', !pro && remaining('ai') <= 0);
      aiChip.classList.toggle('empty', !pro && remaining('ai') <= 0);
      aiChip.hidden = false;
    }
    if (analyzeBtn && !pro && remaining('analysis') <= 0) {
      analyzeBtn.textContent = 'Unlock unlimited palettes';
    } else if (analyzeBtn && analyzeBtn.textContent === 'Unlock unlimited palettes') {
      analyzeBtn.textContent = 'Analyze palette';
    }
    if (aiBtn && !pro && remaining('ai') <= 0) {
      aiBtn.dataset.locked = '1';
    } else if (aiBtn) {
      delete aiBtn.dataset.locked;
    }
  }

  document.addEventListener('click', (event) => {
    const ai = event.target.closest && event.target.closest('#aiBtn');
    const analyze = event.target.closest && event.target.closest('#analyzeBtn');
    if (!ai && !analyze) return;
    if (allow(ai ? 'ai' : 'analysis')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);

  window.ChrometryLimits = {
    isPro, remaining, allow, consume, refund, showPaywall, refreshUI, LIMITS
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshUI);
  } else {
    refreshUI();
  }
})();
