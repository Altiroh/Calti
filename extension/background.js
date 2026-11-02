// Service worker : relie Brave à l'application Calti via Native Messaging.
// Tant que le port natif est ouvert, Brave garde ce service worker actif.

const HOST = "com.calti.host";
const RECONNECT_ALARM = "calti-reconnect";

let port = null;

// Identifiant stable de ce profil Brave : l'application distingue ainsi Personnel et Pro.
const profileId = chrome.storage.local.get("profileId").then(async ({ profileId }) => {
  if (profileId) return profileId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ profileId: id });
  return id;
});

// Dernière erreur Native Messaging, gardée dans le stockage local : Calti la lit pour l'afficher.
function reportNativeError(message) {
  chrome.storage.local.set({ lastNativeError: message, lastNativeErrorAt: Date.now() });
}

function connect() {
  if (port) return;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (e) {
    console.error("Calti : connexion native impossible", e);
    reportNativeError(String(e?.message ?? e));
    port = null;
    return;
  }
  let received = false;
  port.onMessage.addListener((msg) => {
    if (!received) {
      received = true;
      reportNativeError("");
    }
    onCommand(msg);
  });
  port.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message ?? "hôte arrêté";
    // Une déconnexion avant tout message signale un hôte introuvable ou refusé.
    if (!received) {
      console.error("Calti : hôte natif indisponible :", message);
      reportNativeError(message);
    }
    port = null;
    setTimeout(connect, 5000);
  });
}

function post(message) {
  try {
    port?.postMessage(message);
  } catch (e) {
    console.warn("Calti : envoi impossible", e);
  }
}

// --- Onglets ---------------------------------------------------------------

function toTab(t) {
  return {
    id: t.id,
    windowId: t.windowId,
    index: t.index,
    title: t.title ?? "",
    url: t.url ?? t.pendingUrl ?? "",
    favIconUrl: t.favIconUrl || null,
    active: t.active,
    pinned: t.pinned,
    audible: !!t.audible,
    muted: !!t.mutedInfo?.muted,
    incognito: t.incognito,
    loading: t.status === "loading",
  };
}

async function sendSnapshot() {
  if (!port) return;
  const [tabs, focused] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getLastFocused().catch(() => null),
  ]);
  post({
    type: "snapshot",
    focusedWindowId: focused?.id ?? null,
    tabs: tabs.filter((t) => t.id !== chrome.tabs.TAB_ID_NONE).map(toTab),
  });
}

// --- Favoris ---------------------------------------------------------------

function toBookmark(node) {
  return {
    id: node.id,
    title: node.title,
    url: node.url ?? null,
    children: node.children ? node.children.map(toBookmark) : null,
  };
}

async function sendBookmarks() {
  if (!port) return;
  const [root] = await chrome.bookmarks.getTree();
  post({ type: "bookmarks", tree: (root.children ?? []).map(toBookmark) });
}

// Regroupe les rafales d'événements en un seul envoi.
function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => fn().catch((e) => console.warn("Calti", e)), ms);
  };
}

const scheduleSnapshot = debounce(sendSnapshot, 60);
const scheduleBookmarks = debounce(sendBookmarks, 250);

for (const event of [
  chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onActivated,
  chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabs.onReplaced,
  chrome.windows.onFocusChanged, chrome.windows.onRemoved,
]) {
  event.addListener(scheduleSnapshot);
}

for (const event of [
  chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved, chrome.bookmarks.onChildrenReordered, chrome.bookmarks.onImportEnded,
]) {
  event.addListener(scheduleBookmarks);
}

// --- Commandes de l'application --------------------------------------------

const isTabId = (v) => Number.isInteger(v) && v >= 0;
const isWebUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

async function focusWindow(windowId) {
  await chrome.windows.update(windowId, { focused: true });
}

async function lastFocusedActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function onCommand(msg) {
  try {
    switch (msg?.type) {
      case "identify":
        return post({ type: "hello", profileId: await profileId });
      case "requestSnapshot":
        return await sendSnapshot();
      case "getBookmarks":
        return await sendBookmarks();
      case "activateTab": {
        if (!isTabId(msg.tabId)) return;
        const tab = await chrome.tabs.update(msg.tabId, { active: true });
        return await focusWindow(tab.windowId);
      }
      case "closeTab":
        if (!isTabId(msg.tabId)) return;
        return await chrome.tabs.remove(msg.tabId);
      case "newTab": {
        const tab = await chrome.tabs.create({});
        return await focusWindow(tab.windowId);
      }
      case "openUrl": {
        if (!isWebUrl(msg.url)) return;
        const tab = await chrome.tabs.create({ url: msg.url });
        return await focusWindow(tab.windowId);
      }
      case "search": {
        if (typeof msg.text !== "string" || !msg.text.trim()) return;
        // Utilise le moteur de recherche configuré dans Brave.
        await chrome.search.query({ text: msg.text, disposition: "NEW_TAB" });
        const tab = await lastFocusedActiveTab();
        if (tab) await focusWindow(tab.windowId);
        return;
      }
      case "navigate": {
        const tab = await lastFocusedActiveTab();
        if (!tab) return;
        if (msg.action === "back") await chrome.tabs.goBack(tab.id);
        else if (msg.action === "forward") await chrome.tabs.goForward(tab.id);
        else if (msg.action === "reload") await chrome.tabs.reload(tab.id);
        return;
      }
      default:
        console.warn("Calti : commande inconnue", msg);
    }
  } catch (e) {
    post({ type: "error", message: String(e?.message ?? e) });
  }
}

// --- Démarrage -------------------------------------------------------------

chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
// Filet de sécurité si le service worker a été arrêté avant de pouvoir se reconnecter.
chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === RECONNECT_ALARM && connect());
connect();
