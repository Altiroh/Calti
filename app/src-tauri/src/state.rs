//! Copie de sécurité des réglages et des sessions de Calti dans un fichier.
//!
//! L'interface garde ses données dans le stockage local de WebView2, qui écrit sur le disque en différé : un arrêt
//! brutal de l'ordinateur (mise en veille prolongée, arrêt rapide) peut le laisser vide au lancement suivant. La
//! fenêtre principale recopie donc régulièrement ce stockage ici (écriture atomique), et le reprend au lancement
//! si cette copie est plus récente que lui.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const FILE: &str = "etat.json";
const MAX_SIZE: usize = 20 * 1024 * 1024;

/// Dossier des données de Calti. Une instance d'essai (dossier WebView2 isolé) garde les siennes à part,
/// pour ne jamais lire ni écraser celles de l'utilisateur.
pub(crate) fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    match std::env::var_os("WEBVIEW2_USER_DATA_FOLDER") {
        Some(dir) => Some(PathBuf::from(dir)),
        None => app.path().app_local_data_dir().ok(),
    }
}

/// Copie enregistrée (JSON : génération, date, clés du stockage local), absente au tout premier lancement.
#[tauri::command]
pub fn state_load(app: AppHandle) -> Option<String> {
    std::fs::read_to_string(data_dir(&app)?.join(FILE)).ok()
}

/// Enregistre la copie : fichier temporaire puis remplacement, l'ancienne copie gardée en « etat.prev.json ».
/// Un arrêt pendant l'écriture laisse toujours un fichier complet.
#[tauri::command]
pub fn state_save(app: AppHandle, data: String) -> Result<(), String> {
    if data.len() > MAX_SIZE || serde_json::from_str::<serde_json::Value>(&data).is_err() {
        return Err("copie refusée (trop grande ou invalide)".into());
    }
    let dir = data_dir(&app).ok_or("dossier des données introuvable")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(FILE);
    let temp = dir.join("etat.json.tmp");
    {
        use std::io::Write;
        let mut out = std::fs::File::create(&temp).map_err(|e| e.to_string())?;
        out.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        // Sur le disque avant le remplacement, même si Windows s'arrête juste après.
        out.sync_all().map_err(|e| e.to_string())?;
    }
    if file.exists() {
        let _ = std::fs::copy(&file, dir.join("etat.prev.json"));
    }
    std::fs::rename(&temp, &file).map_err(|e| e.to_string())
}
