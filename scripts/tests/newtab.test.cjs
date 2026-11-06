// Nouvel onglet (Ctrl+T, bouton +) : le curseur va dans la barre d'adresse du haut, pas dans la recherche de l'accueil.
//   powershell -File scripts\tests\run.ps1 newtab.test.cjs
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const focused = `(() => { const a = document.activeElement; return a?.closest(".pane__address") ? "adresse" : a?.classList.contains("search__input") ? "accueil" : a?.tagName ?? "rien"; })()`;

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  await ui.ev(`document.body.focus()`);

  await ui.call("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", windowsVirtualKeyCode: 84, modifiers: 2 });
  await ui.call("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT", windowsVirtualKeyCode: 84, modifiers: 2 });
  await sleep(600);
  t.check("Ctrl+T : curseur dans la barre d'adresse", (await ui.ev(focused)) === "adresse", await ui.ev(focused));

  await ui.ev(`document.body.focus(); document.querySelector(".ptab--new")?.click()`);
  await sleep(600);
  t.check("bouton + : curseur dans la barre d'adresse", (await ui.ev(focused)) === "adresse", await ui.ev(focused));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
