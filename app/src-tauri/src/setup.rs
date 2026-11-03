//! Profils Brave installés et leurs favoris, pour la reprise des données (lecture seule des fichiers de Brave).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize)]
pub struct BraveProfileInfo {
    /// Dossier du profil (« Default », « Profile 1 »…).
    dir: String,
    /// Nom affiché dans Brave.
    name: String,
}

pub(crate) fn user_data_dir() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(Path::new(&local).join(r"BraveSoftware\Brave-Browser\User Data"))
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

/// Profils déclarés dans « Local State » : (dossier, nom).
pub(crate) fn declared_profiles(user_data: &Path) -> Vec<(String, String)> {
    let Some(state) = read_json(&user_data.join("Local State")) else { return Vec::new() };
    let Some(cache) = state.pointer("/profile/info_cache").and_then(|c| c.as_object()) else { return Vec::new() };
    cache
        .iter()
        .map(|(dir, info)| (dir.clone(), info["name"].as_str().unwrap_or(dir).to_string()))
        .collect()
}

#[tauri::command]
pub fn brave_profiles() -> Vec<BraveProfileInfo> {
    let Some(user_data) = user_data_dir() else { return Vec::new() };
    let mut list: Vec<_> = declared_profiles(&user_data).into_iter().map(|(dir, name)| BraveProfileInfo { dir, name }).collect();
    list.sort_by(|a, b| a.dir.cmp(&b.dir));
    list
}

#[derive(Serialize)]
pub struct BookmarkNode {
    id: String,
    title: String,
    url: Option<String>,
    children: Option<Vec<BookmarkNode>>,
}

fn bookmark_node(node: &serde_json::Value) -> BookmarkNode {
    BookmarkNode {
        id: node["id"].as_str().unwrap_or_default().to_string(),
        title: node["name"].as_str().unwrap_or_default().to_string(),
        url: node["url"].as_str().map(str::to_string),
        children: node["children"].as_array().map(|c| c.iter().map(bookmark_node).collect()),
    }
}

/// Favoris d'un profil Brave, lus dans son fichier « Bookmarks » (lecture seule, Brave peut être fermé).
#[tauri::command]
pub fn brave_bookmarks(dir: String) -> Result<Vec<BookmarkNode>, String> {
    let user_data = user_data_dir().ok_or("dossier Brave introuvable")?;
    if !declared_profiles(&user_data).iter().any(|(d, _)| *d == dir) {
        return Err("profil Brave inconnu".into());
    }
    let file = read_json(&user_data.join(&dir).join("Bookmarks")).ok_or("aucun favori dans ce profil")?;
    Ok(["bookmark_bar", "other"]
        .iter()
        .filter_map(|root| file.pointer(&format!("/roots/{root}")))
        .map(bookmark_node)
        .collect())
}
