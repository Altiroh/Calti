// Lance un script du skill unslop (.claude/skills/unslop/scripts) avec les outils du projet :
// ffmpeg de ffmpeg-static ajouté au PATH, et Edge comme navigateur si aucun CHROME_PATH n'est donné
// (pas de Chromium à télécharger). À lancer depuis app/ :
//   npm run unslop:snapshot -- <url> <out.html>
//   npm run unslop:story -- <story.html> <out.mp4> [--wide | --play]
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [script, ...args] = process.argv.slice(2);
if (!["snapshot", "story"].includes(script)) {
  console.error("usage : node scripts/unslop.mjs snapshot|story <arguments du script>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const ffmpeg = createRequire(join(process.cwd(), "package.json"))("ffmpeg-static");
if (ffmpeg) env.PATH = `${dirname(ffmpeg)}${delimiter}${env.PATH ?? ""}`;
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!env.CHROME_PATH && existsSync(edge)) env.CHROME_PATH = edge;

const result = spawnSync(process.execPath, [join(root, ".claude", "skills", "unslop", "scripts", `${script}.mjs`), ...args], { stdio: "inherit", env });
process.exit(result.status ?? 1);
