// Menus de Calti aux couleurs du thème (barre, onglets, pages), style global et outils de développement.
//   powershell -File scripts\tests\run.ps1 menus.test.cjs
const path = require("path");
const { execSync } = require("child_process");
const { connect, pages, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const menus = `[...document.querySelectorAll(".cmenu")].map((m) => ({
  radius: getComputedStyle(m).borderTopLeftRadius,
  labels: [...m.querySelectorAll(".cmenu__label")].map((l) => l.textContent),
  icons: m.querySelectorAll(".cmenu__icon:not(.cmenu__icon--none) svg, .cmenu__icon .favicon").length,
  keys: m.querySelectorAll(".cmenu__keys kbd").length,
}))`;
const rightClick = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.right - 6, clientY: r.top + r.height / 2 }));
})()`;
const item = (label) => `[...document.querySelectorAll(".cmenu__item")].find((b) => b.textContent.includes(${JSON.stringify(label)}))`;

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: { radius: 16 } }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  // Interface affichée (barre d’adresse présente) avant de commencer.
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  // Ouverture par la barre d’adresse, comme un utilisateur : l’onglet devient celui affiché.
  await ui.ev(`(() => { const i = document.querySelector(".pane__address input"); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "https://example.com/"); i.dispatchEvent(new Event("input", { bubbles: true })); i.form.requestSubmit(); })()`);
  await sleep(3500);

  // Barre du haut.
  await ui.ev(rightClick(".pane__bar"));
  await sleep(300);
  let shown = await ui.ev(menus);
  t.check("clic droit sur la barre : menu de Calti", shown.length === 1 && shown[0].labels.includes("Nouvel onglet"), shown[0]?.labels);
  t.check("icônes teintées et touches affichées", shown[0]?.icons >= 15 && shown[0]?.keys >= 8, shown[0]);
  t.check("arrondi du style global", shown[0]?.radius === "16px", shown[0]?.radius);
  t.check("outils de développement proposés", shown[0]?.labels.includes("Outils de développement"));

  // Sous-menu du zoom, puis « Agrandir ».
  const r = await ui.ev(`(() => { const b = ${item("Zoom de la page")}.getBoundingClientRect(); return { x: b.left + 40, y: b.top + b.height / 2 }; })()`);
  await ui.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x - 30, y: r.y });
  await ui.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
  await sleep(250);
  shown = await ui.ev(menus);
  t.check("sous-menu ouvert à côté", shown.length === 2 && shown[1].labels.includes("Agrandir"), shown.map((m) => m.labels.length));
  await ui.ev(`${item("Agrandir")}.click()`);
  await sleep(800);
  const zoom = (await ui.ev(invoke("browser_tabs"))).find((x) => x.url.includes("example.com"))?.zoom;
  t.check("action du sous-menu exécutée (zoom 110 %)", Math.abs(zoom - 1.1) < 0.01, zoom);
  t.check("menu refermé après le choix", (await ui.ev(menus)).length === 0);
  await ui.ev(invoke("browser_action", { id: (await ui.ev(invoke("browser_tabs")))[0].id, action: "zoom-reset" }));

  // Onglet : menu propre, Échap le referme.
  await ui.ev(rightClick(".ptab"));
  await sleep(300);
  shown = await ui.ev(menus);
  t.check("clic droit sur un onglet", shown[0]?.labels.includes("Dupliquer l'onglet"), shown[0]?.labels);
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(200);
  t.check("Échap referme le menu", (await ui.ev(menus)).length === 0);

  // Style global : plus carré et opaque, appliqué aux menus.
  await ui.ev(`(() => { const s = JSON.parse(localStorage.getItem("calti.settings.v3")); s.theme.chrome = { ...s.theme.chrome, radius: 4, surface: "solid" };
    localStorage.setItem("calti.settings.v3", JSON.stringify(s)); window.dispatchEvent(new StorageEvent("storage", { key: "calti.settings.v3" })); })()`);
  await sleep(400);
  await ui.ev(rightClick(".pane__bar"));
  await sleep(300);
  shown = await ui.ev(menus);
  t.check("arrondi global appliqué au menu", shown[0]?.radius === "4px", shown[0]?.radius);
  t.check("matière pleine sur la fenêtre", await ui.ev(`document.querySelector(".shell").dataset.surface === "solid" && getComputedStyle(document.querySelector(".cmenu")).backdropFilter === "none"`));
  await ui.shot(path.join(process.env.TEMP, "calti-menu-barre.png"));
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);

  // Clic droit dans la page : entrées de WebView2, dessinées par Calti.
  const target = (await pages()).find((p) => p.url.startsWith("https://example.com"));
  const page = await connect((p) => p.id === target.id);
  await page.ev(`window.__mark = 1`);
  const click = async () => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await page.call("Input.dispatchMouseEvent", { type, x: 60, y: 300, button: "right", clickCount: 1 });
    }
    await sleep(700);
  };
  await click();
  shown = await ui.ev(menus);
  t.check("clic droit dans la page : menu de Calti", shown.length === 1 && shown[0].labels.length >= 3, shown[0]?.labels);
  t.check("entrées de la page avec icônes", shown[0]?.icons >= 3, shown[0]?.icons);
  await ui.shot(path.join(process.env.TEMP, "calti-menu-page.png"));
  // Choix d'une entrée de WebView2 : « Actualiser » recharge la page.
  const reloadLabel = await ui.ev(`[...document.querySelectorAll(".cmenu__item")].find((b) => b.querySelector("svg path[d^='M19 12a7']"))?.textContent ?? ""`);
  await ui.ev(`[...document.querySelectorAll(".cmenu__item")].find((b) => b.querySelector("svg path[d^='M19 12a7']"))?.click()`);
  await sleep(1500);
  const reloaded = await page.ev(`window.__mark === undefined`).catch(() => true);
  t.check("entrée choisie exécutée par la page (rechargement)", reloadLabel && reloaded, reloadLabel);

  // Outils de développement de la page, ancrés dans la fenêtre de Calti (F12), puis refermés.
  const wins = () => JSON.parse(execSync(`powershell -NoProfile -File "${path.join(__dirname, "windows.ps1")}" -CaltiPid ${process.env.CALTI_PID}`).toString());
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "F12" }))`);
  let state = { child: false };
  for (let i = 0; i < 12 && !state.child; i++) {
    await sleep(500);
    state = wins();
  }
  t.check("F12 : panneau des outils dans le volet", await ui.ev(`!!document.querySelector(".devtools .devtools__slot")`));
  t.check("outils ancrés dans la fenêtre de Calti (pas de fenêtre à part)", state.child && state.tools.length === 0, state);
  const slot = await ui.ev(`(() => { const r = document.querySelector(".devtools__slot").getBoundingClientRect(); const p = document.querySelector(".pane__content").getBoundingClientRect(); return { slot: r.width, page: p.width }; })()`);
  t.check("la page se resserre à côté des outils", slot.slot > 200 && slot.page > 200, slot);
  await sleep(1500);
  execSync(`powershell -NoProfile -File "${path.join(__dirname, "windows.ps1")}" -CaltiPid ${process.env.CALTI_PID} -Shot "${path.join(process.env.TEMP, "calti-devtools.png")}"`);
  // Ancrage en bas.
  await ui.ev(`document.querySelector(".devtools__bar button").click()`);
  await sleep(800);
  t.check("ancrage en bas", await ui.ev(`!!document.querySelector(".pane__stack .devtools--bottom")`) && wins().child);
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "F12" }))`);
  await sleep(1200);
  state = wins();
  t.check("F12 à nouveau : outils refermés", !state.child && state.tools.length === 0 && await ui.ev(`!document.querySelector(".devtools")`), state);

  t.report();
  process.exit();
})().catch(async (e) => {
  try { const ui = await connect(); await ui.shot(path.join(process.env.TEMP, "calti-menus-echec.png")); console.error(await ui.ev(`document.body.innerText.slice(0, 200)`)); } catch { /* rien */ }
  console.error("✘ scénario interrompu :", e.message);
  process.exit(1);
});
