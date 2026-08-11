const $ = id => document.getElementById(id);

function showStatus(id, msg, type) {
  const el = $(id);
  el.textContent = msg;
  el.className = 'status ' + type;
}

// Load saved config
chrome.storage.sync.get(['webAppUrl','agentSpeed'], d => {
  if (d.webAppUrl)  $('urlInput').value    = d.webAppUrl;
  if (d.agentSpeed) $('speedSelect').value = String(d.agentSpeed);
});

// Refresh stats every 2s
function refreshStats() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, d => {
    if (!d) return;
    if (d.lastSaved   !== undefined) $('statSaved').textContent   = d.lastSaved;
    if (d.lastSkipped !== undefined) $('statSkipped').textContent = d.lastSkipped;
  });
}
refreshStats();
setInterval(refreshStats, 2000);

// Save URL
$('saveUrlBtn').addEventListener('click', () => {
  const val = $('urlInput').value.trim();
  if (!val.startsWith('https://script.google.com/macros/s/')) {
    showStatus('urlStatus', '❌ Must be a valid /exec URL', 'err'); return;
  }
  chrome.storage.sync.set({ webAppUrl: val }, () => {
    showStatus('urlStatus', '✅ URL saved!', 'ok');
    setTimeout(() => $('urlStatus').style.display = 'none', 2500);
  });
});

// Test connection
$('testBtn').addEventListener('click', () => {
  const val = $('urlInput').value.trim();
  if (!val) { showStatus('urlStatus', '❌ Enter URL first', 'err'); return; }
  showStatus('urlStatus', '⏳ Testing...', 'info');
  chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', url: val }, res => {
    if (res?.ok) showStatus('urlStatus', '✅ ' + (res.data?.message || 'Connected!'), 'ok');
    else showStatus('urlStatus', '❌ ' + (res?.error || 'Failed'), 'err');
  });
});

// Start agent
$('startBtn').addEventListener('click', () => {
  const speed = parseInt($('speedSelect').value);
  chrome.storage.sync.set({ agentSpeed: speed });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) {
      showStatus('startStatus', '❌ No active tab found', 'err'); return;
    }
    if (!tabs[0].url?.includes('app.apollo.io')) {
      showStatus('startStatus', '❌ Must be on app.apollo.io/people list', 'err'); return;
    }

    showStatus('startStatus', '⏳ Starting agent...', 'info');

    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_AGENT', speed }, res => {
      if (chrome.runtime.lastError || !res?.ok) {
        showStatus('startStatus', '❌ Could not start — reload the Apollo tab first', 'err');
      } else {
        showStatus('startStatus', '🟢 Agent running — watch the HUD on the page', 'ok');
        $('startBtn').disabled = true;
        setTimeout(() => {
          $('startBtn').disabled = false;
          showStatus('startStatus', 'Go to Apollo People list → check contacts → click above', 'info');
        }, 8000);
      }
    });
  });
});

// Reset history
$('resetBtn').addEventListener('click', () => {
  if (confirm('Clear saved URL history? Agent will re-process previously saved contacts.')) {
    chrome.runtime.sendMessage({ type: 'RESET' }, () => {
      $('statSaved').textContent   = '0';
      $('statSkipped').textContent = '0';
      showStatus('startStatus', '✅ History cleared', 'ok');
      setTimeout(() => showStatus('startStatus', 'Go to Apollo People list → check contacts → click above', 'info'), 2000);
    });
  }
});
