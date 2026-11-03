// Fonctions de navigateur : onglets fermés, Ctrl+1…9, palette, zoom par site, son, blocage, téléchargements,
// autorisations, effacement des données, liens reçus au lancement.
//   powershell -File scripts\tests\run.ps1 features.test.cjs -AppArgs https://example.org/?lancement
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const key = (k, mods = {}) => `window.dispatchEvent(new KeyboardEvent("keydown", ${JSON.stringify({ key: k, ...mods })}))`;

(async () => {
  let ui = await connect();
  // Réglages d'essai : un seul profil jetable, blocage actif.
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  const tabs = () => ui.ev(`${invoke("browser_tabs")}`);
  const tabOf = async (part) => (await tabs()).find((x) => x.url.includes(part));

  // Lien passé en argument au lancement (navigateur par défaut).
  const launched = await tabOf("?lancement");
  t.check("lien reçu au lancement ouvert dans un onglet", process.argv.includes("--no-launch") || launched, launched?.url ?? "aucun");

  // Onglets : ouverture, Ctrl+2, fermeture (Ctrl+W) puis Ctrl+Maj+T.
  for (const q of ["un", "deux", "trois"]) await ui.ev(`${invoke("browser_open", { profile: "essai", url: `https://example.com/?${q}` })}`);
  await sleep(2500);
  await ui.ev(key("é", { code: "Digit2", ctrlKey: true }));
  await sleep(400);
  const second = (await tabs()).filter((x) => x.profile === "essai")[1];
  t.check("Ctrl+2 affiche le deuxième onglet", await ui.ev(`!!document.querySelector('[data-tab="${second.id}"].ptab--active')`), second.url);
  await ui.ev(key("w", { ctrlKey: true }));
  await sleep(800);
  t.check("Ctrl+W ferme l'onglet affiché", !(await tabs()).some((x) => x.id === second.id));
  t.check("onglet fermé mémorisé", (await ui.ev(`localStorage.getItem("calti.closed") ?? ""`)).includes(second.url));
  await ui.ev(key("T", { ctrlKey: true, shiftKey: true }));
  await sleep(1500);
  t.check("Ctrl+Maj+T rouvre l'onglet fermé", (await tabs()).some((x) => x.url === second.url));

  // Palette de commandes.
  await ui.ev(key("k", { ctrlKey: true }));
  await sleep(500);
  t.check("Ctrl+K ouvre la palette", await ui.ev(`!!document.querySelector(".palette input")`));
  const entries = await ui.ev(`document.querySelectorAll(".palette__item").length`);
  t.check("la palette propose onglets et commandes", entries >= 8, `${entries} entrées`);
  await ui.ev(`(() => { const i = document.querySelector(".palette input"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "téléch"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(300);
  t.check("la palette filtre les commandes", (await ui.ev(`document.querySelector(".palette__item--on .palette__title")?.textContent`)) === "Téléchargements");
  await ui.ev(`document.querySelector(".palette__item--on").click()`);
  await sleep(500);
  t.check("la commande choisie ouvre le panneau des téléchargements", await ui.ev(`!!document.querySelector(".drawer--open")?.textContent.includes("Téléchargements")`));
  await ui.ev(key("j", { ctrlKey: true }));

  // Zoom mémorisé par site.
  // Zoom retenu lors d'un essai précédent (le fichier zoom.json est commun) : oublié d'abord.
  await ui.ev(`${invoke("zoom_set", { site: "essai|example.com", factor: null })}`);
  await sleep(500);
  const one = await tabOf("?un");
  await ui.ev(`${invoke("browser_action", { id: one.id, action: "zoom-in" })}`);
  await sleep(600);
  t.check("zoom de l'onglet suivi", Math.abs((await tabOf("?un")).zoom - 1.1) < 0.01, (await tabOf("?un")).zoom);
  const other = await ui.ev(`${invoke("browser_open", { profile: "essai", url: "https://example.com/?autre" })}`);
  await ui.ev(`${invoke("browser_layout", { visible: [{ id: other, x: 0, y: 0, width: 800, height: 600 }] })}`);
  await sleep(2500);
  t.check("même site : zoom réappliqué", Math.abs((await tabOf("?autre")).zoom - 1.1) < 0.01, (await tabOf("?autre")).zoom);
  const page = await connect((p) => p.url.includes("?un"));
  await page.ev(`document.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }))`);
  page.close();
  await sleep(800);
  t.check("Ctrl+molette zoome la page", Math.abs((await tabOf("?un")).zoom - 1.25) < 0.01, (await tabOf("?un")).zoom);

  // Son coupé.
  await ui.ev(`${invoke("browser_action", { id: one.id, action: "mute" })}`);
  await sleep(500);
  t.check("son de l'onglet coupé", (await tabOf("?un")).muted === true);

  // Blocage : requête vers un traqueur depuis la page, compteur de l'onglet.
  await ui.ev(`${invoke("browser_layout", { visible: [{ id: one.id, x: 0, y: 0, width: 800, height: 600 }] })}`);
  await sleep(500);
  await ui.ev(`${invoke("browser_eval", { id: one.id, script: `["https://www.google-analytics.com/analytics.js","https://securepubads.g.doubleclick.net/tag/js/gpt.js"].forEach((src) => { const s = document.createElement("script"); s.src = src; document.head.append(s); })` })}`);
  await sleep(1500);
  const blocked = (await tabOf("?un")).blocked;
  t.check("publicités et traqueurs bloqués", blocked >= 2, `${blocked} bloqué(s)`);

  // Téléchargement (fichier généré par la page).
  await ui.ev(`${invoke("browser_eval", { id: one.id, script: `(() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["essai Calti"], { type: "text/plain" })); a.download = "calti-essai.txt"; document.body.append(a); a.click(); })()` })}`);
  let downloads = [];
  for (let i = 0; i < 20 && !downloads.some((d) => d.state === "done"); i++) {
    await sleep(400);
    downloads = await ui.ev(`${invoke("downloads_list")}`);
  }
  const done = downloads.find((d) => d.state === "done");
  t.check("téléchargement suivi jusqu'au bout", done, done ? `${done.path} (${done.received} o)` : downloads);
  if (done) {
    require("fs").rmSync(done.path, { force: true });
    await ui.ev(`${invoke("downloads_clear")}`);
  }

  // Données du profil.
  const perms = await ui.ev(`${invoke("site_permissions", { profile: "essai" })}.then((l) => l.length).catch((e) => "ERR " + e)`);
  t.check("autorisations des sites lisibles", typeof perms === "number", perms);
  const cleared = await ui.ev(`${invoke("clear_browsing_data", { profile: "essai", kinds: ["cache"] })}.then(() => "ok").catch((e) => "ERR " + e)`);
  t.check("cache du profil effacé", cleared === "ok", cleared);

  // Réglages du zoom : le site apparaît, puis est oublié.
  const zs = await ui.ev(`${invoke("zoom_settings")}`);
  t.check("site listé dans les réglages du zoom", zs.sites.some(([p, h]) => p === "essai" && h === "example.com"), zs);
  await ui.ev(`${invoke("zoom_set", { site: "essai|example.com", factor: null })}`);
  await sleep(500);
  t.check("site oublié : zoom par défaut réappliqué", (await tabOf("?un")).zoom === 1, (await tabOf("?un")).zoom);

  t.report();
  process.exit();
})().catch((e) => {
  console.error("✘ scénario interrompu :", e.message);
  process.exit(1);
});
