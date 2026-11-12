// Images enregistrées en fichiers WebP : reprise des images d'une version précédente, relecture depuis le fichier
// quand IndexedDB est perdu, suppression, clés refusées.
//   powershell -File scripts\tests\run.ps1 images.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const dir = path.join(process.env.WEBVIEW2_USER_DATA_FOLDER, "images");
const file = (key) => path.join(dir, `${key}.webp`);
const idb = (body) => `new Promise((ok, ko) => { const r = indexedDB.open("calti", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("backgrounds");
  r.onsuccess = () => { const db = r.result; const s = db.transaction("backgrounds", "readwrite").objectStore("backgrounds"); ${body} };
  r.onerror = () => ko(r.error); })`;

async function ready() {
  const ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  return ui;
}

(async () => {
  let ui = await connect();
  // Version précédente : un fond et une photo de profil en JPEG, seulement dans IndexedDB.
  await ui.ev(`(async () => {
    localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { background: 1 }, profiles: { essai: { name: "Essai", image: 1 } }, profileOrder: ["essai"] }));
    const c = document.createElement("canvas"); c.width = 1600; c.height = 1000;
    const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 1600, 1000);
    grad.addColorStop(0, "#1e3a8a"); grad.addColorStop(1, "#f59e0b"); g.fillStyle = grad; g.fillRect(0, 0, 1600, 1000);
    for (let i = 0; i < 400; i++) { g.fillStyle = "hsl(" + (i * 37 % 360) + " 70% 60%)"; g.fillRect((i * 97) % 1600, (i * 53) % 1000, 30, 30); }
    const jpeg = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
    window.__jpegSize = jpeg.size;
    await ${idb(`s.put(jpeg, "app"); s.put(jpeg, "profile-essai"); s.put(jpeg, "clip-1"); s.transaction.oncomplete = () => { db.close(); ok(); };`)};
    location.reload();
  })()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await ready();
  for (let i = 0; i < 40 && !(fs.existsSync(file("app")) && fs.existsSync(file("profile-essai"))); i++) await sleep(250);

  t.check("fond recopié en fichier", fs.existsSync(file("app")));
  t.check("photo de profil recopiée en fichier", fs.existsSync(file("profile-essai")));
  t.check("presse-papiers non recopié", !fs.existsSync(file("clip-1")));
  const head = fs.existsSync(file("app")) ? fs.readFileSync(file("app")) : Buffer.alloc(0);
  t.check("fichier au format WebP", head.slice(0, 4).toString() === "RIFF" && head.slice(8, 12).toString() === "WEBP");
  const avatar = fs.existsSync(file("profile-essai")) ? fs.statSync(file("profile-essai")).size : 0;
  t.check("photo de profil réduite (256 px)", avatar > 0 && avatar < 40_000, `${avatar} o`);
  const cached = await ui.ev(`${idb(`const q = s.get("app"); q.onsuccess = () => { db.close(); ok(q.result?.type); };`)}`);
  t.check("cache remplacé par le WebP", cached === "image/webp", cached);

  // IndexedDB perdu : le fond revient depuis son fichier.
  await ui.ev(`${idb(`s.clear(); s.transaction.oncomplete = () => { db.close(); ok(); };`)}`);
  await ui.ev(`location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await ready();
  let shown = "";
  for (let i = 0; i < 20 && !shown; i++) { shown = await ui.ev(`document.querySelector(".scenery__image")?.style.backgroundImage ?? ""`); if (!shown) await sleep(250); }
  t.check("fond affiché après perte d'IndexedDB", shown.includes("blob:"), shown);
  const back = await ui.ev(`${idb(`const q = s.get("app"); q.onsuccess = () => { db.close(); ok(q.result?.size ?? 0); };`)}`);
  t.check("fond remis en cache", back > 0, back);

  // Commandes : enregistrement brut, lecture, suppression, clés refusées.
  const sizes = await ui.ev(`(async () => {
    const i = window.__TAURI_INTERNALS__;
    await i.invoke("image_save", new Uint8Array([1, 2, 3, 4, 5]), { headers: { key: "essai-1" } });
    const read = await i.invoke("image_load", { key: "essai-1" });
    const none = await i.invoke("image_load", { key: "absente" });
    const list = await i.invoke("image_list");
    return [read.byteLength, none.byteLength, list.includes("essai-1")];
  })()`);
  t.check("enregistrement et relecture", JSON.stringify(sizes) === "[5,0,true]", sizes);
  await ui.ev(`window.__TAURI_INTERNALS__.invoke("image_delete", { key: "essai-1" })`);
  t.check("suppression du fichier", !fs.existsSync(file("essai-1")));
  const refused = await ui.ev(`window.__TAURI_INTERNALS__.invoke("image_load", { key: "../etat" }).then(() => "lu", (e) => String(e))`);
  t.check("clé hors du dossier refusée", refused.includes("invalide"), refused);

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
