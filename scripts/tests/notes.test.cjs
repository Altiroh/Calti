// Notes : reprise des anciens blocs-notes, création et modification, groupes, couleurs, glisser-déposer, tri,
// partage entre profils.
//   powershell -File scripts\tests\run.ps1 notes.test.cjs
const { connect, sleep, suite } = require("./cdp.cjs");

const t = suite();
const book = `JSON.parse(localStorage.getItem("calti.notebook") ?? "null")`;
const setValue = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
})()`;
const click = (selector) => `document.querySelector(${JSON.stringify(selector)}).click()`;
const item = (label) => `[...document.querySelectorAll(".cmenu__item")].find((b) => b.textContent.includes(${JSON.stringify(label)}))`;
const titles = `[...document.querySelectorAll(".notes-card .note .note__title span")].map((s) => s.textContent)`;

(async () => {
  let ui = await connect();
  // Deux profils ; un ancien bloc-notes (texte libre) dans « essai ».
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: {}, profiles: { essai: { name: "Essai", color: "#3f9b5c" }, pro: { name: "Pro", color: "#1f8c8c" } }, profileOrder: ["essai", "pro"] }));
    localStorage.setItem("calti.notes.essai", "Liste de courses\\npain, lait");
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".notes-card")`)); i++) await sleep(250);
  await ui.ev(`document.querySelector(".notes-card").scrollIntoView({ block: "center" })`);
  await sleep(300);

  const migrated = await ui.ev(book);
  t.check("ancien bloc-notes repris en note", migrated?.notes.length === 1 && migrated.notes[0].owner === "essai" && migrated.notes[0].text.startsWith("Liste"));
  t.check("ancienne clé retirée", await ui.ev(`localStorage.getItem("calti.notes.essai") === null`));
  t.check("note affichée avec sa première ligne en titre", (await ui.ev(titles))[0] === "Liste de courses", await ui.ev(titles));

  // Nouvelle note : éditeur, titre et texte enregistrés au fil de la frappe.
  await ui.ev(click(`.notes-card button[aria-label="Nouvelle note"]`));
  await sleep(300);
  t.check("éditeur ouvert sur une nouvelle note", await ui.ev(`!!document.querySelector(".note-editor") && document.activeElement?.classList.contains("note-editor__title")`));
  await ui.ev(setValue(".note-editor__title", "Idées"));
  await ui.ev(setValue(".note-editor__text", "Un widget de notes plus complet"));
  await ui.ev(`document.querySelectorAll(".note-editor__color")[6].click()`);
  await sleep(500);
  let b = await ui.ev(book);
  const idea = b.notes.find((n) => n.title === "Idées");
  t.check("titre, texte et couleur enregistrés", idea?.text.includes("widget") && idea.color === "#4a8fe7", idea);
  await ui.ev(click(`.note-editor button[aria-label="Retour aux notes"]`));
  await sleep(300);
  t.check("retour à la liste, note colorée", await ui.ev(`[...document.querySelectorAll(".notes-card .note--tinted")].some((n) => n.textContent.includes("Idées"))`));

  // Note laissée vide : supprimée en revenant.
  await ui.ev(click(`.notes-card button[aria-label="Nouvelle note"]`));
  await sleep(200);
  await ui.ev(click(`.note-editor button[aria-label="Retour aux notes"]`));
  await sleep(300);
  t.check("note vide abandonnée", (await ui.ev(book)).notes.length === 2);

  // Groupe : création et nom.
  await ui.ev(click(`.notes-card button[aria-label="Nouveau groupe"]`));
  await sleep(300);
  await ui.ev(setValue(".notes__rename", "Travail"));
  await ui.ev(`document.querySelector(".notes__rename").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
  await sleep(300);
  b = await ui.ev(book);
  t.check("groupe créé et nommé", b.groups.length === 1 && b.groups[0].name === "Travail" && await ui.ev(`document.querySelector(".notes__group-name")?.textContent === "Travail"`));

  // Glisser la note « Idées » sur le groupe, à la souris.
  const center = (selector) => ui.ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const ideaSel = `.notes-card [data-note="${idea.id}"]`;
  const from = await center(ideaSel);
  const to = await center(".notes__group-head");
  const mouse = (type, p, extra = {}) => ui.call("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
  await mouse("mousePressed", from);
  for (let i = 1; i <= 8; i++) await mouse("mouseMoved", { x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 });
  const marked = await ui.ev(`!!document.querySelector(".notes__group.drop-into")`);
  await mouse("mouseReleased", to);
  await sleep(400);
  b = await ui.ev(book);
  t.check("glisser sur un groupe : repère puis note rangée", marked && b.notes.find((n) => n.id === idea.id).group === b.groups[0].id, { marked });
  t.check("note affichée dans le groupe", await ui.ev(`!!document.querySelector('.notes__group [data-note="${idea.id}"]')`));
  t.check("pas d'éditeur ouvert par le relâchement", await ui.ev(`!document.querySelector(".note-editor")`));

  // Clic droit : épingler et partager avec « Pro ».
  const courses = b.notes.find((n) => n.text.startsWith("Liste"));
  await ui.ev(`(() => { const el = document.querySelector('.notes-card [data-note="${courses.id}"]'); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); })()`);
  await sleep(250);
  const labels = await ui.ev(`[...document.querySelectorAll(".cmenu__label")].map((l) => l.textContent)`);
  t.check("menu de la note", ["Épingler en haut", "Couleur", "Groupe", "Partager", "Supprimer la note"].every((l) => labels.includes(l)), labels);
  await ui.ev(`${item("Épingler en haut")}.click()`);
  await sleep(300);
  t.check("note épinglée", (await ui.ev(book)).notes.find((n) => n.id === courses.id).pinned && await ui.ev(`!!document.querySelector('[data-note="${courses.id}"].note--pinned')`));

  // Partage par le sous-menu (survol réel pour l'ouvrir).
  await ui.ev(`(() => { const el = document.querySelector('.notes-card [data-note="${courses.id}"]'); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); })()`);
  await sleep(250);
  const share = await ui.ev(`(() => { const r = ${item("Partager")}.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; })()`);
  await ui.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: share.x - 20, y: share.y });
  await ui.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: share.x, y: share.y });
  await sleep(400);
  const subLabels = await ui.ev(`[...document.querySelectorAll(".cmenu")].slice(1).flatMap((m) => [...m.querySelectorAll(".cmenu__label")].map((l) => l.textContent))`);
  t.check("sous-menu de partage : ce profil, tous, chaque profil", ["Ce profil seulement", "Tous les profils", "Pro"].every((l) => subLabels.includes(l)), subLabels);
  await ui.ev(`[...document.querySelectorAll(".cmenu")].at(-1).querySelectorAll(".cmenu__item").forEach((b) => b.textContent.includes("Pro") && b.click())`);
  await sleep(300);
  t.check("note partagée avec Pro", JSON.stringify((await ui.ev(book)).notes.find((n) => n.id === courses.id).share) === '["pro"]');
  t.check("pastille de partage affichée", await ui.ev(`!!document.querySelector('[data-note="${courses.id}"] .note__shared')`));

  // Côté « Pro » : la note partagée est visible avec le nom de son profil ; « Idées » (non partagée) ne l'est pas.
  const visibleFor = await ui.ev(`(() => {
    const b = ${book};
    const seen = (item, p) => item.owner === p || item.share === "all" || item.share.includes(p);
    return b.notes.filter((n) => seen(n, "pro")).map((n) => n.title || n.text.split("\\n")[0]);
  })()`);
  t.check("visible dans Pro : seulement la note partagée", visibleFor.length === 1 && visibleFor[0] === "Liste de courses", visibleFor);

  // Partager le groupe avec tous : ses notes suivent.
  await ui.ev(`(() => { const el = document.querySelector(".notes__group-head"); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10 })); })()`);
  await sleep(250);
  const gshare = await ui.ev(`(() => { const r = ${item("Partager le groupe")}.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; })()`);
  await ui.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: gshare.x - 20, y: gshare.y });
  await ui.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: gshare.x, y: gshare.y });
  await sleep(400);
  await ui.ev(`[...document.querySelectorAll(".cmenu")].at(-1).querySelectorAll(".cmenu__item").forEach((b) => b.textContent.includes("Tous les profils") && b.click())`);
  await sleep(300);
  b = await ui.ev(book);
  t.check("groupe partagé avec tous, ses notes aussi", b.groups[0].share === "all" && b.notes.find((n) => n.id === idea.id).share === "all");

  // Affichage en grille, tri par titre, groupe replié.
  await ui.ev(click(`.notes-card button[aria-label="Affichage et tri"]`));
  await sleep(250);
  await ui.ev(`${item("Grille de cartes")}.click()`);
  await sleep(300);
  t.check("affichage en grille", await ui.ev(`!!document.querySelector(".notes__list--grid .note")`));
  await ui.ev(click(".notes__group-head"));
  await sleep(250);
  t.check("groupe replié", await ui.ev(`!!document.querySelector(".notes__group--collapsed") && !document.querySelector('.notes__group [data-note]')`));
  const view = await ui.ev(`JSON.parse(localStorage.getItem("calti.notes.view.essai"))`);
  t.check("affichage retenu pour le profil", view.layout === "grid" && view.collapsed.length === 1, view);

  await ui.shot(require("path").join(process.env.TEMP, "calti-notes.png"));
  t.report();
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
