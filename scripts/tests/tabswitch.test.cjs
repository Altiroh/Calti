// Sélecteur d'onglets façon Alt+Tab (Ctrl+Tab) : ordre du plus récent, navigation, choix, appui bref = onglet précédent.
//   powershell -File scripts\tests\run.ps1 tabswitch.test.cjs
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const go = (url) => `(() => { const i = document.querySelector(".pane__address input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(url)}); i.dispatchEvent(new Event("input", { bubbles: true })); i.closest("form").requestSubmit(); })()`;
const active = `document.querySelector(".ptab--active[data-tab]")?.title.split("\\n")[1] ?? ""`;
const items = `[...document.querySelectorAll(".tswitch__item")].map((b) => ({ host: b.querySelector(".tswitch__host").textContent, url: b.title, on: b.classList.contains("tswitch__item--on") }))`;

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);
  const key = (type, k, code, vk, modifiers = 0) => ui.call("Input.dispatchKeyEvent", { type, key: k, code, windowsVirtualKeyCode: vk, modifiers });
  const newTab = async (url) => {
    await key("keyDown", "t", "KeyT", 84, 2);
    await key("keyUp", "t", "KeyT", 84, 2);
    await sleep(300);
    await ui.ev(go(url));
    await sleep(2200);
  };
  await ui.ev(go("https://example.org/?a"));
  await sleep(2200);
  await newTab("https://example.com/?b");
  await newTab("https://example.net/?c");
  t.check("trois onglets, le dernier affiché", (await ui.ev(active)).includes("?c"));

  // Ouvert sans Ctrl tenue (comme depuis la palette) : liste du plus récent, le précédent présélectionné.
  await ui.ev(`window.dispatchEvent(new CustomEvent("calti:tab-switch", { detail: { profile: "essai", back: false, held: false } }))`);
  await sleep(300);
  let list = await ui.ev(items);
  t.check("liste du plus récent au plus ancien", list.length === 3 && list[0].host === "example.net" && list[1].host === "example.com", list);
  t.check("onglet précédent présélectionné", list[1].on, list);
  await ui.shot(path.join(process.env.TEMP, "calti-tabswitch.png"));
  await key("keyDown", "ArrowDown", "ArrowDown", 40);
  await sleep(150);
  t.check("flèche : suivant", (await ui.ev(items))[2].on);
  await key("keyDown", "Enter", "Enter", 13);
  await sleep(600);
  t.check("Entrée : onglet choisi affiché", (await ui.ev(active)).includes("?a") && !(await ui.ev(`!!document.querySelector(".tswitch")`)));

  // Ctrl+Tab bref (Ctrl relâchée aussitôt) : retour à l'onglet précédent (c).
  await key("rawKeyDown", "Control", "ControlLeft", 17, 2);
  await key("keyDown", "Tab", "Tab", 9, 2);
  await key("keyUp", "Tab", "Tab", 9, 2);
  await key("keyUp", "Control", "ControlLeft", 17, 0);
  await sleep(700);
  t.check("Ctrl+Tab bref : retour à l'onglet précédent", (await ui.ev(active)).includes("?c"), await ui.ev(active));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
