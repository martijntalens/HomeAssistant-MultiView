'use strict';

const { app, BrowserWindow, ipcMain, session, shell, Menu, screen, webContents } = require('electron');
const path = require('path');
const fs = require('fs');

// Optional: separate profile folder (e.g. a second HA instance or testing).
if (process.env.HA_MULTIVIEW_PROFILE) {
  app.setPath('userData', path.resolve(process.env.HA_MULTIVIEW_PROFILE));
}

// All Home Assistant panes share one persistent partition, so you log in once
// and every pane reuses the same session.
const PARTITION = 'persist:ha';

let win = null;
let state = {};
let writeTimer = null;

const statePath = () => path.join(app.getPath('userData'), 'state.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeStateNow() {
  clearTimeout(writeTimer);
  writeTimer = null;
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    const tmp = statePath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, statePath());
  } catch (err) {
    console.error('Could not write state:', err);
  }
}

function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeStateNow, 500);
}

function haOrigin() {
  try {
    return new URL(state.settings && state.settings.baseUrl).origin;
  } catch {
    return null;
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function isHttp(url) {
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

// Holding a key down only repeats these; structural actions (split, close, ...) fire once per press.
const REPEATABLE = new Set(['zoom-in', 'zoom-out', 'next-ws', 'prev-ws']);

// One shortcut map for both the app UI and every Home Assistant pane.
function shortcutFor(input) {
  if (input.type !== 'keyDown') return null;
  const k = (input.key || '').toLowerCase();
  const ctrl = input.control || input.meta;
  const shift = input.shift;
  if (input.alt) return null;
  if (k === 'f11') return 'fullscreen';
  if (k === 'f5') return shift ? 'reload-all' : 'reload';
  if (!ctrl) return null;
  if (k === 'd') return shift ? 'split-down' : 'split-right';
  if (k === 'w') return 'close-pane';
  if (k === 'r') return shift ? 'reload-all' : 'reload';
  if (k === 'enter') return 'maximize';
  if (k === 't') return 'new-ws';
  if (k === 'tab') return shift ? 'prev-ws' : 'next-ws';
  if (k === 'g') return 'grid';
  if (k === 'l') return 'focus-address';
  if (k === '=' || k === '+') return 'zoom-in';
  if (k === '-') return 'zoom-out';
  if (k === '0') return 'zoom-reset';
  if (shift && k === 'i') return 'devtools';
  if (/^[1-9]$/.test(k)) return 'ws-' + k;
  return null;
}

function boundsVisible(b) {
  if (!b || typeof b.x !== 'number' || typeof b.y !== 'number') return false;
  const d = screen.getDisplayMatching(b);
  const a = d.workArea;
  return b.x < a.x + a.width - 50 && b.y < a.y + a.height - 50 && b.x + b.width > a.x + 50 && b.y >= a.y - 10;
}

function createWindow() {
  const saved = state.window || {};
  const bounds = boundsVisible(saved.bounds) ? saved.bounds : { width: 1440, height: 900 };

  win = new BrowserWindow({
    ...bounds,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#0f1115',
    title: 'HA Multiview',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: false,
    },
  });

  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Harden every <webview>: no preload, no Node, sandboxed, http(s) only, shared HA partition only.
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    const srcOk = !params.src || params.src === 'about:blank' || isHttp(params.src);
    if (params.partition !== PARTITION || !srcOk) event.preventDefault();
  });

  // The app shell itself never navigates or opens windows.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.webContents.on('before-input-event', (event, input) => {
    const sc = shortcutFor(input);
    if (sc) {
      event.preventDefault();
      if (!input.isAutoRepeat || REPEATABLE.has(sc)) win.webContents.send('shortcut', sc, null);
    }
  });

  win.on('close', () => {
    state.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    writeStateNow();
  });
  win.on('closed', () => {
    win = null;
  });
}

function setupSessions() {
  const allowed = new Set(['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write']);
  const ses = session.fromPartition(PARTITION);

  // Only the configured Home Assistant origin may use mic/camera (Assist), notifications etc.
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowed.has(permission) && originOf(details.requestingUrl) === haOrigin());
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return allowed.has(permission) && originOf(requestingOrigin) === haOrigin();
  });

  // The app shell needs no permissions at all.
  session.defaultSession.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.on('before-input-event', (event, input) => {
    const sc = shortcutFor(input);
    if (sc && win) {
      event.preventDefault();
      if (!input.isAutoRepeat || REPEATABLE.has(sc)) win.webContents.send('shortcut', sc, contents.id);
    }
  });

  // Tell the shell which pane the user is working in (clicks inside a page never reach the shell DOM).
  const reportFocus = () => {
    if (win) win.webContents.send('webview-focus', contents.id);
  };
  contents.on('focus', reportFocus);
  contents.on('before-mouse-event', (_event, mouse) => {
    if (mouse.type === 'mouseDown') reportFocus();
  });

  // Links that open a new window: HA pages open in a new pane, everything else in the default browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) {
      if (originOf(url) === haOrigin()) {
        if (win) win.webContents.send('open-in-pane', url, contents.id);
      } else {
        shell.openExternal(url);
      }
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (!isHttp(url)) event.preventDefault();
  });
});

// Self-signed certificates are only accepted when the user enabled it, and only for the configured HA origin.
app.on('certificate-error', (event, _wc, url, _error, _cert, callback) => {
  const ok = !!(state.settings && state.settings.allowSelfSigned) && originOf(url) === haOrigin();
  if (ok) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

const fromShell = (event) => !!win && event.sender === win.webContents;

ipcMain.handle('state:load', (event) => (fromShell(event) ? state : null));

ipcMain.on('state:save', (event, next) => {
  if (!fromShell(event) || !next || typeof next !== 'object') return;
  state = { ...next, window: state.window };
  scheduleWrite();
});

ipcMain.on('win:fullscreen', (event) => {
  if (fromShell(event)) win.setFullScreen(!win.isFullScreen());
});

// Per-pane zoom. Chromium shares normal page zoom between all pages of the same origin,
// so every HA pane would zoom together. Instead each pane gets its own emulated viewport
// (size / zoom) that is scaled back to the pane size, like browser zoom but per pane.
ipcMain.on('pane:zoom', (event, wcId, zoom, width, height) => {
  if (!fromShell(event)) return;
  const wc = webContents.fromId(Number(wcId));
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== win.webContents) return;
  const z = Number(zoom);
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!(z > 0) || Math.abs(z - 1) < 0.001 || !(w > 0 && h > 0)) {
    wc.disableDeviceEmulation();
    return;
  }
  const size = { width: Math.max(1, Math.round(w / z)), height: Math.max(1, Math.round(h / z)) };
  wc.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: size,
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: 0,
    viewSize: size,
    scale: z,
  });
});

ipcMain.handle('session:clear', async (event) => {
  if (!fromShell(event)) return false;
  const ses = session.fromPartition(PARTITION);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    state = readState();
    Menu.setApplicationMenu(null);
    setupSessions();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    if (writeTimer) writeStateNow();
  });
}
