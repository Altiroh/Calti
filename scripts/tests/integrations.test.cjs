// Claude (panneau claude.ai, « Demander à Claude ») et Lecture en cours (panneau, mini-lecteur flottant).
//   powershell -File scripts\tests\run.ps1 integrations.test.cjs
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const settings = (chrome) => `localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: ${JSON.stringify(chrome)} }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }))`;

(async () => {
  let ui = await connect();
  // Désactivées par défaut : ni bouton ni lecteur.
  await ui.ev(`localStorage.clear(); ${settings({})}; location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__content")`)); i++) await sleep(250);
  t.check("désactivées par défaut", await ui.ev(`!document.querySelector('.rail-btn[aria-label="Claude"]') && !document.querySelector(".media-float")`));
  // Réglages : cartes d'activation.
  await ui.ev(`[...document.querySelectorAll(".rail-btn")].find((b) => /Réglages|Paramètres/.test(b.getAttribute("aria-label") ?? ""))?.click()`);
  await sleep(600);
  const cards = await ui.ev(`[...document.querySelectorAll(".ext strong")].map((s) => s.textContent)`);
  t.check("activables dans les extensions", ["Claude", "Lecture en cours", "Mini-lecteur"].every((n) => cards.includes(n)), cards);
  for (const name of ["Claude", "Lecture en cours", "Mini-lecteur"]) {
    await ui.ev(`[...document.querySelectorAll(".ext")].find((b) => b.querySelector("strong").textContent === ${JSON.stringify(name)}).click()`);
    await sleep(150);
  }
  await ui.ev(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await sleep(500);
  const chrome = await ui.ev(`JSON.parse(localStorage.getItem("calti.settings.v3")).theme.chrome`);
  // Choix du raccourci dans la barre latérale, sous la carte de l'extension activée.
  const railChoice = (ext, label) => ui.ev(`[...document.querySelectorAll('[data-ext="${ext}"] .ext__options .segmented button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  t.check("choix du raccourci proposé à l'activation", await ui.ev(`document.querySelectorAll(".ext-item--on .ext__options").length`) >= 5);
  await railChoice("media", "Non");
  await sleep(400);
  const hidden = await ui.ev(`!document.querySelector('.rail-btn[aria-label="Lecture en cours"]') && JSON.parse(localStorage.getItem("calti.settings.v3")).theme.chrome.railHidden.includes("media")`);
  await railChoice("media", "Oui");
  await sleep(400);
  t.check("sans raccourci : retiré de la barre, puis remis", hidden && await ui.ev(`!!document.querySelector('.rail-btn[aria-label="Lecture en cours"]')`));
  t.check("activées : enregistré",chrome.railWidgets.includes("claude") && chrome.railWidgets.includes("media") && chrome.mediaFloat === true, chrome);

  // Mini-lecteur : affiché, déplacé, redimensionné, formes au clic droit.
  for (let i = 0; i < 20 && !(await ui.ev(`!!document.querySelector(".media-float")`)); i++) await sleep(200);
  t.check("mini-lecteur flottant affiché", await ui.ev(`!!document.querySelector(".media-float .media")`));
  const box = () => ui.ev(`(() => { const r = document.querySelector(".media-float").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const mouse = (type, x, y) => ui.call("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  let b = await box();
  const grab = { x: b.x + 20, y: b.y + 8 };
  await mouse("mousePressed", grab.x, grab.y);
  for (let i = 1; i <= 6; i++) await mouse("mouseMoved", grab.x - 50 * i, grab.y - 40 * i);
  await mouse("mouseReleased", grab.x - 300, grab.y - 240);
  await sleep(300);
  const moved = await box();
  t.check("glissé ailleurs dans la fenêtre", Math.abs(moved.x - (b.x - 300)) < 3 && Math.abs(moved.y - (b.y - 240)) < 3, { b, moved });
  const saved = await ui.ev(`JSON.parse(localStorage.getItem("calti.mediaFloat"))`);
  t.check("place retenue", Math.abs(saved.x - moved.x) < 2, saved);
  const corner = await ui.ev(`(() => { const r = document.querySelector(".media-float__grip").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await mouse("mousePressed", corner.x, corner.y);
  for (let i = 1; i <= 5; i++) await mouse("mouseMoved", corner.x + 20 * i, corner.y + 30 * i);
  await mouse("mouseReleased", corner.x + 100, corner.y + 150);
  await sleep(300);
  const resized = await box();
  t.check("redimensionné au coin, forme carte", Math.abs(resized.w - (moved.w + 100)) < 3 && Math.abs(resized.h - (moved.h + 150)) < 3
    && await ui.ev(`document.querySelector(".media-float").classList.contains("media-float--wide")`), resized);
  await ui.ev(`(() => { const el = document.querySelector(".media-float"); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.top + 20 })); })()`);
  await sleep(250);
  await ui.ev(`[...document.querySelectorAll(".cmenu__item")].find((b) => b.textContent.includes("Pochette")).click()`);
  await sleep(300);
  t.check("forme « Pochette » au clic droit", await ui.ev(`document.querySelector(".media-float").classList.contains("media-float--tall")`));
  await ui.shot(path.join(process.env.TEMP, "calti-player.png"));
  const state = await ui.ev(invoke("media_state"));
  t.check("état de lecture de Windows lisible", state === null || typeof state.title === "string", state && { app: state.app, title: state.title });

  // Places du mini-lecteur (réglage) : barre latérale, haut, bas, droite ; les pages lui font place.
  const page = `(() => { const r = document.querySelector(".pane__content").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; })()`;
  const before = await ui.ev(page);
  // Apparence → Mini-lecteur.
  await ui.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Apparence").click()`);
  await sleep(400);
  await ui.ev(`[...document.querySelectorAll(".sgroup__head")].find((b) => b.textContent.includes("Mini-lecteur")).click()`);
  await sleep(400);
  t.check("section Mini-lecteur dans Apparence, 6 places", await ui.ev(`document.querySelectorAll(".placement").length`) === 6);
  const setDock = (value) => ui.ev(`document.querySelector('.placement[data-placement="${value}"]').click()`);
  const segment = (label) => ui.ev(`[...document.querySelectorAll(".sgroup--open .segmented button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
  for (const dock of ["rail", "titlebar", "top", "bottom", "right"]) {
    await setDock(dock);
    await sleep(600);
    const shown = await ui.ev(`!!document.querySelector('[data-media-dock="${dock}"]') && !document.querySelector(".media-float")`);
    const now = await ui.ev(page);
    const room = dock === "top" ? now.top > before.top + 40 : dock === "bottom" ? now.bottom < before.bottom - 40
      : dock === "right" ? now.right < before.right - 150
      : dock === "titlebar" ? await ui.ev(`!!document.querySelector(".pane__bar [data-media-dock=titlebar] + .window-controls")`)
      : await ui.ev(`!!document.querySelector(".rail [data-media-dock=rail]")`);
    if (dock === "bottom") await ui.shot(path.join(process.env.TEMP, "calti-dock-bottom.png"));
    if (dock === "right") await ui.shot(path.join(process.env.TEMP, "calti-dock-right.png"));
    t.check(`lecteur ${dock === "rail" ? "dans la barre latérale" : dock === "titlebar" ? "dans la barre du haut" : `en bordure (${dock})`}, place faite`, shown && room, { before, now });
  }
  // Styles comme la barre latérale : bord renflé (liseré + collé au bord), collé au bord, plein.
  await setDock("bottom");
  await sleep(300);
  await segment("Bord renflé");
  await sleep(400);
  const edge = await ui.ev(`(() => { const d = document.querySelector(".media-dock"); const r = d.getBoundingClientRect();
    return { style: d.dataset.style, line: !!document.querySelector(".media-line--bottom"), gap: innerHeight - r.bottom, fill: getComputedStyle(d).backgroundColor }; })()`);
  t.check("bord renflé : liseré et lecteur collé au bord", edge.style === "edge" && edge.line && Math.abs(edge.gap) < 2, edge);
  await ui.shot(path.join(process.env.TEMP, "calti-dock-edge.png"));
  await segment("Flottant");
  await sleep(300);
  await segment("Plein");
  await sleep(300);
  t.check("flottant plein", await ui.ev(`(() => { const d = document.querySelector(".media-dock"); return d.dataset.style === "floating" && d.dataset.surface === "solid" && !document.querySelector(".media-line"); })()`));
  await segment("Petit");
  await segment("À droite");
  await sleep(300);
  t.check("taille et alignement", await ui.ev(`(() => { const d = document.querySelector(".media-dock"); const r = d.getBoundingClientRect(); const c = document.querySelector(".pane__content").getBoundingClientRect(); return r.width <= 422 && Math.abs(r.right - c.right) < 3; })()`));
  await setDock("free");
  await sleep(400);

  // Panneau « Lecture en cours » de la barre latérale.
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Lecture en cours"]').click()`);
  await sleep(400);
  t.check("panneau Lecture en cours", await ui.ev(`!!document.querySelector(".pane__panel--media .media-card")`));

  // Panneau Claude : page claude.ai à part (pas un onglet).
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Claude"]').click()`);
  await sleep(2500);
  let tabs = await ui.ev(invoke("browser_tabs"));
  let panel = tabs.find((x) => x.panel);
  t.check("page Claude ouverte dans le panneau", !!panel && /claude\.ai/.test(panel.url) && await ui.ev(`!!document.querySelector(".pane__panel--claude [data-panel-page]")`), tabs.map((x) => ({ url: x.url, panel: x.panel })));
  t.check("hors barre d'onglets", await ui.ev(`document.querySelectorAll(".ptab[data-tab]").length`) === tabs.filter((x) => !x.panel).length);
  const slot = await ui.ev(`(() => { const r = document.querySelector(".claude__page").getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  t.check("zone de la page Claude assez large", slot.w >= 300 && slot.h >= 300, slot);

  // « Demander à Claude » : même page, nouvelle conversation avec la question.
  await ui.ev(`window.dispatchEvent(new CustomEvent("calti:claude", { detail: { profile: "essai", prompt: "Bonjour Claude" } }))`);
  await sleep(2500);
  tabs = await ui.ev(invoke("browser_tabs"));
  const panels = tabs.filter((x) => x.panel);
  t.check("question envoyée à la même page", panels.length === 1 && panels[0].id === panel.id, panels.map((x) => x.url));
  await ui.shot(path.join(process.env.TEMP, "calti-claude.png"));

  // Extensions désactivées : panneau fermé, page Claude détruite.
  await ui.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Général").click()`);
  await sleep(400);
  await ui.ev(`[...document.querySelectorAll(".ext")].find((b) => b.querySelector("strong").textContent === "Claude").click()`);
  await sleep(1200);
  tabs = await ui.ev(invoke("browser_tabs"));
  t.check("Claude désactivé : panneau fermé et page détruite", !tabs.some((x) => x.panel) && !(await ui.ev(`!!document.querySelector(".pane__panel--claude")`)), tabs.map((x) => x.url));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
