// Téléchargements dans la barre latérale (comme les favoris) et animation d'un nouveau fichier : pastille de la
// barre d'adresse au bouton, rebond, coche à la fin.
//   powershell -File scripts\tests\run.ps1 downloads.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;

(async () => {
  let ui = await connect();
  // Réglages d'avant : favoris dans la barre, pas de téléchargements.
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: { railWidgets: ["history", "bookmarks", "notes"] } }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  await sleep(500);
  // La fenêtre d'essai n'a pas le focus : il est simulé (les animations ne partent que dans la fenêtre active).
  await ui.call("Emulation.setFocusEmulationEnabled", { enabled: true });

  const widgets = await ui.ev(`JSON.parse(localStorage.getItem("calti.settings.v3")).theme.chrome.railWidgets`);
  t.check("ajouté à la barre latérale, après les favoris", JSON.stringify(widgets) === JSON.stringify(["history", "bookmarks", "downloads", "notes"]), widgets);
  t.check("bouton Téléchargements dans la barre", await ui.ev(`!!document.querySelector(".rail .rail-btn[aria-label='Téléchargements'] .dl-glyph")`));

  await ui.ev(`document.querySelector(".rail .rail-btn[aria-label='Téléchargements']").click()`);
  await sleep(600);
  t.check("widget ouvert à côté de la page", await ui.ev(`document.querySelector(".pane__panel .downloads-card .card__title, .pane__panel .downloads-card h2, .pane__panel .downloads-card")?.textContent.includes("Téléchargements") ?? false`));
  t.check("état vide sans phrase", await ui.ev(`document.querySelector(".pane__panel .downloads-card .settings__hint")?.textContent ?? ""`) === "Aucun téléchargement");
  await ui.ev(`document.querySelector(".rail .rail-btn[aria-label='Téléchargements']").click()`);
  await sleep(400);

  // Nouveau téléchargement depuis une page affichée.
  await ui.ev(`(() => { const input = document.querySelector(".pane__address input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "https://example.org/?telechargement");
    input.dispatchEvent(new Event("input", { bubbles: true })); input.closest("form").requestSubmit(); })()`);
  await sleep(3500);
  const tab = (await ui.ev(`${invoke("browser_tabs")}`)).find((x) => x.url.includes("telechargement"));
  await ui.ev(`window.__flight = false; new MutationObserver((m, o) => { if (document.querySelector(".dl-flight")) { window.__flight = true; o.disconnect(); } }).observe(document.body, { childList: true })`);
  await ui.ev(`${invoke("browser_eval", { id: tab.id, script: `(() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["essai Calti"], { type: "text/plain" })); a.download = "calti-anim.txt"; document.body.append(a); a.click(); })()` })}`);
  let done = null;
  for (let i = 0; i < 25 && !done; i++) { await sleep(300); done = (await ui.ev(`${invoke("downloads_list")}`)).find((d) => d.path.endsWith("calti-anim.txt") && d.state === "done"); }
  t.check("fichier téléchargé (contrôle)", !!done, done?.path);
  t.check("pastille partie de la barre d'adresse vers le bouton", await ui.ev(`window.__flight`));
  t.check("pas de message en plus (le bouton suffit)", !(await ui.ev(`!!document.querySelector(".toast--info")`)));
  let check = false;
  for (let i = 0; i < 12 && !check; i++) { await sleep(150); check = await ui.ev(`!!document.querySelector(".rail .dl-glyph__check")`); }
  t.check("coche sur le bouton à la fin", check);
  await sleep(2200);
  t.check("coche retirée ensuite", !(await ui.ev(`!!document.querySelector(".rail .dl-glyph__check")`)));
  await sleep(500);
  t.check("pastille retirée après son vol", !(await ui.ev(`!!document.querySelector(".dl-flight")`)));

  await ui.ev(`document.querySelector(".rail .rail-btn[aria-label='Téléchargements']").click()`);
  await sleep(600);
  t.check("le fichier est dans le widget", await ui.ev(`[...document.querySelectorAll(".pane__panel .downloads-card .download__name")].some((x) => x.textContent === "calti-anim.txt")`));
  await ui.shot(path.join(process.env.TEMP, "calti-downloads-widget.png"));

  if (done) fs.rmSync(done.path, { force: true });
  await ui.ev(`${invoke("downloads_clear")}`);
  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
