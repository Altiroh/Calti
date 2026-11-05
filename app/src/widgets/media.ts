// Lecture en cours, telle que Windows la connaît (app/src-tauri/src/media.rs) : Spotify, page web, lecteur…
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { listen } from "../browser/windowEvents";

export interface MediaState {
  /** Application qui joue (identifiant Windows, ex. « Spotify.exe »). */
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  position: number;
  duration: number;
  canPrevious: boolean;
  canNext: boolean;
  /** Pochette (image « data: »), ou vide. */
  cover: string;
}

/** Nom lisible de l'application : « Spotify.exe » → « Spotify », « Microsoft.ZuneMusic_8wek…!Microsoft.ZuneMusic » → « ZuneMusic ». */
export function appName(id: string): string {
  if (!id) return "";
  const last = id.split("!").pop()!.split("\\").pop()!.replace(/\.exe$/i, "");
  const name = last.split(".").pop() || last;
  const known: Record<string, string> = { msedge: "Edge", chrome: "Chrome", firefox: "Firefox", calti: "Calti", ZuneMusic: "Lecteur multimédia", vlc: "VLC" };
  return known[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export const isSpotify = (m: MediaState | null) => !!m && /spotify/i.test(m.app);

export const control = (action: "toggle" | "next" | "previous") => invoke("media_control", { action }).catch(() => {});

/** État de la lecture, suivi en direct ; la position avance entre deux nouvelles de Windows. */
export function useMedia() {
  const [state, setState] = useState<{ media: MediaState | null; at: number }>({ media: null, at: Date.now() });
  const [, tick] = useState(0);
  useEffect(() => {
    invoke<MediaState | null>("media_state").then((media) => setState({ media, at: Date.now() })).catch(() => {});
    const off = listen<MediaState | null>("media:state", (e) => setState({ media: e.payload, at: Date.now() }));
    return () => { off.then((u) => u()); };
  }, []);
  useEffect(() => {
    if (!state.media?.playing) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [state.media?.playing]);
  const media = state.media;
  const position = media ? Math.min(media.duration || Infinity, media.position + (media.playing ? (Date.now() - state.at) / 1000 : 0)) : 0;
  return { media, position };
}

export const clock = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
