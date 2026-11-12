//! Images de Calti (fond d'écran, photos de profil, préréglages) enregistrées en fichiers WebP, dans `images/`.
//!
//! L'interface les garde aussi dans IndexedDB, qui sert de cache : WebView2 peut le perdre (arrêt brutal, fichiers
//! verrouillés au lancement), alors que ces fichiers restent. Une image absente d'IndexedDB est relue ici.

use std::path::PathBuf;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::AppHandle;

use crate::state::data_dir;

const MAX_SIZE: usize = 16 * 1024 * 1024;

/// Clé sûre (lettres, chiffres, tirets, soulignés) : elle devient un nom de fichier.
fn path_for(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.is_empty() || key.len() > 120 || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("clé d'image invalide : {key}"));
    }
    let dir = data_dir(app).ok_or("dossier de données introuvable")?.join("images");
    Ok(dir.join(format!("{key}.webp")))
}

/// Enregistre une image : octets bruts dans le corps, clé dans l'en-tête `key`. Écriture atomique.
#[tauri::command]
pub fn image_save(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let key = request.headers().get("key").and_then(|v| v.to_str().ok()).ok_or("clé d'image manquante")?;
    let InvokeBody::Raw(bytes) = request.body() else { return Err("image attendue en octets".into()) };
    if bytes.is_empty() || bytes.len() > MAX_SIZE {
        return Err(format!("taille d'image refusée : {} octets", bytes.len()));
    }
    let path = path_for(&app, key)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("webp.tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Octets de l'image, ou rien (corps vide) si elle n'existe pas.
#[tauri::command]
pub fn image_load(app: AppHandle, key: String) -> Result<Response, String> {
    match std::fs::read(path_for(&app, &key)?) {
        Ok(bytes) => Ok(Response::new(bytes)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn image_delete(app: AppHandle, key: String) -> Result<(), String> {
    match std::fs::remove_file(path_for(&app, &key)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Clés des images enregistrées.
#[tauri::command]
pub fn image_list(app: AppHandle) -> Vec<String> {
    let Some(dir) = data_dir(&app) else { return Vec::new() };
    let Ok(entries) = std::fs::read_dir(dir.join("images")) else { return Vec::new() };
    entries
        .flatten()
        .filter_map(|e| e.file_name().to_str()?.strip_suffix(".webp").map(str::to_owned))
        .collect()
}
