//! Hôte Native Messaging lancé par Brave pour l'extension Calti.
//! Relaie les messages entre l'extension (stdin/stdout) et l'application (pipe nommé local).

use std::io::Write;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bridge::{pipe_server_exe, is_sibling_exe, read_frame, write_frame, APP_EXE, EXTENSION_ID, PIPE_NAME};
use tokio::net::windows::named_pipe::ClientOptions;
use tokio::sync::mpsc;

/// Journal de diagnostic : %LOCALAPPDATA%\Calti\host.log (Brave ne montre pas la sortie d’erreur).
macro_rules! log {
    ($($arg:tt)*) => { write_log(&format!($($arg)*)) };
}

fn write_log(message: &str) {
    let Some(dir) = std::env::var_os("LOCALAPPDATA") else { return };
    let path = std::path::Path::new(&dir).join("Calti").join("host.log");
    // Le journal reste petit : il repart de zéro au-delà de 256 Kio.
    let truncate = std::fs::metadata(&path).map(|m| m.len() > 256 * 1024).unwrap_or(false);
    let file = std::fs::OpenOptions::new().create(true).write(true).append(!truncate).truncate(truncate).open(&path);
    if let Ok(mut file) = file {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let _ = writeln!(file, "{secs} [{}] {message}", std::process::id());
    }
}

/// Limite de Native Messaging pour les messages envoyés à l'extension.
const MAX_TO_EXTENSION: usize = 1024 * 1024;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Brave passe l'origine de l'extension appelante en premier argument.
    let origin = std::env::args().nth(1).unwrap_or_default();
    log!("lancé par Brave, origine {origin}");
    if origin != format!("chrome-extension://{EXTENSION_ID}/") {
        log!("origine refusée : {origin}");
        std::process::exit(1);
    }

    // stdout : un seul écrivain vers l'extension.
    let (to_ext, mut to_ext_rx) = mpsc::channel::<Vec<u8>>(64);
    tokio::spawn(async move {
        let mut out = tokio::io::stdout();
        while let Some(frame) = to_ext_rx.recv().await {
            if write_frame(&mut out, &frame).await.is_err() {
                log!("sortie vers Brave fermée, arrêt");
                std::process::exit(0);
            }
        }
    });

    // stdin : la fermeture du port par Brave termine l'hôte.
    let (from_ext_tx, mut from_ext) = mpsc::channel::<Vec<u8>>(64);
    tokio::spawn(async move {
        let mut input = tokio::io::stdin();
        loop {
            match read_frame(&mut input).await {
                Ok(Some(frame)) if is_json(&frame) => {
                    if from_ext_tx.send(frame).await.is_err() {
                        break;
                    }
                }
                Ok(Some(_)) => log!("message de l'extension ignoré (JSON invalide)"),
                Ok(None) | Err(_) => break,
            }
        }
        log!("port fermé par Brave, arrêt");
        std::process::exit(0);
    });

    loop {
        let pipe = match ClientOptions::new().open(PIPE_NAME) {
            Ok(pipe) => pipe,
            Err(_) => {
                // Application absente : on jette les messages de l'extension et on réessaie.
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(1)) => {}
                    msg = from_ext.recv() => if msg.is_none() { return },
                }
                continue;
            }
        };

        match pipe_server_exe(&pipe) {
            Ok(exe) if is_sibling_exe(&exe, APP_EXE) => log!("connecté à Calti"),
            other => {
                log!("serveur du pipe refusé : {other:?}");
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        }

        let (mut pipe_r, mut pipe_w) = tokio::io::split(pipe);
        let to_ext_from_app = to_ext.clone();
        let mut reader = tokio::spawn(async move {
            while let Ok(Some(frame)) = read_frame(&mut pipe_r).await {
                if frame.len() > MAX_TO_EXTENSION || !is_json(&frame) {
                    log!("message de l'application ignoré");
                    continue;
                }
                if to_ext_from_app.send(frame).await.is_err() {
                    break;
                }
            }
        });

        loop {
            tokio::select! {
                _ = &mut reader => break,
                msg = from_ext.recv() => match msg {
                    Some(frame) => if write_frame(&mut pipe_w, &frame).await.is_err() { break },
                    None => return,
                },
            }
        }
        reader.abort();
        log!("Calti déconnecté, nouvelle tentative");
    }
}

fn is_json(frame: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Value>(frame).is_ok()
}
