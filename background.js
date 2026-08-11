// Background Service Worker — handles all HTTP + storage

const log = (...a) => console.log('[BG]', ...a);

async function sendToSheets(payload, webAppUrl) {
  const params = new URLSearchParams({
    n:   payload.personName      || '',
    li:  payload.personLinkedIn  || '',
    cn:  payload.companyName     || '',
    cli: payload.companyLinkedIn || '',
    w:   payload.companyWebsite  || '',
    u:   payload.apolloUrl       || '',
  });
  const res  = await fetch(webAppUrl + '?' + params.toString());
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 'ok' }; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'SAVE_ROW') {
    chrome.storage.sync.get(['webAppUrl'], async ({ webAppUrl }) => {
      if (!webAppUrl) { sendResponse({ ok: false, error: 'No URL configured' }); return; }
      try {
        const result = await sendToSheets(msg.payload, webAppUrl);
        log('Saved:', msg.payload.personName, '→', result.status);
        sendResponse({ ok: true, result });
      } catch (e) {
        log('Error:', e.message);
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }

  if (msg.type === 'GET_SHEET_URLS') {
    chrome.storage.sync.get(['webAppUrl'], async ({ webAppUrl }) => {
      if (!webAppUrl) { sendResponse({ ok: false, urls: [] }); return; }
      try {
        const res  = await fetch(webAppUrl + '?action=getUrls');
        const data = await res.json();
        log('Fetched sheet URLs:', data.urls?.length || 0);
        sendResponse({ ok: true, urls: data.urls || [] });
      } catch (e) {
        log('GET_SHEET_URLS error:', e.message);
        sendResponse({ ok: false, urls: [] });
      }
    });
    return true;
  }

  if (msg.type === 'GET_SAVED_URLS') {
    chrome.storage.local.get(['savedUrls'], ({ savedUrls }) => {
      sendResponse({ urls: savedUrls || [] });
    });
    return true;
  }

  if (msg.type === 'MARK_SAVED') {
    chrome.storage.local.get(['savedUrls'], ({ savedUrls }) => {
      const urls = [...(savedUrls || []), msg.url];
      chrome.storage.local.set({ savedUrls: urls });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'SET_STATE') {
    chrome.storage.local.set(msg.data, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'GET_STATE') {
    chrome.storage.local.get(null, d => sendResponse(d));
    return true;
  }

  if (msg.type === 'RESET') {
    chrome.storage.local.clear(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'TEST_CONNECTION') {
    fetch(msg.url)
      .then(r => r.json())
      .then(d => sendResponse({ ok: true, data: d }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});