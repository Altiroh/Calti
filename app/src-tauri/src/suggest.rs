//! Suggestions du moteur de recherche du profil pendant la saisie, comme dans un navigateur.
//! Les pages ne peuvent pas les demander elles-mêmes (en-têtes CORS) : la requête part d'ici, par WinHTTP,
//! vers une adresse fixe par moteur. Format OpenSearch : `["saisie", ["suggestion", …]]`.

use windows_sys::Win32::Networking::WinHttp::{
    WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpReadData, WinHttpReceiveResponse,
    WinHttpSendRequest, WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
};

/// Hôte et chemin (la saisie encodée est ajoutée à la fin) de chaque moteur proposé dans les réglages.
fn endpoint(engine: &str) -> Option<(&'static str, &'static str)> {
    Some(match engine {
        "brave" => ("search.brave.com", "/api/suggest?q="),
        "google" => ("suggestqueries.google.com", "/complete/search?client=firefox&q="),
        "duckduckgo" => ("duckduckgo.com", "/ac/?type=list&q="),
        "bing" => ("api.bing.com", "/osjson.aspx?query="),
        "ecosia" => ("ac.ecosia.org", "/autocomplete?type=list&q="),
        _ => return None,
    })
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn encode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Poignée WinHTTP fermée quoi qu'il arrive.
struct Handle(*mut core::ffi::c_void);

impl Drop for Handle {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { WinHttpCloseHandle(self.0) };
        }
    }
}

fn get(host: &str, path: &str) -> Option<Vec<u8>> {
    unsafe {
        let session = Handle(WinHttpOpen(wide("Calti/0.1 (Windows NT 10.0; Win64; x64)").as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, std::ptr::null(), std::ptr::null(), 0));
        if session.0.is_null() {
            return None;
        }
        // Une suggestion en retard ne sert plus à rien : délais courts.
        WinHttpSetTimeouts(session.0, 2000, 2000, 2000, 3000);
        let connect = Handle(WinHttpConnect(session.0, wide(host).as_ptr(), 443, 0));
        if connect.0.is_null() {
            return None;
        }
        let accept = wide("Accept: application/json, application/x-suggestions+json\r\n");
        let request = Handle(WinHttpOpenRequest(connect.0, wide("GET").as_ptr(), wide(path).as_ptr(), std::ptr::null(),
            std::ptr::null(), std::ptr::null(), WINHTTP_FLAG_SECURE));
        if request.0.is_null()
            // Sans « Accept », certains moteurs (Brave, Ecosia) renvoient leur page HTML au lieu des suggestions.
            || WinHttpSendRequest(request.0, accept.as_ptr(), u32::MAX, std::ptr::null(), 0, 0, 0) == 0
            || WinHttpReceiveResponse(request.0, std::ptr::null_mut()) == 0
        {
            return None;
        }
        let mut body = Vec::new();
        let mut buffer = [0u8; 8192];
        loop {
            let mut read = 0u32;
            if WinHttpReadData(request.0, buffer.as_mut_ptr() as _, buffer.len() as u32, &mut read) == 0 {
                return None;
            }
            if read == 0 || body.len() > 256 * 1024 {
                break;
            }
            body.extend_from_slice(&buffer[..read as usize]);
        }
        Some(body)
    }
}

#[tauri::command]
pub async fn search_suggestions(engine: String, query: String) -> Result<Vec<String>, String> {
    let query = query.trim().to_string();
    let Some((host, path)) = endpoint(&engine) else { return Ok(Vec::new()) };
    if query.is_empty() || query.len() > 200 {
        return Ok(Vec::new());
    }
    let url = format!("{path}{}", encode(&query));
    let body = tauri::async_runtime::spawn_blocking(move || get(host, &url))
        .await
        .map_err(|e| e.to_string())?
        .ok_or("moteur injoignable")?;
    let value: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| format!("{e} : {}", String::from_utf8_lossy(&body[..body.len().min(160)])))?;
    Ok(value
        .get(1)
        .and_then(|list| list.as_array())
        .map(|list| list.iter().filter_map(|s| s.as_str().map(str::to_string)).take(8).collect())
        .unwrap_or_default())
}
