// Navigation privée : fenêtre dédiée (Ctrl+Maj+N), onglets InPrivate (cookies à part, oubliés à la fermeture), ni
// historique, ni session, ni zoom mémorisé ; pastille dans la barre du haut.
//   powershell -File scripts\tests\run.ps1 private.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const isPrivateUi = (p) => /^http:\/\/tauri\.localhost\/index\.html\?profile=essai&private=1$/.test(p.url);
const zoomFile = path.join(process.env.WEBVIEW2_USER_DATA_FOLDER, "zoom.json");
const SITE = "https://example.org/";

async function waitTab(ui, match) {
  for (let i = 0; i < 60; i++) {
    const tab = (await ui.ev(`${invoke("browser_tabs")}`)).find(match);
    if (tab && !tab.loading) return tab;
    await sleep(250);
  }
  return null;
}

/** Cookies vus par la page de l'onglet (recopiés dans son titre). */
async function cookiesOf(ui, id) {
  await ui.ev(`${invoke("browser_eval", { id, script: `document.title = "c:" + document.cookie` })}`);
  for (let i = 0; i < 20; i++) {
    const tab = (await ui.ev(`${invoke("browser_tabs")}`)).find((x) => x.id === id);
    if (tab?.title.startsWith("c:")) return tab.title;
    await sleep(150);
  }
  return "";
}

async function openPrivateWindow(ui) {
  await ui.ev(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "N", ctrlKey: true, shiftKey: true }))`);
  const priv = await connect(isPrivateUi, 45000).catch(() => null);
  if (priv) for (let i = 0; i < 40 && !(await priv.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  return priv;
}

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  const mark = Date.now().toString(36);

  await ui.ev(`${invoke("browser_open", { profile: "essai", url: `${SITE}?normal-${mark}` })}`);
  const normal = await waitTab(ui, (x) => x.url.includes(`normal-${mark}`));
  await ui.ev(`${invoke("browser_eval", { id: normal.id, script: `document.cookie = "calti_normal_${mark}=1; max-age=3600; path=/"` })}`);

  let priv = await openPrivateWindow(ui);
  t.check("Ctrl+Maj+N ouvre une fenêtre privée", !!priv);
  if (!priv) {
    const list = await (await fetch(`http://127.0.0.1:${process.env.CALTI_CDP_PORT ?? 9334}/json`)).json();
    console.log("pages :", list.map((x) => x.type + " " + x.url).join(" | "));
    console.log("erreur :", await ui.ev(`document.querySelector(\".error, [role=alert]\")?.textContent ?? \"\"`));
    t.report(); process.exit(1);
  }
  t.check("pastille « Privée » affichée", await priv.ev(`document.querySelector(".private-badge")?.textContent ?? ""`) === "Privée");
  t.check("décor de la fenêtre privée", await priv.ev(`document.querySelector("[data-private]") != null`));

  await priv.ev(`${invoke("browser_open", { profile: "essai", url: `${SITE}?prive-${mark}` })}`);
  const secret = await waitTab(ui, (x) => x.url.includes(`prive-${mark}`));
  t.check("onglet de la fenêtre privée marqué privé", secret?.private === true && secret.window.startsWith("calti-prive-"), secret?.window);
  t.check("onglet normal non privé", normal.private === false);
  await priv.ev(`${invoke("browser_eval", { id: secret.id, script: `document.cookie = "calti_prive_${mark}=1; max-age=3600; path=/"` })}`);
  await priv.ev(`${invoke("browser_action", { id: secret.id, action: "zoom-in" })}`);
  await sleep(800);

  // Cookies : chaque côté ne voit que les siens ; deux onglets privés partagent les leurs.
  const inPrivate = await cookiesOf(ui, secret.id);
  t.check("l'onglet privé ne voit pas les cookies normaux", inPrivate.includes(`calti_prive_${mark}`) && !inPrivate.includes(`calti_normal_${mark}`), inPrivate);
  await ui.ev(`${invoke("browser_open", { profile: "essai", url: `${SITE}?normal2-${mark}` })}`);
  const normal2 = await waitTab(ui, (x) => x.url.includes(`normal2-${mark}`));
  const inNormal = await cookiesOf(ui, normal2.id);
  t.check("un onglet normal ne voit pas les cookies privés", inNormal.includes(`calti_normal_${mark}`) && !inNormal.includes(`calti_prive_${mark}`), inNormal);
  await priv.ev(`${invoke("browser_open", { profile: "essai", url: `${SITE}?prive2-${mark}` })}`);
  const secret2 = await waitTab(ui, (x) => x.url.includes(`prive2-${mark}`));
  t.check("les onglets privés partagent leurs cookies", (await cookiesOf(ui, secret2.id)).includes(`calti_prive_${mark}`));

  const history = await ui.ev(`localStorage.getItem("calti.history.essai") ?? ""`);
  t.check("onglet normal dans l'historique (contrôle)", history.includes(`normal-${mark}`));
  t.check("onglets privés absents de l'historique", !history.includes(`prive-${mark}`) && !history.includes(`prive2-${mark}`));
  const sessions = await ui.ev(`Object.keys(localStorage).filter((k) => k.startsWith("calti.browser")).map((k) => k + "=" + localStorage.getItem(k)).join("\\n")`);
  t.check("ni session de fenêtre privée, ni onglet privé enregistrés", !sessions.includes("calti-prive") && !sessions.includes(`prive-${mark}`));
  const zooms = fs.existsSync(zoomFile) ? fs.readFileSync(zoomFile, "utf8") : "";
  t.check("zoom d'un onglet privé non mémorisé", !zooms.includes("example.org"), zooms.slice(0, 120));

  await priv.ev(`${invoke("browser_close", { id: secret.id })}`);
  await sleep(500);
  const closed = await ui.ev(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => /closed/i.test(k)).map((k) => [k, localStorage.getItem(k)])))`);
  t.check("onglet privé absent des onglets fermés", !closed.includes(`prive-${mark}`));

  // Fenêtre privée fermée : sa session privée est oubliée.
  await priv.ev(`window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label: null }).catch(() => window.close())`).catch(() => {});
  priv.close();
  for (let i = 0; i < 40 && (await ui.ev(`${invoke("browser_tabs")}`)).some((x) => x.private); i++) await sleep(250);
  await sleep(1500);
  priv = await openPrivateWindow(ui);
  await priv.ev(`${invoke("browser_open", { profile: "essai", url: `${SITE}?prive3-${mark}` })}`);
  const secret3 = await waitTab(ui, (x) => x.url.includes(`prive3-${mark}`));
  t.check("cookies privés oubliés à la fermeture de la fenêtre", !(await cookiesOf(ui, secret3.id)).includes(`calti_prive_${mark}`));

  t.report();
  priv.close();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
