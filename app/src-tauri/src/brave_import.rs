//! Reprise des données d'un profil Brave : historique, sites les plus visités, mots de passe.
//! Tout reste sur la machine ; les mots de passe ne sont jamais écrits en clair ni affichés.
//! Les connexions (cookies) ne sont pas reprises : Brave les protège par un chiffrement lié à l'application.

use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use rusqlite::{types::Value, Connection, OpenFlags};
use serde::Serialize;
use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

use crate::setup::{declared_profiles, user_data_dir};

/// Écart entre l'époque de Chromium (1601) et celle d'Unix, en secondes.
const EPOCH_GAP: i64 = 11_644_473_600;

#[derive(Serialize)]
pub struct VisitedPage {
    url: String,
    title: String,
    visits: i64,
    /// Dernière visite, en millisecondes Unix.
    at: i64,
}

#[derive(Serialize)]
pub struct BraveHistory {
    recent: Vec<VisitedPage>,
    top: Vec<VisitedPage>,
}

fn brave_profile(dir: &str) -> Result<PathBuf, String> {
    let user_data = user_data_dir().ok_or("dossier Brave introuvable")?;
    if !declared_profiles(&user_data).iter().any(|(d, _)| d == dir) {
        return Err("profil Brave inconnu".into());
    }
    Ok(user_data.join(dir))
}

/// Base SQLite copiée à part : Brave la garde ouverte (et verrouillée) tant qu'il tourne.
struct Snapshot(PathBuf);

impl Snapshot {
    fn of(file: &Path) -> Result<Self, String> {
        let copy = std::env::temp_dir().join(format!("calti-{}-{}", std::process::id(), file.file_name().unwrap().to_string_lossy()));
        fs::copy(file, &copy).map_err(|e| format!("lecture de {} impossible ({e}) : fermez Brave et réessayez", file.display()))?;
        Ok(Snapshot(copy))
    }

    fn open(&self) -> Result<Connection, String> {
        Connection::open_with_flags(&self.0, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())
    }
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

/// Historique récent et sites les plus visités d'un profil Brave.
#[tauri::command]
pub fn brave_history(dir: String) -> Result<BraveHistory, String> {
    let snapshot = Snapshot::of(&brave_profile(&dir)?.join("History"))?;
    let db = snapshot.open()?;
    let query = |order: &str, limit: u32| -> Result<Vec<VisitedPage>, String> {
        let sql = format!(
            "SELECT url, title, visit_count, last_visit_time FROM urls
             WHERE hidden = 0 AND (url LIKE 'http%' OR url LIKE 'file:%') ORDER BY {order} LIMIT {limit}"
        );
        let mut stmt = db.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| {
            let micros: i64 = r.get(3)?;
            Ok(VisitedPage {
                url: r.get(0)?,
                title: r.get(1)?,
                visits: r.get(2)?,
                at: (micros / 1_000_000 - EPOCH_GAP) * 1000,
            })
        }).map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    };
    Ok(BraveHistory { recent: query("last_visit_time DESC", 1000)?, top: query("visit_count DESC", 80)? })
}

/// Clé AES d'un navigateur Chromium, protégée par DPAPI dans « Local State ».
fn browser_key(local_state: &Path) -> Result<Vec<u8>, String> {
    let state: serde_json::Value = serde_json::from_slice(&fs::read(local_state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let encoded = state.pointer("/os_crypt/encrypted_key").and_then(|v| v.as_str()).ok_or("clé de chiffrement absente")?;
    let blob = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    let protected = blob.strip_prefix(b"DPAPI").ok_or("clé de chiffrement inattendue")?;
    unprotect(protected)
}

fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
        let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        if CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), 0, &mut output) == 0 {
            return Err("déchiffrement Windows refusé".into());
        }
        let key = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        LocalFree(output.pbData as _);
        Ok(key)
    }
}

/// Champs d'un fichier CSV (guillemets doublés, retours à la ligne entre guillemets).
fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let (mut rows, mut row, mut field, mut quoted) = (Vec::new(), Vec::new(), String::new(), false);
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => { field.push('"'); chars.next(); }
            ('"', _) => quoted = !quoted,
            (',', false) => row.push(std::mem::take(&mut field)),
            ('\r', false) => {}
            ('\n', false) => { row.push(std::mem::take(&mut field)); rows.push(std::mem::take(&mut row)); }
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows
}

/// Identifiants exportés par Brave (Gestionnaire de mots de passe → Exporter : name, url, username, password, note),
/// ajoutés au profil Calti. Calti doit être fermé.
pub fn import_passwords_csv(file: &Path, calti_profile: &str) -> Result<PasswordImport, String> {
    let rows = parse_csv(&fs::read_to_string(file).map_err(|e| e.to_string())?);
    let header = rows.first().ok_or("fichier vide")?;
    let col = |name: &str| header.iter().position(|h| h.trim().eq_ignore_ascii_case(name));
    let (url_i, user_i, pass_i) = (col("url").ok_or("colonne url absente")?, col("username").ok_or("colonne username absente")?, col("password").ok_or("colonne password absente")?);

    let local = std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA absent")?;
    let webview = Path::new(&local).join("fr.calti.app").join("profiles").join(calti_profile).join("EBWebView");
    let cipher = Aes256Gcm::new_from_slice(&browser_key(&webview.join("Local State"))
        .map_err(|e| format!("profil Calti « {calti_profile} » : {e} (ouvrez-le une fois dans Calti)"))?).map_err(|e| e.to_string())?;
    let target = Connection::open(webview.join("Default").join("Login Data")).map_err(|e| e.to_string())?;
    let mut stmt = target.prepare("PRAGMA table_info(logins)").map_err(|e| e.to_string())?;
    let columns: Vec<(String, String, bool)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)? != 0)))
        .map_err(|e| e.to_string())?
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    let columns: Vec<_> = columns.into_iter().filter(|(name, ..)| name != "id").collect();
    let insert = format!(
        "INSERT OR IGNORE INTO logins ({}) VALUES ({})",
        columns.iter().map(|(n, ..)| n.as_str()).collect::<Vec<_>>().join(", "),
        vec!["?"; columns.len()].join(", "),
    );
    // Date de Chromium : microsecondes depuis 1601.
    let now = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64 + EPOCH_GAP) * 1_000_000;

    let mut report = PasswordImport::default();
    for row in rows.iter().skip(1) {
        let (Some(url), Some(user), Some(password)) = (row.get(url_i), row.get(user_i), row.get(pass_i)) else { continue };
        let Ok(parsed) = tauri::Url::parse(url) else { continue };
        if password.is_empty() || !matches!(parsed.scheme(), "http" | "https") {
            continue;
        }
        let origin = format!("{}://{}/", parsed.scheme(), parsed.host_str().unwrap_or_default());
        let origin = match parsed.port() { Some(p) => format!("{}:{p}/", origin.trim_end_matches('/')), None => origin };
        let mut nonce = [0u8; 12];
        getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
        let mut encrypted = b"v10".to_vec();
        encrypted.extend_from_slice(&nonce);
        encrypted.extend(cipher.encrypt(Nonce::from_slice(&nonce), password.as_bytes()).map_err(|_| "chiffrement impossible")?);
        let values: Vec<Value> = columns.iter().map(|(name, kind, not_null)| match name.as_str() {
            "origin_url" => Value::Text(url.clone()),
            "action_url" => Value::Text(url.clone()),
            "signon_realm" => Value::Text(origin.clone()),
            "username_value" => Value::Text(user.clone()),
            "password_value" => Value::Blob(encrypted.clone()),
            "date_created" | "date_last_used" | "date_password_modified" => Value::Integer(now),
            _ if *not_null => match kind.to_ascii_uppercase().as_str() {
                k if k.contains("INT") => Value::Integer(0),
                "BLOB" => Value::Blob(Vec::new()),
                _ => Value::Text(String::new()),
            },
            _ => Value::Null,
        }).collect();
        if exists(&target, &values, &columns)? {
            report.already += 1;
            continue;
        }
        target.execute(&insert, rusqlite::params_from_iter(values)).map_err(|e| e.to_string())?;
        report.imported += 1;
    }
    Ok(report)
}

#[derive(Default, Serialize)]
pub struct PasswordImport {
    pub imported: usize,
    pub already: usize,
    /// Chiffrés par une protection liée à Brave (v20) : illisibles hors de Brave.
    pub locked: usize,
}

/// Copie les identifiants enregistrés d'un profil Brave dans un profil Calti. Calti doit être fermé :
/// WebView2 garde sa base de mots de passe ouverte tant que le profil est utilisé.
pub fn import_passwords(brave_dir: &str, calti_profile: &str) -> Result<PasswordImport, String> {
    let brave = brave_profile(brave_dir)?;
    let brave_cipher = Aes256Gcm::new_from_slice(&browser_key(&brave.parent().unwrap().join("Local State"))?).map_err(|e| e.to_string())?;
    let local = std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA absent")?;
    let webview = Path::new(&local).join("fr.calti.app").join("profiles").join(calti_profile).join("EBWebView");
    let calti_cipher = Aes256Gcm::new_from_slice(&browser_key(&webview.join("Local State"))
        .map_err(|e| format!("profil Calti « {calti_profile} » : {e} (ouvrez-le une fois dans Calti)"))?).map_err(|e| e.to_string())?;

    let snapshot = Snapshot::of(&brave.join("Login Data"))?;
    let source = snapshot.open()?;
    let target = Connection::open(webview.join("Default").join("Login Data")).map_err(|e| e.to_string())?;

    // Colonnes des deux bases (Brave peut être plus récent que WebView2) : on remplit celles de Calti.
    let columns = |db: &Connection| -> Result<Vec<(String, String, bool)>, String> {
        let mut stmt = db.prepare("PRAGMA table_info(logins)").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)? != 0)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    };
    let target_columns: Vec<_> = columns(&target)?.into_iter().filter(|(name, ..)| name != "id").collect();
    let source_names: Vec<String> = columns(&source)?.into_iter().map(|(name, ..)| name).collect();

    let mut stmt = source.prepare(&format!("SELECT {} FROM logins", source_names.join(", "))).map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let insert = format!(
        "INSERT OR IGNORE INTO logins ({}) VALUES ({})",
        target_columns.iter().map(|(n, ..)| n.as_str()).collect::<Vec<_>>().join(", "),
        vec!["?"; target_columns.len()].join(", "),
    );
    let mut report = PasswordImport::default();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let get = |name: &str| source_names.iter().position(|n| n == name).map(|i| row.get::<_, Value>(i).unwrap_or(Value::Null));
        let Some(Value::Blob(encrypted)) = get("password_value") else { continue };
        let password = match encrypted.get(..3) {
            Some(b"v10") | Some(b"v11") if encrypted.len() > 15 => brave_cipher
                .decrypt(Nonce::from_slice(&encrypted[3..15]), &encrypted[15..])
                .map_err(|_| "mot de passe illisible".to_string())?,
            _ => {
                report.locked += 1;
                continue;
            }
        };
        let mut nonce = [0u8; 12];
        getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
        let mut reencrypted = b"v10".to_vec();
        reencrypted.extend_from_slice(&nonce);
        reencrypted.extend(calti_cipher.encrypt(Nonce::from_slice(&nonce), password.as_slice()).map_err(|_| "chiffrement impossible")?);

        let values: Vec<Value> = target_columns.iter().map(|(name, kind, not_null)| {
            if name == "password_value" {
                return Value::Blob(reencrypted.clone());
            }
            match get(name) {
                Some(v) => v,
                // Colonne propre à WebView2 : valeur neutre si elle est obligatoire.
                None if *not_null => match kind.to_ascii_uppercase().as_str() {
                    k if k.contains("INT") => Value::Integer(0),
                    "BLOB" => Value::Blob(Vec::new()),
                    _ => Value::Text(String::new()),
                },
                None => Value::Null,
            }
        }).collect();
        if exists(&target, &values, &target_columns)? {
            report.already += 1;
            continue;
        }
        target.execute(&insert, rusqlite::params_from_iter(values)).map_err(|e| e.to_string())?;
        report.imported += 1;
    }
    Ok(report)
}

/// Même site et même identifiant déjà enregistrés (WebView2 n'impose pas toujours l'unicité).
fn exists(db: &Connection, values: &[Value], columns: &[(String, String, bool)]) -> Result<bool, String> {
    let get = |name: &str| columns.iter().position(|(n, ..)| n == name).map(|i| values[i].clone()).unwrap_or(Value::Null);
    db.query_row(
        "SELECT COUNT(*) FROM logins WHERE signon_realm = ?1 AND username_value = ?2",
        [get("signon_realm"), get("username_value")],
        |r| r.get::<_, i64>(0),
    )
    .map(|n| n > 0)
    .map_err(|e| e.to_string())
}

/// Dossier des imports en attente : la base de mots de passe d'un profil n'est modifiable que Calti fermé.
fn pending_dir() -> Option<PathBuf> {
    Some(Path::new(&std::env::var_os("LOCALAPPDATA")?).join("fr.calti.app").join("pending"))
}

fn valid_profile(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Met de côté un export CSV de Brave ; il sera importé au prochain lancement, avant l'ouverture des pages.
#[tauri::command]
pub fn queue_password_import(profile: String, csv: String) -> Result<(), String> {
    if !valid_profile(&profile) {
        return Err("profil invalide".into());
    }
    let dir = pending_dir().ok_or("LOCALAPPDATA absent")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("passwords-{profile}.csv")), csv).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct PendingResult {
    profile: String,
    imported: usize,
    already: usize,
    error: Option<String>,
}

/// Au lancement, avant WebView2 : importe les exports en attente, puis les efface (ils contiennent des mots de passe en clair).
pub fn run_pending_imports() {
    let Some(dir) = pending_dir() else { return };
    let Ok(entries) = fs::read_dir(&dir) else { return };
    let mut results = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(profile) = name.strip_prefix("passwords-").and_then(|n| n.strip_suffix(".csv")) else { continue };
        let result = import_passwords_csv(&entry.path(), profile);
        let _ = fs::remove_file(entry.path());
        results.push(match result {
            Ok(r) => PendingResult { profile: profile.into(), imported: r.imported, already: r.already, error: None },
            Err(e) => PendingResult { profile: profile.into(), imported: 0, already: 0, error: Some(e) },
        });
    }
    if !results.is_empty() {
        let _ = fs::write(dir.join("result.json"), serde_json::to_vec(&results).unwrap_or_default());
    }
}

/// Résultat du dernier import fait au lancement (lu une seule fois).
#[tauri::command]
pub fn password_import_result() -> Option<serde_json::Value> {
    let file = pending_dir()?.join("result.json");
    let value = serde_json::from_slice(&fs::read(&file).ok()?).ok();
    let _ = fs::remove_file(file);
    value
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
