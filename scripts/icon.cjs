// Icône de Calti : un C fin ouvert vers le haut, en dégradé bleu → violet → rose, et un point rose dans l'ouverture.
// Dessinée en PNG 1024 px sans dépendance (distances signées, bords lissés), puis déclinée par `npx tauri icon`.
// Usage : node scripts/icon.cjs app/src-tauri/icons/source.png
const zlib = require("zlib");
const fs = require("fs");

const S = 1024;
// Repère de dessin 100×100 (celui des propositions), agrandi pour que l'anneau occupe la même place que l'ancienne icône.
const SCALE = 1.15;
const toUnit = (p) => 50 + ((p + 0.5) / S * 100 - 50) / SCALE;
const PIXEL = 100 / S / SCALE;

const R = 34;        // rayon de l'anneau
const HALF = 6;      // demi-épaisseur du trait
const GAP = 35;      // demi-ouverture en degrés, centrée en haut
const DOT = { x: 50, y: 22, r: 6 };
const STOPS = [[0, [0x4f, 0xac, 0xfe]], [0.5, [0x7a, 0x62, 0xc4]], [1, [0xff, 0x6f, 0xd8]]];
const DOT_COLOR = [0xff, 0x6f, 0xd8];

const rad = (d) => (d * Math.PI) / 180;
const ends = [-90 + GAP, -90 - GAP].map((a) => ({ x: 50 + R * Math.cos(rad(a)), y: 50 + R * Math.sin(rad(a)) }));

/** Distance au trait de l'anneau (bouts arrondis). */
function ringDistance(x, y) {
  const a = (Math.atan2(y - 50, x - 50) * 180) / Math.PI;
  if (a > -90 - GAP && a < -90 + GAP) return Math.min(...ends.map((e) => Math.hypot(x - e.x, y - e.y))) - HALF;
  return Math.abs(Math.hypot(x - 50, y - 50) - R) - HALF;
}

/** Dégradé de bas-gauche (bleu) à haut-droite (rose). */
function gradient(x, y) {
  const t = Math.min(1, Math.max(0, (x / 100 + (1 - y / 100)) / 2));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (t <= t1) return c0.map((c, k) => c + (c1[k] - c) * ((t - t0) / (t1 - t0)));
  }
  return STOPS[STOPS.length - 1][1];
}

const coverage = (d) => Math.min(1, Math.max(0, 0.5 - d / PIXEL));
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let py = 0; py < S; py++) {
  raw[py * (S * 4 + 1)] = 0;
  for (let px = 0; px < S; px++) {
    // Remonté de 3,5 unités : l’ensemble (ouverture comprise) est centré verticalement.
    const x = toUnit(px), y = toUnit(py) + 3.5;
    const ring = coverage(ringDistance(x, y));
    const dot = coverage(Math.hypot(x - DOT.x, y - DOT.y) - DOT.r);
    const ringColor = gradient(x, y);
    // Le point passe devant l'anneau (ils ne se touchent pas, mais par sûreté).
    const alpha = dot + ring * (1 - dot);
    const color = alpha > 0 ? ringColor.map((c, k) => (DOT_COLOR[k] * dot + c * ring * (1 - dot)) / alpha) : [0, 0, 0];
    const i = py * (S * 4 + 1) + 1 + px * 4;
    raw[i] = Math.round(color[0]);
    raw[i + 1] = Math.round(color[1]);
    raw[i + 2] = Math.round(color[2]);
    raw[i + 3] = Math.round(alpha * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let r = 0xffffffff;
  for (const b of buf) r = crcTable[(r ^ b) & 255] ^ (r >>> 8);
  return (r ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(S, 0);
header.writeUInt32BE(S, 4);
header[8] = 8;
header[9] = 6;
fs.writeFileSync(process.argv[2], Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]));
