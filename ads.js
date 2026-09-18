(() => {
  'use strict';

  const CONFIG = window.CHROMETRY_AD_CONFIG || {};
  let enabled = true;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function mount(slot) {
    if (!enabled || !slot || slot.dataset.adMounted === '1') return;
    slot.dataset.adMounted = '1';

    const endpoint = CONFIG.endpoint || ((window.CHROMETRY_API_BASE_URL || '').replace(/\/$/, '') + '/api/ads');
    const fallback = CONFIG.fallback || null;

    const render = (ad) => {
      if (!enabled || !ad || !ad.url || !ad.title) {
        slot.hidden = true;
        return;
      }

      slot.hidden = false;
      slot.className = 'chrometry-ad';
      slot.innerHTML = `
        <div class="chrometry-ad-label">Sponsored</div>
        <a href="${esc(ad.url)}" target="_blank" rel="noopener noreferrer sponsored">
          ${ad.image ? `<img src="${esc(ad.image)}" alt="">` : ''}
          <strong>${esc(ad.title)}</strong>
          <small>${esc(ad.description || ad.sponsor || '')}</small>
        </a>`;

      slot.querySelector('a')?.addEventListener('click', () => {
        if (endpoint) {
          fetch(endpoint + (endpoint.includes('?') ? '&' : '?') + 'event=click', {
            method: 'GET',
            keepalive: true
          }).catch(() => {});
        }
      });
    };

    if (fallback) {
      render(fallback);
      return;
    }

    if (!endpoint) {
      slot.hidden = true;
      return;
    }

    fetch(endpoint + (endpoint.includes('?') ? '&' : '?') + 'event=impression', {
      method: 'GET',
      cache: 'no-store'
    })
      .then((response) => response.ok ? response.json() : null)
      .then(render)
      .catch(() => { slot.hidden = true; });
  }

  function mountAll() {
    if (!enabled) {
      document.querySelectorAll('.chrometry-ad').forEach((slot) => { slot.hidden = true; });
      return;
    }
    document.querySelectorAll('[data-chrometry-ad]').forEach(mount);
  }

  window.ChrometryAds = {
    setEnabled(value) {
      enabled = Boolean(value);
      mountAll();
    },
    mount: mountAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll, { once: true });
  } else {
    mountAll();
  }
})();