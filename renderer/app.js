'use strict';

/*
 * HA Multiview renderer.
 *
 * Layout model: every workspace has a tree of splits ("row" = side by side, "col" = stacked)
 * whose leaves are panes. The tree only renders empty "slots"; the actual pane elements
 * (each with its own <webview>) live in a separate absolutely-positioned layer and are moved
 * on top of their slot. That way a pane is never re-parented in the DOM, so splitting,
 * swapping, resizing or switching workspaces never reloads a Home Assistant view.
 */
(() => {
  const api = window.haApi;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const PARTITION = 'persist:ha';
  const MIN_PANE_PX = 140;
  const ZOOM_STEPS = [0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
  const DEFAULT_FAVORITES = [
    { name: 'Overzicht', path: '/lovelace' },
    { name: 'Energie', path: '/energy' },
    { name: 'Kaart', path: '/map' },
    { name: 'Logboek', path: '/logbook' },
    { name: 'Geschiedenis', path: '/history' },
    { name: 'Automatiseringen', path: '/config/automation/dashboard' },
    { name: 'Instellingen', path: '/config/dashboard' },
  ];

  const svg = (d) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    back: svg('<path d="M10 3.5 5.5 8l4.5 4.5"/>'),
    forward: svg('<path d="M6 3.5 10.5 8 6 12.5"/>'),
    reload: svg('<path d="M13 8a5 5 0 1 1-1.46-3.54"/><path d="M13 2.5V5h-2.5"/>'),
    star: svg('<path d="m8 2.2 1.75 3.6 3.95.55-2.87 2.77.7 3.93L8 11.2l-3.53 1.85.7-3.93L2.3 6.35l3.95-.55z"/>'),
    splitRight: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/>'),
    splitDown: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 8h12"/>'),
    maximize: svg('<path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10"/>'),
    restore: svg('<path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5"/>'),
    close: svg('<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>'),
    grip: '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg>',
    plus: svg('<path d="M8 3v10M3 8h10"/>'),
    caret: svg('<path d="m4.5 6.5 3.5 3.5 3.5-3.5"/>'),
    layout: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M7 2.5v11M7 8h7"/>'),
    fullscreen: svg('<path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10"/>'),
    settings: svg('<path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7"/><circle cx="11" cy="4.5" r="1.5"/><circle cx="5" cy="11.5" r="1.5"/>'),
  };

  let state = null;
  const panes = new Map(); // paneId -> ctx
  const maximized = new Map(); // workspaceId -> paneId (session-only)
  let focusedId = null;
  let saveTimer = null;

  const uid = (p) => p + Math.random().toString(36).slice(2, 10);

  /* ================= State ================= */

  function normalizeState(s) {
    s = s && typeof s === 'object' ? s : {};
    const settings = Object.assign(
      { baseUrl: '', defaultPath: '/lovelace', favorites: DEFAULT_FAVORITES.slice(), restoreSession: true, allowSelfSigned: false },
      s.settings || {}
    );
    if (!Array.isArray(settings.favorites)) settings.favorites = DEFAULT_FAVORITES.slice();

    const paneStore = s.panes && typeof s.panes === 'object' ? s.panes : {};
    let workspaces = Array.isArray(s.workspaces) ? s.workspaces.filter((w) => w && w.id) : [];

    if (!settings.restoreSession) workspaces = [];
    workspaces = workspaces.map((w) => ({ id: w.id, name: String(w.name || 'Werkruimte'), tree: cleanTree(w.tree, paneStore) }));
    if (!workspaces.length) workspaces = [{ id: uid('ws'), name: 'Werkruimte 1', tree: null }];

    // Drop pane records that no tree references any more.
    const used = new Set(workspaces.flatMap((w) => leaves(w.tree)));
    const panesOut = {};
    for (const id of used) {
      const p = paneStore[id] || {};
      panesOut[id] = { url: typeof p.url === 'string' ? p.url : '', zoom: Number(p.zoom) > 0 ? Number(p.zoom) : 1 };
    }

    const active = workspaces.some((w) => w.id === s.activeWorkspace) ? s.activeWorkspace : workspaces[0].id;
    return { version: 1, settings, workspaces, activeWorkspace: active, panes: panesOut };
  }

  function serialize() {
    return {
      version: 1,
      settings: state.settings,
      workspaces: state.workspaces.map((w) => ({ id: w.id, name: w.name, tree: w.tree })),
      activeWorkspace: state.activeWorkspace,
      panes: state.panes,
    };
  }

  function save(immediate) {
    clearTimeout(saveTimer);
    if (immediate) api.saveState(serialize());
    else saveTimer = setTimeout(() => api.saveState(serialize()), 250);
  }

  const activeWs = () => state.workspaces.find((w) => w.id === state.activeWorkspace);
  const wsById = (id) => state.workspaces.find((w) => w.id === id);
  const wsOfPane = (id) => state.workspaces.find((w) => leaves(w.tree).includes(id));

  /* ================= Layout tree ================= */

  const leaf = (id) => ({ type: 'pane', id });

  function leaves(node, out = []) {
    if (!node) return out;
    if (node.type === 'pane') out.push(node.id);
    else node.children.forEach((c) => leaves(c, out));
    return out;
  }

  function cleanTree(node, paneStore) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'pane') return paneStore[node.id] ? leaf(node.id) : null;
    if (node.type !== 'split' || !Array.isArray(node.children)) return null;
    const dir = node.dir === 'col' ? 'col' : 'row';
    const sizes = Array.isArray(node.sizes) ? node.sizes : [];
    return simplify({ type: 'split', dir, sizes: node.children.map((_, i) => sizes[i]), children: node.children.map((c) => cleanTree(c, paneStore)) });
  }

  // Removes empty and single-child splits and flattens nested splits that go the same way.
  function simplify(node) {
    if (!node || node.type === 'pane') return node;
    const kids = [];
    const sizes = [];
    node.children.forEach((c, i) => {
      const sc = simplify(c);
      if (!sc) return;
      const sz = Number(node.sizes && node.sizes[i]) > 0 ? Number(node.sizes[i]) : 1;
      if (sc.type === 'split' && sc.dir === node.dir) {
        const total = sc.sizes.reduce((a, b) => a + b, 0);
        sc.children.forEach((cc, j) => {
          kids.push(cc);
          sizes.push((sz * sc.sizes[j]) / total);
        });
      } else {
        kids.push(sc);
        sizes.push(sz);
      }
    });
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    node.children = kids;
    node.sizes = sizes;
    return node;
  }

  function findParent(node, id) {
    if (!node || node.type === 'pane') return null;
    for (let i = 0; i < node.children.length; i++) {
      const c = node.children[i];
      if (c.type === 'pane' && c.id === id) return { parent: node, index: i };
      const r = findParent(c, id);
      if (r) return r;
    }
    return null;
  }

  function removeLeaf(node, id) {
    if (!node) return null;
    if (node.type === 'pane') return node.id === id ? null : node;
    // The space of a removed child goes to its neighbour (the previous one, or the next if it was first).
    const kids = [];
    const sizes = [];
    let carry = 0;
    node.children.forEach((c, i) => {
      const r = removeLeaf(c, id);
      const sz = node.sizes[i] || 1;
      if (r) {
        kids.push(r);
        sizes.push(sz + carry);
        carry = 0;
      } else if (sizes.length) {
        sizes[sizes.length - 1] += sz;
      } else {
        carry += sz;
      }
    });
    node.children = kids;
    node.sizes = sizes;
    return simplify(node);
  }

  function insertNextTo(root, targetId, newId, dir, before) {
    const nl = leaf(newId);
    if (!root) return nl;
    const loc = findParent(root, targetId);
    if (!loc) {
      if (root.type === 'pane' && root.id === targetId) {
        return { type: 'split', dir, sizes: [1, 1], children: before ? [nl, root] : [root, nl] };
      }
      return appendToRoot(root, newId, dir);
    }
    const { parent, index } = loc;
    if (parent.dir === dir) {
      const half = parent.sizes[index] / 2;
      parent.sizes[index] = half;
      const at = before ? index : index + 1;
      parent.children.splice(at, 0, nl);
      parent.sizes.splice(at, 0, half);
    } else {
      const t = parent.children[index];
      parent.children[index] = { type: 'split', dir, sizes: [1, 1], children: before ? [nl, t] : [t, nl] };
    }
    return root;
  }

  function appendToRoot(root, newId, dir) {
    if (!root) return leaf(newId);
    if (root.type === 'split' && root.dir === dir) {
      const avg = root.sizes.reduce((a, b) => a + b, 0) / root.sizes.length;
      root.children.push(leaf(newId));
      root.sizes.push(avg);
      return root;
    }
    return { type: 'split', dir, sizes: [root.type === 'split' ? root.children.length : 1, 1], children: [root, leaf(newId)] };
  }

  function swapLeaves(node, a, b) {
    if (!node) return;
    if (node.type === 'pane') {
      if (node.id === a) node.id = b;
      else if (node.id === b) node.id = a;
      return;
    }
    node.children.forEach((c) => swapLeaves(c, a, b));
  }

  function equalize(node) {
    if (!node || node.type === 'pane') return;
    node.sizes = node.children.map(() => 1);
    node.children.forEach(equalize);
  }

  function buildGrid(ids, cols) {
    const rows = [];
    for (let i = 0; i < ids.length; i += cols) {
      const slice = ids.slice(i, i + cols);
      rows.push(slice.length === 1 ? leaf(slice[0]) : { type: 'split', dir: 'row', sizes: slice.map(() => 1), children: slice.map(leaf) });
    }
    if (rows.length === 1) return rows[0];
    return { type: 'split', dir: 'col', sizes: rows.map(() => 1), children: rows };
  }

  function bestColumns(n) {
    const r = $('#layout').getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : 16 / 9;
    let best = 1;
    let bestScore = Infinity;
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      const cellAspect = aspect * (rows / c);
      const score = Math.abs(Math.log(cellAspect / 1.4)) + 0.3 * (c * rows - n);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /* ================= URLs ================= */

  const baseUrl = () => (state.settings.baseUrl || '').trim().replace(/\/+$/, '');
  const baseOrigin = () => {
    try {
      return new URL(baseUrl()).origin;
    } catch {
      return null;
    }
  };

  function resolveUrl(input) {
    const v = (input || '').trim();
    if (/^https?:\/\//i.test(v)) return v;
    const base = baseUrl();
    if (!base) return 'about:blank';
    if (!v) return base + '/';
    return base + (v.startsWith('/') ? v : '/' + v);
  }

  const defaultUrl = () => resolveUrl(state.settings.defaultPath || '/');

  function displayUrl(url) {
    if (!url || url === 'about:blank') return '';
    try {
      const u = new URL(url);
      if (u.origin === baseOrigin()) return u.pathname + u.search + u.hash;
    } catch {
      /* keep as is */
    }
    return url;
  }

  /* ================= Panes ================= */

  function newPaneRecord(url) {
    const id = uid('p');
    state.panes[id] = { url: url || defaultUrl(), zoom: 1 };
    createPaneEl(id);
    return id;
  }

  function createPaneEl(id) {
    const rec = state.panes[id];
    const el = document.createElement('div');
    el.className = 'pane offstage';
    el.dataset.id = id;
    el.innerHTML = `
      <div class="pane-header">
        <span class="ib grip" title="Slepen: wisselen, ernaast plaatsen of naar een werkruimte-tab">${I.grip}</span>
        <button class="ib" data-act="back" title="Terug">${I.back}</button>
        <button class="ib" data-act="forward" title="Vooruit">${I.forward}</button>
        <button class="ib" data-act="reload" title="Herladen (Ctrl+R)">${I.reload}</button>
        <button class="ib" data-act="favs" title="Favorieten">${I.star}</button>
        <input class="addr" spellcheck="false" list="fav-list" placeholder="/lovelace" aria-label="Pad of adres">
        <span class="title"></span>
        <span class="zoom-group">
          <button class="ib" data-act="zoom-out" title="Uitzoomen (Ctrl+-)">${svg('<path d="M4 8h8"/>')}</button>
          <button class="zoom-label" data-act="zoom-reset" title="Zoom herstellen (Ctrl+0)">100%</button>
          <button class="ib" data-act="zoom-in" title="Inzoomen (Ctrl++)">${I.plus}</button>
        </span>
        <span class="sep z"></span>
        <button class="ib" data-act="split-right" title="Splits naar rechts (Ctrl+D)">${I.splitRight}</button>
        <button class="ib" data-act="split-down" title="Splits naar beneden (Ctrl+Shift+D)">${I.splitDown}</button>
        <button class="ib" data-act="maximize" title="Maximaliseren (Ctrl+Enter)">${I.maximize}</button>
        <button class="ib close" data-act="close" title="Paneel sluiten (Ctrl+W)">${I.close}</button>
      </div>
      <div class="pane-body">
        <div class="pane-overlay" hidden>
          <div class="msg"></div>
          <button class="btn" data-act="reload">Opnieuw proberen</button>
        </div>
      </div>`;

    const wv = document.createElement('webview');
    wv.setAttribute('partition', PARTITION);
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('src', rec.url && /^https?:/i.test(rec.url) ? rec.url : 'about:blank');
    $('.pane-body', el).prepend(wv);
    $('#panes').appendChild(el);

    const ctx = {
      id,
      el,
      wv,
      ready: false,
      addr: $('.addr', el),
      titleEl: $('.title', el),
      zoomLabel: $('.zoom-label', el),
      overlay: $('.pane-overlay', el),
      overlayMsg: $('.pane-overlay .msg', el),
      btnBack: $('[data-act="back"]', el),
      btnForward: $('[data-act="forward"]', el),
      btnMax: $('[data-act="maximize"]', el),
    };
    panes.set(id, ctx);
    wirePane(ctx);
    ctx.addr.value = displayUrl(rec.url);
    updateZoomLabel(ctx);
    updateNav(ctx);
    if (!rec.url || !/^https?:/i.test(rec.url)) {
      showError(ctx, 'Geen Home Assistant-adres', 'Stel eerst het adres van je Home Assistant in via Instellingen.');
    }
    return ctx;
  }

  function wirePane(ctx) {
    const { el, wv, id } = ctx;

    el.addEventListener('mousedown', () => setFocused(id), true);
    $('.pane-header', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) paneAction(id, b.dataset.act, b);
    });
    $('.pane-header', el).addEventListener('dblclick', (e) => {
      if (e.target === e.currentTarget || e.target.classList.contains('title')) toggleMaximize(id);
    });
    ctx.overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="reload"]')) reloadPane(id);
    });
    $('.grip', el).addEventListener('mousedown', (e) => startPaneDrag(e, id));

    ctx.addr.addEventListener('focus', () => ctx.addr.select());
    ctx.addr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        navigatePane(id, resolveUrl(ctx.addr.value));
        ctx.addr.blur();
        wv.focus();
      } else if (e.key === 'Escape') {
        ctx.addr.value = displayUrl(state.panes[id] && state.panes[id].url);
        ctx.addr.blur();
      }
    });

    wv.addEventListener('dom-ready', () => {
      ctx.ready = true;
      applyZoom(ctx, true);
      if (ctx.wantsFocus && focusedId === id) giveKeyboardFocus(ctx);
      ctx.wantsFocus = false;
      updateNav(ctx);
    });
    wv.addEventListener('did-start-loading', () => {
      el.classList.add('loading');
      hideError(ctx);
    });
    wv.addEventListener('did-stop-loading', () => {
      el.classList.remove('loading');
      updateNav(ctx);
    });
    wv.addEventListener('did-navigate', (e) => {
      onNavigated(ctx, e.url);
      applyZoom(ctx, true);
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (e.isMainFrame) onNavigated(ctx, e.url);
    });
    wv.addEventListener('page-title-updated', (e) => {
      const t = (e.title || '').replace(/\s+[–-]\s+Home Assistant$/, '');
      ctx.titleEl.textContent = t;
      ctx.titleEl.title = e.title || '';
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return; // -3 = aborted (normal during redirects)
      showError(ctx, 'Kan de pagina niet laden', `${e.errorDescription || 'Onbekende fout'} (${e.errorCode})\n${e.validatedURL || ''}`);
    });
    wv.addEventListener('render-process-gone', () => showError(ctx, 'Dit paneel is gecrasht', 'Klik op opnieuw proberen om het te herladen.'));
  }

  function onNavigated(ctx, url) {
    if (!url || url.startsWith('chrome-error:')) return;
    const rec = state.panes[ctx.id];
    if (!rec) return;
    rec.url = url;
    if (document.activeElement !== ctx.addr) ctx.addr.value = displayUrl(url);
    updateNav(ctx);
    save();
  }

  function updateNav(ctx) {
    let back = false;
    let fwd = false;
    if (ctx.ready) {
      try {
        back = ctx.wv.canGoBack();
        fwd = ctx.wv.canGoForward();
      } catch {
        /* not attached yet */
      }
    }
    ctx.btnBack.disabled = !back;
    ctx.btnForward.disabled = !fwd;
  }

  function showError(ctx, title, detail) {
    ctx.overlayMsg.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = title;
    const d = document.createElement('div');
    d.style.whiteSpace = 'pre-line';
    d.textContent = detail || '';
    ctx.overlayMsg.append(b, d);
    ctx.overlay.hidden = false;
  }

  function hideError(ctx) {
    ctx.overlay.hidden = true;
  }

  function navigatePane(id, url) {
    const ctx = panes.get(id);
    if (!ctx || !/^https?:/i.test(url)) {
      if (ctx) showError(ctx, 'Geen Home Assistant-adres', 'Stel eerst het adres van je Home Assistant in via Instellingen.');
      return;
    }
    state.panes[id].url = url;
    ctx.addr.value = displayUrl(url);
    hideError(ctx);
    if (ctx.ready) ctx.wv.loadURL(url).catch(() => {});
    else ctx.wv.setAttribute('src', url);
    save();
  }

  function reloadPane(id) {
    const ctx = panes.get(id);
    if (!ctx) return;
    const url = state.panes[id] && state.panes[id].url;
    hideError(ctx);
    if (ctx.ready && ctx.wv.getURL() && ctx.wv.getURL() !== 'about:blank' && !ctx.wv.getURL().startsWith('chrome-error:')) ctx.wv.reload();
    else if (url && /^https?:/i.test(url)) navigatePane(id, url);
    else navigatePane(id, defaultUrl());
  }

  function reloadAll() {
    const ws = activeWs();
    leaves(ws.tree).forEach(reloadPane);
  }

  // Zoom is applied per pane by the main process (see 'pane:zoom'); it needs the pane's pixel size,
  // so it is re-sent whenever the pane is resized. `force` re-applies after navigation.
  function applyZoom(ctx, force) {
    if (!ctx.ready || !state.panes[ctx.id]) return;
    const z = state.panes[ctx.id].zoom || 1;
    const w = Math.round(ctx.wv.clientWidth);
    const h = Math.round(ctx.wv.clientHeight);
    if (!w || !h) return;
    const key = Math.abs(z - 1) < 0.001 ? '1' : `${z}|${w}|${h}`;
    if (!force && key === ctx.zoomKey) return;
    ctx.zoomKey = key;
    let wcId;
    try {
      wcId = ctx.wv.getWebContentsId();
    } catch {
      return;
    }
    api.setPaneZoom(wcId, z, w, h);
  }

  function updateZoomLabel(ctx) {
    const z = (state.panes[ctx.id] && state.panes[ctx.id].zoom) || 1;
    ctx.zoomLabel.textContent = Math.round(z * 100) + '%';
  }

  function zoomPane(id, step) {
    const ctx = panes.get(id);
    if (!ctx) return;
    const rec = state.panes[id];
    let z = rec.zoom || 1;
    if (step === 0) z = 1;
    else {
      let idx = ZOOM_STEPS.findIndex((s) => s >= z - 0.001);
      if (idx < 0) idx = ZOOM_STEPS.length - 1;
      if (step > 0) idx = ZOOM_STEPS[idx] > z + 0.001 ? idx : idx + 1;
      else idx = idx - 1;
      z = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx))];
    }
    rec.zoom = z;
    applyZoom(ctx);
    updateZoomLabel(ctx);
    save();
  }

  function setFocused(id) {
    if (focusedId === id) return;
    if (focusedId && panes.has(focusedId)) panes.get(focusedId).el.classList.remove('focused');
    focusedId = id;
    if (id && panes.has(id)) panes.get(id).el.classList.add('focused');
  }

  // Highlight a pane AND move keyboard focus into it, so shortcuts act on the pane you see selected.
  function focusPane(id) {
    setFocused(id);
    const ctx = id && panes.get(id);
    if (!ctx) return;
    ctx.wantsFocus = true;
    if (ctx.ready) giveKeyboardFocus(ctx);
  }

  // The previously focused <webview> keeps keyboard focus unless it is blurred first.
  function giveKeyboardFocus(ctx) {
    ctx.wantsFocus = false;
    const active = document.activeElement;
    if (active && active !== ctx.wv && active !== document.body) active.blur();
    ctx.wv.focus();
  }

  function focusedInActive() {
    const ws = activeWs();
    if (focusedId && panes.has(focusedId) && leaves(ws.tree).includes(focusedId)) return focusedId;
    return null;
  }

  function paneIdByWebContents(wcId) {
    for (const [id, ctx] of panes) {
      try {
        if (ctx.ready && ctx.wv.getWebContentsId() === wcId) return id;
      } catch {
        /* not attached */
      }
    }
    return null;
  }

  function paneLabel(id) {
    const ctx = panes.get(id);
    if (!ctx) return 'Paneel';
    return ctx.titleEl.textContent || ctx.addr.value || 'Paneel';
  }

  function destroyPane(id) {
    const ctx = panes.get(id);
    if (ctx) {
      ctx.el.remove();
      panes.delete(id);
    }
    delete state.panes[id];
    if (focusedId === id) focusedId = null;
  }

  /* ================= Pane actions ================= */

  function addPane(url, dir = 'row') {
    const ws = activeWs();
    const target = focusedInActive();
    const id = newPaneRecord(url);
    ws.tree = target ? insertNextTo(ws.tree, target, id, dir, false) : appendToRoot(ws.tree, id, dir);
    maximized.delete(ws.id);
    focusPane(id);
    refresh();
    save(true);
    return id;
  }

  function splitPane(id, dir, url) {
    const ws = wsOfPane(id);
    if (!ws) return;
    const nid = newPaneRecord(url);
    ws.tree = insertNextTo(ws.tree, id, nid, dir, false);
    maximized.delete(ws.id);
    focusPane(nid);
    refresh();
    save(true);
  }

  function closePane(id) {
    const ws = wsOfPane(id);
    if (!ws) return;
    const order = leaves(ws.tree);
    const idx = order.indexOf(id);
    ws.tree = removeLeaf(ws.tree, id);
    if (maximized.get(ws.id) === id) maximized.delete(ws.id);
    destroyPane(id);
    const rest = leaves(ws.tree);
    if (rest.length) focusPane(rest[Math.min(idx, rest.length - 1)]);
    refresh();
    save(true);
  }

  function toggleMaximize(id) {
    const ws = wsOfPane(id);
    if (!ws) return;
    if (maximized.get(ws.id) === id) maximized.delete(ws.id);
    else if (leaves(ws.tree).length > 1) maximized.set(ws.id, id);
    renderLayout();
  }

  function paneAction(id, act, btn) {
    const ctx = panes.get(id);
    if (!ctx) return;
    switch (act) {
      case 'back':
        if (ctx.ready && ctx.wv.canGoBack()) ctx.wv.goBack();
        break;
      case 'forward':
        if (ctx.ready && ctx.wv.canGoForward()) ctx.wv.goForward();
        break;
      case 'reload':
        reloadPane(id);
        break;
      case 'favs':
        showFavoritesMenu(btn, id);
        break;
      case 'zoom-in':
        zoomPane(id, 1);
        break;
      case 'zoom-out':
        zoomPane(id, -1);
        break;
      case 'zoom-reset':
        zoomPane(id, 0);
        break;
      case 'split-right':
        splitPane(id, 'row');
        break;
      case 'split-down':
        splitPane(id, 'col');
        break;
      case 'maximize':
        toggleMaximize(id);
        break;
      case 'close':
        closePane(id);
        break;
    }
  }

  function applyGrid(cols, minCount) {
    const ws = activeWs();
    const ids = leaves(ws.tree);
    while (ids.length < (minCount || 0)) ids.push(newPaneRecord());
    if (!ids.length) return;
    ws.tree = buildGrid(ids, cols || bestColumns(ids.length));
    maximized.delete(ws.id);
    if (!focusedInActive()) setFocused(ids[0]);
    refresh();
    save(true);
  }

  /* ================= Rendering ================= */

  function refresh() {
    renderLayout();
    renderTabs();
  }

  function renderLayout() {
    const layout = $('#layout');
    layout.innerHTML = '';
    const ws = activeWs();
    const max = maximized.get(ws.id);

    if (max && leaves(ws.tree).includes(max)) {
      layout.appendChild(makeSlot(max));
    } else if (ws.tree) {
      maximized.delete(ws.id);
      layout.appendChild(buildNode(ws.tree));
    }

    panes.forEach((ctx, id) => {
      const isMax = maximized.get(ws.id) === id;
      ctx.btnMax.innerHTML = isMax ? I.restore : I.maximize;
      ctx.btnMax.title = isMax ? 'Herstellen (Ctrl+Enter)' : 'Maximaliseren (Ctrl+Enter)';
    });

    const empty = !ws.tree;
    $('#empty').hidden = !empty;
    if (empty) {
      const hasUrl = !!baseUrl();
      $('#empty-title').textContent = hasUrl ? 'Nog geen panelen' : 'Welkom bij HA Multiview';
      $('#empty-text').textContent = hasUrl
        ? 'Voeg panelen toe en zet zoveel Home Assistant-weergaven naast elkaar als je wilt.'
        : 'Stel eerst het adres van je Home Assistant in. Daarna kun je zoveel panelen naast elkaar openen als je wilt.';
      $('#empty-add').hidden = !hasUrl;
    }
    syncPanes();
  }

  function makeSlot(id) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.dataset.paneId = id;
    return s;
  }

  function buildNode(node) {
    if (node.type === 'pane') return makeSlot(node.id);
    const el = document.createElement('div');
    el.className = 'split ' + node.dir;
    node.children.forEach((c, i) => {
      if (i > 0) el.appendChild(makeGutter(node, i));
      const child = buildNode(c);
      child.style.flex = `${node.sizes[i]} 1 0px`;
      el.appendChild(child);
    });
    return el;
  }

  function syncPanes() {
    const layoutRect = $('#layout').getBoundingClientRect();
    const visible = new Set();
    $$('#layout .slot').forEach((slot) => {
      const id = slot.dataset.paneId;
      const ctx = panes.get(id);
      if (!ctx) return;
      const r = slot.getBoundingClientRect();
      const st = ctx.el.style;
      st.left = r.left - layoutRect.left + 'px';
      st.top = r.top - layoutRect.top + 'px';
      st.width = r.width + 'px';
      st.height = r.height + 'px';
      ctx.el.classList.remove('offstage');
      visible.add(id);
      applyZoom(ctx);
    });
    panes.forEach((ctx, id) => {
      if (!visible.has(id)) ctx.el.classList.add('offstage');
    });
  }

  /* ================= Resizing ================= */

  function makeGutter(node, i) {
    const g = document.createElement('div');
    g.className = 'gutter';
    g.addEventListener('mousedown', (e) => startGutterDrag(e, node, i, g));
    g.addEventListener('dblclick', () => {
      const total = node.sizes[i - 1] + node.sizes[i];
      node.sizes[i - 1] = node.sizes[i] = total / 2;
      renderLayout();
      save();
    });
    return g;
  }

  function startGutterDrag(e, node, i, g) {
    if (e.button !== 0) return;
    e.preventDefault();
    const horizontal = node.dir === 'row';
    const prev = g.previousElementSibling;
    const next = g.nextElementSibling;
    const pr = prev.getBoundingClientRect();
    const nr = next.getBoundingClientRect();
    const prevPx = horizontal ? pr.width : pr.height;
    const nextPx = horizontal ? nr.width : nr.height;
    const pairPx = prevPx + nextPx;
    const pairSize = node.sizes[i - 1] + node.sizes[i];
    const start = horizontal ? e.clientX : e.clientY;
    const min = Math.min(MIN_PANE_PX, pairPx / 2);

    g.classList.add('active');
    shield(true, horizontal ? 'col-resize' : 'row-resize');

    const move = (ev) => {
      const delta = (horizontal ? ev.clientX : ev.clientY) - start;
      const a = Math.max(min, Math.min(pairPx - min, prevPx + delta));
      node.sizes[i - 1] = (pairSize * a) / pairPx;
      node.sizes[i] = pairSize - node.sizes[i - 1];
      prev.style.flex = `${node.sizes[i - 1]} 1 0px`;
      next.style.flex = `${node.sizes[i]} 1 0px`;
      syncPanes();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      g.classList.remove('active');
      shield(false);
      save();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // A transparent layer over everything so <webview>s don't swallow mouse events while dragging.
  function shield(on, cursor) {
    const s = $('#shield');
    s.classList.toggle('active', on);
    s.style.cursor = on ? cursor || 'default' : '';
  }

  /* ================= Drag & drop panes ================= */

  function startPaneDrag(e, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const ghost = $('#drag-ghost');
    const ind = $('#drop-indicator');
    let started = false;
    let drop = null;

    const move = (ev) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        started = true;
        shield(true, 'grabbing');
        ghost.textContent = paneLabel(id);
        ghost.hidden = false;
        const ctx = panes.get(id);
        if (ctx) ctx.el.classList.add('dragging');
      }
      ghost.style.left = ev.clientX + 14 + 'px';
      ghost.style.top = ev.clientY + 14 + 'px';
      drop = computeDrop(ev.clientX, ev.clientY, id);
      showDrop(drop);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!started) return;
      shield(false);
      ghost.hidden = true;
      ind.hidden = true;
      $$('.tab.drop-target').forEach((t) => t.classList.remove('drop-target'));
      const ctx = panes.get(id);
      if (ctx) ctx.el.classList.remove('dragging');
      if (drop) applyDrop(id, drop);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  function computeDrop(x, y, srcId) {
    const srcWs = wsOfPane(srcId);
    for (const tab of $$('.tab')) {
      if (inside(tab.getBoundingClientRect(), x, y)) {
        return tab.dataset.ws !== srcWs.id ? { type: 'ws', wsId: tab.dataset.ws, el: tab } : null;
      }
    }
    for (const slot of $$('#layout .slot')) {
      const r = slot.getBoundingClientRect();
      if (!inside(r, x, y)) continue;
      const target = slot.dataset.paneId;
      if (target === srcId) return null;
      const fx = (x - r.left) / r.width;
      const fy = (y - r.top) / r.height;
      const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
      const edge = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
      const zone = d[edge] < 0.25 ? edge : 'center';
      return { type: 'pane', target, zone, rect: r };
    }
    return null;
  }

  function showDrop(drop) {
    const ind = $('#drop-indicator');
    $$('.tab.drop-target').forEach((t) => t.classList.remove('drop-target'));
    if (!drop) {
      ind.hidden = true;
      return;
    }
    if (drop.type === 'ws') {
      ind.hidden = true;
      drop.el.classList.add('drop-target');
      return;
    }
    const r = drop.rect;
    let { left, top, width, height } = r;
    if (drop.zone === 'left') width /= 2;
    if (drop.zone === 'right') {
      left += width / 2;
      width /= 2;
    }
    if (drop.zone === 'top') height /= 2;
    if (drop.zone === 'bottom') {
      top += height / 2;
      height /= 2;
    }
    Object.assign(ind.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
    ind.hidden = false;
  }

  function applyDrop(src, drop) {
    const srcWs = wsOfPane(src);
    if (!srcWs) return;
    if (drop.type === 'ws') {
      const target = wsById(drop.wsId);
      if (!target) return;
      srcWs.tree = removeLeaf(srcWs.tree, src);
      if (maximized.get(srcWs.id) === src) maximized.delete(srcWs.id);
      target.tree = appendToRoot(target.tree, src, 'row');
      refresh();
      save(true);
      return;
    }
    if (drop.zone === 'center') {
      swapLeaves(srcWs.tree, src, drop.target);
    } else {
      const dir = drop.zone === 'left' || drop.zone === 'right' ? 'row' : 'col';
      const before = drop.zone === 'left' || drop.zone === 'top';
      srcWs.tree = removeLeaf(srcWs.tree, src);
      srcWs.tree = insertNextTo(srcWs.tree, drop.target, src, dir, before);
    }
    focusPane(src);
    refresh();
    save(true);
  }

  /* ================= Workspaces / tabs ================= */

  function renderTabs() {
    const bar = $('#tabs');
    bar.innerHTML = '';
    state.workspaces.forEach((ws, i) => {
      const t = document.createElement('div');
      t.className = 'tab' + (ws.id === state.activeWorkspace ? ' active' : '');
      t.dataset.ws = ws.id;
      t.setAttribute('role', 'tab');
      t.title = 'Dubbelklik om te hernoemen' + (i < 9 ? ` · Ctrl+${i + 1}` : '');
      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = ws.name;
      const count = document.createElement('span');
      count.className = 'tab-count';
      count.textContent = leaves(ws.tree).length;
      t.append(name, count);
      if (state.workspaces.length > 1) {
        const x = document.createElement('button');
        x.className = 'tab-close';
        x.title = 'Werkruimte sluiten';
        x.innerHTML = I.close;
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          closeWs(ws.id);
        });
        t.append(x);
      }
      t.addEventListener('click', () => switchWs(ws.id));
      t.addEventListener('dblclick', () => renameWs(ws.id));
      bar.append(t);
    });
    const add = document.createElement('button');
    add.className = 'tab-add';
    add.title = 'Nieuwe werkruimte (Ctrl+T)';
    add.innerHTML = I.plus;
    add.addEventListener('click', () => newWs());
    bar.append(add);
  }

  function switchWs(id) {
    if (!wsById(id) || id === state.activeWorkspace) return;
    state.activeWorkspace = id;
    const first = leaves(activeWs().tree)[0];
    if (!focusedInActive()) focusPane(first || null);
    refresh();
    save();
  }

  function cycleWs(step) {
    const i = state.workspaces.findIndex((w) => w.id === state.activeWorkspace);
    const n = state.workspaces.length;
    switchWs(state.workspaces[(i + step + n) % n].id);
  }

  function newWs() {
    let n = state.workspaces.length + 1;
    while (state.workspaces.some((w) => w.name === `Werkruimte ${n}`)) n++;
    const ws = { id: uid('ws'), name: `Werkruimte ${n}`, tree: null };
    state.workspaces.push(ws);
    state.activeWorkspace = ws.id;
    if (baseUrl()) {
      const id = newPaneRecord();
      ws.tree = leaf(id);
      setFocused(id);
    }
    refresh();
    save(true);
  }

  function closeWs(id) {
    const ws = wsById(id);
    if (!ws || state.workspaces.length < 2) return;
    const count = leaves(ws.tree).length;
    if (count && !confirm(`Werkruimte "${ws.name}" met ${count} paneel/panelen sluiten?`)) return;
    leaves(ws.tree).forEach(destroyPane);
    const idx = state.workspaces.indexOf(ws);
    state.workspaces.splice(idx, 1);
    maximized.delete(id);
    if (state.activeWorkspace === id) state.activeWorkspace = state.workspaces[Math.max(0, idx - 1)].id;
    refresh();
    save(true);
  }

  async function renameWs(id) {
    const ws = wsById(id);
    if (!ws) return;
    const name = await askText('Werkruimte hernoemen', ws.name);
    if (name && name.trim()) {
      ws.name = name.trim().slice(0, 60);
      renderTabs();
      save(true);
    }
  }

  /* ================= Menus ================= */

  function showMenu(anchor, items) {
    const m = $('#menu');
    m.innerHTML = '';
    for (const it of items) {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'menu-sep';
        m.append(s);
        continue;
      }
      if (it.heading) {
        const h = document.createElement('div');
        h.className = 'menu-label';
        h.textContent = it.heading;
        m.append(h);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'menu-item';
      b.setAttribute('role', 'menuitem');
      if (it.iconHtml) b.insertAdjacentHTML('beforeend', it.iconHtml);
      const label = document.createElement('span');
      label.textContent = it.label;
      b.append(label);
      if (it.hint) {
        const h = document.createElement('span');
        h.className = 'hint';
        h.textContent = it.hint;
        b.append(h);
      }
      b.addEventListener('click', () => {
        closeMenu();
        it.onClick();
      });
      m.append(b);
    }
    $('#menu-backdrop').hidden = false;
    m.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - mr.width - 8));
    const top = r.bottom + mr.height + 8 > window.innerHeight ? Math.max(8, r.top - mr.height - 4) : r.bottom + 4;
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    const first = $('.menu-item', m);
    if (first) first.focus();
  }

  function closeMenu() {
    $('#menu').hidden = true;
    $('#menu-backdrop').hidden = true;
  }

  function showFavoritesMenu(anchor, paneId) {
    const favs = state.settings.favorites;
    const items = favs.map((f) => ({ label: f.name, hint: f.path, onClick: () => navigatePane(paneId, resolveUrl(f.path)) }));
    if (items.length) items.push({ sep: true });
    items.push({ label: 'Huidige pagina toevoegen aan favorieten', onClick: () => addFavoriteFromPane(paneId) });
    items.push({ label: 'Favorieten beheren…', onClick: () => openSettings() });
    showMenu(anchor, items);
  }

  function showAddMenu(anchor) {
    const items = [{ heading: 'Openen in nieuw paneel' }];
    items.push({ label: 'Startpagina', hint: state.settings.defaultPath || '/', onClick: () => addPane() });
    state.settings.favorites.forEach((f) => items.push({ label: f.name, hint: f.path, onClick: () => addPane(resolveUrl(f.path)) }));
    showMenu(anchor, items);
  }

  function presetIcon(cols, rows) {
    let cells = '';
    for (let i = 0; i < cols * rows; i++) cells += '<i></i>';
    return `<span class="preset-icon" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)">${cells}</span>`;
  }

  function showLayoutMenu(anchor) {
    const presets = [
      ['2 naast elkaar', 2, 1],
      ['3 naast elkaar', 3, 1],
      ['4 naast elkaar', 4, 1],
      ['2 boven elkaar', 1, 2],
      ['2 × 2', 2, 2],
      ['3 × 2', 3, 2],
      ['4 × 2', 4, 2],
      ['3 × 3', 3, 3],
    ];
    const items = [{ heading: 'Indeling (vult aan met nieuwe panelen)' }];
    presets.forEach(([label, c, r]) => items.push({ label, iconHtml: presetIcon(c, r), onClick: () => applyGrid(c, c * r) }));
    items.push({ sep: true });
    items.push({ label: 'Automatisch raster', hint: 'Ctrl+G', onClick: () => applyGrid() });
    items.push({
      label: 'Gelijk verdelen',
      onClick: () => {
        equalize(activeWs().tree);
        renderLayout();
        save();
      },
    });
    showMenu(anchor, items);
  }

  async function addFavoriteFromPane(paneId) {
    const rec = state.panes[paneId];
    if (!rec || !rec.url) return;
    const path = displayUrl(rec.url);
    const name = await askText(`Naam voor favoriet (${path})`, paneLabel(paneId));
    if (!name || !name.trim()) return;
    state.settings.favorites.push({ name: name.trim(), path });
    renderFavList();
    save(true);
  }

  function renderFavList() {
    const dl = $('#fav-list');
    dl.innerHTML = '';
    state.settings.favorites.forEach((f) => {
      const o = document.createElement('option');
      o.value = f.path;
      o.label = f.name;
      dl.append(o);
    });
  }

  /* ================= Dialogs ================= */

  function askText(title, value) {
    return new Promise((resolve) => {
      const dlg = $('#ask');
      const input = $('#ask-input');
      $('#ask-title').textContent = title;
      input.value = value || '';
      let result = null;
      const form = $('#ask-form');
      const onSubmit = () => {
        result = input.value;
      };
      const onCancel = () => dlg.close();
      form.addEventListener('submit', onSubmit, { once: true });
      $('#ask-cancel').addEventListener('click', onCancel, { once: true });
      dlg.addEventListener(
        'close',
        () => {
          form.removeEventListener('submit', onSubmit);
          $('#ask-cancel').removeEventListener('click', onCancel);
          resolve(result);
        },
        { once: true }
      );
      dlg.showModal();
      input.select();
    });
  }

  function openSettings() {
    const f = $('#settings-form');
    const s = state.settings;
    f.baseUrl.value = s.baseUrl;
    f.defaultPath.value = s.defaultPath;
    f.favorites.value = s.favorites.map((x) => `${x.name} | ${x.path}`).join('\n');
    f.restoreSession.checked = !!s.restoreSession;
    f.allowSelfSigned.checked = !!s.allowSelfSigned;
    $('#settings').showModal();
    f.baseUrl.focus();
  }

  function parseFavorites(text) {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [a, b] = l.includes('|') ? l.split('|').map((x) => x.trim()) : [l, l];
        return { name: a || b, path: b || a };
      })
      .filter((x) => x.path);
  }

  function onSettingsSubmit(e) {
    const f = e.target;
    let url = f.baseUrl.value.trim();
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
      url = u.origin + u.pathname.replace(/\/+$/, '');
    } catch {
      e.preventDefault();
      f.baseUrl.setCustomValidity('Voer een geldig http(s)-adres in, bijv. http://homeassistant.local:8123');
      f.baseUrl.reportValidity();
      return;
    }
    const hadUrl = !!baseUrl();
    state.settings.baseUrl = url;
    state.settings.defaultPath = f.defaultPath.value.trim() || '/';
    state.settings.favorites = parseFavorites(f.favorites.value);
    state.settings.restoreSession = f.restoreSession.checked;
    state.settings.allowSelfSigned = f.allowSelfSigned.checked;
    renderFavList();
    save(true);

    // Panes created before an address existed get their start page now.
    panes.forEach((ctx, id) => {
      const rec = state.panes[id];
      if (!rec.url || !/^https?:/i.test(rec.url)) navigatePane(id, defaultUrl());
    });
    if (!hadUrl && !activeWs().tree) addPane();
    else renderLayout();
  }

  async function clearSession() {
    if (!confirm('Je wordt in alle panelen uitgelogd en opgeslagen sessiegegevens (tokens, cache) worden gewist. Doorgaan?')) return;
    await api.clearSession();
    $('#settings').close();
    panes.forEach((_, id) => reloadPane(id));
  }

  /* ================= Shortcuts ================= */

  function onShortcut(name, wcId) {
    if (wcId != null) {
      const id = paneIdByWebContents(wcId);
      if (id) setFocused(id);
    }
    if ($('#settings').open || $('#ask').open) return;
    closeMenu();
    const target = focusedInActive();

    if (name.startsWith('ws-')) {
      const ws = state.workspaces[Number(name.slice(3)) - 1];
      if (ws) switchWs(ws.id);
      return;
    }

    switch (name) {
      case 'split-right':
        if (target) splitPane(target, 'row');
        else addPane();
        break;
      case 'split-down':
        if (target) splitPane(target, 'col');
        else addPane(undefined, 'col');
        break;
      case 'close-pane':
        if (target) closePane(target);
        break;
      case 'reload':
        if (target) reloadPane(target);
        break;
      case 'reload-all':
        reloadAll();
        break;
      case 'maximize':
        if (target) toggleMaximize(target);
        break;
      case 'zoom-in':
        if (target) zoomPane(target, 1);
        break;
      case 'zoom-out':
        if (target) zoomPane(target, -1);
        break;
      case 'zoom-reset':
        if (target) zoomPane(target, 0);
        break;
      case 'new-ws':
        newWs();
        break;
      case 'next-ws':
        cycleWs(1);
        break;
      case 'prev-ws':
        cycleWs(-1);
        break;
      case 'grid':
        applyGrid();
        break;
      case 'fullscreen':
        api.toggleFullscreen();
        break;
      case 'focus-address':
        if (target) panes.get(target).addr.focus();
        break;
      case 'devtools':
        if (target) panes.get(target).wv.openDevTools();
        break;
    }
  }

  /* ================= Init ================= */

  async function init() {
    state = normalizeState(await api.loadState());

    for (const id of Object.keys(state.panes)) createPaneEl(id);

    $('#btn-add').innerHTML = `${I.plus}<span>Paneel</span>`;
    $('#btn-add-menu').innerHTML = I.caret;
    $('#btn-layout').innerHTML = `${I.layout}<span>Indeling</span>`;
    $('#btn-reload-all').innerHTML = I.reload;
    $('#btn-fullscreen').innerHTML = I.fullscreen;
    $('#btn-settings').innerHTML = I.settings;

    $('#btn-add').addEventListener('click', () => addPane());
    $('#btn-add-menu').addEventListener('click', (e) => showAddMenu(e.currentTarget));
    $('#btn-layout').addEventListener('click', (e) => showLayoutMenu(e.currentTarget));
    $('#btn-reload-all').addEventListener('click', reloadAll);
    $('#btn-fullscreen').addEventListener('click', () => api.toggleFullscreen());
    $('#btn-settings').addEventListener('click', openSettings);
    $('#empty-add').addEventListener('click', () => addPane());
    $('#empty-settings').addEventListener('click', openSettings);
    $('#menu-backdrop').addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#menu').hidden) closeMenu();
    });

    const sf = $('#settings-form');
    sf.addEventListener('submit', onSettingsSubmit);
    sf.baseUrl.addEventListener('input', () => sf.baseUrl.setCustomValidity(''));
    $('#settings-cancel').addEventListener('click', () => $('#settings').close());
    $('#btn-clear-session').addEventListener('click', clearSession);

    api.onShortcut(onShortcut);
    api.onWebviewFocus((wcId) => {
      closeMenu();
      const id = paneIdByWebContents(wcId);
      if (id) setFocused(id);
    });
    api.onOpenInPane((url, wcId) => {
      const src = paneIdByWebContents(wcId);
      if (src) splitPane(src, 'row', url);
      else addPane(url);
    });

    new ResizeObserver(() => syncPanes()).observe($('#layout'));
    window.addEventListener('beforeunload', () => save(true));

    renderFavList();
    const first = leaves(activeWs().tree)[0];
    if (first) setFocused(first);
    refresh();

    if (!baseUrl()) openSettings();
    else if (!activeWs().tree && Object.keys(state.panes).length === 0) addPane();
  }

  init();
})();
