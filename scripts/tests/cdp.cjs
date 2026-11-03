// Pilotage d'une instance d'essai de Calti par le protocole DevTools (port 9334, voir run.ps1).
const fs = require("fs");

const PORT = Number(process.env.CALTI_CDP_PORT ?? 9334);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Interface de la fenêtre principale (version compilée ou serveur de développement). */
const isMain = (p) => /^http:\/\/(tauri\.localhost|localhost:1420)\/(index\.html)?$/.test(p.url);

async function pages() {
  return (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
}

/** Attend qu'une page correspondant à `match` soit ouverte, puis s'y connecte. */
async function connect(match = isMain, timeout = 20000) {
  const end = Date.now() + timeout;
  let page;
  while (!page) {
    try { page = (await pages()).find((p) => p.type === "page" && match(p)); } catch { /* instance pas encore prête */ }
    if (page) break;
    if (Date.now() > end) throw new Error("page introuvable");
    await sleep(300);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
  const call = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  /** Évalue une expression dans la page ; une exception est renvoyée comme une erreur. */
  const ev = async (expr) => {
    const r = (await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result;
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 300));
    return r.result.value;
  };
  // Page tout juste créée : on attend qu'elle soit chargée et ait accès à son stockage.
  for (let i = 0; i < 50; i++) {
    try { if (await ev(`document.readyState === "complete" && typeof localStorage === "object"`)) break; } catch { /* pas encore prête */ }
    await sleep(200);
  }
  const shot = async (file) => {
    const { result } = await call("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  };
  return { ws, call, ev, shot, page, close: () => ws.close() };
}

/** Petit cadre de tests : `check(nom, condition, détail)` puis `report()` (code de sortie 1 en cas d'échec). */
function suite() {
  const results = [];
  return {
    check(name, ok, detail = "") {
      results.push({ name, ok: !!ok });
      console.log(`${ok ? "✔" : "✘"} ${name}${detail !== "" ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
    },
    report() {
      const failed = results.filter((r) => !r.ok).length;
      console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
      process.exitCode = failed ? 1 : 0;
    },
  };
}

module.exports = { connect, pages, isMain, sleep, suite };
