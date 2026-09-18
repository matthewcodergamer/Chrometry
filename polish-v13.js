(() => {
  'use strict';
  const STRIPE_PRO_URL = 'https://buy.stripe.com/test_aFadRb9XR7WD60d4Ic14404';
  const SITE = 'https://matthewcodergamer.github.io/Chrometry/';
  function toast(message) {
    let el = document.getElementById('copyToast');
    if (!el) { el = document.createElement('div'); el.id = 'copyToast'; el.className = 'copy-toast'; document.body.appendChild(el); }
    el.textContent = message; el.classList.add('show'); clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 1400);
  }
  window.chrometryToast = toast;
  const originalWrite = navigator.clipboard && navigator.clipboard.writeText && navigator.clipboard.writeText.bind(navigator.clipboard);
  if (originalWrite) {
    navigator.clipboard.writeText = async (text) => {
      await originalWrite(text);
      toast(/^#?[0-9A-Fa-f]{6}$/.test(String(text).trim()) ? ('Copied ' + String(text).toUpperCase()) : 'Copied');
    };
  }
  const topbar = document.querySelector('.topbar');
  if (topbar && !document.getElementById('proBtn')) {
    const actions = document.createElement('div');
    actions.className = 'topbar-actions';
    const theme = document.getElementById('themeIndicator');
    const pro = document.createElement('button');
    pro.id = 'proBtn'; pro.type = 'button'; pro.className = 'pro-chip';
    const unlocked = localStorage.getItem('chrometry-pro') === '1' || /[?&]pro=1/.test(location.search);
    if (unlocked) { localStorage.setItem('chrometry-pro', '1'); pro.textContent = 'PRO'; pro.classList.add('is-pro'); }
    else pro.textContent = 'Upgrade to Pro';
    pro.addEventListener('click', () => { if (pro.classList.contains('is-pro')) { toast('Pro is active'); return; } window.open(STRIPE_PRO_URL, '_blank', 'noopener'); });
    if (theme) { theme.replaceWith(actions); actions.append(pro, theme); } else { topbar.append(actions); actions.append(pro); }
  }
  const semantic = [...document.querySelectorAll('.section-kicker')].find(el => /semantic/i.test(el.textContent));
  if (semantic) semantic.closest('.card').classList.add('flat');
  const aiShell = document.querySelector('.ai-card-shell'); if (aiShell) aiShell.classList.add('flat');
  const exportKicker = [...document.querySelectorAll('.section-kicker')].find(el => /export/i.test(el.textContent));
  if (exportKicker) exportKicker.closest('.card').classList.add('flat');
  if (!document.querySelector('.ambient-stage')) {
    const stage = document.createElement('div'); stage.className = 'ambient-stage';
    stage.innerHTML = '<i class="ambient-orb a"></i><i class="ambient-orb b"></i><i class="ambient-orb c"></i>';
    document.body.prepend(stage);
  }
  const preview = document.getElementById('previewCanvas');
  if (preview) preview.addEventListener('pointerup', () => {
    const bubble = document.getElementById('sampleBubble');
    const hex = (bubble && bubble.textContent || '').match(/#[0-9A-Fa-f]{6}/);
    if (hex) navigator.clipboard.writeText(hex[0]).catch(() => toast(hex[0]));
  });
  document.addEventListener('click', (event) => {
    const role = event.target.closest('#roleGrid .role-card');
    if (!role) return;
    const hex = (role.querySelector('small') && role.querySelector('small').textContent || '').match(/#[0-9A-Fa-f]{6}/);
    if (hex) navigator.clipboard.writeText(hex[0]).catch(() => {});
  });
  const hideCodedErrors = (node) => {
    if (!node) return;
    const raw = node.textContent || '';
    if (/fail to fetch|failed to fetch|TypeError|stack:|puter\.|status code|ECONN|promo code|AdSense/i.test(raw)) {
      node.textContent = 'Something went wrong. Try again in a moment.';
    }
  };
  const log = document.getElementById('log');
  if (log) new MutationObserver(() => hideCodedErrors(log.firstElementChild)).observe(log, {childList:true});
  const aiOut = document.getElementById('aiOutput');
  if (aiOut) new MutationObserver(() => hideCodedErrors(aiOut)).observe(aiOut, {childList:true,characterData:true,subtree:true});
  document.querySelectorAll('a,button,span,p,small').forEach(el => {
    const t = el.textContent || '';
    if (/use free web version/i.test(t) || /google adsense/i.test(t)) el.remove();
  });
  const sample = new URLSearchParams(location.search).get('sample');
  if (sample) toast('Sampled ' + sample.toUpperCase());
  window.CHROMETRY_SITE = SITE;
  window.CHROMETRY_STRIPE = STRIPE_PRO_URL;
})();
