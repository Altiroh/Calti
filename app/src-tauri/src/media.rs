//! Lecture en cours : ce que Windows sait du média joué (Spotify, navigateur, lecteur…), par les contrôles de
//! transport du système (GlobalSystemMediaTransportControlsSessionManager). Aucun compte ni clé : titre, artiste,
//! pochette, position, et commandes lecture/pause, précédent, suivant.

use std::sync::Mutex;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference, InputStreamOptions};
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

#[derive(Serialize, Clone, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    /// Application qui joue (identifiant Windows, ex. « Spotify.exe »).
    app: String,
    title: String,
    artist: String,
    album: String,
    playing: bool,
    /// Position et durée, en secondes (0 si inconnues).
    position: f64,
    duration: f64,
    can_previous: bool,
    can_next: bool,
    /// Pochette en image « data: », ou vide.
    cover: String,
}

static LAST: Mutex<Option<MediaState>> = Mutex::new(None);

fn manager() -> Option<Manager> {
    Manager::RequestAsync().ok()?.join().ok()
}

fn cover(thumb: &IRandomAccessStreamReference) -> Option<String> {
    let stream = thumb.OpenReadAsync().ok()?.join().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 || size > 4_000_000 {
        return None;
    }
    let kind = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.SetInputStreamOptions(InputStreamOptions::ReadAhead).ok()?;
    let read = reader.LoadAsync(size).ok()?.join().ok()?;
    let mut bytes = vec![0u8; read as usize];
    reader.ReadBytes(&mut bytes).ok()?;
    let kind = if kind.starts_with("image/") { kind } else { "image/png".into() };
    Some(format!("data:{kind};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

fn read(session: &Session, previous: Option<&MediaState>) -> Option<MediaState> {
    let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
    let info = session.GetPlaybackInfo().ok()?;
    let controls = info.Controls().ok()?;
    let timeline = session.GetTimelineProperties().ok();
    let secs = |d: windows::Foundation::TimeSpan| d.Duration as f64 / 10_000_000.0;
    let mut state = MediaState {
        app: session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default(),
        title: props.Title().map(|s| s.to_string()).unwrap_or_default(),
        artist: props.Artist().map(|s| s.to_string()).unwrap_or_default(),
        album: props.AlbumTitle().map(|s| s.to_string()).unwrap_or_default(),
        playing: info.PlaybackStatus().ok() == Some(Status::Playing),
        position: timeline.as_ref().and_then(|t| t.Position().ok()).map(secs).unwrap_or(0.0),
        duration: timeline.as_ref().and_then(|t| t.EndTime().ok()).map(secs).unwrap_or(0.0),
        can_previous: controls.IsPreviousEnabled().unwrap_or(false),
        can_next: controls.IsNextEnabled().unwrap_or(false),
        cover: String::new(),
    };
    // Pochette relue seulement quand le morceau change.
    state.cover = match previous {
        Some(p) if p.title == state.title && p.artist == state.artist && p.app == state.app => p.cover.clone(),
        _ => props.Thumbnail().ok().and_then(|t| cover(&t)).unwrap_or_default(),
    };
    Some(state)
}

/// Suivi en tâche de fond : événement `media:state` (null sans lecture) à chaque changement.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let mut manager_cache: Option<Manager> = None;
        loop {
            if manager_cache.is_none() {
                manager_cache = manager();
            }
            let previous = LAST.lock().unwrap().clone();
            let state = manager_cache
                .as_ref()
                .and_then(|m| m.GetCurrentSession().ok())
                .and_then(|s| read(&s, previous.as_ref()))
                .filter(|s| !s.title.is_empty() || !s.app.is_empty());
            // La position avance seule : on ne renvoie l'état que si autre chose change, ou toutes les 5 s.
            let changed = match (&previous, &state) {
                (Some(a), Some(b)) => {
                    let mut a2 = a.clone();
                    a2.position = b.position;
                    a2 != *b || (a.position - b.position).abs() > 5.0
                }
                (None, None) => false,
                _ => true,
            };
            if changed {
                *LAST.lock().unwrap() = state.clone();
                let _ = app.emit("media:state", state);
            }
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

/// Dernier état connu (à l'ouverture d'un widget).
#[tauri::command]
pub fn media_state() -> Option<MediaState> {
    LAST.lock().unwrap().clone()
}

/// Lecture/pause, précédent, suivant sur le média en cours.
#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let session = manager().and_then(|m| m.GetCurrentSession().ok()).ok_or("aucune lecture en cours")?;
        let op = match action.as_str() {
            "toggle" => session.TryTogglePlayPauseAsync(),
            "next" => session.TrySkipNextAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            _ => return Err("action inconnue".to_string()),
        };
        op.and_then(|o| o.join()).map(|_| ()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
