// Apollo Lead Agent v6.0
// NEW FLOW:
// 1. On list page → collect checked contacts → save queue to storage → start processing
// 2. After each contact → navigate to https://app.apollo.io/#/people (clean URL)
// 3. On page reload → agent auto-detects pending queue in storage → picks next contact
// 4. No dependency on filtered list URL, checked checkboxes, or list page state

(function () {
  'use strict';
  const TAG   = '[Apollo Agent]';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log   = (...a) => console.log(TAG, ...a);
  const warn  = (...a) => console.warn(TAG, ...a);

  const CLEAN_LIST_URL = 'https://app.apollo.io/#/people';

  let RUNNING = false, PAUSED = false, SPEED = 4000;

  // ── Page detection ────────────────────────────────────────
  function isListPage() {
    return location.href.includes('app.apollo.io') &&
           location.href.includes('people') &&
           !location.href.match(/\/people\/[a-zA-Z0-9]{10,}/);
  }

  function waitUntil(fn, timeout = 18000, interval = 400) {
    return new Promise((res, rej) => {
      const t0 = Date.now();
      const id = setInterval(() => {
        const v = fn();
        if (v) { clearInterval(id); res(v); }
        else if (Date.now() - t0 > timeout) { clearInterval(id); rej(new Error('timeout')); }
      }, interval);
    });
  }

  function isLocked(name) {
    if (!name) return false;
    const parts = name.trim().split(/\s+/);
    const last  = parts[parts.length - 1].replace(/\.$/, '');
    return parts.length >= 2 && last.length <= 2 && /^[A-Za-z]+$/.test(last);
  }

  // ── Storage helpers ───────────────────────────────────────
  const getState      = ()  => new Promise(r => chrome.runtime.sendMessage({type:'GET_STATE'},        x => r(x || {})));
  const setState      = d   => new Promise(r => chrome.runtime.sendMessage({type:'SET_STATE',data:d}, r));
  const saveRow       = p   => new Promise(r => chrome.runtime.sendMessage({type:'SAVE_ROW',payload:p}, x => r(chrome.runtime.lastError ? {ok:false} : (x||{ok:false}))));
  const markSaved     = u   => new Promise(r => chrome.runtime.sendMessage({type:'MARK_SAVED',url:u}, r));
  const getSaved      = ()  => new Promise(r => chrome.runtime.sendMessage({type:'GET_SAVED_URLS'},   x => r(x?.urls||[])));
  const getSheetUrls  = ()  => new Promise(r => chrome.runtime.sendMessage({type:'GET_SHEET_URLS'},   x => r(x?.urls||[])));

  // ── Row / checkbox detection ──────────────────────────────
  function isRowChecked(row) {
    const inp = row.querySelector('input[type="checkbox"]');
    if (inp) {
      const rk = Object.keys(inp).find(k =>
        k.startsWith('__reactProps') || k.startsWith('__reactFiber') ||
        k.startsWith('__reactInternalInstance'));
      if (rk) {
        try {
          const obj = inp[rk];
          if (obj?.checked === true) return true;
          let fiber = obj; let d = 0;
          while (fiber && d++ < 20) {
            const p = fiber.memoizedProps || fiber.pendingProps || {};
            if (p.checked === true) return true;
            if (fiber.stateNode?.checked === true) return true;
            fiber = fiber.return;
          }
        } catch(e) {}
      }
      if (inp.checked) return true;
    }
    if (row.getAttribute('aria-selected') === 'true') return true;
    if (row.querySelector('[aria-checked="true"]'))    return true;
    if (/selected|checked/i.test(row.className || '')) return true;
    const bg = window.getComputedStyle(row).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') return true;
    return false;
  }

  function getCheckedContacts() {
    const contacts = [];
    const seen     = new Set();
    const rows = [...document.querySelectorAll('div[role="row"]')]
      .filter(r => r.querySelector('a[href*="/people/"]'));
    const allRows = rows.length ? rows :
      [...document.querySelectorAll('tr')].filter(r => r.querySelector('a[href*="/people/"]'));
    log(`Rows found: ${allRows.length}`);
    for (const row of allRows) {
      const link = row.querySelector('a[href*="/people/"]');
      if (!link || seen.has(link.href)) continue;
      const name = link.innerText?.trim() || '';
      if (!name || name.length < 2) continue;
      if (isRowChecked(row) && !isLocked(name)) {
        seen.add(link.href);
        contacts.push({ name, apolloUrl: link.href });
        log(`✅ "${name}"`);
      }
    }
    log(`Total checked: ${contacts.length}`);
    return contacts;
  }

  // ════════════════════════════════════════════════════════
  // PROFILE SCRAPER
  // ════════════════════════════════════════════════════════
  async function scrapeFullProfile(apolloUrl) {
    log('→ Navigating to profile:', apolloUrl);
    location.href = apolloUrl;

    try {
      await waitUntil(() => {
        const t = document.title || '';
        return t.includes(' - ') && !t.toLowerCase().includes('find people');
      }, 18000);
    } catch {
      return { personLinkedIn:'', companyName:'', companyLinkedIn:'', companyWebsite:'' };
    }
    await sleep(3000);

    // ── Person LinkedIn ──────────────────────────────────
    let personLinkedIn = '';
    for (const a of document.querySelectorAll('a')) {
      if ((a.href||'').includes('linkedin.com/in/')) { personLinkedIn = a.href; break; }
    }
    log('Person LinkedIn:', personLinkedIn || 'NOT FOUND');

    // ── Company link (contains organizationId) ───────────
    let companyName = '';
    let companyLink = null;
    for (const a of document.querySelectorAll('a')) {
      const href = a.getAttribute('href') || a.getAttribute('data-to') || '';
      if (href.includes('organizationId=')) {
        const text = a.innerText?.trim() || '';
        if (text.length > 0 && text.length < 100 &&
            !text.includes('|') && !text.includes('@') && !text.includes('·')) {
          companyName = text;
          companyLink = a;
          log(`Company link: "${companyName}"`);
          break;
        }
      }
    }

    if (!companyLink) {
      log('No company link found');
      return { personLinkedIn, companyName:'', companyLinkedIn:'', companyWebsite:'' };
    }

    // ── Click company to open side drawer ────────────────
    log('Clicking company:', companyName);
    companyLink.click();

    try {
      await waitUntil(() => {
        const text = document.body.innerText || '';
        return text.includes('Company details') ||
               text.includes('LINKS') ||
               text.includes('Founded') ||
               text.includes('employees') ||
               document.querySelector('[class*="drawer"]') !== null ||
               document.querySelector('[class*="slide"]') !== null;
      }, 8000);
      log('Drawer opened');
    } catch {
      log('Drawer timeout — reading anyway');
    }

    await sleep(2000);

    // ── Company LinkedIn ─────────────────────────────────
    let companyLinkedIn = '';
    for (const a of document.querySelectorAll('a')) {
      const href = a.href || '';
      if (href.includes('linkedin.com/company/')) {
        companyLinkedIn = href;
        log('Company LinkedIn:', href);
        break;
      }
    }

    // ── Company Website ──────────────────────────────────
    let companyWebsite = '';
    const BLK = ['apollo.io','linkedin.com','google.com','twitter.com','x.com',
                 'facebook.com','instagram.com','chrome-extension','youtube.com','t.co'];
    for (const a of document.querySelectorAll('a[target="_blank"]')) {
      const h = a.href || '';
      if (h.startsWith('http') && !BLK.some(b => h.includes(b))) {
        companyWebsite = h;
        log('Company Website:', h);
        break;
      }
    }

    log('Scrape result:', { personLinkedIn, companyName, companyLinkedIn, companyWebsite });
    return { personLinkedIn, companyName, companyLinkedIn, companyWebsite };
  }

  // ── HUD ───────────────────────────────────────────────────
  function createHUD(sv, sk, total) {
    document.getElementById('_apollo_hud')?.remove();
    const hud = document.createElement('div');
    hud.id = '_apollo_hud';
    hud.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-weight:800;font-size:14px;color:#a5b4fc">🤖 Apollo Agent</span>
        <span id="_hb" style="font-size:10px;background:#14532d;color:#86efac;padding:2px 8px;border-radius:99px;font-weight:700">RUNNING</span>
      </div>
      <div id="_hs" style="font-size:12px;color:#94a3b8;margin-bottom:10px;min-height:40px;line-height:1.6;word-break:break-word">Initializing...</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:#0f172a;border-radius:6px;padding:7px;text-align:center">
          <div id="_hsv" style="font-size:18px;font-weight:800;color:#a5b4fc">${sv||0}</div>
          <div style="font-size:9px;color:#64748b;margin-top:2px">SAVED</div>
        </div>
        <div style="background:#0f172a;border-radius:6px;padding:7px;text-align:center">
          <div id="_hsk" style="font-size:18px;font-weight:800;color:#a5b4fc">${sk||0}</div>
          <div style="font-size:9px;color:#64748b;margin-top:2px">SKIPPED</div>
        </div>
        <div style="background:#0f172a;border-radius:6px;padding:7px;text-align:center">
          <div id="_hto" style="font-size:18px;font-weight:800;color:#a5b4fc">${total||0}</div>
          <div style="font-size:9px;color:#64748b;margin-top:2px">TOTAL</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button id="_hp" style="flex:1;padding:7px;border:1px solid #334155;border-radius:6px;background:#1e293b;color:#94a3b8;font-size:11px;cursor:pointer;font-weight:600">⏸ Pause</button>
        <button id="_hx" style="flex:1;padding:7px;border:1px solid #7f1d1d;border-radius:6px;background:#450a0a;color:#fca5a5;font-size:11px;cursor:pointer;font-weight:600">⏹ Stop</button>
      </div>`;
    Object.assign(hud.style, {
      position:'fixed', bottom:'20px', right:'20px', zIndex:'2147483647',
      background:'#0f172a', border:'1px solid #334155', borderRadius:'14px',
      padding:'16px', width:'260px', fontFamily:'Segoe UI,system-ui,sans-serif',
      boxShadow:'0 12px 40px rgba(0,0,0,.6)', color:'#e2e8f0'
    });
    document.body.appendChild(hud);

    document.getElementById('_hp').onclick = async () => {
      PAUSED = !PAUSED;
      const st = await getState();
      await setState({ ...st, agentPaused: PAUSED });
      document.getElementById('_hp').textContent = PAUSED ? '▶ Resume' : '⏸ Pause';
      upd(PAUSED ? '⏸ Paused — click Resume to continue' : '▶ Resuming...');
    };

    document.getElementById('_hx').onclick = async () => {
      RUNNING = false; PAUSED = false;
      await setState({ agentState: 'idle', agentQueue: [], agentIndex: 0 });
      bdg('STOPPED','#450a0a','#fca5a5');
      upd('⏹ Stopped. Queue cleared.');
    };
  }

  function upd(s, sv, sk, to) {
    const g = id => document.getElementById(id);
    if (s  !== undefined && g('_hs'))  g('_hs').textContent  = s;
    if (sv !== undefined && g('_hsv')) g('_hsv').textContent = sv;
    if (sk !== undefined && g('_hsk')) g('_hsk').textContent = sk;
    if (to !== undefined && g('_hto')) g('_hto').textContent = to;
  }
  function bdg(t, bg, c) {
    const e = document.getElementById('_hb');
    if (e) { e.textContent=t; e.style.background=bg; e.style.color=c; }
  }
  function toast(msg, type='success', dur=6000) {
    document.getElementById('_at')?.remove();
    const el = document.createElement('div'); el.id='_at'; el.textContent=msg;
    Object.assign(el.style, {
      position:'fixed', bottom:'300px', right:'20px', zIndex:'2147483647',
      padding:'12px 20px', borderRadius:'10px', fontSize:'13px',
      fontFamily:'Segoe UI,sans-serif', fontWeight:'700', color:'#fff',
      background:{success:'#16a34a',warn:'#d97706',error:'#dc2626',info:'#2563eb'}[type]||'#16a34a',
      boxShadow:'0 6px 24px rgba(0,0,0,.3)', pointerEvents:'none',
      maxWidth:'260px', lineHeight:'1.5'
    });
    document.body.appendChild(el);
    setTimeout(()=>{el.style.transition='opacity .5s';el.style.opacity='0';setTimeout(()=>el.remove(),600);},dur);
  }

  // ════════════════════════════════════════════════════════
  // PHASE 1 — startAgent()
  // Called when user clicks "Process Checked Contacts"
  // Collects contacts → saves queue to storage → kicks off processing
  // ════════════════════════════════════════════════════════
  async function startAgent(speed) {
    if (RUNNING) { toast('Already running!','warn'); return; }
    if (!isListPage()) { toast('⚠️ Go to Apollo People list first','warn'); return; }

    SPEED = speed || SPEED;

    const contacts = getCheckedContacts();
    if (contacts.length === 0) {
      toast('⚠️ No checked contacts found.','warn',8000);
      return;
    }

    // ── Cross-match against Google Sheet BEFORE queuing ──
    toast('🔍 Checking Google Sheet for duplicates...', 'info', 4000);
    log('Fetching existing Apollo URLs from Google Sheet...');
    const sheetUrls  = await getSheetUrls();
    const sheetUrlSet = new Set(sheetUrls);
    log(`Sheet has ${sheetUrlSet.size} existing URLs.`);

    const fresh    = contacts.filter(c => !sheetUrlSet.has(c.apolloUrl));
    const dupeCount = contacts.length - fresh.length;

    if (dupeCount > 0) {
      log(`Skipping ${dupeCount} already-in-sheet contact(s).`);
      toast(`⏭ ${dupeCount} already in Sheet — skipped upfront.`, 'info', 3000);
    }

    if (fresh.length === 0) {
      toast('✅ All selected contacts are already in the Sheet. Nothing to do!', 'success', 8000);
      return;
    }

    // Persist only the fresh contacts as the queue
    await setState({
      agentState:   'running',
      agentSpeed:   SPEED,
      agentQueue:   fresh,
      agentIndex:   0,
      agentSaved:   0,
      agentSkipped: 0,
      agentTotal:   fresh.length,
      agentPaused:  false,
    });

    log(`✅ Queue of ${fresh.length} contacts saved to storage.`);
    toast(`📋 ${fresh.length} contacts queued. Starting first...`, 'info', 2500);

    await sleep(1500);
    await processNextContact();
  }

  // ════════════════════════════════════════════════════════
  // PHASE 2 — processNextContact()
  // Reads current index from storage, processes that one contact,
  // then navigates to CLEAN_LIST_URL which triggers checkAutoResume()
  // ════════════════════════════════════════════════════════
  async function processNextContact() {
    const st = await getState();

    if (st.agentState !== 'running') {
      log('Agent stopped, exiting.');
      RUNNING = false;
      return;
    }

    const queue   = st.agentQueue   || [];
    const index   = st.agentIndex   || 0;
    const total   = st.agentTotal   || queue.length;
    let   sv      = st.agentSaved   || 0;
    let   sk      = st.agentSkipped || 0;
    SPEED         = st.agentSpeed   || SPEED;
    PAUSED        = st.agentPaused  || false;

    // ── All contacts done ────────────────────────────────
    if (index >= queue.length) {
      RUNNING = false;
      await setState({ ...st, agentState: 'idle' });
      createHUD(sv, sk, total);
      bdg('DONE','#1e3a5f','#93c5fd');
      upd(`🎉 Done! ${sv} saved, ${sk} skipped`, sv, sk, total);
      toast(`🎉 Complete!\n${sv} saved, ${sk} skipped`, 'success', 10000);
      try { new Notification('Apollo Agent Done 🎉', {body:`${sv} saved, ${sk} skipped`}); } catch(e) {}
      return;
    }

    RUNNING = true;
    const { name, apolloUrl } = queue[index];
    const L = `[${index+1}/${total}]`;

    createHUD(sv, sk, total);
    upd(`${L} Checking: ${name}`, sv, sk, total);

    // ── Skip if already saved ────────────────────────────
    const savedUrls = await getSaved();
    if (new Set(savedUrls).has(apolloUrl)) {
      sk++;
      log(`${L} Already saved, skipping: ${name}`);
      await setState({ ...st, agentIndex: index+1, agentSkipped: sk });
      upd(`${L} ⏭ Skipped: ${name}`, sv, sk, total);
      await sleep(600);
      // Navigate to clean list page + hard reload → SPA won't reinject otherwise
      if (location.href === CLEAN_LIST_URL) {
        location.reload(true);
      } else {
        location.href = CLEAN_LIST_URL;
        await sleep(500);
        location.reload(true);
      }
      return;
    }

    // ── Wait if paused ───────────────────────────────────
    while (PAUSED && RUNNING) await sleep(500);
    if (!RUNNING) return;

    // ── Scrape profile ───────────────────────────────────
    upd(`${L} Scraping: ${name}`, sv, sk, total);
    const data = await scrapeFullProfile(apolloUrl);

    // Check if stopped during scrape
    const stCheck = await getState();
    if (stCheck.agentState !== 'running') { RUNNING = false; return; }

    const payload = {
      personName:      name,
      personLinkedIn:  data.personLinkedIn,
      companyName:     data.companyName,
      companyLinkedIn: data.companyLinkedIn,
      companyWebsite:  data.companyWebsite,
      apolloUrl,
      timestamp: new Date().toISOString()
    };

    upd(`${L} Saving to Sheets: ${name}`, sv, sk, total);
    const res = await saveRow(payload);

    if (res?.ok) {
      sv++;
      await markSaved(apolloUrl);
      log(`${L} ✅ Saved: ${name}`);
      upd(`${L} ✅ Saved: ${name}`, sv, sk, total);
    } else {
      warn(`${L} ⚠️ Save failed: ${name}`);
      upd(`${L} ⚠️ Failed: ${name}`, sv, sk, total);
    }

    // ── Persist progress → advance index ────────────────
    const latestSt = await getState();
    await setState({
      ...latestSt,
      agentIndex:   index + 1,
      agentSaved:   sv,
      agentSkipped: sk,
    });

    log(`${L} Done. Navigating to clean list page for next contact...`);
    upd(`${L} ✅ Done. Loading next...`, sv, sk, total);

    // Brief pause so user can see the result, then go to clean list
    await sleep(1200);

    // ── KEY: Navigate to base /people page + HARD RELOAD ─
    // Apollo is a SPA — hash navigation alone doesn't cause a real reload,
    // so agent.js would NOT reinject. We force a hard reload so the page
    // fully reloads, agent.js reinjects, and checkAutoResume() picks up next.
    if (location.href === CLEAN_LIST_URL) {
      location.reload(true);
    } else {
      location.href = CLEAN_LIST_URL;
      await sleep(500);
      location.reload(true);
    }
  }

  // ════════════════════════════════════════════════════════
  // AUTO-RESUME — Runs on every page load on Apollo
  // If agentState==='running' and there's a queue, automatically
  // continues from where it left off
  // ════════════════════════════════════════════════════════
  async function checkAutoResume() {
    if (!isListPage()) return;

    const st = await getState();
    if (st.agentState !== 'running') return;

    const queue = st.agentQueue || [];
    const index = st.agentIndex || 0;
    if (queue.length === 0 || index >= queue.length) return;

    const next  = queue[index];
    const total = st.agentTotal || queue.length;
    const sv    = st.agentSaved   || 0;
    const sk    = st.agentSkipped || 0;
    SPEED       = st.agentSpeed   || SPEED;

    log(`🔄 Auto-resuming: ${index+1}/${total} — "${next?.name}"`);

    // Show HUD immediately so user knows the agent is alive
    createHUD(sv, sk, total);
    upd(`⏳ Loading next: ${next?.name} (${index+1}/${total})`, sv, sk, total);
    toast(`⚙️ Resuming: ${next?.name} (${index+1}/${total})`, 'info', 2000);

    // Wait for the page to fully settle before navigating to profile
    await sleep(SPEED);
    await processNextContact();
  }

  // ── Message listener (from popup) ────────────────────────
  chrome.runtime.onMessage.addListener((msg, _, res) => {
    if (msg.type === 'START_AGENT') {
      startAgent(msg.speed);
      res({ok: true});
    }
    if (msg.type === 'PAUSE_AGENT') {
      PAUSED = !PAUSED;
      setState({ agentPaused: PAUSED });
      res({ok: true});
    }
    if (msg.type === 'STOP_AGENT') {
      RUNNING = false; PAUSED = false;
      setState({ agentState: 'idle', agentQueue: [], agentIndex: 0 });
      document.getElementById('_apollo_hud')?.remove();
      res({ok: true});
    }
    if (msg.type === 'GET_STATUS') {
      res({ running: RUNNING, paused: PAUSED });
    }
  });

  // ── Boot ──────────────────────────────────────────────────
  log('Apollo Lead Agent v6.0 loaded ✅');
  checkAutoResume();

})();