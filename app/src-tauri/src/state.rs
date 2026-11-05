//! Copie de sécurité des réglages et des sessions de Calti dans un fichier.
//!
//! L'interface garde ses données dans le stockage local de WebView2, qui écrit sur le disque en différé : un arrêt
//! brutal de l'ordinateur (mise en veille prolongée, arrêt rapide) peut le laisser vide au lancement suivant. La
//! fenêtre principale recopie donc régulièrement ce stockage ici (écriture atomique), et le reprend au lancement
//! si cette copie est plus récente que lui.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const FILE: &str = "etat.json";
const LOG: &str = "etat.log";
const LOG_MAX: u64 = 256 * 1024;
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

/// Nombre de profils d'une copie (réglages `calti.settings.v3`, champ `profileOrder`).
fn profiles_in(snapshot: &serde_json::Value) -> usize {
    snapshot["data"]["calti.settings.v3"]
        .as_str()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .and_then(|v| v["profileOrder"].as_array().map(|a| a.len()))
        .unwrap_or(0)
}

/// Ajoute une ligne datée au journal de la copie (etat.log, recommencé au-delà de 256 Ko).
fn append_log(app: &AppHandle, line: &str) {
    use std::io::Write;
    let Some(dir) = data_dir(app) else { return };
    let path = dir.join(LOG);
    if std::fs::metadata(&path).map(|m| m.len() > LOG_MAX).unwrap_or(false) {
        let _ = std::fs::rename(&path, dir.join("etat.log.old"));
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{now} {line}");
    }
}

/// Journal de la copie, écrit par l'interface (décisions de reprise, copies refusées).
#[tauri::command]
pub fn state_log(app: AppHandle, line: String) {
    append_log(&app, &line.chars().take(500).collect::<String>());
}

/// Enregistre la copie : fichier temporaire puis remplacement, l'ancienne copie gardée en « etat.prev.json ».
/// Un arrêt pendant l'écriture laisse toujours un fichier complet.
#[tauri::command]
pub fn state_save(app: AppHandle, data: String) -> Result<(), String> {
    let parsed = (data.len() <= MAX_SIZE).then(|| serde_json::from_str::<serde_json::Value>(&data).ok()).flatten();
    let Some(parsed) = parsed else {
        return Err("copie refusée (trop grande ou invalide)".into());
    };
    let dir = data_dir(&app).ok_or("dossier des données introuvable")?;
    // Une copie sans profil ne remplace jamais une copie qui en a (stockage de WebView2 perdu entre-temps).
    if profiles_in(&parsed) == 0 {
        let previous = std::fs::read_to_string(dir.join(FILE)).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());
        if previous.as_ref().map_or(0, profiles_in) > 0 {
            append_log(&app, "copie sans profil refusée : la copie précédente est gardée");
            return Err("copie sans profil refusée".into());
        }
    }
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
