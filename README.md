# HA Multiview

A Windows desktop app (Electron) for Home Assistant whose main feature is running **any number of Home Assistant views side by side** in one window.

## Features

- **Unlimited tiled panes** – split any pane right (`Ctrl+D`) or down (`Ctrl+Shift+D`), as often as you like. Drag the gutters to resize; double-click a gutter to split evenly.
- **Drag & drop panes** – grab the `⠿` handle: drop in the centre of another pane to swap, on an edge to dock next to it, or on a workspace tab to move it there.
- **Layout presets** – 2/3/4 side by side, 2×2, 3×2, 4×2, 3×3, auto grid (`Ctrl+G`), equalize. Presets add new panes when needed and never close panes.
- **Workspaces (tabs)** – separate sets of panes (e.g. "Living room", "Energy"). Panes in background workspaces keep running so dashboards stay live.
- **Per-pane controls** – back/forward, reload, address bar (type a path like `/energy` or a full URL), favorites, maximize (`Ctrl+Enter`), and **independent zoom per pane**.
- **Single login** – all panes share one persistent session, so you log in to Home Assistant once.
- **Everything is restored** on restart: workspaces, layout, sizes, URLs and zoom.
- **English and Dutch** – the interface follows your Windows language by default; change it under **Settings → Language**.

## Install

Download the latest build from the [Releases page](https://github.com/martijntalens/HomeAssistant-MultiView/releases/latest):

| File | Use |
|---|---|
| `HA Multiview Setup <version>.exe` | Installer (per user, choose folder, Start menu shortcut) |
| `HA-Multiview-<version>-portable.exe` | Portable, no installation |

The builds are not code-signed, so Windows SmartScreen will show a warning on first launch ("More info" → "Run anyway").

On first launch, enter your Home Assistant address, e.g. `http://homeassistant.local:8123`.

## Language

The app is available in **English** and **Dutch (Nederlands)**. With the default setting, *Automatic*, it uses Dutch when Windows is set to Dutch and English otherwise. Pick a fixed language under **Settings → Language**; the change applies immediately, without a restart.

Names the app created itself (the default favorites and workspaces such as "Workspace 2") switch along with the language. Names you typed or renamed yourself are left alone.

## Keyboard shortcuts

Shortcuts also work while the focus is inside a Home Assistant page.

| Keys | Action |
|---|---|
| `Ctrl+D` / `Ctrl+Shift+D` | Split pane right / down |
| `Ctrl+W` | Close pane |
| `Ctrl+Enter` | Maximize / restore pane |
| `Ctrl+R`, `F5` / `Ctrl+Shift+R` | Reload pane / all panes |
| `Ctrl+L` | Focus the pane's address bar |
| `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Pane zoom |
| `Ctrl+G` | Auto grid |
| `Ctrl+T`, `Ctrl+Tab`, `Ctrl+1…9` | New / next / specific workspace |
| `F11` | Full screen |
| `Ctrl+Shift+I` | DevTools for the pane |

## Development

The following commands install dependencies, start the app, and build the Windows packages:

```bash
npm install
npm start
npm run dist
```

`npm run dist` writes the installer and portable build to `dist/` (not committed; publish them as a GitHub Release). It uses NSIS, which fails when the project path is very long (over ~260 characters). Build from a short path such as `C:\src\ha-multiview` if that happens.

To use a separate profile (for example a second Home Assistant instance, or testing), set `HA_MULTIVIEW_PROFILE` to a folder before starting:

```powershell
$env:HA_MULTIVIEW_PROFILE = "C:\ha-multiview-profiles\cabin"; npm start
```

### How it works

- `main.js` – window, security hardening of every `<webview>`, shortcuts, per-pane zoom, state file.
- `renderer/app.js` – layout tree (splits + panes), workspaces, drag & drop, menus, settings.
- `renderer/i18n.js` – all interface text in English and Dutch. To add a language, add a block with the same keys and an `<option>` in the language list in `renderer/index.html`.
- Panes are never moved in the DOM: the layout tree renders empty slots and each pane is positioned over its slot. Splitting, swapping, resizing or switching workspaces therefore never reloads a dashboard.
- Chromium shares page zoom between all pages of the same origin, so per-pane zoom is done with per-pane viewport emulation instead.

## Security and privacy

- Home Assistant pages run sandboxed, without Node.js access and without a preload script; only `http(s)` URLs are allowed.
- Camera/microphone (Assist), notifications and fullscreen are only granted to the configured Home Assistant address.
- Links to other sites open in your default browser; links to Home Assistant open in a new pane.
- Self-signed HTTPS certificates are only accepted when you enable it, and only for the configured address.
- The app stores no passwords. Home Assistant's own login tokens live in the Chromium session storage of the app profile (`%APPDATA%\HA Multiview`), the same as in a normal browser. Use **Settings → Log out and clear session data** to remove them. For remote access, use HTTPS so tokens are encrypted in transit.
- `state.json` in the profile folder only contains layout, URLs, zoom and settings.

## License

[MIT](LICENSE)
