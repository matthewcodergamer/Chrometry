(() => {
  'use strict';

  const root = document.documentElement;
  const themeButton = document.getElementById('themeIndicator');
  const themeColor = document.getElementById('themeColor');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const themeStorageKey = 'chrometry-appearance';
  const prefsStorageKey = 'chrometry-ui-preferences-v1';

  const savedAppearance = () => {
    try {
      const value = localStorage.getItem(themeStorageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };

  const preferredAppearance = () => savedAppearance() || (systemTheme.matches ? 'dark' : 'light');

  const themeIcon = mode => mode === 'dark'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.2 14.8A7.6 7.6 0 0 1 9.2 4.8 7.9 7.9 0 1 0 19.2 14.8Z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>';

  function applyAppearance(mode, animate = false) {
    const next = mode === 'dark' ? 'dark' : 'light';
    if (animate) {
      root.classList.remove('theme-switching');
      void root.offsetWidth;
      root.classList.add('theme-switching');
      window.setTimeout(() => root.classList.remove('theme-switching'), 440);
    }
    root.dataset.appearance = next;
    root.style.colorScheme = next;
    if (themeColor) themeColor.content = next === 'dark' ? '#08080a' : '#f5f5f7';
    if (themeButton) {
      themeButton.innerHTML = themeIcon(next);
      themeButton.setAttribute('aria-label', next === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance');
      themeButton.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      themeButton.dataset.mode = next;
    }
  }

  applyAppearance(preferredAppearance(), false);

  themeButton?.addEventListener('click', () => {
    const current = root.dataset.appearance === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(themeStorageKey, next); } catch {}
    applyAppearance(next, true);
  });

  systemTheme.addEventListener?.('change', () => {
    applyAppearance(savedAppearance() || (systemTheme.matches ? 'dark' : 'light'), true);
  });

  function readPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(prefsStorageKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writePreferences(patch) {
    try {
      const current = readPreferences();
      localStorage.setItem(prefsStorageKey, JSON.stringify({...current, ...patch}));
    } catch {}
  }

  const colorCount = document.getElementById('colorCount');
  const detail = document.getElementById('detail');
  const exportTabs = [...document.querySelectorAll('.export-tab')];
  const prefs = readPreferences();

  if (colorCount && Number.isFinite(Number(prefs.colorCount))) {
    const value = Math.max(Number(colorCount.min), Math.min(Number(colorCount.max), Number(prefs.colorCount)));
    colorCount.value = String(value);
    colorCount.dispatchEvent(new Event('input', {bubbles:true}));
  }
  if (detail && Number.isFinite(Number(prefs.detail))) {
    const value = Math.max(Number(detail.min), Math.min(Number(detail.max), Number(prefs.detail)));
    detail.value = String(value);
    detail.dispatchEvent(new Event('input', {bubbles:true}));
  }
  if (typeof prefs.exportFormat === 'string') {
    exportTabs.find(tab => tab.dataset.format === prefs.exportFormat)?.click();
  }

  colorCount?.addEventListener('input', () => writePreferences({colorCount:Number(colorCount.value)}));
  detail?.addEventListener('input', () => writePreferences({detail:Number(detail.value)}));
  exportTabs.forEach(tab => tab.addEventListener('click', () => writePreferences({exportFormat:tab.dataset.format})));

  const dropzone = document.getElementById('dropzone');
  const openImageButton = document.getElementById('openImageBtn');
  const fileInput = document.getElementById('fileInput');
  const openPicker = () => fileInput?.click();

  openImageButton?.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openPicker();
  });

  dropzone?.addEventListener('click', event => {
    if (event.target.closest('button')) return;
    openPicker();
  });

  dropzone?.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });

  const copyButton = document.getElementById('copyBtn');
  if (copyButton) {
    const iconMarkup = copyButton.innerHTML;
    const restoreIcon = () => {
      if (!copyButton.querySelector('.sf-icon')) copyButton.innerHTML = iconMarkup;
    };
    new MutationObserver(restoreIcon).observe(copyButton, { childList: true, characterData: true, subtree: true });
    copyButton.addEventListener('click', () => {
      copyButton.classList.add('copied');
      window.setTimeout(() => copyButton.classList.remove('copied'), 800);
    });
  }

  // Persistent color locator. Direct image taps stay exactly where tapped and every
  // subsequent tap moves the same circle. Palette and Color Roles selections find a
  // representative matching pixel in CIELAB and move that same circle to the image.
  const canvasStage = document.getElementById('canvasStage');
  const previewCanvas = document.getElementById('previewCanvas');
  const roleGrid = document.getElementById('roleGrid');
  let locator = null;
  let activePointerId = null;

  const interactionStyle = document.createElement('style');
  interactionStyle.textContent = `
    #roleGrid .role-card{cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    #roleGrid .role-card:active{transform:scale(.992)}
    #roleGrid .role-card.color-located{outline:2px solid rgba(255,69,58,.58);outline-offset:2px}
    .color-locator.direct-sample .color-locator-arrow,.color-locator.direct-sample .color-locator-label{display:none!important}
    .color-locator.direct-sample .color-locator-ring{width:20px;height:20px;left:-10px;top:-10px;border-width:2px;background:rgba(255,69,58,.07)}
  `;
  document.head.appendChild(interactionStyle);

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    return m ? {r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16)} : null;
  }

  function rgbToHex(r,g,b) {
    return `#${[r,g,b].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('').toUpperCase()}`;
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

  function findRepresentativePixel(hex) {
    if (!previewCanvas?.width || !previewCanvas?.height) return null;
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const target = rgbToLab(rgb.r,rgb.g,rgb.b);
    const ctx = previewCanvas.getContext('2d', {willReadFrequently:true});
    const {width:w,height:h} = previewCanvas;
    const data = ctx.getImageData(0,0,w,h).data;
    const step = Math.max(1, Math.round(Math.max(w,h)/280));
    let minD = Infinity;

    for (let y=0; y<h; y+=step) {
      for (let x=0; x<w; x+=step) {
        const i=(y*w+x)*4;
        if (data[i+3] < 220) continue;
        const d=labDistance2(target,rgbToLab(data[i],data[i+1],data[i+2]));
        if (d<minD) minD=d;
      }
    }
    if (!Number.isFinite(minD)) return null;

    const threshold = Math.pow(Math.max(10, Math.sqrt(minD)+7),2);
    let sx=0,sy=0,count=0;
    for (let y=0; y<h; y+=step) {
      for (let x=0; x<w; x+=step) {
        const i=(y*w+x)*4;
        if (data[i+3] < 220) continue;
        const d=labDistance2(target,rgbToLab(data[i],data[i+1],data[i+2]));
        if (d<=threshold) { sx+=x; sy+=y; count++; }
      }
    }
    if (!count) return null;

    const cx=sx/count, cy=sy/count;
    let best=null, bestScore=Infinity;
    for (let y=0; y<h; y+=step) {
      for (let x=0; x<w; x+=step) {
        const i=(y*w+x)*4;
        if (data[i+3] < 220) continue;
        const d=labDistance2(target,rgbToLab(data[i],data[i+1],data[i+2]));
        if (d>threshold) continue;
        const spatial=((x-cx)*(x-cx)+(y-cy)*(y-cy))/Math.max(1,w*w+h*h);
        const score=d + spatial*160;
        if (score<bestScore) { bestScore=score; best={x:(x+.5)/w,y:(y+.5)/h}; }
      }
    }
    return best;
  }

  function ensureLocator() {
    if (locator || !canvasStage) return locator;
    locator = document.createElement('div');
    locator.className = 'color-locator';
    locator.setAttribute('aria-hidden','true');
    locator.innerHTML = '<span class="color-locator-label"></span><span class="color-locator-arrow"></span><span class="color-locator-ring"></span>';
    canvasStage.appendChild(locator);
    return locator;
  }

  function clearLocatedSelection() {
    document.querySelectorAll('.swatch.color-located,.palette-segment.color-located,#roleGrid .role-card.color-located').forEach(el=>el.classList.remove('color-located'));
  }

  function placeLocator(point, hex, sourceElement = null, options = {}) {
    if (!point || !canvasStage || !previewCanvas) return;
    const marker = ensureLocator();
    if (!marker) return;
    const stageRect = canvasStage.getBoundingClientRect();
    const canvasRect = previewCanvas.getBoundingClientRect();
    const left = canvasRect.left-stageRect.left + point.x*canvasRect.width;
    const top = canvasRect.top-stageRect.top + point.y*canvasRect.height;
    marker.style.left = `${left}px`;
    marker.style.top = `${top}px`;
    marker.querySelector('.color-locator-label').textContent = String(hex || '').toUpperCase();
    marker.classList.toggle('direct-sample', Boolean(options.direct));
    marker.classList.add('visible');
    clearLocatedSelection();
    sourceElement?.classList.add('color-located');
    if (options.scroll) canvasStage.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
  }

  function showColorLocation(hex, sourceElement) {
    const point = findRepresentativePixel(hex);
    if (!point) return;
    placeLocator(point, hex, sourceElement, {direct:false, scroll:true});
  }

  function placeExactTap(event) {
    if (!previewCanvas?.width || !previewCanvas?.height) return;
    const rect = previewCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = Math.max(0, Math.min(rect.width, event.clientX-rect.left));
    const py = Math.max(0, Math.min(rect.height, event.clientY-rect.top));
    const nx = px/rect.width;
    const ny = py/rect.height;
    const x = Math.max(0,Math.min(previewCanvas.width-1,Math.floor(nx*previewCanvas.width)));
    const y = Math.max(0,Math.min(previewCanvas.height-1,Math.floor(ny*previewCanvas.height)));
    const data = previewCanvas.getContext('2d',{willReadFrequently:true}).getImageData(x,y,1,1).data;
    const hex = rgbToHex(data[0],data[1],data[2]);
    placeLocator({x:nx,y:ny}, hex, null, {direct:true, scroll:false});
  }

  previewCanvas?.addEventListener('pointerdown', event => {
    activePointerId = event.pointerId;
    placeExactTap(event);
    try { previewCanvas.setPointerCapture?.(event.pointerId); } catch {}
  });
  previewCanvas?.addEventListener('pointermove', event => {
    if (activePointerId !== event.pointerId) return;
    placeExactTap(event);
  });
  const endPointer = event => {
    if (activePointerId === event.pointerId) activePointerId = null;
  };
  previewCanvas?.addEventListener('pointerup', endPointer);
  previewCanvas?.addEventListener('pointercancel', endPointer);

  document.addEventListener('click', event => {
    const colorButton = event.target.closest('#swatches .swatch, #paletteStrip .palette-segment');
    if (colorButton) {
      let hex = colorButton.querySelector('b')?.textContent?.trim();
      if (!hex) hex = colorButton.title?.match(/#[0-9A-Fa-f]{6}/)?.[0];
      if (hex) window.requestAnimationFrame(() => showColorLocation(hex, colorButton));
      return;
    }

    const roleCard = event.target.closest('#roleGrid .role-card');
    if (!roleCard) return;
    const hex = roleCard.querySelector('small')?.textContent?.match(/#[0-9A-Fa-f]{6}/)?.[0];
    if (!hex) return;
    window.requestAnimationFrame(() => showColorLocation(hex, roleCard));
  });

  roleGrid?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const roleCard = event.target.closest('.role-card');
    if (!roleCard) return;
    event.preventDefault();
    const hex = roleCard.querySelector('small')?.textContent?.match(/#[0-9A-Fa-f]{6}/)?.[0];
    if (hex) showColorLocation(hex, roleCard);
  });

  // New role rows are rendered dynamically, so keep the whole row keyboard/touch accessible.
  const makeRolesInteractive = () => {
    roleGrid?.querySelectorAll('.role-card').forEach(card => {
      if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
      card.setAttribute('role','button');
      const name = card.querySelector('b')?.textContent?.trim();
      const hex = card.querySelector('small')?.textContent?.match(/#[0-9A-Fa-f]{6}/)?.[0];
      if (name && hex) card.setAttribute('aria-label',`${name}, ${hex}. Show this color on the image.`);
    });
  };
  if (roleGrid) new MutationObserver(makeRolesInteractive).observe(roleGrid,{childList:true,subtree:true});
  makeRolesInteractive();

  fileInput?.addEventListener('change', () => {
    locator?.classList.remove('visible');
    clearLocatedSelection();
    activePointerId = null;
  });

  document.addEventListener('contextmenu', event => event.preventDefault(), { passive: false });
})();
