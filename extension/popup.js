const SITE = 'https://matthewcodergamer.github.io/Chrometry/';
const pick = document.getElementById('pick');
const openBtn = document.getElementById('open');
const meta = document.getElementById('meta');
const toast = document.getElementById('toast');
const swatches = document.getElementById('swatches');
async function loadHistory() {
  const data = await chrome.storage.local.get('history');
  const history = data.history || [];
  swatches.innerHTML = '';
  history.slice(0, 12).forEach(hex => {
    const el = document.createElement('button');
    el.className = 'swatch'; el.style.background = hex; el.title = hex;
    el.addEventListener('click', () => copyHex(hex));
    swatches.appendChild(el);
  });
}
async function saveHex(hex) {
  const data = await chrome.storage.local.get('history');
  const history = data.history || [];
  const next = [hex].concat(history.filter(h => h !== hex)).slice(0, 16);
  await chrome.storage.local.set({ history: next, last: hex });
  await loadHistory();
}
async function copyHex(hex) {
  try { await navigator.clipboard.writeText(hex); } catch (e) {}
  toast.textContent = 'Copied ' + hex;
  meta.textContent = hex;
  setTimeout(() => { toast.textContent = ''; }, 1400);
}
pick.addEventListener('click', async () => {
  if (!window.EyeDropper) { meta.textContent = 'Eyedropper is not available in this browser.'; return; }
  try {
    const result = await new EyeDropper().open();
    const hex = String(result.sRGBHex || '').toUpperCase();
    if (!hex) return;
    await saveHex(hex);
    await copyHex(hex);
  } catch (err) {
    if (String(err).includes('abort') || String(err.name || '').includes('Abort')) return;
    meta.textContent = 'Could not sample that pixel. Try again.';
  }
});
openBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('last');
  const url = data.last ? (SITE + '?sample=' + encodeURIComponent(data.last)) : SITE;
  chrome.tabs.create({ url: url });
});
loadHistory();
