//! Liaison avec Brave : serveur de pipe nommé local, réservé à l'hôte Native Messaging.
//! Chaque profil Brave (Personnel, Pro…) ouvre sa propre connexion.

use std::collections::BTreeMap;
use std::sync::Mutex;

use bridge::{is_sibling_exe, pipe_client_exe, read_frame, write_frame, HOST_EXE, PIPE_NAME};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
use tokio::sync::mpsc;

use crate::protocol::{BookmarkNode, FromBrave, Snapshot, ToBrave};

#[derive(Default)]
pub struct BraveLink(Mutex<Inner>);

#[derive(Default)]
struct Inner {
    next_conn: u64,
    profiles: BTreeMap<String, Profile>,
}

struct Profile {
    /// Connexion propriétaire : une ancienne connexion ne peut pas retirer la nouvelle.
    conn: u64,
    tx: mpsc::Sender<Vec<u8>>,
    snapshot: Option<Snapshot>,
    bookmarks: Option<Vec<BookmarkNode>>,
}

#[derive(Serialize)]
pub struct ProfileState {
    id: String,
    snapshot: Option<Snapshot>,
    bookmarks: Option<Vec<BookmarkNode>>,
}

fn profiles_state(inner: &Inner) -> Vec<ProfileState> {
    inner
        .profiles
        .iter()
        .map(|(id, p)| ProfileState { id: id.clone(), snapshot: p.snapshot.clone(), bookmarks: p.bookmarks.clone() })
        .collect()
}

fn emit_profiles(app: &AppHandle) {
    let link = app.state::<BraveLink>();
    let list = profiles_state(&link.0.lock().unwrap());
    let _ = app.emit("brave:profiles", &list);
}

#[tauri::command]
pub fn brave_state(link: State<'_, BraveLink>) -> Vec<ProfileState> {
    profiles_state(&link.0.lock().unwrap())
}

#[tauri::command]
pub fn brave_send(link: State<'_, BraveLink>, profile: String, command: ToBrave) -> Result<(), String> {
    command.validate()?;
    let tx = link.0.lock().unwrap().profiles.get(&profile).map(|p| p.tx.clone())
        .ok_or("ce profil Brave n'est pas connecté")?;
    let frame = serde_json::to_vec(&command).map_err(|e| e.to_string())?;
    tx.try_send(frame).map_err(|_| "liaison Brave saturée ou fermée".to_string())
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = serve(app).await {
            eprintln!("pipe Brave indisponible : {e}");
        }
    });
}

async fn serve(app: AppHandle) -> std::io::Result<()> {
    // `first_pipe_instance` échoue si un autre processus possède déjà ce nom.
    let mut server = ServerOptions::new()
        .first_pipe_instance(true)
        .reject_remote_clients(true)
        .create(PIPE_NAME)?;
    loop {
        server.connect().await?;
        let client = server;
        server = ServerOptions::new().reject_remote_clients(true).create(PIPE_NAME)?;

        match pipe_client_exe(&client) {
            Ok(exe) if is_sibling_exe(&exe, HOST_EXE) => {
                tauri::async_runtime::spawn(handle(app.clone(), client));
            }
            other => eprintln!("client du pipe refusé : {other:?}"),
        }
    }
}

fn valid_profile_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

async fn handle(app: AppHandle, pipe: NamedPipeServer) {
    let (mut reader, mut writer) = tokio::io::split(pipe);
    let (tx, mut rx) = mpsc::channel::<Vec<u8>>(32);
    let conn = {
        let link = app.state::<BraveLink>();
        let mut inner = link.0.lock().unwrap();
        inner.next_conn += 1;
        inner.next_conn
    };

    let writer_task = tauri::async_runtime::spawn(async move {
        while let Some(frame) = rx.recv().await {
            if write_frame(&mut writer, &frame).await.is_err() {
                break;
            }
        }
    });

    for cmd in [ToBrave::Identify, ToBrave::RequestSnapshot, ToBrave::GetBookmarks] {
        let _ = tx.send(serde_json::to_vec(&cmd).unwrap()).await;
    }

    // Les données reçues avant l'identification du profil sont gardées en attente.
    let mut profile: Option<String> = None;
    let mut pending_snapshot = None;
    let mut pending_bookmarks = None;

    while let Ok(Some(frame)) = read_frame(&mut reader).await {
        let msg = match serde_json::from_slice::<FromBrave>(&frame) {
            Ok(msg) => msg,
            Err(e) => {
                eprintln!("message Brave invalide : {e}");
                continue;
            }
        };
        let link = app.state::<BraveLink>();
        match (msg, &profile) {
            (FromBrave::Hello { profile_id }, None) if valid_profile_id(&profile_id) => {
                link.0.lock().unwrap().profiles.insert(profile_id.clone(), Profile {
                    conn,
                    tx: tx.clone(),
                    snapshot: pending_snapshot.take(),
                    bookmarks: pending_bookmarks.take(),
                });
                profile = Some(profile_id);
            }
            (FromBrave::Hello { .. }, _) => continue,
            (FromBrave::Snapshot(s), None) => pending_snapshot = Some(s),
            (FromBrave::Bookmarks { tree }, None) => pending_bookmarks = Some(tree),
            (FromBrave::Snapshot(s), Some(id)) => {
                if let Some(p) = link.0.lock().unwrap().profiles.get_mut(id) {
                    p.snapshot = Some(s);
                }
            }
            (FromBrave::Bookmarks { tree }, Some(id)) => {
                if let Some(p) = link.0.lock().unwrap().profiles.get_mut(id) {
                    p.bookmarks = Some(tree);
                }
            }
            (FromBrave::Error { message }, _) => {
                let _ = app.emit("brave:error", message);
                continue;
            }
        }
        if profile.is_some() {
            emit_profiles(&app);
        }
    }

    writer_task.abort();
    if let Some(id) = profile {
        let link = app.state::<BraveLink>();
        let mut inner = link.0.lock().unwrap();
        if inner.profiles.get(&id).is_some_and(|p| p.conn == conn) {
            inner.profiles.remove(&id);
        }
        drop(inner);
        emit_profiles(&app);
    }
}
