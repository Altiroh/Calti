//! Outils de développement ancrés dans la fenêtre de Calti.
//!
//! WebView2 n'ouvre ses outils de développement que dans une fenêtre à part. Calti repère cette fenêtre (nouvelle
//! fenêtre du processus du navigateur juste après `OpenDevToolsWindow`), en fait une fenêtre enfant de la sienne et
//! la place dans le panneau prévu par l'interface (`browser_layout`, champ `devtools` de chaque page).
//! Sans port de débogage ouvert : aucun autre programme ne peut piloter les pages.

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Window};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2;
use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{CreateRectRgn, SetWindowRgn};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, EnumWindows, GetClassNameW, GetWindowRect, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindow, IsWindowVisible,
    PostMessageW, SetParent, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, GWL_STYLE, HWND_TOP, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE, WM_CLOSE, WS_CAPTION, WS_CHILD, WS_EX_APPWINDOW, WS_EX_DLGMODALFRAME, WS_EX_WINDOWEDGE,
    WS_MAXIMIZEBOX, WS_MINIMIZEBOX, WS_OVERLAPPEDWINDOW, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
};

/// Fenêtre des outils ancrée, par onglet.
static DOCKED: Mutex<Option<HashMap<u64, isize>>> = Mutex::new(None);
/// Dernière place demandée par l'interface (pixels physiques, dans la fenêtre), par onglet.
static PLACES: Mutex<Option<HashMap<u64, Option<(i32, i32, i32, i32)>>>> = Mutex::new(None);

fn docked(tab: u64) -> Option<HWND> {
    let map = DOCKED.lock().unwrap();
    let hwnd = *map.as_ref()?.get(&tab)? as HWND;
    unsafe { (IsWindow(hwnd) != 0).then_some(hwnd) }
}

fn forget(tab: u64) {
    if let Some(map) = DOCKED.lock().unwrap().as_mut() {
        map.remove(&tab);
    }
}

/// Fenêtres de premier niveau d'un processus.
fn windows_of(pid: u32) -> Vec<isize> {
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> i32 {
        let (pid, out) = &mut *(data as *mut (u32, Vec<isize>));
        let mut owner = 0u32;
        GetWindowThreadProcessId(hwnd, &mut owner);
        if owner == *pid {
            out.push(hwnd as isize);
        }
        1
    }
    let mut data = (pid, Vec::new());
    unsafe { EnumWindows(Some(each), &mut data as *mut _ as LPARAM) };
    data.1
}

/// Fenêtre de Chromium visible et titrée : celle des outils de développement.
fn is_tools_window(hwnd: HWND) -> bool {
    unsafe {
        let mut class = [0u16; 64];
        let n = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
        let class = String::from_utf16_lossy(&class[..n.max(0) as usize]);
        class.starts_with("Chrome_WidgetWin") && IsWindowVisible(hwnd) != 0 && GetWindowTextLengthW(hwnd) > 0
    }
}

/// Fait de la fenêtre des outils une fenêtre enfant de Calti, sans cadre.
fn dock(hwnd: HWND, parent: HWND) {
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
        let style = (style & !(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX)) | WS_CHILD;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & !(WS_EX_APPWINDOW | WS_EX_WINDOWEDGE | WS_EX_DLGMODALFRAME);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
        SetParent(hwnd, parent);
        // Cadre recalculé une fois ici (pas à chaque mise en place : Chromium redisposerait son contenu en retard).
        SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
}

/// Marges du cadre que Chromium dessine lui-même autour du contenu (barre de titre, bords) : écart entre la
/// fenêtre des outils et la zone de leur contenu (fenêtre enfant « Chrome_RenderWidgetHostHWND »).
fn frame_margins(hwnd: HWND) -> (i32, i32, i32, i32) {
    unsafe extern "system" fn each(child: HWND, data: LPARAM) -> i32 {
        let out = &mut *(data as *mut Option<RECT>);
        let mut class = [0u16; 64];
        let n = GetClassNameW(child, class.as_mut_ptr(), class.len() as i32);
        if String::from_utf16_lossy(&class[..n.max(0) as usize]) == "Chrome_RenderWidgetHostHWND" {
            let mut r: RECT = std::mem::zeroed();
            GetWindowRect(child, &mut r);
            // La plus haute : le contenu des outils.
            if out.map_or(true, |o| r.top < o.top) {
                *out = Some(r);
            }
        }
        1
    }
    unsafe {
        let mut content: Option<RECT> = None;
        EnumChildWindows(hwnd, Some(each), &mut content as *mut _ as LPARAM);
        let mut win: RECT = std::mem::zeroed();
        GetWindowRect(hwnd, &mut win);
        let Some(c) = content else { return (0, 0, 0, 0) };
        let m = (c.left - win.left, c.top - win.top, win.right - c.right, win.bottom - c.bottom);
        if [m.0, m.1, m.2, m.3].iter().all(|v| (0..200).contains(v)) { m } else { (0, 0, 0, 0) }
    }
}

fn apply(hwnd: HWND, place: Option<(i32, i32, i32, i32)>) {
    unsafe {
        match place {
            Some((x, y, w, h)) => {
                // La fenêtre déborde de son cadre (barre de titre comprise), rogné : seul le contenu reste visible.
                let (l, t, r, b) = frame_margins(hwnd);
                let (w, h) = (w.max(1), h.max(1));
                SetWindowPos(hwnd, HWND_TOP, x - l, y - t, w + l + r, h + t + b, SWP_NOACTIVATE | SWP_SHOWWINDOW);
                SetWindowRgn(hwnd, CreateRectRgn(l, t, l + w, t + h), 1);
            }
            None => {
                ShowWindow(hwnd, SW_HIDE);
            }
        }
    }
}

/// Place (ou cache, `None`) les outils ancrés d'un onglet ; appelé à chaque mise en place des pages.
pub fn place(tab: u64, place: Option<(i32, i32, i32, i32)>) {
    PLACES.lock().unwrap().get_or_insert_with(HashMap::new).insert(tab, place);
    match docked(tab) {
        Some(hwnd) => apply(hwnd, place),
        None => forget(tab),
    }
}

/// Fenêtres du navigateur de la page avant l'ouverture des outils : la nouvelle sera celle des outils.
pub fn snapshot(core: &ICoreWebView2) -> Option<(u32, HashSet<isize>)> {
    let mut pid = 0u32;
    unsafe { core.BrowserProcessId(&mut pid).ok()? };
    Some((pid, windows_of(pid).into_iter().collect()))
}

/// Guette la fenêtre des outils qui vient d'être demandée et l'ancre dans la fenêtre de Calti.
pub fn watch(app: AppHandle, label: String, parent: isize, id: u64, (pid, before): (u32, HashSet<isize>)) {
    std::thread::spawn(move || {
        for _ in 0..60 {
            std::thread::sleep(Duration::from_millis(100));
            let found = windows_of(pid).into_iter().find(|h| !before.contains(h) && is_tools_window(*h as HWND));
            if let Some(hwnd) = found {
                dock(hwnd as HWND, parent as HWND);
                DOCKED.lock().unwrap().get_or_insert_with(HashMap::new).insert(id, hwnd);
                let place = PLACES.lock().unwrap().as_ref().and_then(|m| m.get(&id).copied()).flatten();
                apply(hwnd as HWND, place);
                let _ = app.emit_to(label.as_str(), "browser:devtools-opened", id);
                // Chromium remet ensuite la fenêtre à sa place enregistrée et finit sa mise en page : on la replace.
                for wait in [150, 250, 400, 600, 900, 1500] {
                    std::thread::sleep(Duration::from_millis(wait));
                    let Some(hwnd) = docked(id) else { return };
                    let place = PLACES.lock().unwrap().as_ref().and_then(|m| m.get(&id).copied()).flatten();
                    apply(hwnd, place);
                }
                return;
            }
        }
        // Pas de fenêtre repérée : l'interface referme son panneau.
        let _ = app.emit_to(label.as_str(), "browser:devtools-closed", id);
    });
}

/// Outils déjà ancrés pour cet onglet ?
pub fn is_docked(id: u64) -> bool {
    docked(id).is_some()
}

/// Ouvre les outils de l'onglet dans la fenêtre (ou les ferme s'ils y sont déjà) ; renvoie s'ils sont ouverts.
#[tauri::command]
pub fn devtools_toggle(app: AppHandle, window: Window, id: u64) -> Result<bool, String> {
    if let Some(hwnd) = docked(id) {
        unsafe { PostMessageW(hwnd, WM_CLOSE, 0 as WPARAM, 0) };
        forget(id);
        return Ok(false);
    }
    let parent = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let webview = crate::browser::webview(&app, id)?;
    let label = window.label().to_string();
    let _ = webview.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        let Some(before) = snapshot(&core) else { return };
        let _ = ICoreWebView2::OpenDevToolsWindow(&core);
        watch(app, label, parent, id, before);
    });
    Ok(true)
}

/// Détache les outils ancrés : ils redeviennent une fenêtre à part.
#[tauri::command]
pub fn devtools_undock(id: u64) {
    let Some(hwnd) = docked(id) else { return };
    forget(id);
    unsafe {
        SetWindowRgn(hwnd, std::ptr::null_mut(), 1);
        SetParent(hwnd, std::ptr::null_mut());
        let style = (GetWindowLongPtrW(hwnd, GWL_STYLE) as u32 & !WS_CHILD) | WS_OVERLAPPEDWINDOW;
        SetWindowLongPtrW(hwnd, GWL_STYLE, style as isize);
        SetWindowPos(hwnd, HWND_TOP, 120, 120, 1100, 760, SWP_SHOWWINDOW | SWP_FRAMECHANGED);
    }
}
