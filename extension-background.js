const TRUSTED_WEB_ORIGIN = 'https://matthewcodergamer.github.io/Chrometry';
const PRO_TOKEN_KEY = 'chrometry-pro-license-v1';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html?source=extension') });
});

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
