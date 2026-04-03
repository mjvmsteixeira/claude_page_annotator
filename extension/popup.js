const PORTS = [3847,3848,3849,3850,3851,3852,3853,3854,3855,3856];
const SCAN_TIMEOUT_MS = 800;
const SESSION_KEY_SERVER = 'cpa-selected-server';
const LANG_KEY = 'cpa-lang';

document.addEventListener('DOMContentLoaded', async () => {
  const btnToggle     = document.getElementById('btn-toggle');
  const btnExport     = document.getElementById('btn-export');
  const btnScan       = document.getElementById('btn-scan');
  const btnLang       = document.getElementById('btn-lang');
  const statusDot     = document.getElementById('status-dot');
  const statusLabel   = document.getElementById('status-label');
  const serverSelect  = document.getElementById('server-select');
  const serverError   = document.getElementById('server-error');
  const cliError      = document.getElementById('cli-error');
  const mcpDot        = document.getElementById('mcp-dot');
  const mcpStatusText = document.getElementById('mcp-status-text');
  const pendingBadge  = document.getElementById('pending-badge');

  let lang = 'pt';

  async function loadLang() {
    try {
      const data = await chrome.storage.sync.get(LANG_KEY);
      if (data[LANG_KEY] === 'en') lang = 'en';
    } catch { /* default pt */ }
  }

  function s() { return window.CPA_STRINGS[lang]; }

  function applyStrings() {
    btnLang.textContent = lang === 'pt' ? 'EN' : 'PT';
    document.getElementById('subtitle').textContent = s().subtitle;
    document.getElementById('label-server').textContent = s().sectionServer;
    document.getElementById('label-status').textContent = s().statusLabel;
    serverError.textContent = s().serverNotFound;
    document.getElementById('instr-1-bold').textContent = s().instrSelect;
    document.getElementById('instr-1-text').textContent = s().instrSelectServer;
    document.getElementById('instr-2-bold').textContent = s().instrActivate;
    document.getElementById('instr-2-text').textContent = s().instrActivateAnnotator;
    document.getElementById('instr-3-bold').textContent = s().instrSelectArea;
    document.getElementById('instr-3-text').textContent = s().instrSelectAreaPage;
    document.getElementById('instr-4-bold').textContent = s().instrSend;
    document.getElementById('instr-4-text').textContent = s().instrSendToCLI;
  }

  btnLang.addEventListener('click', async () => {
    lang = lang === 'pt' ? 'en' : 'pt';
    try { await chrome.storage.sync.set({ [LANG_KEY]: lang }); } catch { /* in-memory only */ }
    applyStrings();
    await refreshState();
  });

  function setMcpStatus(connected, label) {
    mcpDot.className = 'mcp-dot ' + (connected ? 'connected' : 'disconnected');
    mcpStatusText.textContent = label;
  }

  function clearMcpStatus() {
    mcpDot.className = 'mcp-dot';
    mcpStatusText.textContent = '';
  }

  let lastServers = [];

  async function scanServers() {
    serverSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = s().scanning;
    serverSelect.appendChild(placeholder);
    serverSelect.disabled = true;
    serverError.style.display = 'none';
    clearMcpStatus();
    pendingBadge.style.display = 'none';

    const results = await Promise.allSettled(
      PORTS.map(port =>
        fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(SCAN_TIMEOUT_MS) })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(data => ({ url: `http://localhost:${port}`, port, name: data.name ?? `annotator-${port}`, pending: data.pending ?? 0 }))
      )
    );

    lastServers = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    serverSelect.innerHTML = '';

    if (lastServers.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = lang === 'pt' ? 'Nenhum servidor encontrado' : 'No server found';
      serverSelect.appendChild(opt);
      serverSelect.disabled = true;
      serverError.style.display = 'block';
      setMcpStatus(false, s().mcpDisconnected);
      return;
    }

    lastServers.forEach(sv => {
      const opt = document.createElement('option');
      opt.value = sv.url;
      opt.textContent = `${sv.name}  :${sv.port}`;
      serverSelect.appendChild(opt);
    });
    serverSelect.disabled = false;

    const saved = await chrome.storage.session.get(SESSION_KEY_SERVER).catch(() => ({}));
    const lastUrl = saved[SESSION_KEY_SERVER];
    if (lastUrl && lastServers.find(sv => sv.url === lastUrl)) serverSelect.value = lastUrl;

    updateMcpStatusForSelected();
  }

  function updateMcpStatusForSelected() {
    const selectedUrl = serverSelect.value;
    if (!selectedUrl) { clearMcpStatus(); pendingBadge.style.display = 'none'; return; }
    const sv = lastServers.find(x => x.url === selectedUrl);
    if (!sv) { clearMcpStatus(); return; }
    setMcpStatus(true, sv.name);
    if (sv.pending > 0) {
      pendingBadge.textContent = s().pendingBadge(sv.pending);
      pendingBadge.style.display = 'block';
    } else {
      pendingBadge.style.display = 'none';
    }
  }

  serverSelect.addEventListener('change', async () => {
    const url = serverSelect.value;
    if (!url) return;
    chrome.storage.session.set({ [SESSION_KEY_SERVER]: url }).catch(() => {});
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
      if (serverSelect.value !== url) return; // selection changed while awaiting
      if (r.ok) {
        const data = await r.json();
        const pending = data.pending ?? 0;
        const idx = lastServers.findIndex(x => x.url === url);
        if (idx !== -1) lastServers[idx].pending = pending;
        setMcpStatus(true, data.name ?? url);
        pendingBadge.textContent = pending > 0 ? s().pendingBadge(pending) : '';
        pendingBadge.style.display = pending > 0 ? 'block' : 'none';
      } else {
        setMcpStatus(false, s().mcpNotResponding);
      }
    } catch {
      setMcpStatus(false, s().mcpDisconnected);
    }
  });

  btnScan.addEventListener('click', scanServers);

  async function getTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
  }

  function updateUI(active, count) {
    if (active) {
      statusDot.className = 'status-dot active';
      statusLabel.textContent = s().statusActive(count);
      btnToggle.textContent = s().toggleDeactivate;
      btnToggle.classList.remove('btn-primary');
      btnToggle.classList.add('btn-danger');
      if (count > 0) {
        btnExport.style.display = 'block';
        btnExport.textContent = s().sendBtn(count);
      } else {
        btnExport.style.display = 'none';
      }
    } else {
      statusDot.className = 'status-dot inactive';
      statusLabel.textContent = s().statusInactive;
      btnToggle.textContent = s().toggleActivate;
      btnToggle.classList.remove('btn-danger');
      btnToggle.classList.add('btn-primary');
      btnExport.style.display = 'none';
    }
  }

  async function refreshState() {
    const tab = await getTab();
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url === 'about:blank') {
      updateUI(false, 0);
      return;
    }
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
      updateUI(resp.active, resp.count);
    } catch {
      updateUI(false, 0);
    }
  }

  btnToggle.addEventListener('click', async () => {
    cliError.style.display = 'none';
    const prevText = btnToggle.textContent;
    btnToggle.disabled = true;
    btnToggle.textContent = s().toggleActivating;

    try {
      const tab = await getTab();
      if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url === 'about:blank') {
        throw new Error(s().errorNotAPage);
      }
      let resp;
      try {
        resp = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      } catch {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['i18n.js'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
        resp = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      }
      updateUI(resp?.active ?? false, 0);
    } catch (err) {
      btnToggle.textContent = prevText;
      cliError.textContent = s().errorPrefix + (err?.message ?? s().errorUnsupported);
      cliError.style.display = 'block';
      updateUI(false, 0);
    } finally {
      btnToggle.disabled = false;
    }
  });

  btnExport.addEventListener('click', async () => {
    const tab = await getTab();
    if (!tab?.id) return;

    const serverUrl = serverSelect.value;
    if (!serverUrl) {
      cliError.textContent = s().noServerSelected;
      cliError.style.display = 'block';
      return;
    }

    cliError.style.display = 'none';
    btnExport.disabled = true;
    btnExport.textContent = s().sendChecking;

    try {
      const health = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(1500) });
      if (!health.ok) throw new Error('unhealthy');
    } catch {
      const selectedText = serverSelect.options[serverSelect.selectedIndex]?.textContent ?? serverUrl;
      cliError.textContent = s().serverOffline(selectedText);
      cliError.style.display = 'block';
      btnExport.disabled = false;
      setMcpStatus(false, s().mcpDisconnected);
      setTimeout(() => refreshState(), 0);
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'sendToCLI', serverUrl });
    btnExport.textContent = s().sendSending;
    pendingBadge.style.display = 'none';
    setTimeout(() => refreshState(), 2000);
  });

  await loadLang();
  applyStrings();
  await scanServers();
  await refreshState();
});
