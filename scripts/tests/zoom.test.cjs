// Zoom mémorisé par site : une valeur aberrante (0,12 %, signalée par la visionneuse de PDF de Google) est écartée,
// les zooms valides sont gardés.
//   powershell -File scripts\tests\run.ps1 zoom.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const go = (url) => `(() => { const i = document.querySelector(".pane__address input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(url)}); i.dispatchEvent(new Event("input", { bubbles: true })); i.closest("form").requestSubmit(); })()`;
const zoomOf = (host) => `window.__TAURI_INTERNALS__.invoke("browser_tabs").then((tabs) => tabs.find((t) => t.url.includes(${JSON.stringify(host)}))?.zoom)`;

(async () => {
  const file = path.join(process.env.WEBVIEW2_USER_DATA_FOLDER, "zoom.json");
  fs.writeFileSync(file, JSON.stringify({ "essai|example.org": 0.0012453300124533001, "essai|example.com": 1.5 }));
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);

  await ui.ev(go("https://example.org/"));
  await sleep(2500);
  const z1 = await ui.ev(zoomOf("example.org"));
  t.check("zoom aberrant écarté : page à 100 %", Math.abs(z1 - 1) < 0.01, z1);
  t.check("barre : 0 % n'est plus affiché", !(await ui.ev(`document.querySelector(".pane__bar")?.textContent.includes("0 %")`)));
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  t.check("fichier des zooms nettoyé, zoom valide gardé", !("essai|example.org" in saved) && saved["essai|example.com"] === 1.5, saved);

  await ui.ev(go("https://example.com/"));
  await sleep(2500);
  const z2 = await ui.ev(zoomOf("example.com"));
  t.check("zoom valide d'un site toujours appliqué (150 %)", Math.abs(z2 - 1.5) < 0.01, z2);

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
