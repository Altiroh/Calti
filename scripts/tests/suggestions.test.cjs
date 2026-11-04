// Suggestions de la barre d'adresse : icône du site pour une page de l'historique, loupe pour une recherche.
//   powershell -File scripts\tests\run.ps1 suggestions.test.cjs
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }));
    localStorage.setItem("calti.history.essai", JSON.stringify([{ url: "https://example.com/", title: "Example Domain", at: Date.now() }]));
    localStorage.setItem("calti.searches.essai", JSON.stringify([{ url: "", title: "example recherche", at: Date.now() }]));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  await ui.ev(invoke("browser_open", { profile: "essai", url: "https://example.com/" }));
  await sleep(2500);
  await ui.ev(`(() => { const i = document.querySelector(".pane__address input"); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "exam"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(800);
  const items = await ui.ev(`[...document.querySelectorAll(".suggest__item")].map((el) => ({
    text: el.querySelector(".suggest__text")?.textContent,
    site: !!el.querySelector(".suggest__icon--site img.favicon, .suggest__icon--site .favicon"),
    kind: !!el.querySelector(".suggest__kind svg"),
    loupe: !!el.querySelector(".suggest__icon:not(.suggest__icon--site) svg"),
  }))`);
  const page = items.find((i) => i.text?.includes("Example Domain"));
  const search = items.find((i) => i.text === "example recherche");
  t.check("page de l'historique : icône du site et repère", page?.site && page?.kind, items);
  t.check("recherche passée : loupe", search?.loupe, search);

  // Icône déclarée par la page (GitHub la sert depuis un autre domaine que /favicon.ico) : apprise et reprise.
  await ui.ev(invoke("browser_open", { profile: "essai", url: "https://github.com/" }));
  let declared = "";
  for (let i = 0; i < 30 && !declared; i++) {
    await sleep(500);
    declared = (await ui.ev(invoke("browser_tabs"))).find((x) => x.url.includes("github.com"))?.icon ?? "";
  }
  t.check("icône déclarée par la page connue de Calti", declared && !declared.endsWith("github.com/favicon.ico"), declared);
  await sleep(300);
  const learned = await ui.ev(`JSON.parse(localStorage.getItem("calti.icons") ?? "{}")["github.com"] ?? ""`);
  t.check("icône retenue pour le site", learned === declared, learned);
  await ui.ev(`localStorage.setItem("calti.history.essai", JSON.stringify([{ url: "https://github.com/", title: "GitHub", at: Date.now() }]))`);
  await ui.ev(`(() => { const i = document.querySelector(".pane__address input"); i.blur(); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "githu"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(800);
  const src = await ui.ev(`[...document.querySelectorAll(".suggest__item")].map((el) => el.querySelector(".suggest__icon--site img")?.getAttribute("src")).find(Boolean) ?? ""`);
  t.check("suggestion avec l'icône réelle du site", src === declared, src);
  await sleep(1000);
  await ui.shot(path.join(process.env.TEMP, "calti-suggestions.png"));
  t.report();
  process.exit();
})().catch((e) => {
  console.error("✘ scénario interrompu :", e.message);
  process.exit(1);
});
