// Onglet ouvert depuis une page (clic molette, Ctrl+clic) : juste après l'onglet d'origine ; les suivants à la suite.
//   powershell -File scripts\tests\run.ps1 tabplace.test.cjs
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const invoke = (cmd, args = {}) => `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`;
const order = async (ui) => (await ui.ev(`${invoke("browser_tabs")}`)).filter((x) => !x.panel).map((x) => (x.url.match(/\?([a-z0-9-]+)/) ?? [])[1] ?? "?");

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear(); localStorage.setItem("calti.edge-rail", "1"); localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] })); location.reload()`).catch(() => {});
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);

  for (const name of ["a", "b"]) await ui.ev(`${invoke("browser_open", { profile: "essai", url: `https://example.org/?${name}` })}`);
  await sleep(3000);
  const a = (await ui.ev(`${invoke("browser_tabs")}`)).find((x) => x.url.includes("?a"));
  t.check("départ : a puis b", (await order(ui)).join(",") === "a,b", (await order(ui)).join(","));

  // Clic molette dans « a », deux fois.
  for (const name of ["a1", "a2"]) {
    await ui.ev(`${invoke("browser_eval", { id: a.id, script: `chrome.webview.postMessage(JSON.stringify({ calti: "open-background", url: "https://example.com/?${name}" }))` })}`);
    await sleep(900);
  }
  await sleep(800);
  t.check("ouverts juste après l'onglet d'origine, dans l'ordre", (await order(ui)).join(",") === "a,a1,a2,b", (await order(ui)).join(","));
  t.check("dans la barre d'onglets aussi", await ui.ev(`[...document.querySelectorAll(".strip .ptab")].map((x) => x.title || x.textContent).length >= 4`));

  // Depuis le dernier onglet : il reste à la fin.
  const b = (await ui.ev(`${invoke("browser_tabs")}`)).find((x) => x.url.includes("?b"));
  await ui.ev(`${invoke("browser_eval", { id: b.id, script: `chrome.webview.postMessage(JSON.stringify({ calti: "open-background", url: "https://example.com/?b1" }))` })}`);
  await sleep(1500);
  t.check("depuis le dernier onglet : à la fin", (await order(ui)).join(",") === "a,a1,a2,b,b1", (await order(ui)).join(","));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 200));
