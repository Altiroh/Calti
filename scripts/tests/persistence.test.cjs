// Premier lancement sans profil, puis copie de sécurité : le stockage de WebView2 vidé (arrêt brutal) est repris
// depuis le fichier etat.json au lancement suivant.
//   powershell -File scripts\tests\run.ps1 persistence.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const setInput = (selector, value) => `(() => { const i = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`;

(async () => {
  let ui = await connect();
  const rendered = async () => { for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".welcome__card, .pane__bar")`)); i++) await sleep(250); };
  await rendered();
  t.check("premier lancement : écran de création du profil", await ui.ev(`!!document.querySelector(".welcome__card")`));
  t.check("aucun profil créé d'office", await ui.ev(`JSON.parse(localStorage.getItem("calti.settings.v3") ?? '{"profileOrder":[]}').profileOrder.length === 0`));

  await ui.ev(setInput(".welcome__name", "Essai"));
  await ui.ev(`document.querySelectorAll(".welcome__color")[3].click()`);
  await sleep(200);
  await ui.ev(`document.querySelector(".welcome__go").click()`);
  await sleep(1500);
  const settings = await ui.ev(`JSON.parse(localStorage.getItem("calti.settings.v3"))`);
  t.check("profil créé avec son nom et sa couleur", settings.profileOrder[0] === "essai" && settings.profiles.essai.color === "#3f9b5c", settings.profiles);
  t.check("navigateur affiché après la création", await ui.ev(`!document.querySelector(".welcome") && !!document.querySelector(".pane__bar")`));

  // Une donnée de plus, puis attente de la copie (toutes les 3 s).
  await ui.ev(`localStorage.setItem("calti.searches.essai", JSON.stringify(["témoin de copie"]))`);
  await sleep(4000);
  const file = path.join(process.env.WEBVIEW2_USER_DATA_FOLDER, "etat.json");
  const copy = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  t.check("copie de sécurité écrite dans le dossier de l'instance", copy?.data?.["calti.searches.essai"]?.includes("témoin"), copy ? Object.keys(copy.data) : "absente");

  // Stockage perdu (comme après l'arrêt brutal) : tout vidé, puis relance de l'interface.
  await ui.ev(`localStorage.clear(); location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  await rendered();
  t.check("stockage repris depuis la copie au lancement", (await ui.ev(`localStorage.getItem("calti.searches.essai") ?? ""`)).includes("témoin"));
  t.check("profil retrouvé, pas d'écran de création", await ui.ev(`!document.querySelector(".welcome") && JSON.parse(localStorage.getItem("calti.settings.v3")).profileOrder[0] === "essai"`));

  // Cas du 5 novembre : WebView2 repart d'un stockage neuf, Calti y écrit des réglages vides et un numéro de
  // génération plus récent que la copie. La copie (avec profils) doit quand même être reprise, et jamais écrasée.
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: {}, profileOrder: [] }));
    localStorage.setItem("calti.state.gen", String(Date.now() + 86400000));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  await rendered();
  t.check("stockage vide plus « récent » : profils repris depuis la copie", await ui.ev(`!document.querySelector(".welcome") && JSON.parse(localStorage.getItem("calti.settings.v3")).profileOrder[0] === "essai"`));
  await sleep(3500);
  const after = JSON.parse(fs.readFileSync(file, "utf8"));
  t.check("copie toujours avec ses profils", JSON.parse(after.data["calti.settings.v3"]).profileOrder[0] === "essai" && after.gen >= before.gen);
  // Copie sans profil envoyée directement : refusée par Calti.
  const refused = await ui.ev(`window.__TAURI_INTERNALS__.invoke("state_save", { data: JSON.stringify({ calti: 1, gen: Date.now() + 9e9, saved: "", data: { "calti.settings.v3": JSON.stringify({ profileOrder: [] }) } }) }).then(() => false, () => true)`);
  t.check("copie sans profil refusée", refused && JSON.parse(JSON.parse(fs.readFileSync(file, "utf8")).data["calti.settings.v3"]).profileOrder.length === 1);
  const journal = fs.readFileSync(path.join(process.env.WEBVIEW2_USER_DATA_FOLDER, "etat.log"), "utf8");
  t.check("journal de la copie tenu", /copie reprise \(profils perdus\)/.test(journal) && /refusée/.test(journal), journal.split("\n").slice(-4).join(" | "));

  t.report();
  process.exit();
})().catch((e) => {
  console.error("✘ scénario interrompu :", e.message);
  process.exit(1);
});
