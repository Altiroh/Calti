#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod brave;
mod brave_import;
mod clipboard;
mod browser;
mod native;
mod protocol;
mod setup;

fn main() {
    // `calti --import-brave-passwords <profil Brave> <profil Calti>` : à lancer Calti fermé.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--import-brave-passwords") && args.len() == 4 {
        match brave_import::import_passwords(&args[2], &args[3]) {
            Ok(r) => println!("importés {} · déjà présents {} · illisibles hors de Brave {}", r.imported, r.already, r.locked),
            Err(e) => { eprintln!("échec : {e}"); std::process::exit(1) }
        }
        return;
    }
    // `calti --import-passwords-csv <fichier exporté par Brave> <profil Calti>` : à lancer Calti fermé.
    if args.get(1).map(String::as_str) == Some("--import-passwords-csv") && args.len() == 4 {
        match brave_import::import_passwords_csv(std::path::Path::new(&args[2]), &args[3]) {
            Ok(r) => println!("importés {} · déjà présents {}", r.imported, r.already),
            Err(e) => { eprintln!("échec : {e}"); std::process::exit(1) }
        }
        return;
    }
    // Mots de passe repris de Brave, mis de côté : importés avant que WebView2 n’ouvre les profils.
    brave_import::run_pending_imports();
    tauri::Builder::default()
        .manage(brave::BraveLink::default())
        .manage(browser::Browser::default())
        .setup(|app| {
            brave::start(app.handle().clone());
            clipboard::watch(app.handle().clone());
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
            browser::browser_eval,
            browser::browser_move,
            brave_import::brave_history,
            brave_import::queue_password_import,
            brave_import::password_import_result,
            brave_import::restart_app,
            native::taskbar_overlay,
            clipboard::clipboard_image,
            clipboard::clipboard_pause,
            setup::brave_profiles,
            setup::brave_bookmarks,
            setup::open_brave_extensions,
            setup::launch_brave,
            setup::reveal_extension_folder,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
