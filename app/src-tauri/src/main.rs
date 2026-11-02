#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod brave;
mod protocol;
mod setup;

fn main() {
    tauri::Builder::default()
        .manage(brave::BraveLink::default())
        .setup(|app| {
            brave::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            brave::brave_send,
            brave::brave_state,
            setup::brave_profiles,
            setup::open_brave_extensions,
            setup::launch_brave,
            setup::reveal_extension_folder,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
