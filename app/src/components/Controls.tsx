// Contrôles de réglage partagés par le tiroir Réglages et l'inspecteur de l'éditeur.
import type { ReactNode } from "react";
import "./Controls.css";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      {format && <output>{format(value)}</output>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }:
  { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "segmented--on" : ""} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/** Couleur facultative : vide = couleur par défaut du thème. */
export function ColorField({ label, value, onChange }:
  { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  return (
    <div className="color-field">
      <span>{label}</span>
      <label className={`color-field__swatch${value ? "" : " color-field__swatch--auto"}`} style={{ background: value }}>
        <input type="color" value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} />
      </label>
      {value ? <button className="color-field__clear" onClick={() => onChange(undefined)}>Auto</button>
        : <span className="color-field__auto">Auto</span>}
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
