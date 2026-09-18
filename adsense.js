(() => {
  'use strict';
  const publisher = window.CHROMETRY_ADSENSE_PUBLISHER_ID || '';
  let enabled = true;
  let loaded = false;
  const valid = /^ca-pub-\d{10,30}$/.test(String(publisher));
  function load() {
    if (!enabled || loaded || !valid || (location.protocol !== 'http:' && location.protocol !== 'https:')) return;
    loaded = true;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(publisher);
    document.head.appendChild(script);
  }
  window.ChrometryWebAds = { setEnabled(value) { enabled = Boolean(value); if (enabled) load(); }, load };
})();