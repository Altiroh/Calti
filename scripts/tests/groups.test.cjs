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

  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
