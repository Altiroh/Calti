// Fermeture d'un onglet : la poubelle sort de l'onglet, l'onglet saute dedans, la poubelle disparaît.
//   powershell -File scripts\tests\run.ps1 closeanim.test.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const go = (url) => `(() => { const i = document.querySelector(".pane__address input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(url)}); i.dispatchEvent(new Event("input", { bubbles: true })); i.closest("form").requestSubmit(); })()`;
const out = path.join(process.env.TEMP, "calti-closeanim");

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
  await ui.ev(go("https://example.org/?a"));
  await sleep(2000);
  for (const u of ["https://example.com/?b", "https://example.net/?c"]) {
    await key("keyDown", "t", "KeyT", 84, 2);
    await key("keyUp", "t", "KeyT", 84, 2);
    await sleep(300);
    await ui.ev(go(u));
    await sleep(2000);
  }
  t.check("trois onglets", await ui.ev(`document.querySelectorAll(".strip .ptab[data-tab]").length`) === 3);

  // Fermer l'onglet du milieu par sa croix, et regarder l'animation.
  fs.mkdirSync(out, { recursive: true });
  // Animations ralenties 4× pour en capturer les étapes.
  await ui.call("Animation.enable");
  await ui.call("Animation.setPlaybackRate", { playbackRate: 0.25 });
  await ui.ev(`document.querySelectorAll(".strip .ptab[data-tab]")[1].querySelector(".ptab__close").click()`);
  const states = [];
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) {
    states.push(await ui.ev(`({ trash: !!document.querySelector(".tab-trash"), ghost: !!document.querySelector(".ptab--ghost") })`));
    await ui.shot(path.join(out, `f${i}.png`));
    await sleep(250);
  }
  await ui.call("Animation.setPlaybackRate", { playbackRate: 1 });
  const elapsed = Date.now() - t0;
  t.check("la poubelle sort et l'onglet (fantôme) est animé", states.some((s) => s.trash && s.ghost), { states, elapsed });
  await sleep(3000);
  t.check("poubelle et fantôme disparus ensuite", await ui.ev(`!document.querySelector(".tab-trash") && !document.querySelector(".ptab--ghost")`));
  t.check("onglet fermé", await ui.ev(`document.querySelectorAll(".strip .ptab[data-tab]").length`) === 2);

  // Mouvements coupés : pas d'animation.
  await ui.ev(`document.querySelector(".shell").classList.add("no-motion")`);
  await ui.ev(`document.querySelectorAll(".strip .ptab[data-tab]")[0].querySelector(".ptab__close").click()`);
  await sleep(80);
  t.check("mouvements coupés : fermeture sans animation", await ui.ev(`!document.querySelector(".tab-trash")`));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
