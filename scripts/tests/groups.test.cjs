// Groupes d'onglets : icône Font Awesome, pastille à la taille des onglets, contour, repli animé, groupes enregistrés
// (fermer, rouvrir, supprimer), seconde barre (groupes enregistrés et favoris), panneau « Groupes ».
//   powershell -File scripts\tests\run.ps1 groups.test.cjs
const path = require("path");
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const item = (label) => `[...document.querySelectorAll(".cmenu__item")].find((b) => b.textContent.includes(${JSON.stringify(label)}))`;
const rightClick = (selector) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 })); })()`;
const go = (url) => `(() => { const i = document.querySelector(".pane__address input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(url)}); i.dispatchEvent(new Event("input", { bubbles: true })); i.closest("form").requestSubmit(); })()`;
const saved = `JSON.parse(localStorage.getItem("calti.savedGroups") ?? "[]")`;

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: { subBar: true, subBarGroups: true, subBarBookmarks: true, railWidgets: ["groups"] } },
      profiles: { essai: { name: "Essai" } }, profileOrder: ["essai"] }));
    localStorage.setItem("calti.bookmarks.essai", JSON.stringify([{ url: "https://example.org/", title: "Exemple", at: 1 }, { url: "https://www.wikipedia.org/", title: "Wikipédia", at: 2 }]));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__address input")`)); i++) await sleep(250);

  t.check("seconde barre avec les favoris", await ui.ev(`document.querySelectorAll(".subbar .subbar__mark").length`) === 2);

  // Un onglet, mis dans un nouveau groupe avec une icône.
  await ui.ev(go("https://example.org/?groupe"));
  await sleep(2500);
  await ui.ev(rightClick(".ptab[data-tab]"));
  await sleep(250);
  await ui.ev(`${item("Ajouter à un nouveau groupe")}.click()`);
  await sleep(500);
  await ui.ev(`(() => { const i = document.querySelector(".group-dialog__name"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Travail"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await ui.ev(`document.querySelector('.group-dialog__icon[title="briefcase"]').click()`);
  await sleep(150);
  await ui.ev(`document.querySelector(".group-dialog").requestSubmit()`);
  await sleep(600);
  const chip = await ui.ev(`(() => { const c = document.querySelector(".tgroup__chip"); const tab = document.querySelector(".tgroup .ptab"); return c && { icon: !!c.querySelector("svg.fa"), name: c.textContent.trim(), h: c.getBoundingClientRect().height, tab: tab.getBoundingClientRect().height }; })()`);
  t.check("groupe avec icône Font Awesome et nom", chip?.icon && chip.name.startsWith("Travail"), chip);
  t.check("pastille du groupe à la taille d'un onglet", chip && Math.abs(chip.h - chip.tab) < 1, chip);
  t.check("contour autour du groupe", await ui.ev(`getComputedStyle(document.querySelector(".tgroup")).boxShadow.includes("inset")`));

  // Menu du groupe : tient sans défiler ; barres de défilement de l'interface (pas celles de Windows).
  await ui.ev(rightClick(".tgroup__chip"));
  await sleep(300);
  const menuBox = await ui.ev(`(() => { const m = document.querySelector(".cmenu"); return { over: m.scrollHeight - m.clientHeight, oy: getComputedStyle(m).overflowY, sw: getComputedStyle(m).scrollbarWidth }; })()`);
  t.check("menu du groupe sans défilement, barre fine de l'interface", menuBox.oy === "hidden" && menuBox.sw === "auto", menuBox);
  await ui.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(200);

  // Réordonner : un second onglet à droite du groupe, puis le groupe glissé derrière lui.
  await ui.call("Input.dispatchKeyEvent", { type: "keyDown", key: "t", code: "KeyT", windowsVirtualKeyCode: 84, modifiers: 2 });
  await ui.call("Input.dispatchKeyEvent", { type: "keyUp", key: "t", code: "KeyT", windowsVirtualKeyCode: 84, modifiers: 2 });
  await sleep(400);
  await ui.ev(go("https://example.com/?seul"));
  await sleep(2500);
  const order = `[...document.querySelector(".strip").children].filter((c) => c.matches(".tgroup, .ptab[data-tab]")).map((c) => c.matches(".tgroup") ? "groupe" : "onglet").join(",")`;
  const beforeOrder = await ui.ev(order);
  const pos = await ui.ev(`(() => { const c = document.querySelector(".tgroup__chip").getBoundingClientRect(); const t = document.querySelector(".strip > .ptab[data-tab]").getBoundingClientRect(); return { x: c.left + 10, y: c.top + c.height / 2, to: t.right + 20 }; })()`);
  const mouse = (type, x, y) => ui.call("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await mouse("mousePressed", pos.x, pos.y);
  for (let i = 1; i <= 8; i++) await mouse("mouseMoved", pos.x + ((pos.to - pos.x) * i) / 8, pos.y);
  await mouse("mouseReleased", pos.to, pos.y);
  await sleep(900);
  const afterOrder = await ui.ev(order);
  t.check("groupe déplacé derrière l'onglet", beforeOrder === "groupe,onglet" && afterOrder === "onglet,groupe", { beforeOrder, afterOrder });
  t.check("déplacer ne replie pas le groupe", await ui.ev(`!document.querySelector(".tgroup--collapsed")`));
  await ui.shot(path.join(process.env.TEMP, "calti-groups-moved.png"));

  // Repli animé (largeur intermédiaire pendant l'animation), puis dépli.
  const width = `document.querySelector(".tgroup__tabs").getBoundingClientRect().width`;
  const full = await ui.ev(width);
  await ui.ev(`document.querySelector(".tgroup__chip").click()`);
  await sleep(120);
  const mid = await ui.ev(width);
  await sleep(600);
  const folded = await ui.ev(width);
  t.check("repli progressif jusqu'à zéro", mid > 2 && mid < full - 2 && folded < 1, { full, mid, folded });
  await ui.ev(`document.querySelector(".tgroup__chip").click()`);
  await sleep(700);
  t.check("dépli : les onglets reviennent", Math.abs((await ui.ev(width)) - full) < 2);

  // Fermer et enregistrer : l'onglet se ferme, le groupe va dans la seconde barre.
  await ui.ev(rightClick(".tgroup__chip"));
  await sleep(250);
  await ui.ev(`${item("Fermer et enregistrer")}.click()`);
  await sleep(1200);
  let list = await ui.ev(saved);
  t.check("groupe enregistré à la fermeture", list.length === 1 && list[0].name === "Travail" && list[0].icon === "briefcase" && list[0].tabs[0].url.includes("groupe"), list);
  t.check("onglets du groupe fermés", await ui.ev(`!document.querySelector(".tgroup")`));
  t.check("groupe dans la seconde barre", await ui.ev(`!!document.querySelector(".subbar .subbar__group svg.fa")`));
  await ui.shot(path.join(process.env.TEMP, "calti-groups-bar.png"));

  // Panneau « Groupes ».
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Groupes"]').click()`);
  await sleep(400);
  t.check("panneau Groupes : groupe enregistré listé", await ui.ev(`[...document.querySelectorAll(".groups__name")].some((n) => n.textContent === "Travail")`));
  await ui.ev(`document.querySelector('.rail-btn[aria-label="Groupes"]').click()`);

  // Rouvrir depuis la seconde barre.
  await ui.ev(`document.querySelector(".subbar__group").click()`);
  await sleep(2000);
  t.check("rouvert : groupe et onglet revenus, plus dans les enregistrés", await ui.ev(`document.querySelector(".tgroup__name")?.textContent === "Travail" && !!document.querySelector(".tgroup .ptab")`) && (await ui.ev(saved)).length === 0);
  await ui.shot(path.join(process.env.TEMP, "calti-groups.png"));

  // Fermer sans enregistrer : rien dans la barre. Puis enregistrer et supprimer.
  await ui.ev(rightClick(".tgroup__chip"));
  await sleep(250);
  await ui.ev(`${item("Fermer et enregistrer")}.click()`);
  await sleep(1200);
  await ui.ev(rightClick(".subbar__group"));
  await sleep(250);
  await ui.ev(`${item("Supprimer le groupe enregistré")}.click()`);
  await sleep(400);
  t.check("groupe enregistré supprimé", (await ui.ev(saved)).length === 0 && await ui.ev(`!document.querySelector(".subbar__group")`));

  // Seconde barre : une icône par catégorie, et le clic droit pour choisir ce qu'elle affiche.
  t.check("icônes des catégories et séparation", await ui.ev(`document.querySelectorAll(".subbar__cat").length === 2 && !!document.querySelector(".subbar__sep")`));
  await ui.ev(`(() => { const el = document.querySelector(".subbar__cat"); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 })); })()`);
  await sleep(300);
  const labels = await ui.ev(`[...document.querySelectorAll(".cmenu__label")].map((l) => l.textContent)`);
  t.check("clic droit sur la seconde barre : Groupes enregistrés, Favoris", ["Groupes enregistrés", "Favoris", "Masquer la seconde barre"].every((l) => labels.includes(l)), labels);
  await ui.ev(`${item("Favoris")}.click()`);
  await sleep(400);
  t.check("favoris masqués de la seconde barre", await ui.ev(`document.querySelectorAll(".subbar__mark").length === 0 && document.querySelectorAll(".subbar__cat").length === 1`));

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
