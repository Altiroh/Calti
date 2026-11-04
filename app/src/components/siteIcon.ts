// Icône d'un site sans service tiers : celle que ses pages déclarent (apprise des onglets ouverts, retenue par
// site), sinon /favicon.ico de son origine.

const KEY = "calti.icons";
const MAX = 400;

let icons: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; }
})();

// Icônes apprises dans une autre fenêtre.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  try { icons = JSON.parse(e.newValue ?? "{}"); } catch { /* ignoré */ }
});

const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
};

/** Retient l'icône déclarée par chaque onglet ouvert, pour son site. */
export function learnIcons(tabs: { url: string; icon?: string }[]) {
  let changed = false;
  for (const t of tabs) {
    const host = t.icon && hostOf(t.url);
    if (host && icons[host] !== t.icon) {
      delete icons[host];
      icons[host] = t.icon!;
      changed = true;
    }
  }
  if (!changed) return;
  const hosts = Object.keys(icons);
  if (hosts.length > MAX) for (const h of hosts.slice(0, hosts.length - MAX)) delete icons[h];
  try { localStorage.setItem(KEY, JSON.stringify(icons)); } catch { /* non persisté */ }
}

export function siteIcon(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return icons[u.hostname.replace(/^www\./, "")] ?? `${u.origin}/favicon.ico`;
  } catch {
    return null;
  }
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
