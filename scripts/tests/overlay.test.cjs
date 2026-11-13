// Mini-lecteur en bordure par-dessus la page : il ne prend plus de place, se place sur la zone des pages (haut,
// bas, droite), et la page native est découpée à sa place (même découpe que le lecteur flottant).
//   powershell -File scripts\tests\run.ps1 overlay.test.cjs
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;

async function open(chrome) {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: ${JSON.stringify(chrome)} }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  await sleep(800);
  return ui;
}

const geometry = (ui) => ui.ev(`(() => {
  const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
  return { page: r(document.querySelector(".pane__content")), player: r(document.querySelector("[data-media-dock]")),
    overlay: !!document.querySelector(".media-dock--overlay"), line: !!document.querySelector(".media-line") };
})()`);

(async () => {
  const base = { mediaFloat: true, playerStyle: "floating", playerWidth: "m", playerAlign: "center" };

  // Référence : lecteur en bas, dans le flux (la page lui fait place).
  let ui = await open({ ...base, mediaDock: "bottom", playerOverlay: false });
  const flow = await geometry(ui);
  ui.close();

  ui = await open({ ...base, mediaDock: "bottom", playerOverlay: true });
  await ui.ev(`${invoke("browser_open", { profile: "essai", url: "https://example.org/?dessous" })}`);
  await sleep(3000);
  const bottom = await geometry(ui);
  t.check("lecteur par-dessus la page", bottom.overlay);
  t.check("la page ne lui fait plus place", bottom.page.height > flow.page.height + 40, `${Math.round(flow.page.height)} → ${Math.round(bottom.page.height)} px`);
  t.check("en bas de la zone des pages, à 12 px", Math.abs(bottom.page.bottom - 12 - bottom.player.bottom) < 2 && bottom.player.top > bottom.page.top,
    `page ${Math.round(bottom.page.bottom)} / lecteur ${Math.round(bottom.player.bottom)}`);
  t.check("centré sur la page", Math.abs((bottom.player.left + bottom.player.right) / 2 - (bottom.page.left + bottom.page.right) / 2) < 2);

  // Menu du lecteur : l'option s'y trouve et se décoche.
  await ui.ev(`document.querySelector("[data-media-dock]").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 400, clientY: 400 }))`);
  await sleep(400);
  const item = await ui.ev(`[...document.querySelectorAll("[role=menuitemcheckbox], [role=menuitem]")].find((b) => b.textContent.includes("Par-dessus la page"))?.querySelector(".cmenu__check--on") ? "cochée" : "absente ou décochée"`);
  t.check("option dans le menu du lecteur, cochée", item === "cochée", item);
  await ui.ev(`[...document.querySelectorAll("[role=menuitemcheckbox], [role=menuitem]")].find((b) => b.textContent.includes("Par-dessus la page"))?.click()`);
  await sleep(800);
  const back = await geometry(ui);
  t.check("décochée : la page lui refait place", !back.overlay && Math.abs(back.page.height - flow.page.height) < 3, `${Math.round(back.page.height)} px`);
  ui.close();

  // Haut, collé à la page.
  ui = await open({ ...base, mediaDock: "top", playerStyle: "attached", playerOverlay: true });
  const top = await geometry(ui);
  t.check("en haut, collé au bord de la page", top.overlay && Math.abs(top.player.top - top.page.top) < 2, `page ${Math.round(top.page.top)} / lecteur ${Math.round(top.player.top)}`);
  ui.close();

  // Droite, bord renflé : sans liseré le long de la fenêtre.
  ui = await open({ ...base, mediaDock: "right", playerStyle: "edge", playerOverlay: true });
  await ui.ev(`${invoke("browser_open", { profile: "essai", url: "https://example.org/?droite" })}`);
  await sleep(3000);
  const right = await geometry(ui);
  t.check("à droite, collé au bord de la page", right.overlay && Math.abs(right.player.right - right.page.right) < 2, `page ${Math.round(right.page.right)} / lecteur ${Math.round(right.player.right)}`);
  t.check("pas de liseré au milieu de la fenêtre", !right.line);

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
