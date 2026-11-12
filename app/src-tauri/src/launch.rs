//! Calti comme navigateur par défaut : une seule instance, qui reçoit les liens ouverts depuis d'autres applications.

use std::os::windows::process::CommandExt;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Url};

/// Liens reçus au lancement, en attente que l'interface de la fenêtre principale soit prête.
static PENDING: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// Adresses passées en argument : liens web, ou fichiers locaux (pages enregistrées, PDF, images).
pub fn urls_from_args(args: &[String], cwd: &str) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with("--"))
        .filter_map(|a| match Url::parse(a) {
            Ok(u) if matches!(u.scheme(), "http" | "https" | "file") => Some(u.to_string()),
            _ => {
                let path = std::path::Path::new(cwd).join(a);
                path.exists().then(|| Url::from_file_path(&path).ok()).flatten().map(|u| u.to_string())
            }
        })
        .collect()
}

pub fn remember(urls: Vec<String>) {
    PENDING.lock().unwrap().extend(urls);
}

/// Liens du lancement, remis une seule fois à la fenêtre principale.
#[tauri::command]
pub fn take_launch_urls() -> Vec<String> {
    std::mem::take(&mut *PENDING.lock().unwrap())
}

/// Calti relancé alors qu'il est déjà ouvert : les liens vont dans la fenêtre principale, mise au premier plan.
pub fn second_instance(app: &AppHandle, args: Vec<String>, cwd: String) {
    let urls = urls_from_args(&args, &cwd);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    if !urls.is_empty() {
        let _ = app.emit_to("main", "browser:open-urls", urls);
    }
}

fn reg(args: &[&str]) -> Result<(), String> {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let status = std::process::Command::new("reg.exe")
        .arg("add")
        .args(args)
        .arg("/f")
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    status.success().then_some(()).ok_or_else(|| format!("registre : échec ({})", args[0]))
}

/// Déclare Calti à Windows comme navigateur (pour l'utilisateur courant), puis ouvre les paramètres
/// « Applications par défaut » : Windows réserve ce choix à l'utilisateur.
#[tauri::command]
pub fn register_default_browser() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().to_string();
    let icon = format!("{exe},0");
    let open = format!("\"{exe}\" \"%1\"");
    let client = r"HKCU\Software\Clients\StartMenuInternet\Calti";
    let caps = format!(r"{client}\Capabilities");
    let class = r"HKCU\Software\Classes\CaltiURL";
    reg(&[client, "/ve", "/d", "Calti"])?;
    reg(&[&format!(r"{client}\DefaultIcon"), "/ve", "/d", &icon])?;
    reg(&[&format!(r"{client}\shell\open\command"), "/ve", "/d", &format!("\"{exe}\"")])?;
    reg(&[&caps, "/v", "ApplicationName", "/d", "Calti"])?;
    reg(&[&caps, "/v", "ApplicationDescription", "/d", "Navigateur Calti"])?;
    reg(&[&caps, "/v", "ApplicationIcon", "/d", &icon])?;
    reg(&[&format!(r"{caps}\StartMenu"), "/v", "StartMenuInternet", "/d", "Calti"])?;
    for scheme in ["http", "https"] {
        reg(&[&format!(r"{caps}\URLAssociations"), "/v", scheme, "/d", "CaltiURL"])?;
    }
    for ext in [".htm", ".html", ".xhtml", ".svg", ".pdf"] {
        reg(&[&format!(r"{caps}\FileAssociations"), "/v", ext, "/d", "CaltiURL"])?;
    }
    reg(&[class, "/ve", "/d", "Page web Calti"])?;
    reg(&[class, "/v", "URL Protocol", "/d", ""])?;
    reg(&[&format!(r"{class}\DefaultIcon"), "/ve", "/d", &icon])?;
    reg(&[&format!(r"{class}\shell\open\command"), "/ve", "/d", &open])?;
    reg(&[r"HKCU\Software\RegisteredApplications", "/v", "Calti", "/d", r"Software\Clients\StartMenuInternet\Calti\Capabilities"])?;
    std::process::Command::new("explorer.exe")
        .arg("ms-settings:defaultapps?registeredAppUser=Calti")
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Calti lancé par une application empaquetée (l'application Claude, par exemple) hérite de son conteneur : Windows
/// redirige alors ses écritures dans AppData vers une copie propre à cette application
/// (`AppData\Local\Packages\<application>\LocalCache\Local\…`). Profils, connexions et identifiants s'y
/// retrouvent, invisibles du Calti lancé normalement, et inversement.
/// Détection : un fichier témoin écrit dans le dossier de Calti apparaît-il dans une de ces copies ? Si oui, Calti se
/// relance par l'Explorateur (hors du conteneur) et ce processus s'arrête : renvoie vrai.
/// Pas pour une instance d'essai (dossier WebView2 isolé) ni quand des arguments sont passés.
pub fn escape_package_container(args: &[String], identifier: &str) -> bool {
    if args.len() > 1 || std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        return false;
    }
    let Some(local) = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from) else { return false };
    let dir = local.join(identifier);
    let name = format!(".lancement-{}", std::process::id());
    if std::fs::create_dir_all(&dir).is_err() || std::fs::write(dir.join(&name), b"").is_err() {
        return false;
    }
    let redirected = std::fs::read_dir(local.join("Packages")).into_iter().flatten().flatten().any(|package| {
        package.path().join("LocalCache").join("Local").join(identifier).join(&name).exists()
    });
    let _ = std::fs::remove_file(dir.join(&name));
    if !redirected {
        return false;
    }
    let Ok(exe) = std::env::current_exe() else { return false };
    std::process::Command::new("explorer.exe").arg(exe).spawn().is_ok()
}
