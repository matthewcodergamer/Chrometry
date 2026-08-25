(() => {
  'use strict';

  const root = document.documentElement;
  const themeButton = document.getElementById('themeIndicator');
  const themeColor = document.getElementById('themeColor');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const storageKey = 'chrometry-appearance';

  const savedAppearance = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };

  const preferredAppearance = () => savedAppearance() || (systemTheme.matches ? 'dark' : 'light');

  function applyAppearance(mode, animate = false) {
    const next = mode === 'dark' ? 'dark' : 'light';
    if (animate) {
      root.classList.remove('theme-changing');
      void root.offsetWidth;
      root.classList.add('theme-changing');
      window.setTimeout(() => root.classList.remove('theme-changing'), 420);
    }
    root.dataset.appearance = next;
    root.style.colorScheme = next;
    if (themeColor) themeColor.content = next === 'dark' ? '#08080a' : '#f5f5f7';
    if (themeButton) {
      themeButton.setAttribute('aria-label', next === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance');
      themeButton.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
      themeButton.dataset.mode = next;
    }
  }

  applyAppearance(preferredAppearance(), false);

  themeButton?.addEventListener('click', () => {
    const current = root.dataset.appearance === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(storageKey, next); } catch {}
    applyAppearance(next, true);
  });

  systemTheme.addEventListener?.('change', () => {
    if (!savedAppearance()) applyAppearance(systemTheme.matches ? 'dark' : 'light', true);
  });

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
