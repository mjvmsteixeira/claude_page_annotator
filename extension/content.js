/* ═══════════════════════════════════════════════════════════
   Claude Page Annotator — Content Script
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  if (window.__cpaLoaded) return;
  window.__cpaLoaded = true;

  // ── State ───────────────────────────────────────────────
  const state = {
    active: false,
    selecting: false,
    startX: 0,
    startY: 0,
    annotations: [],
    nextId: 1,
  };

  // ── Session persistence ─────────────────────────────────
  const SESSION_KEY = `cpa-${location.href}`;
  const LANG_KEY = 'cpa-lang';
  let currentLang = 'pt';

  async function loadLang() {
    try {
      const data = await chrome.storage.sync.get(LANG_KEY);
      if (data[LANG_KEY] === 'en') currentLang = 'en';
    } catch { /* default pt */ }
  }

  function t() { return (window.CPA_STRINGS ?? {})[currentLang] ?? {}; }

  async function loadSession() {
    try {
      const data = await chrome.storage.session.get(SESSION_KEY);
      const saved = data[SESSION_KEY];
      if (saved) {
        state.annotations = saved.annotations;
        state.nextId = saved.nextId;
      }
    } catch (err) {
      console.warn('[cpa] session storage unavailable:', err.message);
    }
  }

  function saveSession() {
    try {
      chrome.storage.session.set({
        [SESSION_KEY]: { annotations: state.annotations, nextId: state.nextId },
      });
    } catch { /* storage unavailable — annotations kept in memory only */ }
  }

  function clearSession() {
    try {
      chrome.storage.session.remove(SESSION_KEY);
    } catch { /* ignore */ }
  }

  // ── SVG icons (inline) ─────────────────────────────────
  const ICON_LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="12" y1="6" x2="12" y2="12"/></svg>`;

  // ── Toolbar ─────────────────────────────────────────────
  function createToolbar() {
    if (document.getElementById('cpa-toolbar')) return;

    const bar = document.createElement('div');
    bar.id = 'cpa-toolbar';
    bar.innerHTML = `
      <div class="cpa-logo">${ICON_LOGO} ${t().toolbarTitle}</div>
      <span class="cpa-status">${t().toolbarStatusEmpty}</span>
      <span class="cpa-badge" id="cpa-count">0</span>
      <button class="cpa-toolbar-btn cpa-btn-primary" id="cpa-btn-export">${t().toolbarSend}</button>
      <button class="cpa-toolbar-btn" id="cpa-btn-clear" style="display:none;">${t().toolbarClear}</button>
      <button class="cpa-toolbar-btn cpa-btn-danger" id="cpa-btn-close">${t().toolbarClose}</button>
    `;
    document.body.appendChild(bar);

    document.getElementById('cpa-btn-export').addEventListener('click', () => sendToCLI());
    const clearBtn = document.getElementById('cpa-btn-clear');
    clearBtn.addEventListener('click', () => {
      if (clearBtn.dataset.confirming) {
        state.annotations = [];
        state.nextId = 1;
        clearSession();
        document.querySelectorAll('.cpa-marker').forEach(m => m.remove());
        updateCount();
        clearBtn.textContent = t().toolbarClear;
        delete clearBtn.dataset.confirming;
      } else {
        clearBtn.textContent = t().toolbarClearConfirm;
        clearBtn.dataset.confirming = '1';
        setTimeout(() => {
          if (clearBtn.dataset.confirming) {
            clearBtn.textContent = t().toolbarClear;
            delete clearBtn.dataset.confirming;
          }
        }, 3000);
      }
    });
    document.getElementById('cpa-btn-close').addEventListener('click', deactivate);
  }

  function statusText(n) {
    if (n === 0) return t().toolbarStatusEmpty;
    if (n === 1) return t().toolbarStatus1;
    return t().toolbarStatusN(n);
  }

  function updateCount() {
    const el = document.getElementById('cpa-count');
    if (el) el.textContent = state.annotations.length;
    const st = document.querySelector('#cpa-toolbar .cpa-status');
    if (st) st.textContent = statusText(state.annotations.length);
    const clearBtn = document.getElementById('cpa-btn-clear');
    if (clearBtn) clearBtn.style.display = state.annotations.length > 0 ? '' : 'none';
  }

  // ── Overlay (selection layer) ──────────────────────────
  function createOverlay() {
    if (document.getElementById('cpa-overlay')) return;
    const ov = document.createElement('div');
    ov.id = 'cpa-overlay';
    document.body.appendChild(ov);

    ov.addEventListener('mousedown', onSelectionStart);
    ov.addEventListener('mousemove', onSelectionMove);
    ov.addEventListener('mouseup', onSelectionEnd);
  }

  function removeOverlay() {
    const ov = document.getElementById('cpa-overlay');
    if (ov) ov.remove();
    const box = document.getElementById('cpa-selection-box');
    if (box) box.remove();
  }

  // ── Selection handlers ─────────────────────────────────
  function onSelectionStart(e) {
    state.selecting = true;
    state.startX = e.clientX;
    state.startY = e.clientY;

    let box = document.getElementById('cpa-selection-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'cpa-selection-box';
      document.body.appendChild(box);
    }
    box.style.left = e.clientX + 'px';
    box.style.top = e.clientY + 'px';
    box.style.width = '0';
    box.style.height = '0';
    box.style.display = 'block';
  }

  function onSelectionMove(e) {
    if (!state.selecting) return;
    const box = document.getElementById('cpa-selection-box');
    if (!box) return;

    const x = Math.min(state.startX, e.clientX);
    const y = Math.min(state.startY, e.clientY);
    const w = Math.abs(e.clientX - state.startX);
    const h = Math.abs(e.clientY - state.startY);

    box.style.left = x + 'px';
    box.style.top = y + 'px';
    box.style.width = w + 'px';
    box.style.height = h + 'px';
  }

  function onSelectionEnd(e) {
    if (!state.selecting) return;
    state.selecting = false;

    const box = document.getElementById('cpa-selection-box');
    if (!box) return;

    const w = Math.abs(e.clientX - state.startX);
    const h = Math.abs(e.clientY - state.startY);

    // Ignore tiny selections (accidental clicks)
    if (w < 20 || h < 20) {
      box.style.display = 'none';
      return;
    }

    const rect = {
      x: Math.min(state.startX, e.clientX),
      y: Math.min(state.startY, e.clientY),
      w, h,
    };

    box.style.display = 'none';
    removeOverlay();
    showCommentModal(rect);
  }

  // ── Comment modal ──────────────────────────────────────
  function showCommentModal(rect, existingAnnotation = null) {
    const isEditing = existingAnnotation !== null;
    const capturedHTML = isEditing ? existingAnnotation.html : captureElementsInRect(rect);
    const annotationId = isEditing ? existingAnnotation.id : state.nextId;

    const backdrop = document.createElement('div');
    backdrop.id = 'cpa-backdrop';
    document.body.appendChild(backdrop);

    const modal = document.createElement('div');
    modal.id = 'cpa-comment-modal';

    // Position near the selection
    let modalX = isEditing ? (window.innerWidth / 2 - 200) : rect.x + rect.w + 16;
    let modalY = isEditing ? (window.innerHeight / 2 - 160) : rect.y;
    if (!isEditing) {
      if (modalX + 400 > window.innerWidth) modalX = rect.x - 400;
      if (modalX < 8) modalX = 8;
      if (modalY + 320 > window.innerHeight) modalY = window.innerHeight - 330;
      if (modalY < 60) modalY = 60;
    }

    modal.style.left = modalX + 'px';
    modal.style.top = modalY + 'px';

    modal.innerHTML = `
      <div class="cpa-modal-header">
        <h3>${isEditing ? t().modalEditTitle(annotationId) : t().modalNewTitle(annotationId)}</h3>
      </div>
      <div class="cpa-modal-body">
        <div class="cpa-tag-row">
          <button class="cpa-tag" data-tag="codigo">${t().modalTagCode}</button>
          <button class="cpa-tag" data-tag="acessibilidade">${t().modalTagA11y}</button>
          <button class="cpa-tag" data-tag="conteudo">${t().modalTagContent}</button>
        </div>
        <textarea id="cpa-comment-text" placeholder="${t().modalPlaceholder}"></textarea>
        <div class="cpa-modal-hint">
          ${t().modalHint}
        </div>
      </div>
      <div class="cpa-modal-footer">
        <button class="cpa-toolbar-btn" id="cpa-modal-cancel">${t().modalCancel}</button>
        <button class="cpa-toolbar-btn cpa-btn-primary" id="cpa-modal-save">${t().modalSave}</button>
      </div>
    `;
    document.body.appendChild(modal);

    const selectedTags = new Set(isEditing ? existingAnnotation.tags : []);
    modal.querySelectorAll('.cpa-tag').forEach(tag => {
      if (selectedTags.has(tag.dataset.tag)) tag.classList.add('active');
      tag.addEventListener('click', () => {
        const tagKey = tag.dataset.tag;
        if (selectedTags.has(tagKey)) {
          selectedTags.delete(tagKey);
          tag.classList.remove('active');
        } else {
          selectedTags.add(tagKey);
          tag.classList.add('active');
        }
      });
    });

    setTimeout(() => {
      const ta = document.getElementById('cpa-comment-text');
      if (ta) {
        if (isEditing) ta.value = existingAnnotation.comment;
        ta.focus();
      }
    }, 100);

    // Cancel
    document.getElementById('cpa-modal-cancel').addEventListener('click', () => {
      closeCommentModal();
      createOverlay();
    });

    document.getElementById('cpa-modal-save').addEventListener('click', () => {
      const text = document.getElementById('cpa-comment-text').value.trim();
      if (!text) {
        document.getElementById('cpa-comment-text').style.borderColor = '#ef4444';
        return;
      }

      if (isEditing) {
        const idx = state.annotations.findIndex(a => a.id === existingAnnotation.id);
        if (idx !== -1) {
          state.annotations[idx] = {
            ...state.annotations[idx],
            tags: [...selectedTags],
            comment: text,
          };
          document.querySelector(`.cpa-marker[data-annotation-id="${existingAnnotation.id}"]`)?.remove();
          placeMarker(state.annotations[idx]);
        }
        saveSession();
        updateCount();
        closeCommentModal();
      } else {
        const annotation = {
          id: state.nextId++,
          rect: {
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            w: rect.w,
            h: rect.h,
          },
          tags: [...selectedTags],
          comment: text,
          html: capturedHTML,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        };
        state.annotations.push(annotation);
        placeMarker(annotation);
        saveSession();
        updateCount();
        closeCommentModal();
        createOverlay();
      }
    });

    // Keyboard shortcuts
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCommentModal();
        createOverlay();
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        document.getElementById('cpa-modal-save')?.click();
      }
    });
  }

  function closeCommentModal() {
    document.getElementById('cpa-comment-modal')?.remove();
    document.getElementById('cpa-backdrop')?.remove();
  }

  // ── Capture elements under selection ───────────────────
  function captureElementsInRect(rect) {
    const points = [
      [rect.x + rect.w * 0.5,  rect.y + rect.h * 0.5],
      [rect.x + rect.w * 0.25, rect.y + rect.h * 0.25],
      [rect.x + rect.w * 0.75, rect.y + rect.h * 0.25],
      [rect.x + rect.w * 0.25, rect.y + rect.h * 0.75],
      [rect.x + rect.w * 0.75, rect.y + rect.h * 0.75],
    ];

    const counts = new Map();
    for (const [px, py] of points) {
      const els = document.elementsFromPoint(px, py);
      const target = els.find(el =>
        !el.id?.startsWith('cpa-') &&
        !el.classList?.contains('cpa-marker') &&
        el.tagName !== 'HTML' &&
        el.tagName !== 'BODY'
      );
      if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
    }

    if (counts.size === 0) return '<no-element-found />';

    const candidates = [...counts.entries()].filter(([, c]) => c >= 3);
    const pool = candidates.length > 0 ? candidates : [...counts.entries()];
    const best = pool.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].querySelectorAll('*').length - a[0].querySelectorAll('*').length;
    })[0][0];

    let html = best.outerHTML;
    if (html.length > 3000) {
      html = html.substring(0, 3000) + '\n' + t().truncated;
    }
    return html;
  }

  // ── Place marker on page ───────────────────────────────
  function placeMarker(ann) {
    const marker = document.createElement('div');
    marker.className = 'cpa-marker';
    marker.dataset.annotationId = ann.id;
    marker.style.left = ann.rect.x + 'px';
    marker.style.top = ann.rect.y + 'px';
    marker.style.width = ann.rect.w + 'px';
    marker.style.height = ann.rect.h + 'px';

    // Number label
    const label = document.createElement('div');
    label.className = 'cpa-marker-label';
    label.textContent = ann.id;
    marker.appendChild(label);

    // Delete button
    const del = document.createElement('button');
    del.className = 'cpa-marker-delete';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      state.annotations = state.annotations.filter(a => a.id !== ann.id);
      marker.remove();
      saveSession();
      updateCount();
    });
    marker.appendChild(del);

    marker.addEventListener('click', () => {
      showMarkerPopover(marker, ann);
    });

    document.body.appendChild(marker);
  }

  function showMarkerPopover(marker, ann) {
    document.getElementById('cpa-popover')?.remove();

    const pop = document.createElement('div');
    pop.id = 'cpa-popover';
    pop.className = 'cpa-popover';

    const tags = ann.tags.map(tagVal => t().mcpTagLabels[tagVal] ?? tagVal).join(', ') || t().mcpTagGeneral;

    // Build structure using DOM methods — user content set via textContent (XSS-safe)
    const header = document.createElement('div');
    header.className = 'cpa-popover-header';
    header.textContent = `#${ann.id} — ${tags}`;

    const body = document.createElement('div');
    body.className = 'cpa-popover-body';
    body.textContent = ann.comment;

    const footer = document.createElement('div');
    footer.className = 'cpa-popover-footer';

    const editBtn = document.createElement('button');
    editBtn.className = 'cpa-toolbar-btn cpa-btn-primary';
    editBtn.textContent = t().popoverEdit;

    const delBtn = document.createElement('button');
    delBtn.className = 'cpa-toolbar-btn cpa-btn-danger';
    delBtn.textContent = t().popoverDelete;

    footer.appendChild(editBtn);
    footer.appendChild(delBtn);
    pop.appendChild(header);
    pop.appendChild(body);
    pop.appendChild(footer);

    const markerRect = marker.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.left = Math.max(8, markerRect.left) + 'px';
    pop.style.top = Math.max(60, markerRect.top - 130) + 'px';

    document.body.appendChild(pop);

    const dismiss = (e) => {
      if (!pop.contains(e.target) && e.target !== marker) {
        pop.remove();
        document.removeEventListener('click', dismiss, true);
      }
    };

    editBtn.addEventListener('click', () => {
      document.removeEventListener('click', dismiss, true);
      pop.remove();
      removeOverlay();
      showCommentModal(null, ann);
    });

    delBtn.addEventListener('click', () => {
      document.removeEventListener('click', dismiss, true);
      state.annotations = state.annotations.filter(a => a.id !== ann.id);
      marker.remove();
      pop.remove();
      updateCount();
      saveSession();
    });

    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  // ── Build payload ──────────────────────────────────────
  function buildPayload() {
    return {
      url: window.location.href,
      title: document.title,
      lang: currentLang,
      annotations: state.annotations.map(ann => ({
        id: ann.id,
        tags: ann.tags,
        comment: ann.comment,
        html: ann.html,
      })),
    };
  }

  async function sendToCLI(serverUrl = 'http://localhost:3847') {
    if (state.annotations.length === 0) return;

    const btn = document.getElementById('cpa-btn-export');
    const originalText = btn.textContent;
    btn.textContent = t().toolbarSending;
    btn.disabled = true;

    try {
      const res = await fetch(`${serverUrl}/annotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Annotator-Secret': 'claude-annotator-local',
        },
        body: JSON.stringify(buildPayload()),
      });

      if (res.ok) {
        btn.textContent = t().toolbarSent;
        state.annotations = [];
        state.nextId = 1;
        clearSession();
        updateCount();
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 2000);
      } else {
        const err = await res.json().catch(() => ({}));
        btn.textContent = t().toolbarError;
        console.error('[annotator] MCP server error:', err);
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 3000);
      }
    } catch {
      btn.textContent = t().toolbarOffline;
      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 3000);
    }
  }

  // ── Activation / Deactivation ─────────────────────────
  async function activate() {
    if (state.active) return;
    state.active = true;
    await loadSession();
    await loadLang();
    createToolbar();
    state.annotations.forEach(ann => placeMarker(ann));
    updateCount();
    createOverlay();
  }

  function deactivate() {
    state.active = false;
    removeOverlay();
    closeCommentModal();
    document.getElementById('cpa-toolbar')?.remove();
    document.querySelectorAll('.cpa-marker').forEach(m => m.remove());
    // state.annotations intentionally NOT cleared — session persists in chrome.storage.session
  }

  // ── Message listener (from popup / background) ────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'toggle') {
      if (state.active) {
        deactivate();
        sendResponse({ active: state.active });
      } else {
        activate().then(() => sendResponse({ active: state.active }));
        return true; // async response
      }
      return;
    }

    if (msg.action === 'getState') {
      sendResponse({
        active: state.active,
        count: state.annotations.length,
      });
    }

    if (msg.action === 'sendToCLI') {
      if (state.annotations.length === 0) {
        sendResponse({ success: false, error: 'No annotations' });
        return;
      }
      const serverUrl = msg.serverUrl ?? 'http://localhost:3847';
      sendToCLI(serverUrl).then(() => sendResponse({ success: true }));
      return true;
    }
  });

})();
