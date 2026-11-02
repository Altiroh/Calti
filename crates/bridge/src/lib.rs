//! Éléments partagés entre l'application et l'hôte Native Messaging :
//! nom du pipe, identité de l'extension, trames et vérification des processus.

use std::io;
use std::os::windows::io::AsRawHandle;
use std::path::{Path, PathBuf};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::Pipes::{GetNamedPipeClientProcessId, GetNamedPipeServerProcessId};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// Pipe nommé local : aucun port réseau n'est ouvert.
pub const PIPE_NAME: &str = r"\\.\pipe\calti";

/// Identifiant de l'extension, dérivé de la clé publique de `extension/manifest.json`.
pub const EXTENSION_ID: &str = "djgdkiajnehmpnnnanbojdmgndcmendg";

pub const APP_EXE: &str = "calti.exe";
pub const HOST_EXE: &str = "calti-host.exe";

/// Taille maximale d'une trame acceptée (les instantanés d'onglets restent bien en dessous).
pub const MAX_FRAME: usize = 8 * 1024 * 1024;

/// Lit une trame au format Native Messaging : longueur u32 little-endian puis JSON.
/// Renvoie `None` quand le flux est fermé proprement.
pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut len = [0u8; 4];
    match r.read_exact(&mut len).await {
        Ok(_) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len) as usize;
    if len > MAX_FRAME {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "trame trop grande"));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    Ok(Some(buf))
}

pub async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, data: &[u8]) -> io::Result<()> {
    let len = u32::try_from(data.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "trame trop grande"))?;
    w.write_all(&len.to_le_bytes()).await?;
    w.write_all(data).await?;
    w.flush().await
}

/// Chemin de l'exécutable du processus client d'un pipe (côté serveur).
pub fn pipe_client_exe(pipe: &impl AsRawHandle) -> io::Result<PathBuf> {
    let mut pid = 0u32;
    if unsafe { GetNamedPipeClientProcessId(pipe.as_raw_handle() as HANDLE, &mut pid) } == 0 {
        return Err(io::Error::last_os_error());
    }
    process_exe(pid)
}

/// Chemin de l'exécutable du processus serveur d'un pipe (côté client).
pub fn pipe_server_exe(pipe: &impl AsRawHandle) -> io::Result<PathBuf> {
    let mut pid = 0u32;
    if unsafe { GetNamedPipeServerProcessId(pipe.as_raw_handle() as HANDLE, &mut pid) } == 0 {
        return Err(io::Error::last_os_error());
    }
    process_exe(pid)
}

fn process_exe(pid: u32) -> io::Result<PathBuf> {
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return Err(io::Error::last_os_error());
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
        let err = io::Error::last_os_error();
        CloseHandle(process);
        if ok == 0 {
            return Err(err);
        }
        Ok(PathBuf::from(String::from_utf16_lossy(&buf[..len as usize])))
    }
}

/// Vrai si `actual` est l'exécutable `exe_name` situé dans le même dossier que le processus courant.
pub fn is_sibling_exe(actual: &Path, exe_name: &str) -> bool {
    let Ok(current) = std::env::current_exe() else { return false };
    let Some(dir) = current.parent() else { return false };
    let expected = dir.join(exe_name);
    match (expected.canonicalize(), actual.canonicalize()) {
        (Ok(a), Ok(b)) => a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy()),
        _ => false,
    }
}
