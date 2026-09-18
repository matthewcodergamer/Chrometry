const TRUSTED_WEB_ORIGIN = 'https://matthewcodergamer.github.io/Chrometry';
const PRO_TOKEN_KEY = 'chrometry-pro-license-v1';

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  const senderUrl = String(sender?.url || '');
  if (!senderUrl.startsWith(TRUSTED_WEB_ORIGIN + '/')) {
    sendResponse({ ok: false, error: 'Untrusted sender.' });
    return;
  }
  if (request?.type !== 'CHROMETRY_PRO_TOKEN') {
    sendResponse({ ok: false, error: 'Unknown message.' });
    return;
  }
  const token = typeof request.token === 'string' ? request.token.trim() : '';
  if (!token || token.length > 4000) {
    sendResponse({ ok: false, error: 'Invalid activation token.' });
    return;
  }
  chrome.storage.local.set({ [PRO_TOKEN_KEY]: token })
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false, error: 'Could not save activation token.' }));
  return true;
});

async function injectPicker(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['picker.js']
  });
  await chrome.tabs.sendMessage(tabId, { type: 'CHROMETRY_START_PICKER' });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== 'CHROMETRY_START_PICKER') return;
  (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:$/.test(new URL(tab.url || '').protocol)) {
      throw new Error('Chrometry can only pick colors on normal web pages.');
    }
    await injectPicker(tab.id);
    sendResponse({ ok: true });
  })().catch(error => sendResponse({ ok: false, error: error.message || 'Could not start picker.' }));
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== 'CHROMETRY_OPEN_WEB') return;
  chrome.tabs.create({ url: 'https://matthewcodergamer.github.io/Chrometry/?source=extension' })
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));
  return true;
});
