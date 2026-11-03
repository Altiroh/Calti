// Événements de Tauri reçus par cette fenêtre seulement : ceux qui lui sont adressés et ceux envoyés à toutes.
// (`listen` de @tauri-apps/api/event reçoit aussi ceux destinés aux autres fenêtres.)
import type { EventCallback } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export function listen<T>(event: string, handler: EventCallback<T>) {
  return getCurrentWebviewWindow().listen<T>(event, handler);
}
