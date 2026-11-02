//! Aide à la connexion : profils Brave installés, présence de l'extension, raccourcis d'installation.
//! Lecture seule des fichiers de Brave, à l'exception du lancement de Brave et de l'Explorateur.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use bridge::EXTENSION_ID;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BraveProfileInfo {
    /// Dossier du profil (« Default », « Profile 1 »…).
    dir: String,
    /// Nom affiché dans Brave.
    name: String,
    extension_installed: bool,
    /// Identifiants Calti trouvés dans le stockage de l'extension de ce profil.
    profile_ids: Vec<String>,
    /// Dernière erreur Native Messaging signalée par l'extension (vide si la liaison a fonctionné depuis).
    native_error: Option<String>,
}

/// Fichiers du stockage local de l'extension d'un profil, du plus ancien au plus récent.
fn storage_files(profile: &Path) -> Vec<Vec<u8>> {
    let dir = profile.join("Local Extension Settings").join(EXTENSION_ID);
    let mut entries: Vec<_> = fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path()).collect();
    entries.sort();
    entries.iter().filter_map(|p| fs::read(p).ok()).collect()
}

/// Dernière valeur écrite pour `lastNativeError` (chaîne JSON lisible dans le journal LevelDB).
fn last_native_error(files: &[Vec<u8>]) -> Option<String> {
    const KEY: &[u8] = b"lastNativeError";
    let mut last = None;
    for bytes in files {
        let mut from = 0;
        while let Some(pos) = find(&bytes[from..], KEY).map(|p| p + from) {
            from = pos + KEY.len();
            // Ignore la clé voisine « lastNativeErrorAt ».
            if bytes.get(from) == Some(&b'A') {
                continue;
            }
            let rest = &bytes[from..bytes.len().min(from + 400)];
            let Some(start) = rest.iter().position(|&c| c == b'"') else { continue };
            let Some(len) = rest[start + 1..].iter().position(|&c| c == b'"') else { continue };
            last = Some(String::from_utf8_lossy(&rest[start + 1..start + 1 + len]).into_owned());
        }
    }
    last.filter(|m| !m.is_empty())
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn user_data_dir() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA")?;
    Some(Path::new(&local).join(r"BraveSoftware\Brave-Browser\User Data"))
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

/// Profils déclarés dans « Local State » : (dossier, nom).
fn declared_profiles(user_data: &Path) -> Vec<(String, String)> {
    let Some(state) = read_json(&user_data.join("Local State")) else { return Vec::new() };
    let Some(cache) = state.pointer("/profile/info_cache").and_then(|c| c.as_object()) else { return Vec::new() };
    cache
        .iter()
        .map(|(dir, info)| (dir.clone(), info["name"].as_str().unwrap_or(dir).to_string()))
        .collect()
}

fn extension_installed(profile: &Path) -> bool {
    ["Secure Preferences", "Preferences"].iter().any(|file| {
        read_json(&profile.join(file))
            .and_then(|prefs| prefs.pointer(&format!("/extensions/settings/{EXTENSION_ID}")).cloned())
            .is_some()
    })
}

/// Cherche les UUID écrits par l'extension dans son stockage local (fichiers LevelDB, où ils restent lisibles).
fn stored_profile_ids(files: &[Vec<u8>]) -> Vec<String> {
    let mut ids = Vec::new();
    for bytes in files {
        for window in bytes.windows(36) {
            if is_uuid(window) {
                let id = String::from_utf8_lossy(window).into_owned();
                if !ids.contains(&id) {
                    ids.push(id);
                }
            }
        }
    }
    ids
}

fn is_uuid(b: &[u8]) -> bool {
    b.iter().enumerate().all(|(i, c)| match i {
        8 | 13 | 18 | 23 => *c == b'-',
        _ => c.is_ascii_hexdigit() && !c.is_ascii_uppercase(),
    })
}

#[tauri::command]
pub fn brave_profiles() -> Vec<BraveProfileInfo> {
    let Some(user_data) = user_data_dir() else { return Vec::new() };
    let mut list: Vec<_> = declared_profiles(&user_data)
        .into_iter()
        .map(|(dir, name)| {
            let path = user_data.join(&dir);
            let files = storage_files(&path);
            BraveProfileInfo {
                extension_installed: extension_installed(&path),
                profile_ids: stored_profile_ids(&files),
                native_error: last_native_error(&files),
                dir,
                name,
            }
        })
        .collect();
    list.sort_by(|a, b| a.dir.cmp(&b.dir));
    list
}

fn brave_exe() -> Option<PathBuf> {
    ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|base| Path::new(&base).join(r"BraveSoftware\Brave-Browser\Application\brave.exe"))
        .find(|p| p.exists())
}

/// Lance Brave dans un profil déclaré, éventuellement sur une adresse.
fn spawn_brave(dir: Option<&str>, url: Option<&str>) -> Result<(), String> {
    let user_data = user_data_dir().ok_or("dossier Brave introuvable")?;
    let mut command = Command::new(brave_exe().ok_or("brave.exe introuvable")?);
    if let Some(dir) = dir {
        // Seuls les profils déclarés par Brave sont acceptés.
        if !declared_profiles(&user_data).iter().any(|(d, _)| d == dir) {
            return Err("profil Brave inconnu".into());
        }
        command.arg(format!("--profile-directory={dir}"));
    }
    if let Some(url) = url {
        command.arg(url);
    }
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Ouvre la page des extensions de Brave dans le profil demandé.
#[tauri::command]
pub fn open_brave_extensions(dir: String) -> Result<(), String> {
    spawn_brave(Some(&dir), Some("brave://extensions/"))
}

/// Démarre Brave quand il est fermé ; une adresse http(s) s'ouvre directement dans un onglet.
#[tauri::command]
pub fn launch_brave(dir: Option<String>, url: Option<String>) -> Result<(), String> {
    if let Some(url) = &url {
        match tauri::Url::parse(url) {
            Ok(u) if matches!(u.scheme(), "http" | "https") => {}
            _ => return Err("seules les adresses http(s) sont acceptées".into()),
        }
    }
    spawn_brave(dir.as_deref(), url.as_deref())
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

/// Dossier `extension/` du projet (application personnelle compilée depuis les sources).
fn extension_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(r"..\..\extension")
}

/// Ouvre le dossier de l'extension dans l'Explorateur et renvoie son chemin (à coller dans Brave).
#[tauri::command]
pub fn reveal_extension_folder() -> Result<String, String> {
    let dir = extension_dir().canonicalize().map_err(|e| e.to_string())?;
    // L'Explorateur et Brave n'acceptent pas le préfixe \\?\ ajouté par canonicalize.
    let dir = dir.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;
    Ok(dir)
}
