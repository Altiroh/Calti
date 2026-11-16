// Téléchargements : bouton dans la barre latérale (comme les favoris) et, en option, dans la barre du haut. Animation
// d'un nouveau fichier, du bouton cliqué dans la page jusqu'à l'icône : barre du haut si elle y est, sinon barre
// latérale, sinon aucune animation (simple message).
//   powershell -File scripts\tests\run.ps1 downloads.test.cjs
const fs = require("fs");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const run = (ui, id, script) => ui.ev(`${invoke("browser_eval", { id, script })}`);

async function open(chrome, extra = "") {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.edge-rail", "1"); ${extra}
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: ${JSON.stringify(chrome)} }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  await sleep(500);
  return ui;
}

/** Ouvre une page, y clique (point connu) puis télécharge : où la pastille part, où elle arrive, et ce qui s'affiche. */
async function download(ui, name) {
  await ui.ev(`(() => { const input = document.querySelector(".pane__address input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "https://example.org/?${name}");
    input.dispatchEvent(new Event("input", { bubbles: true })); input.closest("form").requestSubmit(); })()`);
  await sleep(3500);
  const tab = (await ui.ev(`${invoke("browser_tabs")}`)).find((x) => x.url.includes(name));
  // Pastille dans l'interface : trajectoire lue sur son animation.
  await ui.ev(`window.__flight = null; new MutationObserver((m, o) => { const d = document.querySelector(".dl-flight"); if (!d) return; o.disconnect();
    const k = d.getAnimations()[0]?.effect.getKeyframes() ?? []; const at = (f) => (f?.transform.match(/translate\\(([-\\d.]+)px, ([-\\d.]+)px\\)/) ?? []).slice(1).map((v) => +v + 14);
    window.__flight = { start: at(k[0]), end: at(k[k.length - 1]) }; }).observe(document.body, { childList: true })`);
  // Clic dans la page (au point 120, 140), puis téléchargement ; la pastille de la page est-elle là peu après ?
  await run(ui, tab.id, `(() => { document.dispatchEvent(new PointerEvent("pointerdown", { clientX: 120, clientY: 140, bubbles: true }));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["essai Calti"], { type: "text/plain" })); a.download = "${name}.txt"; document.body.append(a); a.click();
    setTimeout(() => { document.title = "dans la page : " + !!document.querySelector("calti-download"); }, 250); })()`);
  let done = null;
  for (let i = 0; i < 25 && !done; i++) { await sleep(300); done = (await ui.ev(`${invoke("downloads_list")}`)).find((d) => d.path.endsWith(`${name}.txt`) && d.state === "done"); }
  await sleep(900);
  const title = (await ui.ev(`${invoke("browser_tabs")}`)).find((x) => x.id === tab.id)?.title ?? "";
  const result = await ui.ev(`(() => { const c = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? [r.left + r.width / 2, r.top + r.height / 2] : null; };
    const p = document.querySelector(".pane__content").getBoundingClientRect();
    return { flight: window.__flight, bar: c(".bar-downloads"), rail: c(".rail-btn[aria-label='Téléchargements']"), page: [p.left, p.top, p.right, p.bottom],
      toast: document.querySelector(".toast--info")?.textContent ?? null }; })()`);
  if (done) fs.rmSync(done.path, { force: true });
  await ui.ev(`${invoke("downloads_clear")}`);
  return { ...result, done: !!done, inPage: title === "dans la page : true", title };
}
const near = (a, b, d = 3) => !!a && !!b && Math.abs(a[0] - b[0]) <= d && Math.abs(a[1] - b[1]) <= d;

(async () => {
  // Réglages d'avant : favoris dans la barre latérale, pas de téléchargements.
  let ui = await open({ railWidgets: ["history", "bookmarks", "notes"], railStyle: "floating" }, `localStorage.removeItem("calti.downloads-widget");`);
  const widgets = await ui.ev(`JSON.parse(localStorage.getItem("calti.settings.v3")).theme.chrome.railWidgets`);
  t.check("ajouté à la barre latérale, après les favoris", JSON.stringify(widgets) === JSON.stringify(["history", "bookmarks", "downloads", "notes"]), widgets);
  await ui.ev(`document.querySelector(".rail .rail-btn[aria-label='Téléchargements']").click()`);
  await sleep(600);
  t.check("widget ouvert à côté de la page, état vide sans phrase", await ui.ev(`document.querySelector(".pane__panel .downloads-card .settings__hint")?.textContent ?? ""`) === "Aucun téléchargement");
  await ui.ev(`document.querySelector(".rail .rail-btn[aria-label='Téléchargements']").click()`);
  await sleep(400);
  t.check("pas dans la barre du haut par défaut", !(await ui.ev(`!!document.querySelector(".bar-downloads")`)));

  // Barre latérale seule : la pastille sort de la page par la gauche, vers le bouton de la barre latérale.
  const rail = await download(ui, "lateral");
  t.check("barre latérale : fichier téléchargé (contrôle)", rail.done);
  t.check("barre latérale : pastille d'abord dans la page, depuis le clic", rail.inPage, rail.title);
  t.check("barre latérale : reprise au bord gauche de la page", !!rail.flight && Math.abs(rail.flight.start[0] - rail.page[0]) <= 2, JSON.stringify(rail.flight));
  t.check("barre latérale : arrivée sur l'icône", near(rail.flight?.end, rail.rail), `${JSON.stringify(rail.flight?.end)} / ${JSON.stringify(rail.rail)}`);
  t.check("barre latérale : pas de message en plus", rail.toast === null, rail.toast);
  ui.close();

  // Barre du haut + barre latérale : la barre du haut l'emporte ; sortie par le haut de la page.
  ui = await open({ railWidgets: ["bookmarks", "downloads"], railStyle: "floating", barButtons: { downloads: true } }, `localStorage.setItem("calti.downloads-widget", "1");`);
  t.check("bouton dans la barre du haut", await ui.ev(`!!document.querySelector(".bar-downloads .dl-glyph--bar")`));
  const bar = await download(ui, "haut");
  t.check("barre du haut : pastille d'abord dans la page", bar.inPage, bar.title);
  t.check("barre du haut : reprise au bord haut de la page", !!bar.flight && Math.abs(bar.flight.start[1] - bar.page[1]) <= 2, JSON.stringify(bar.flight));
  t.check("barre du haut : arrivée sur l'icône de la barre du haut", near(bar.flight?.end, bar.bar), `${JSON.stringify(bar.flight?.end)} / ${JSON.stringify(bar.bar)}`);
  await ui.ev(`document.querySelector(".bar-downloads").click()`);
  await sleep(500);
  t.check("barre du haut : le bouton ouvre les téléchargements", await ui.ev(`!!document.querySelector(".drawer--open")?.textContent.includes("Téléchargements")`));
  ui.close();

  // Ni barre du haut, ni barre latérale : pas d'animation, un message.
  ui = await open({ railWidgets: ["bookmarks"], railStyle: "floating", barButtons: { downloads: false } }, `localStorage.setItem("calti.downloads-widget", "1");`);
  const none = await download(ui, "aucun");
  t.check("aucune icône : pas d'animation", none.flight === null && !none.inPage, JSON.stringify(none.flight) + " " + none.title);
  t.check("aucune icône : message court", none.toast === "Téléchargement · Ctrl+J", none.toast);

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
