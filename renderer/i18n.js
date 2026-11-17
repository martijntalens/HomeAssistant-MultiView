'use strict';

/*
 * UI translations. Every visible string of the app shell lives here.
 *
 * - `t(key, params)` returns the string for the current language; `{name}` placeholders are
 *   filled from `params`. Missing keys fall back to English, then to the key itself.
 * - Static markup uses attributes that `applyI18n(root)` fills in:
 *   data-i18n (text), data-i18n-title, data-i18n-placeholder, data-i18n-aria-label.
 * - The language setting is 'auto' (follow Windows), 'en' or 'nl'.
 */
(() => {
  const STRINGS = {
    en: {
      'app.workspaces': 'Workspaces',

      'toolbar.pane': 'Pane',
      'toolbar.newPane': 'New pane (Ctrl+D)',
      'toolbar.openFavorite': 'Open favorite in new pane',
      'toolbar.layout': 'Layout',
      'toolbar.reloadAll': 'Reload all panes (Ctrl+Shift+R)',
      'toolbar.fullscreen': 'Full screen (F11)',
      'toolbar.settings': 'Settings',

      'empty.noPanes': 'No panes yet',
      'empty.welcome': 'Welcome to HA Multiview',
      'empty.textWithUrl': 'Add panes and put as many Home Assistant views side by side as you like.',
      'empty.textNoUrl': 'First set the address of your Home Assistant. Then you can open as many panes side by side as you like.',
      'empty.addPane': 'Add pane',
      'empty.settings': 'Settings',

      'pane.drag': 'Drag: swap, dock next to another pane, or move to a workspace tab',
      'pane.back': 'Back',
      'pane.forward': 'Forward',
      'pane.reload': 'Reload (Ctrl+R)',
      'pane.favorites': 'Favorites',
      'pane.address': 'Path or address',
      'pane.zoomOut': 'Zoom out (Ctrl+-)',
      'pane.zoomReset': 'Reset zoom (Ctrl+0)',
      'pane.zoomIn': 'Zoom in (Ctrl++)',
      'pane.splitRight': 'Split right (Ctrl+D)',
      'pane.splitDown': 'Split down (Ctrl+Shift+D)',
      'pane.maximize': 'Maximize (Ctrl+Enter)',
      'pane.restore': 'Restore (Ctrl+Enter)',
      'pane.close': 'Close pane (Ctrl+W)',
      'pane.retry': 'Try again',
      'pane.fallbackLabel': 'Pane',

      'error.noAddress': 'No Home Assistant address',
      'error.noAddressDetail': 'First set the address of your Home Assistant in Settings.',
      'error.loadFailed': 'Cannot load the page',
      'error.unknown': 'Unknown error',
      'error.crashed': 'This pane crashed',
      'error.crashedDetail': 'Click "Try again" to reload it.',

      'ws.defaultName': 'Workspace {n}',
      'ws.fallbackName': 'Workspace',
      'ws.tabTitle': 'Double-click to rename',
      'ws.close': 'Close workspace',
      'ws.new': 'New workspace (Ctrl+T)',
      'ws.confirmCloseOne': 'Close workspace "{name}" with 1 pane?',
      'ws.confirmCloseMany': 'Close workspace "{name}" with {count} panes?',
      'ws.rename': 'Rename workspace',

      'menu.addCurrentFavorite': 'Add current page to favorites',
      'menu.manageFavorites': 'Manage favorites…',
      'menu.openInNewPane': 'Open in new pane',
      'menu.startPage': 'Start page',
      'menu.layoutHeading': 'Layout (adds new panes when needed)',
      'menu.sideBySide': '{n} side by side',
      'menu.stacked': '{n} stacked',
      'menu.autoGrid': 'Auto grid',
      'menu.equalize': 'Equalize',
      'menu.favoriteName': 'Name for favorite ({path})',

      'settings.title': 'Settings',
      'settings.baseUrl': 'Home Assistant address',
      'settings.defaultPath': 'Start page for new panes',
      'settings.favorites': 'Favorites',
      'settings.favoritesHint': 'one per line:',
      'settings.favoritesFormat': 'Name | /path',
      'settings.language': 'Language',
      'settings.languageAuto': 'Automatic (Windows language)',
      'settings.restoreSession': 'Restore workspaces and panes on startup',
      'settings.allowSelfSigned': 'Accept self-signed HTTPS certificate',
      'settings.allowSelfSignedHint': '(only for the address above)',
      'settings.shortcuts': 'Keyboard shortcuts',
      'settings.clearSession': 'Log out and clear session data',
      'settings.cancel': 'Cancel',
      'settings.save': 'Save',
      'settings.invalidUrl': 'Enter a valid http(s) address, e.g. http://homeassistant.local:8123',
      'settings.confirmClear': 'You will be logged out in all panes and stored session data (tokens, cache) will be deleted. Continue?',

      'keys.splitRight': 'Split pane right',
      'keys.splitDown': 'Split pane down',
      'keys.close': 'Close pane',
      'keys.maximize': 'Maximize / restore pane',
      'keys.reload': 'Reload pane',
      'keys.reloadAll': 'Reload all panes',
      'keys.address': "Go to the pane's address bar",
      'keys.zoom': 'Pane zoom',
      'keys.grid': 'Auto grid',
      'keys.newWs': 'New workspace',
      'keys.switchWs': 'Switch workspace',
      'keys.fullscreen': 'Full screen',
      'keys.devtools': 'DevTools for the pane',
      'keys.dragHint': 'Drag a pane by its ⠿ handle onto another pane: centre = swap, edge = dock next to it, onto a tab = move to that workspace.',

      'ask.cancel': 'Cancel',
      'ask.ok': 'OK',

      'fav.overview': 'Overview',
      'fav.energy': 'Energy',
      'fav.map': 'Map',
      'fav.logbook': 'Logbook',
      'fav.history': 'History',
      'fav.automations': 'Automations',
      'fav.settings': 'Settings',
    },

    nl: {
      'app.workspaces': 'Werkruimtes',

      'toolbar.pane': 'Paneel',
      'toolbar.newPane': 'Nieuw paneel (Ctrl+D)',
      'toolbar.openFavorite': 'Favoriet openen in nieuw paneel',
      'toolbar.layout': 'Indeling',
      'toolbar.reloadAll': 'Alle panelen herladen (Ctrl+Shift+R)',
      'toolbar.fullscreen': 'Volledig scherm (F11)',
      'toolbar.settings': 'Instellingen',

      'empty.noPanes': 'Nog geen panelen',
      'empty.welcome': 'Welkom bij HA Multiview',
      'empty.textWithUrl': 'Voeg panelen toe en zet zoveel Home Assistant-weergaven naast elkaar als je wilt.',
      'empty.textNoUrl': 'Stel eerst het adres van je Home Assistant in. Daarna kun je zoveel panelen naast elkaar openen als je wilt.',
      'empty.addPane': 'Paneel toevoegen',
      'empty.settings': 'Instellingen',

      'pane.drag': 'Slepen: wisselen, ernaast plaatsen of naar een werkruimte-tab',
      'pane.back': 'Terug',
      'pane.forward': 'Vooruit',
      'pane.reload': 'Herladen (Ctrl+R)',
      'pane.favorites': 'Favorieten',
      'pane.address': 'Pad of adres',
      'pane.zoomOut': 'Uitzoomen (Ctrl+-)',
      'pane.zoomReset': 'Zoom herstellen (Ctrl+0)',
      'pane.zoomIn': 'Inzoomen (Ctrl++)',
      'pane.splitRight': 'Splits naar rechts (Ctrl+D)',
      'pane.splitDown': 'Splits naar beneden (Ctrl+Shift+D)',
      'pane.maximize': 'Maximaliseren (Ctrl+Enter)',
      'pane.restore': 'Herstellen (Ctrl+Enter)',
      'pane.close': 'Paneel sluiten (Ctrl+W)',
      'pane.retry': 'Opnieuw proberen',
      'pane.fallbackLabel': 'Paneel',

      'error.noAddress': 'Geen Home Assistant-adres',
      'error.noAddressDetail': 'Stel eerst het adres van je Home Assistant in via Instellingen.',
      'error.loadFailed': 'Kan de pagina niet laden',
      'error.unknown': 'Onbekende fout',
      'error.crashed': 'Dit paneel is gecrasht',
      'error.crashedDetail': 'Klik op opnieuw proberen om het te herladen.',

      'ws.defaultName': 'Werkruimte {n}',
      'ws.fallbackName': 'Werkruimte',
      'ws.tabTitle': 'Dubbelklik om te hernoemen',
      'ws.close': 'Werkruimte sluiten',
      'ws.new': 'Nieuwe werkruimte (Ctrl+T)',
      'ws.confirmCloseOne': 'Werkruimte "{name}" met 1 paneel sluiten?',
      'ws.confirmCloseMany': 'Werkruimte "{name}" met {count} panelen sluiten?',
      'ws.rename': 'Werkruimte hernoemen',

      'menu.addCurrentFavorite': 'Huidige pagina toevoegen aan favorieten',
      'menu.manageFavorites': 'Favorieten beheren…',
      'menu.openInNewPane': 'Openen in nieuw paneel',
      'menu.startPage': 'Startpagina',
      'menu.layoutHeading': 'Indeling (vult aan met nieuwe panelen)',
      'menu.sideBySide': '{n} naast elkaar',
      'menu.stacked': '{n} boven elkaar',
      'menu.autoGrid': 'Automatisch raster',
      'menu.equalize': 'Gelijk verdelen',
      'menu.favoriteName': 'Naam voor favoriet ({path})',

      'settings.title': 'Instellingen',
      'settings.baseUrl': 'Home Assistant-adres',
      'settings.defaultPath': 'Startpagina voor nieuwe panelen',
      'settings.favorites': 'Favorieten',
      'settings.favoritesHint': 'één per regel:',
      'settings.favoritesFormat': 'Naam | /pad',
      'settings.language': 'Taal',
      'settings.languageAuto': 'Automatisch (taal van Windows)',
      'settings.restoreSession': 'Werkruimtes en panelen herstellen bij opstarten',
      'settings.allowSelfSigned': 'Zelfondertekend HTTPS-certificaat accepteren',
      'settings.allowSelfSignedHint': '(alleen voor bovenstaand adres)',
      'settings.shortcuts': 'Sneltoetsen',
      'settings.clearSession': 'Uitloggen en sessiegegevens wissen',
      'settings.cancel': 'Annuleren',
      'settings.save': 'Opslaan',
      'settings.invalidUrl': 'Voer een geldig http(s)-adres in, bijv. http://homeassistant.local:8123',
      'settings.confirmClear': 'Je wordt in alle panelen uitgelogd en opgeslagen sessiegegevens (tokens, cache) worden gewist. Doorgaan?',

      'keys.splitRight': 'Paneel naar rechts splitsen',
      'keys.splitDown': 'Paneel naar beneden splitsen',
      'keys.close': 'Paneel sluiten',
      'keys.maximize': 'Paneel maximaliseren / herstellen',
      'keys.reload': 'Paneel herladen',
      'keys.reloadAll': 'Alle panelen herladen',
      'keys.address': 'Naar adresbalk van paneel',
      'keys.zoom': 'Zoom van paneel',
      'keys.grid': 'Automatisch raster',
      'keys.newWs': 'Nieuwe werkruimte',
      'keys.switchWs': 'Wisselen van werkruimte',
      'keys.fullscreen': 'Volledig scherm',
      'keys.devtools': 'DevTools van paneel',
      'keys.dragHint': 'Sleep een paneel aan het ⠿-handvat naar een ander paneel: midden = wisselen, rand = ernaast plaatsen, op een tabblad = naar die werkruimte verplaatsen.',

      'ask.cancel': 'Annuleren',
      'ask.ok': 'OK',

      'fav.overview': 'Overzicht',
      'fav.energy': 'Energie',
      'fav.map': 'Kaart',
      'fav.logbook': 'Logboek',
      'fav.history': 'Geschiedenis',
      'fav.automations': 'Automatiseringen',
      'fav.settings': 'Instellingen',
    },
  };

  const LANGS = Object.keys(STRINGS);
  let lang = 'en';

  // 'auto' follows the Windows display language (Chromium exposes it as navigator.languages).
  function resolveLang(setting) {
    if (LANGS.includes(setting)) return setting;
    const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']).map((l) =>
      String(l).toLowerCase().split('-')[0]
    );
    return prefs.find((l) => LANGS.includes(l)) || 'en';
  }

  function setLang(setting) {
    lang = resolveLang(setting);
    document.documentElement.lang = lang;
    return lang;
  }

  function t(key, params, forLang) {
    const table = STRINGS[forLang || lang] || STRINGS.en;
    let s = key in table ? table[key] : key in STRINGS.en ? STRINGS.en[key] : key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    return s;
  }

  const ATTRS = [
    ['i18nTitle', 'title'],
    ['i18nPlaceholder', 'placeholder'],
    ['i18nAriaLabel', 'aria-label'],
  ];

  function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    for (const [dataKey, attr] of ATTRS) {
      const sel = '[data-' + dataKey.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']';
      root.querySelectorAll(sel).forEach((el) => el.setAttribute(attr, t(el.dataset[dataKey])));
    }
  }

  window.i18n = { t, setLang, resolveLang, applyI18n, get lang() { return lang; }, LANGS };
})();
