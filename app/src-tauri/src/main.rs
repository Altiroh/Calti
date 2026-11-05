#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

mod brave_import;
mod clipboard;
mod features;
mod launch;
mod state;
mod browser;
mod native;
mod devtools;
mod pagemenu;
mod media;
mod setup;
mod suggest;

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
    let cwd = std::env::current_dir().map(|d| d.to_string_lossy().to_string()).unwrap_or_default();
    launch::remember(launch::urls_from_args(&args, &cwd));
    let mut builder = tauri::Builder::default();
    // Instance d'essai (dossier WebView2 isolé) : indépendante de celle déjà ouverte.
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| launch::second_instance(app, args, cwd)));
    }
    builder
        .manage(browser::Browser::default())
        .setup(|app| {
            clipboard::watch(app.handle().clone());
            media::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                browser::forget_window(window.app_handle(), window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
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
            suggest::search_suggestions,
            brave_import::queue_password_import,
            brave_import::password_import_result,
            brave_import::restart_app,
            native::taskbar_overlay,
            native::ui_devtools,
            native::alt_held,
            media::media_state,
            media::media_control,
            pagemenu::page_menu_pick,
            devtools::devtools_toggle,
            devtools::devtools_undock,
            native::window_identity,
            features::blocker_configure,
            features::zoom_settings,
            features::zoom_set,
            features::downloads_list,
            features::download_cancel,
            features::download_open,
            features::downloads_clear,
            features::site_permissions,
            features::site_permission_set,
            features::clear_browsing_data,
            launch::take_launch_urls,
            state::state_load,
            state::state_save,
            state::state_log,
            launch::register_default_browser,
            clipboard::clipboard_image,
            clipboard::clipboard_pause,
            setup::brave_profiles,
            setup::brave_bookmarks,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
