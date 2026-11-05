// Captures des écrans de Calti (thème par défaut) pour un audit visuel : accueil, page, menus, palette, réglages,
// notes, sélecteur de profils. Ne vérifie rien.
//   powershell -File scripts\tests\run.ps1 audit-shots.cjs
const path = require("path");
const fs = require("fs");
const { connect, sleep } = require("./cdp.cjs");

const out = process.env.CALTI_SHOTS ?? path.join(process.env.TEMP, "calti-audit");
fs.mkdirSync(out, { recursive: true });

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: { railWidgets: ["clipboard", "history", "notes", "claude", "media"], mediaFloat: true, mediaDock: "titlebar" } },
      profiles: { essai: { name: "Essai", color: "#3f9b5c" }, pro: { name: "Pro", color: "#1f8c8c" } }, profileOrder: ["essai", "pro"] }));
    localStorage.setItem("calti.notebook", JSON.stringify({ v: 1, groups: [{ id: "g1", name: "Travail", color: "#4a8fe7", owner: "essai", share: [] }],
      notes: [{ id: "n1", title: "Courses", text: "pain, lait, café", color: "#f5c542", group: null, pinned: true, owner: "essai", share: [], created: 1, updated: Date.now() },
              { id: "n2", title: "Réunion lundi", text: "budget, planning", color: null, group: "g1", pinned: false, owner: "essai", share: "all", created: 1, updated: Date.now() }] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__content")`)); i++) await sleep(250);
  await sleep(800);
  const shot = async (name) => { await sleep(350); await ui.shot(path.join(out, `${name}.png`)); };

  await shot("01-accueil");
  await ui.ev(`window.scrollTo(0, 0); document.querySelector(".notes-card")?.scrollIntoView({ block: "center" })`);
  await shot("02-accueil-bas");

  // Palette
  await ui.ev(`window.dispatchEvent(new CustomEvent("calti:palette", { detail: "essai" }))`);
  await shot("03-palette");
  await ui.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);

  // Menu de la barre
  await ui.ev(`(() => { const el = document.querySelector(".pane__bar"); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 20 })); })()`);
  await shot("04-menu-barre");
  await ui.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

  // Panneau Notes
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Notes"]').click()`);
  await shot("05-panneau-notes");
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Notes"]').click()`);

  // Réglages : Général puis Apparence
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Réglages"]').click()`);
  await shot("06-reglages-general");
  await ui.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Apparence").click()`);
  await shot("07-reglages-apparence");
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Réglages"]').click()`);

  // Sélecteur de profils
  await ui.ev(`window.dispatchEvent(new CustomEvent("calti:profile-switch", { detail: { back: false, held: false } }))`);
  await shot("08-selecteur-profils");
  await ui.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

  // Une page ouverte : barre, onglets
  await ui.ev(`(() => { const i = document.querySelector(".pane__address input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "https://example.org"); i.dispatchEvent(new Event("input", { bubbles: true })); i.closest("form").requestSubmit(); })()`);
  await sleep(2500);
  await shot("09-page");

  console.log(`captures : ${out}`);
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
