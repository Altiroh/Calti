//! Presse-papiers de Windows : signale chaque nouvelle copie (texte, lien ou image) à l'interface.
//! Les contenus que les gestionnaires de mots de passe marquent comme privés sont ignorés.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW,
};
use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

const CF_UNICODETEXT: u32 = 13;
const CF_DIB: u32 = 8;
/// Au-delà, le texte copié est tronqué (l'historique sert à retrouver, pas à archiver).
const MAX_TEXT: usize = 20_000;

/// Suivi suspendu depuis l'interface (Réglages ou widget).
static PAUSED: AtomicBool = AtomicBool::new(false);

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// Presse-papiers ouvert le temps d'une lecture, refermé quoi qu'il arrive.
struct Open;

impl Open {
    fn new() -> Option<Self> {
        // Une autre application peut le tenir : quelques essais rapprochés.
        for _ in 0..5 {
            if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                return Some(Open);
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        None
    }

    /// Octets d'un format présent.
    fn bytes(&self, format: u32) -> Option<Vec<u8>> {
        unsafe {
            let handle = GetClipboardData(format);
            if handle.is_null() {
                return None;
            }
            let ptr = GlobalLock(handle) as *const u8;
            if ptr.is_null() {
                return None;
            }
            let data = std::slice::from_raw_parts(ptr, GlobalSize(handle)).to_vec();
            GlobalUnlock(handle);
            Some(data)
        }
    }
}

impl Drop for Open {
    fn drop(&mut self) {
        unsafe { CloseClipboard() };
    }
}

/// Contenu marqué privé (mots de passe) : formats posés par les gestionnaires, documentés par Windows.
fn private(clip: &Open) -> bool {
    unsafe {
        let excluded = RegisterClipboardFormatW(wide("ExcludeClipboardContentFromMonitorProcessing").as_ptr());
        let ignore = RegisterClipboardFormatW(wide("Clipboard Viewer Ignore").as_ptr());
        if IsClipboardFormatAvailable(excluded) != 0 || IsClipboardFormatAvailable(ignore) != 0 {
            return true;
        }
        let history = RegisterClipboardFormatW(wide("CanIncludeInClipboardHistory").as_ptr());
        IsClipboardFormatAvailable(history) != 0
            && clip.bytes(history).is_some_and(|b| b.len() >= 4 && b[..4] == [0, 0, 0, 0])
    }
}

fn read_text(clip: &Open) -> Option<String> {
    let bytes = clip.bytes(CF_UNICODETEXT)?;
    let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&u| u != 0).collect();
    let text: String = String::from_utf16_lossy(&units).chars().take(MAX_TEXT).collect();
    (!text.trim().is_empty()).then_some(text)
}

/// Image copiée, au format BMP (en-tête de fichier ajouté devant le DIB) : l'interface la réduit.
fn read_image(clip: &Open) -> Option<Vec<u8>> {
    let dib = clip.bytes(CF_DIB)?;
    if dib.len() < 40 {
        return None;
    }
    let header = u32::from_le_bytes(dib[0..4].try_into().ok()?) as usize;
    let bit_count = u16::from_le_bytes(dib[14..16].try_into().ok()?);
    let compression = u32::from_le_bytes(dib[16..20].try_into().ok()?);
    let used = u32::from_le_bytes(dib[32..36].try_into().ok()?) as usize;
    // Palette (≤ 8 bits) ou masques de couleur (BI_BITFIELDS avec un en-tête de 40 octets).
    let palette = if bit_count <= 8 { (if used > 0 { used } else { 1 << bit_count }) * 4 } else { 0 };
    let masks = if compression == 3 && header == 40 { 12 } else { 0 };
    let offset = 14 + header + palette + masks;
    let mut bmp = Vec::with_capacity(14 + dib.len());
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&((14 + dib.len()) as u32).to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&(offset as u32).to_le_bytes());
    bmp.extend_from_slice(&dib);
    Some(bmp)
}

/// Surveille le presse-papiers (numéro de séquence de Windows, sans le lire tant qu'il ne change pas).
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = unsafe { GetClipboardSequenceNumber() };
        loop {
            std::thread::sleep(Duration::from_millis(700));
            let seq = unsafe { GetClipboardSequenceNumber() };
            if seq == last {
                continue;
            }
            last = seq;
            if PAUSED.load(Ordering::Relaxed) {
                continue;
            }
            let Some(clip) = Open::new() else { continue };
            if private(&clip) {
                continue;
            }
            if let Some(text) = read_text(&clip) {
                let _ = app.emit("clipboard:text", text);
            } else if unsafe { IsClipboardFormatAvailable(CF_DIB) } != 0 {
                let _ = app.emit("clipboard:image", seq);
            }
        }
    });
}

/// Image actuellement copiée, en BMP.
#[tauri::command]
pub fn clipboard_image() -> Result<tauri::ipc::Response, String> {
    let clip = Open::new().ok_or("presse-papiers occupé")?;
    if private(&clip) {
        return Err("contenu privé".into());
    }
    read_image(&clip).map(tauri::ipc::Response::new).ok_or_else(|| "aucune image".into())
}

#[tauri::command]
pub fn clipboard_pause(paused: bool) {
    PAUSED.store(paused, Ordering::Relaxed);
}
