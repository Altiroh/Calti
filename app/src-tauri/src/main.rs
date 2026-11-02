#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod brave;
mod browser;
mod protocol;
mod setup;

fn main() {
    tauri::Builder::default()
        .manage(brave::BraveLink::default())
        .manage(browser::Browser::default())
        .setup(|app| {
            brave::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                browser::forget_window(window.app_handle(), window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            brave::brave_send,
            brave::brave_state,
            browser::browser_tabs,
            browser::browser_open,
            browser::browser_close,
            browser::browser_layout,
            browser::browser_navigate,
            browser::browser_action,
            browser::browser_new_window,
            setup::brave_profiles,
            setup::brave_bookmarks,
            setup::open_brave_extensions,
            setup::launch_brave,
            setup::reveal_extension_folder,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
