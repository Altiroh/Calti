// Capture l'accueil de Calti (instance d'essai) en un fichier HTML autonome, styles et images inclus : point de
// départ d'une vidéo « story » du skill unslop. Sortie : $CALTI_STORY_OUT (défaut %TEMP%\calti-story\original.html).
//   powershell -File scripts\tests\run.ps1 story-capture.cjs
const fs = require("fs");
const path = require("path");
const { connect, sleep } = require("./cdp.cjs");

const out = process.env.CALTI_STORY_OUT ?? path.join(process.env.TEMP, "calti-story", "original.html");

(async () => {
  let ui = await connect();
  await ui.ev(`localStorage.clear();
    localStorage.setItem("calti.settings.v3", JSON.stringify({ theme: { chrome: { railWidgets: ["clipboard", "history", "notes", "claude", "media"] } },
      profiles: { essai: { name: "Essai", color: "#3f9b5c" }, pro: { name: "Pro", color: "#1f8c8c" } }, profileOrder: ["essai", "pro"] }));
    location.reload()`);
  ui.close();
  await sleep(3500);
  ui = await connect();
  for (let i = 0; i < 40 && !(await ui.ev(`!!document.querySelector(".pane__content")`)); i++) await sleep(250);
  await ui.call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  // Réglages ouverts (Apparence), si demandé : plus de changements visibles dans la vidéo.
  if (process.env.CALTI_STORY_DRAWER) {
    await ui.ev(`document.querySelector('.rail-btn[aria-label="Réglages"]').click()`);
    await sleep(500);
    await ui.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(process.env.CALTI_STORY_DRAWER)}).click()`);
    await sleep(800);
  }
  const html = await ui.ev(`(async () => {
    const inline = (href) => fetch(href).then((r) => (r.ok ? r.blob() : null)).then((b) => b ? new Promise((done) => { const f = new FileReader(); f.onload = () => done(f.result); f.readAsDataURL(b); }) : href).catch(() => href);
    const urls = async (css, base) => {
      for (const [whole, , value] of [...css.matchAll(/url\\((['"]?)(?!data:)([^)'"]+)\\1\\)/g)]) {
        if (/^(#|%23)/.test(value.trim())) continue;
        css = css.split(whole).join('url("' + (await inline(new URL(value.trim(), base).href)) + '")');
      }
      return css;
    };
    const css = [];
    for (const sheet of document.styleSheets) {
      let text = "";
      try { text = [...sheet.cssRules].map((r) => r.cssText).join("\\n"); } catch {}
      css.push(await urls(text, sheet.href ?? location.href));
    }
    const copy = document.documentElement.cloneNode(true);
    copy.querySelectorAll("script, link[rel='stylesheet'], link[rel='preload'], link[rel='modulepreload'], style").forEach((n) => n.remove());
    for (const img of copy.querySelectorAll("img[src]")) img.setAttribute("src", await inline(new URL(img.getAttribute("src"), location.href).href));
    for (const node of copy.querySelectorAll("[style*='url(']")) node.setAttribute("style", await urls(node.getAttribute("style"), location.href));
    copy.querySelectorAll("input").forEach((i, k) => i.setAttribute("value", document.querySelectorAll("input")[k].value));
    const style = document.createElement("style");
    style.textContent = css.join("\\n");
    copy.querySelector("head").appendChild(style);
    return "<!doctype html>\\n" + copy.outerHTML;
  })()`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  await ui.shot(out.replace(/\.html$/, ".png"));
  console.log(`saved ${out} (${Math.round(html.length / 1024)} Ko)`);
  ui.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
