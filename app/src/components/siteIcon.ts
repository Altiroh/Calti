/** Icône d'un site sans service tiers : /favicon.ico de son origine. */
export function siteIcon(url: string): string | null {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? `${u.origin}/favicon.ico` : null;
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
