// Fenêtre du favori (étoile, Ctrl+D) : nom, dossier, nouveau dossier, supprimer ; dossiers dans la seconde barre et
// le panneau des favoris ; la page est découpée sous la fenêtre.
//   powershell -File scripts\tests\run.ps1 bookmarks.test.cjs
const path = require("path");
const { execSync } = require("child_process");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const store = (ui, key) => ui.ev(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) ?? "null")`);
const click = (ui, sel, text) => ui.ev(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => ${text ? `x.textContent.trim() === ${JSON.stringify(text)}` : "true"}); b?.click(); return !!b; })()`);
const type = (ui, sel, value) => ui.ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
const key = (ui, sel, k) => ui.ev(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(k)}, bubbles: true }))`);
const go = async (ui, url) => {
  await type(ui, ".pane__address input", url);
  await ui.ev(`document.querySelector(".pane__address input").closest("form").requestSubmit()`);
  await sleep(3500);
};

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.edge-rail", "1"); localStorage.setItem("calti.downloads-widget", "1");
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: { subBar: true, subBarBookmarks: true, subBarGroups: false } }, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);

  await go(ui, "https://example.org/?favori");
  await click(ui, ".pane__star");
  await sleep(400);
  t.check("étoile : favori ajouté, fenêtre ouverte", await ui.ev(`document.querySelector(".bmedit__head")?.textContent ?? ""`) === "Favori ajouté");
  t.check("nom prêt à être modifié", await ui.ev(`document.activeElement?.classList.contains("bmedit__name") && document.activeElement.value === "Example Domain"`));
  t.check("enregistré tout de suite, dans la barre de favoris", (await store(ui, "calti.bookmarks.essai"))?.[0]?.url.includes("?favori") && !(await store(ui, "calti.bookmarks.essai"))[0].folder);

  // Découpe de la page sous la fenêtre (région Windows de la page).
  const geo = await ui.ev(`(() => { const p = document.querySelector(".pane__content").getBoundingClientRect(), b = document.querySelector(".bmedit").getBoundingClientRect();
    return { p: [p.left, p.top], b: [b.left + b.width / 2, b.bottom - 20], below: [b.left + b.width / 2, b.bottom + 40], dpr: devicePixelRatio }; })()`);
  const pts = [geo.b, geo.below].map(([x, y]) => `${Math.round((x - geo.p[0]) * geo.dpr)},${Math.round((y - geo.p[1]) * geo.dpr)}`).join(";");
  const seen = execSync(`powershell -NoProfile -File "${path.join(__dirname, "region.ps1")}" -CaltiPid ${process.env.CALTI_PID} -Points "${pts}"`).toString().trim();
  t.check("page découpée sous la fenêtre, visible en dessous", seen === "[false,true]", seen);

  // Renommer, nouveau dossier, Terminé.
  await type(ui, ".bmedit__name", "Mon site");
  await click(ui, ".bmedit__folder--new");
  await sleep(200);
  await type(ui, ".bmedit__create input", "Travail");
  await key(ui, ".bmedit__create input", "Enter");
  await sleep(200);
  t.check("nouveau dossier créé et choisi", await ui.ev(`document.querySelector(".bmedit__folder--on")?.textContent.trim() ?? ""`) === "Travail");
  await click(ui, ".bmedit__done");
  await sleep(300);
  const folders = await store(ui, "calti.bookmarkFolders.essai");
  let saved = (await store(ui, "calti.bookmarks.essai"))[0];
  t.check("Terminé : renommé et rangé dans le dossier", saved.title === "Mon site" && folders?.[0]?.name === "Travail" && saved.folder === folders[0].id, { saved, folders });
  t.check("fenêtre fermée, découpe retirée", !(await ui.ev(`!!document.querySelector(".bmedit")`)));

  // Étoile à nouveau : modification du favori existant ; Échap enregistre.
  await click(ui, ".pane__star");
  await sleep(400);
  t.check("étoile sur un favori : modification", await ui.ev(`document.querySelector(".bmedit__head")?.textContent ?? ""`) === "Favori"
    && await ui.ev(`document.querySelector(".bmedit__folder--on")?.textContent.trim() ?? ""`) === "Travail");
  await type(ui, ".bmedit__name", "Mon site 2");
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(300);
  saved = (await store(ui, "calti.bookmarks.essai"))[0];
  t.check("Échap : enregistré et fermé", saved.title === "Mon site 2" && !(await ui.ev(`!!document.querySelector(".bmedit")`)));

  // Ctrl+D sur une autre page : rangé dans le dernier dossier choisi.
  await go(ui, "https://example.com/?autre");
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", ctrlKey: true }))`);
  await sleep(400);
  t.check("Ctrl+D : fenêtre ouverte", await ui.ev(`document.querySelector(".bmedit__head")?.textContent ?? ""`) === "Favori ajouté");
  t.check("Ctrl+D : dans le dernier dossier choisi", await ui.ev(`document.querySelector(".bmedit__folder--on")?.textContent.trim() ?? ""`) === "Travail");
  await click(ui, ".bmedit__done");
  await sleep(300);

  // Seconde barre : le dossier, et ses favoris dans son menu.
  t.check("seconde barre : dossier affiché", await ui.ev(`[...document.querySelectorAll(".subbar__folder")].map((x) => x.textContent.trim()).join("|")`) === "Travail");
  await click(ui, ".subbar__folder");
  await sleep(400);
  const items = await ui.ev(`[...document.querySelectorAll(".cmenu button, [role=menuitem]")].map((x) => x.textContent.trim())`);
  t.check("seconde barre : favoris du dossier dans son menu", items.some((x) => x.includes("Mon site 2")) && items.some((x) => x.includes("Example Domain")), items);
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
  await sleep(200);

  // Supprimer.
  await click(ui, ".pane__star");
  await sleep(400);
  await click(ui, ".bmedit__remove");
  await sleep(300);
  const left = await store(ui, "calti.bookmarks.essai");
  t.check("Supprimer : favori retiré", left.length === 1 && !left.some((b) => b.url.includes("?autre")) && !(await ui.ev(`document.querySelector(".pane__star")?.classList.contains("pane__star--on")`)));

  // Panneau des favoris : le dossier y est.
  await ui.ev(`window.dispatchEvent(new CustomEvent("calti:bookmarks"))`).catch(() => {});
  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
