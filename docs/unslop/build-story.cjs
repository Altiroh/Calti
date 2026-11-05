// Construit unslop-story/story.html à partir de la capture « après » : l'état d'avant est rejoué par des règles
// actives tant que l'étape n'est pas atteinte (html:not(.sN)), donc chaque étape fait glisser les valeurs.
const fs = require("fs");
const [input, output] = process.argv.slice(2);
let s = fs.readFileSync(input, "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error(a.slice(0, 80)); s = s.replace(a, b); };

// Titre : « Bonjour, Essai. » devient « Essai » (étape 1).
rep(`<div class="rt title-block__title  rt--dim-lines"><span class="rt-line" style="animation-delay: 120ms;"><span class="rt-em">Essai</span></span></div>`,
  `<div class="rt title-block__title rt--dim-lines" data-slop="Salutation"><span class="rt-line"><span class="swap" data-at="1"><span class="from">Bonjour, <span class="rt-em">Essai</span>.</span><span class="to"><span class="rt-em">Essai</span></span></span></span></div>`);
// Étiquette « ONGLET ACTIF » (capitales espacées) et état vide.
rep(`<div class="hero__label">Onglet actif</div><p class="muted hero__empty">Aucun onglet</p>`,
  `<div class="hero__label" data-slop="Capitales espacées">Onglet actif</div><p class="muted hero__empty"><span class="swap" data-at="1"><span class="from">Aucun onglet.</span><span class="to">Aucun onglet</span></span></p>`);
// Tuile colorée la plus visible : marquée pour l'audit.
rep(`<section class="sgroup sgroup--open" style="--group-color: #ff3d7f;"><button class="sgroup__head" aria-expanded="true"><span class="sgroup__icon">`,
  `<section class="sgroup sgroup--open" style="--group-color: #ff3d7f;"><button class="sgroup__head" aria-expanded="true"><span class="sgroup__icon" data-slop="Tuiles en couleur">`);

const head = `<meta name="unslop-steps" content="Texte et typographie, Couleur et icônes, Détails">
<meta name="unslop-frame" content="0 0 1440">
<style>
  /* Avant (étape 0), retiré à l'étape indiquée. */
  html:not(.s1) .title-block__title { font-size: 76px; }
  .title-block__title .swap > .from, .title-block__title .swap > .to { white-space: nowrap; }
  html:not(.s1) .hero__label { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  html:not(.s1) .settings__section h3, html:not(.s1) .pblock__title { letter-spacing: 0.1em; text-transform: uppercase; }
  html:not(.s1) .badge { font-weight: 700; }
  html:not(.s2) .sgroup__icon { color: #fff; background: var(--group-color); box-shadow: 0 3px 10px color-mix(in srgb, var(--group-color) 30%, transparent); }
  html:not(.s3) .search:focus-within, html:not(.s3) .search { transform: scale(1.01); }
  html:not(.s3) .rail-btn--on { transform: scale(1.08); }
</style>
`;
rep(`<head>`, `<head>\n${head}`);
// Les animations d'entrée de la capture rejouées à l'ouverture : figées à leur fin.
s = s.replace(`</style>\n`, `</style>\n<style>*, *::before, *::after { animation: none !important; }</style>\n`);
fs.writeFileSync(output, s);
console.log("ok");
