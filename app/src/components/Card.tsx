import type { ReactNode } from "react";
import "./Card.css";

/** Carte de verre avec en-tête (titre et action facultative). */
export function Card({ title, action, className = "", children }:
  { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`card glass ${className}`}>
      <header className="card__head">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
