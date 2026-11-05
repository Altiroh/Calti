// Sélecteur de profils façon Alt+Tab (Alt+²) : ouverture, ordre du plus récent, navigation, choix, Échap, raccourci
// au clavier avec Alt relâchée.
//   powershell -File scripts\tests\run.ps1 switcher.test.cjs
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const shown = `document.querySelector(".pane__content")?.dataset.profile`;
const cards = `[...document.querySelectorAll(".pswitch__item")].map((b) => ({ name: b.querySelector(".pswitch__name").textContent, on: b.classList.contains("pswitch__item--on") }))`;
const open = (held = false, back = false) => `window.dispatchEvent(new CustomEvent("calti:profile-switch", { detail: { back: ${back}, held: ${held} } }))`;

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: {
      essai: { name: "Essai", color: "#3f9b5c" }, pro: { name: "Pro", color: "#1f8c8c" }, jeux: { name: "Jeux", color: "#9b6bdf" } }, profileOrder: ["essai", "pro", "jeux"] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__content")`)); i++) await sleep(250);
  const key = async (code, k, modifiers = 0, type = "keyDown") => ui.call("Input.dispatchKeyEvent", { type, code, key: k, modifiers, windowsVirtualKeyCode: { Enter: 13, Escape: 27, ArrowRight: 39, Alt: 18 }[k] ?? 0 });

  t.check("profil affiché au départ : Essai", (await ui.ev(shown)) === "essai");

  await ui.ev(open());
  await sleep(300);
  let c = await ui.ev(cards);
  t.check("fenêtre ouverte avec les 3 profils, l'actuel en premier", c.length === 3 && c[0].name === "Essai", c);
  t.check("le suivant présélectionné", c[1].on, c);
  t.check("fenêtre de verre arrondie", await ui.ev(`(() => { const s = getComputedStyle(document.querySelector(".pswitch")); return document.querySelector(".pswitch").classList.contains("glass") && parseFloat(s.borderTopLeftRadius) >= 16; })()`));
  await ui.ev(open());
  await sleep(150);
  c = await ui.ev(cards);
  t.check("nouvel appui : profil suivant", c[2].on, c);
  await key("ArrowRight", "ArrowRight");
  await sleep(150);
  c = await ui.ev(cards);
  t.check("flèche : retour au début (en boucle)", c[0].on, c);
  await key("ArrowRight", "ArrowRight");
  await key("ArrowRight", "ArrowRight");
  await ui.shot(path.join(process.env.TEMP, "calti-switcher.png"));
  await key("Enter", "Enter");
  await sleep(700);
  t.check("Entrée : bascule sur Jeux", (await ui.ev(shown)) === "jeux" && !(await ui.ev(`!!document.querySelector(".pswitch")`)));

  // Ordre du plus récent : Jeux, puis Essai.
  await ui.ev(open());
  await sleep(300);
  c = await ui.ev(cards);
  t.check("ordre du plus récent (Jeux, Essai, Pro)", c.map((x) => x.name).join() === "Jeux,Essai,Pro", c);
  await key("Escape", "Escape");
  await sleep(200);
  t.check("Échap : fermé sans changer", !(await ui.ev(`!!document.querySelector(".pswitch")`)) && (await ui.ev(shown)) === "jeux");

  // Clic sur une carte.
  await ui.ev(open());
  await sleep(300);
  await ui.ev(`[...document.querySelectorAll(".pswitch__item")].find((b) => b.textContent.includes("Pro")).click()`);
  await sleep(700);
  t.check("clic : bascule sur Pro", (await ui.ev(shown)) === "pro");

  // Raccourci réel Alt+² puis Alt relâchée : retour au profil précédent (Jeux), comme un Alt+Tab bref.
  await ui.ev(`window.__seen = false; new MutationObserver(() => { if (document.querySelector(".pswitch")) window.__seen = true; }).observe(document.body, { childList: true, subtree: true })`);
  await key("AltLeft", "Alt", 1);
  await key("Backquote", "²", 1);
  await sleep(150);
  const opened = await ui.ev(`window.__seen`);
  await key("AltLeft", "Alt", 0, "keyUp");
  await sleep(700);
  t.check("Alt+² puis relâcher Alt : profil précédent", opened && (await ui.ev(shown)) === "jeux" && !(await ui.ev(`!!document.querySelector(".pswitch")`)), { opened });

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
