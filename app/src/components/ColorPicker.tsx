import { useEffect, useState, type CSSProperties } from "react";
import "./ColorPicker.css";

/** Palette proposée : tons froids d'abord (identité de Calti), puis quelques teintes chaudes et neutres. */
export const colorPresets = [
  "#2f5fa8", "#2b86c9", "#3fa3c4", "#1f8c8c", "#3f9b5c", "#4b56c8",
  "#7a62c4", "#b8457a", "#c2652f", "#d9a441", "#4a5d78", "#1b2840",
  "#f2e2c4", "#eef3f9", "#ffffff", "#080e1a",
];

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex({ h, s, l }: Hsl): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

/** Sélecteur de couleur intégré : palette, teinte / saturation / luminosité, code hexadécimal. */
export function ColorPicker({ value, onChange }: Props) {
  const [hsl, setHsl] = useState(() => hexToHsl(isHex(value) ? value : "#2f5fa8"));
  const [text, setText] = useState(value);

  // Valeur changée de l'extérieur (palette, réinitialisation) : on resynchronise les curseurs.
  useEffect(() => {
    if (isHex(value) && value.toLowerCase() !== hslToHex(hsl)) setHsl(hexToHsl(value));
    setText(value);
  }, [value]);

  const set = (patch: Partial<Hsl>) => {
    const next = { ...hsl, ...patch };
    setHsl(next);
    onChange(hslToHex(next));
  };

  const vars = { "--h": hsl.h, "--s": `${hsl.s}%`, "--l": `${hsl.l}%` } as CSSProperties;

  return (
    <div className="picker" style={vars}>
      <div className="picker__presets">
        {colorPresets.map((c) => (
          <button key={c} className={`picker__preset${c === value.toLowerCase() ? " picker__preset--on" : ""}`}
            style={{ background: c }} aria-label={c} title={c} onClick={() => onChange(c)} />
        ))}
      </div>

      <label className="picker__row">
        <span>Teinte</span>
        <input type="range" className="picker__range picker__range--hue" min={0} max={360} value={hsl.h}
          onChange={(e) => set({ h: Number(e.target.value) })} />
      </label>
      <label className="picker__row">
        <span>Saturation</span>
        <input type="range" className="picker__range picker__range--sat" min={0} max={100} value={hsl.s}
          onChange={(e) => set({ s: Number(e.target.value) })} />
      </label>
      <label className="picker__row">
        <span>Luminosité</span>
        <input type="range" className="picker__range picker__range--light" min={0} max={100} value={hsl.l}
          onChange={(e) => set({ l: Number(e.target.value) })} />
      </label>

      <div className="picker__foot">
        <span className="picker__preview" style={{ background: value }} />
        <input className="picker__hex" value={text} spellCheck={false} maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setText(v);
            if (isHex(v)) onChange(v.toLowerCase());
          }} />
      </div>
    </div>
  );
}
