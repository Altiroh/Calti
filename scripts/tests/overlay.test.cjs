// Mini-lecteur en bordure par-dessus la page : il ne prend plus de place, se place sur la zone des pages (haut,
// bas, droite), et la page native est découpée à sa place (même découpe que le lecteur flottant).
//   powershell -File scripts\tests\run.ps1 overlay.test.cjs
const path = require("path");
const { execSync } = require("child_process");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
/** La page native est-elle visible en ces points (coordonnées de l'interface) ? Lu dans sa région Windows. */
const visible = (page, dpr, points) => JSON.parse(execSync(`powershell -NoProfile -File "${path.join(__dirname, "region.ps1")}" -CaltiPid ${process.env.CALTI_PID} -Points "${
  points.map(([x, y]) => `${Math.round((x - page.left) * dpr)},${Math.round((y - page.top) * dpr)}`).join(";")}"`).toString().trim());

async function open(chrome) {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.edge-rail", "1"); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: ${JSON.stringify(chrome)} }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  await sleep(800);
  return ui;
}

/** Ouvre une adresse par la barre d'adresse : l'onglet est créé et affiché. */
const go = async (ui, url) => {
  await ui.ev(`(() => { const input = document.querySelector(".pane__address input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(url)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.closest("form").requestSubmit(); })()`);
  await sleep(3500);
};

const geometry = (ui) => ui.ev(`(() => {
  const r = (el) => el && (({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height }))(el.getBoundingClientRect());
  return { page: r(document.querySelector(".pane__content")), player: r(document.querySelector("[data-media-dock]")),
    overlay: !!document.querySelector(".media-dock--overlay"), line: !!document.querySelector(".media-line"),
    lineRect: r(document.querySelector(".media-line")), dpr: devicePixelRatio };
})()`);

(async () => {
  const base = { mediaFloat: true, playerStyle: "floating", playerWidth: "m", playerAlign: "center" };

  // Référence : lecteur en bas, dans le flux (la page lui fait place).
  let ui = await open({ ...base, mediaDock: "bottom", playerOverlay: false });
  const flow = await geometry(ui);
  ui.close();

  ui = await open({ ...base, mediaDock: "bottom", playerOverlay: true });
  await go(ui, "https://example.org/?dessous");
  const bottom = await geometry(ui);
  t.check("lecteur par-dessus la page", bottom.overlay);
  t.check("la page ne lui fait plus place", bottom.page.height > flow.page.height + 40, `${Math.round(flow.page.height)} → ${Math.round(bottom.page.height)} px`);
  t.check("en bas de la zone des pages, à 12 px", Math.abs(bottom.page.bottom - 12 - bottom.player.bottom) < 2 && bottom.player.top > bottom.page.top,
    `page ${Math.round(bottom.page.bottom)} / lecteur ${Math.round(bottom.player.bottom)}`);
  t.check("centré sur la page", Math.abs((bottom.player.left + bottom.player.right) / 2 - (bottom.page.left + bottom.page.right) / 2) < 2);
  {
    const p = bottom.player, cx = (p.left + p.right) / 2, cy = (p.top + p.bottom) / 2;
    const seen = visible(bottom.page, bottom.dpr, [[cx, cy], [cx, p.top - 20]]);
    t.check("page découpée sous le lecteur, visible au-dessus", JSON.stringify(seen) === "[false,true]", JSON.stringify(seen));
  }

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

  // Haut : même allure que la barre latérale, quels que soient les réglages du lecteur dans le flux.
  ui = await open({ ...base, mediaDock: "top", playerStyle: "attached", playerOverlay: true, playerRadius: 36, railStyle: "floating", railSurface: "glass", railRadius: 22 });
  const top = await geometry(ui);
  t.check("en haut de la page, à 12 px", top.overlay && Math.abs(top.player.top - 12 - top.page.top) < 2, `page ${Math.round(top.page.top)} / lecteur ${Math.round(top.player.top)}`);
  const looks = await ui.ev(`(() => { const s = (el) => { const cs = getComputedStyle(el); return { radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, shadow: cs.boxShadow, blur: cs.backdropFilter }; };
    return { rail: s(document.querySelector(".rail")), player: s(document.querySelector(".media-dock--overlay")) }; })()`);
  t.check("arrondi de la barre latérale", looks.player.radius === looks.rail.radius, `${looks.player.radius} / barre ${looks.rail.radius}`);
  t.check("verre, ombre et flou de la barre latérale", looks.player.bg === looks.rail.bg && looks.player.shadow === looks.rail.shadow && looks.player.blur === looks.rail.blur,
    JSON.stringify(looks));
  // Réglages ouverts : le lecteur suit tout de suite (taille, alignement), et les options sans effet par-dessus la
  // page (style, fond, opacité, arrondi) ne sont pas proposées.
  const click = (text) => ui.ev(`(() => { const b = [...document.querySelectorAll("button, [role=tab]")].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); b?.click(); return !!b; })()`);
  await ui.ev(`document.querySelector("[aria-label='Réglages'], [title^='Réglages']")?.click()`);
  await sleep(700);
  await click("Apparence");
  await sleep(700);
  const before = await geometry(ui);
  await click("Petit");
  await sleep(400);
  await click("À gauche");
  await sleep(400);
  const after = await geometry(ui);
  t.check("taille et alignement appliqués en direct", after.player.width < before.player.width - 100 && Math.abs(after.player.left - 12 - after.page.left) < 2,
    `${Math.round(before.player.width)} → ${Math.round(after.player.width)} px, gauche ${Math.round(after.player.left - after.page.left)} px`);
  const hidden = await ui.ev(`(() => { const group = [...document.querySelectorAll(".sgroup")].find((g) => g.querySelector(".sgroup__title")?.textContent === "Mini-lecteur");
    return !!group && !["Collé au bord", "Sans fond", "Opacité", "Arrondi"].some((label) => [...group.querySelectorAll(".sgroup__body *")].some((x) => !x.children.length && x.textContent.trim() === label)); })()`);
  t.check("options sans effet masquées", hidden);
  ui.close();

  // Droite, bord renflé : collé au bord droit de la page, liseré le long de la page (pas de la fenêtre).
  ui = await open({ ...base, mediaDock: "right", playerStyle: "edge", playerOverlay: true });
  await go(ui, "https://example.org/?droite");
  const right = await geometry(ui);
  t.check("à droite, collé au bord de la page", right.overlay && Math.abs(right.player.right - right.page.right) < 1, `page ${Math.round(right.page.right)} / lecteur ${Math.round(right.player.right)}`);
  t.check("liseré le long du bord droit de la page", right.line && Math.abs(right.lineRect.right - right.page.right) < 1 && Math.abs(right.lineRect.height - right.page.height) < 1,
    JSON.stringify(right.lineRect));

  // Bord renflé par-dessus la page : liseré le long du bas de la page, lecteur collé, congés ; découpe exacte.
  ui = await open({ ...base, mediaDock: "bottom", playerOverlay: true, playerStyle: "edge", playerEdgeSurface: "color", playerRadius: 20 });
  await go(ui, "https://example.org/?renfle");
  const edge = await geometry(ui);
  t.check("bord renflé : liseré le long du bas de la page", edge.line && Math.abs(edge.lineRect.bottom - edge.page.bottom) < 1 && Math.abs(edge.lineRect.width - edge.page.width) < 1,
    JSON.stringify(edge.lineRect));
  t.check("bord renflé : lecteur collé au bas de la page", Math.abs(edge.player.bottom - edge.page.bottom) < 1, `page ${Math.round(edge.page.bottom)} / lecteur ${Math.round(edge.player.bottom)}`);
  {
    const p = edge.player, c = 20, l = 6;
    const points = {
      "centre du lecteur": [[(p.left + p.right) / 2, (p.top + p.bottom) / 2], false],
      "liseré, loin du lecteur": [[edge.page.left + 30, edge.page.bottom - 3], false],
      "page au-dessus": [[(p.left + p.right) / 2, p.top - 30], true],
      "coin bas du lecteur (droit)": [[p.left + 1.5, p.bottom - l - 1.5], false],
      "coin haut du lecteur (arrondi)": [[p.left + 1.5, p.top + 1.5], true],
      "congé, côté lecteur": [[p.left - 1.5, p.bottom - l - 1.5], false],
      "congé, creux du quart de cercle": [[p.left - c + 2, p.bottom - l - c + 2], true],
    };
    const seen = visible(edge.page, edge.dpr, Object.values(points).map(([pt]) => pt));
    const wrong = Object.keys(points).filter((k, i) => seen[i] !== points[k][1]);
    t.check("bord renflé : découpe exacte (lecteur, liseré, congés)", seen.length && !wrong.length, wrong.join(" · ") || "ok");
  }
  const click2 = (text) => ui.ev(`(() => { const b = [...document.querySelectorAll("button, [role=tab]")].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); b?.click(); return !!b; })()`);
  await ui.ev(`document.querySelector("[aria-label='Réglages'], [title^='Réglages']")?.click()`);
  await sleep(700);
  await click2("Apparence");
  await sleep(700);
  t.check("réglages : bord renflé proposé par-dessus la page, avec ses couleurs", await ui.ev(`(() => { const g = [...document.querySelectorAll(".sgroup")].find((x) => x.querySelector(".sgroup__title")?.textContent === "Mini-lecteur");
    const labels = [...(g?.querySelectorAll(".sgroup__body button") ?? [])].map((b) => b.textContent.trim()); return labels.includes("Bord renflé") && labels.includes("Couleur") && !labels.includes("Collé au bord"); })()`));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
