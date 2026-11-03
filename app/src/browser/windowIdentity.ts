// Identité de la fenêtre dans Windows : icône de la barre des tâches = badge du profil affiché,
// titre (survol de la barre des tâches, Alt+Tab) = « Calti — page affichée ».
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readableOn } from "../components/ProfileBadge";
import { useBackground } from "../settings/backgrounds";
import { meshes, profileImageKey, type ProfileSettings } from "../settings/settings";

const SIZE = 64;

/** Couleur éclaircie (mélange avec du blanc), pour le dégradé léger du badge. */
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Badge du profil dessiné en PNG, comme ProfileBadge : image, dégradés ou couleur, et icône ou initiales. */
async function badgePng(p: ProfileSettings, image: string | null): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  g.beginPath();
  g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
  g.clip();
  if (image) {
    const img = await loadImage(image);
    const side = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  } else {
    let fill: CanvasGradient;
    if (p.avatar === "mesh") {
      const colors = meshes[p.mesh ?? "aurore"];
      fill = g.createConicGradient(Math.PI * 1.1, SIZE / 2, SIZE / 2);
      [...colors, colors[0]].forEach((c, i, all) => fill.addColorStop(i / (all.length - 1), c));
    } else {
      fill = g.createLinearGradient(0, 0, SIZE, SIZE);
      fill.addColorStop(0, p.avatar === "gradient" ? p.color : lighten(p.color, 0.22));
      fill.addColorStop(1, p.avatar === "gradient" ? p.color2 ?? "#a259ff" : p.color);
    }
    g.fillStyle = fill;
    g.fillRect(0, 0, SIZE, SIZE);
    const text = p.icon || p.name.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase());
    g.fillStyle = p.avatar === "mesh" || p.avatar === "gradient" ? "#fff" : readableOn(p.color);
    g.font = `700 ${p.icon ? 34 : 26}px "Segoe UI", "Segoe UI Emoji", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, SIZE / 2, SIZE / 2 + 2);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject()), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

export function useWindowIdentity(profile: ProfileSettings, pageTitle: string | null) {
  const image = useBackground(profileImageKey(profile.id), profile.avatar === "image" ? profile.image ?? null : null);
  const look = JSON.stringify([profile.icon, profile.name, profile.color, profile.color2, profile.avatar, profile.mesh, image]);

  // Fenêtre secondaire : identité propre à son profil, donc son propre bouton (et son icône) dans la barre des
  // tâches. La principale reste rangée sous Calti épinglé, avec le badge superposé.
  useEffect(() => {
    if (getCurrentWindow().label === "main") return;
    invoke("window_identity", { appId: `fr.calti.app.profil.${profile.id}` }).catch(() => {});
  }, [profile.id]);

  useEffect(() => {
    // Image du profil pas encore chargée : on attend plutôt que d'afficher un badge provisoire.
    if (profile.avatar === "image" && profile.image && !image) return;
    badgePng(profile, image).then((png) => {
      getCurrentWindow().setIcon(png).catch(() => {});
      // Calti épinglé : Windows garde l’icône du raccourci, le badge y est superposé.
      invoke("taskbar_overlay", { png: Array.from(png), label: profile.name }).catch(() => {});
    }).catch(() => {});
  }, [look]);

  useEffect(() => {
    const title = pageTitle?.trim() ? `Calti — ${pageTitle.trim()}` : `Calti — ${profile.name}`;
    getCurrentWindow().setTitle(title).catch(() => {});
  }, [pageTitle, profile.name]);
}
