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

  document.addEventListener('contextmenu', event => event.preventDefault(), { passive: false });
})();
