//! Réglages natifs WebView2 des onglets : raccourcis clavier captés dans les pages, mise en veille.

use tauri::{AppHandle, Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2Environment9, ICoreWebView2_11, ICoreWebView2_19, ICoreWebView2_2, ICoreWebView2_3,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND, COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use webview2_com::{
    take_pwstr, AcceleratorKeyPressedEventHandler, ContainsFullScreenElementChangedEventHandler, CallDevToolsProtocolMethodCompletedHandler, ContextMenuRequestedEventHandler,
    CustomItemSelectedEventHandler, TrySuspendCompletedHandler, WebMessageReceivedEventHandler,
};
use windows::core::{w, Interface, PWSTR};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_SHIFT};

fn pressed(key: u16) -> bool {
    unsafe { GetKeyState(key as i32) < 0 }
}

/// Raccourci reconnu dans une page.
fn shortcut(key: u32, ctrl: bool, shift: bool) -> Option<&'static str> {
    Some(match (key, ctrl, shift) {
        (0x74, false, false) | (0x52, true, false) => "reload",          // F5, Ctrl+R
        (0x74, _, _) | (0x52, true, true) => "hard-reload",              // Ctrl+F5, Maj+F5, Ctrl+Maj+R
        (0x54, true, false) => "new-tab",                                // Ctrl+T
        (0x57, true, false) => "close-tab",                              // Ctrl+W
        (0x4C, true, false) | (0x75, false, false) => "address",         // Ctrl+L, F6
        (0x4E, true, false) => "new-window",                             // Ctrl+N
        (0x44, true, false) => "bookmark",                               // Ctrl+D
        (0x7A, false, false) => "fullscreen",                            // F11
        (0x09, true, false) => "next-tab",                               // Ctrl+Tab
        (0x09, true, true) => "previous-tab",                            // Ctrl+Maj+Tab
        (0x54, true, true) => "reopen-tab",                              // Ctrl+Maj+T
        // Ctrl+K reste aux sites qui l’utilisent (GitHub, Slack…) : depuis une page, la palette est sur Ctrl+Maj+K.
        (0x4B, true, true) => "palette",                                 // Ctrl+Maj+K
        (0x4A, true, false) => "downloads",                              // Ctrl+J
        (0x48, true, false) => "history",                                // Ctrl+H
        (0xBB | 0x6B, true, _) => "zoom-in",                             // Ctrl+= / Ctrl+Plus (pavé)
        (0xBD | 0x6D, true, _) => "zoom-out",                            // Ctrl+Moins (pavé)
        (0x30 | 0x60, true, false) => "zoom-reset",                      // Ctrl+0
        (0x31..=0x39, true, false) => ["tab-1", "tab-2", "tab-3", "tab-4", "tab-5", "tab-6", "tab-7", "tab-8", "tab-last"][(key - 0x31) as usize], // Ctrl+1…9
        _ => return None,
    })
}

/// Les raccourcis du navigateur fonctionnent aussi quand la page a le focus : le rechargement est fait ici,
/// le reste est transmis à l'interface de la fenêtre (événement `browser:shortcut`).
pub fn install_shortcuts(app: &AppHandle, webview: &Webview, tab: u64) {
    let app = app.clone();
    let _ = webview.with_webview(move |platform| unsafe {
        let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |sender, args| {
            let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
            args.KeyEventKind(&mut kind)?;
            if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
                return Ok(());
            }
            let mut key = 0u32;
            args.VirtualKey(&mut key)?;
            let Some(action) = shortcut(key, pressed(VK_CONTROL), pressed(VK_SHIFT)) else { return Ok(()) };
            args.SetHandled(true)?;
            match action {
                "reload" => sender.CoreWebView2()?.Reload()?,
                "hard-reload" => reload_ignoring_cache(&sender.CoreWebView2()?)?,
                "zoom-in" => crate::features::zoom_step(&app, tab, 1),
                "zoom-out" => crate::features::zoom_step(&app, tab, -1),
                "zoom-reset" => crate::features::zoom_step(&app, tab, 0),
                _ => {
                    // Saisie d'adresse, nouvel onglet : le focus clavier repasse à l'interface de la fenêtre.
                    if matches!(action, "address" | "new-tab" | "palette") {
                        if let Some(window) = crate::browser::tab_window(&app, tab) {
                            if let Some(ui) = app.get_webview(&window) {
                                let _ = ui.set_focus();
                            }
                        }
                    }
                    crate::browser::emit_to_tab(&app, tab, "browser:shortcut", (tab, action));
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = platform.controller().add_AcceleratorKeyPressed(&handler, &mut token);
    });
}

/// Rechargement sans le cache, comme Ctrl+F5 dans un navigateur.
pub fn hard_reload(webview: &Webview) {
    let _ = webview.with_webview(|platform| unsafe {
        if let Ok(core) = platform.controller().CoreWebView2() {
            let _ = reload_ignoring_cache(&core);
        }
    });
}

unsafe fn reload_ignoring_cache(core: &ICoreWebView2) -> windows::core::Result<()> {
    core.CallDevToolsProtocolMethod(
        w!("Page.reload"),
        w!("{\"ignoreCache\":true}"),
        &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(()))),
    )
}

/// « Vider le cache et recharger » : cache du profil effacé, puis rechargement sans cache.
pub fn empty_cache_reload(webview: &Webview) {
    let _ = webview.with_webview(|platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        let then = core.clone();
        let _ = core.CallDevToolsProtocolMethod(
            w!("Network.clearBrowserCache"),
            w!("{}"),
            &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |_, _| {
                let _ = reload_ignoring_cache(&then);
                Ok(())
            })),
        );
    });
}

/// Onglet affiché (réveillé) ou caché (mémoire réduite).
pub fn set_awake(webview: &Webview, awake: bool) {
    let _ = webview.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
            let level = if awake { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW };
            let _ = core19.SetMemoryUsageTargetLevel(level);
        }
        if awake {
            if let Ok(core3) = core.cast::<ICoreWebView2_3>() {
                let _ = core3.Resume();
            }
        }
    });
}

/// Suspend un onglet caché depuis longtemps (WebView2 refuse s'il joue du son ou de la vidéo).
pub fn suspend(webview: &Webview) {
    let _ = webview.with_webview(|platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        if let Ok(core3) = core.cast::<ICoreWebView2_3>() {
            let _ = core3.TrySuspend(&TrySuspendCompletedHandler::create(Box::new(|_, _| Ok(()))));
        }
    });
}

/// Liens ouverts en arrière-plan (clic molette, Ctrl+clic) : signalés par le script de page `LINK_SCRIPT`,
/// et entrée « Ouvrir dans un nouvel onglet » à la place de « Ouvrir dans une nouvelle fenêtre » au clic droit.
pub const LINK_SCRIPT: &str = r#"(() => {
  if (window.top !== window || !window.chrome?.webview) return;
  const linkOf = (e) => e.composedPath().find((n) => n.tagName === "A" && n.href);
  const open = (e) => {
    const a = linkOf(e);
    if (!a || !/^(https?|file):/i.test(a.href)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.chrome.webview.postMessage(JSON.stringify({ calti: "open-background", url: a.href }));
  };
  addEventListener("auxclick", (e) => e.button === 1 && open(e), true);
  addEventListener("click", (e) => e.button === 0 && (e.ctrlKey || e.metaKey) && open(e), true);
  // Ctrl+molette (et pincement du pavé tactile) : zoom de Calti, retenu pour le site.
  addEventListener("wheel", (e) => {
    if (!e.ctrlKey || !e.deltaY) return;
    e.preventDefault();
    window.chrome.webview.postMessage(JSON.stringify({ calti: "zoom", step: e.deltaY < 0 ? 1 : -1 }));
  }, { capture: true, passive: false });
})();"#;

pub fn install_link_handling(app: &AppHandle, webview: &Webview, tab: u64) {
    let (app_msg, app_menu) = (app.clone(), app.clone());
    let _ = webview.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };

        let on_message = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut raw = PWSTR::null();
            if args.TryGetWebMessageAsString(&mut raw).is_err() {
                return Ok(());
            }
            let text = take_pwstr(raw);
            let Ok(message) = serde_json::from_str::<serde_json::Value>(&text) else { return Ok(()) };
            if message["calti"] == "zoom" {
                let step = message["step"].as_i64().unwrap_or(0).signum() as i32;
                if step != 0 {
                    crate::features::zoom_step(&app_msg, tab, step);
                }
            }
            if message["calti"] == "open-background" {
                if let Some(url) = message["url"].as_str() {
                    crate::browser::open_from_tab(&app_msg, tab, url, true);
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_WebMessageReceived(&on_message, &mut token);

        let Ok(core11) = core.cast::<ICoreWebView2_11>() else { return };
        let Ok(environment) = core.cast::<ICoreWebView2_2>().and_then(|c| c.Environment()).and_then(|e| e.cast::<ICoreWebView2Environment9>()) else { return };
        let on_menu = ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let target = args.ContextMenuTarget()?;
            let mut has_link = windows::core::BOOL::default();
            target.HasLinkUri(&mut has_link)?;
            if !has_link.as_bool() {
                return Ok(());
            }
            let mut raw = PWSTR::null();
            target.LinkUri(&mut raw)?;
            let url = take_pwstr(raw);
            let items = args.MenuItems()?;
            let mut count = 0u32;
            items.Count(&mut count)?;
            // Position de « Ouvrir dans une nouvelle fenêtre » (remplacée), sinon en tête.
            let mut index = 0u32;
            for i in 0..count {
                let mut name = PWSTR::null();
                items.GetValueAtIndex(i)?.Name(&mut name)?;
                if take_pwstr(name) == "openLinkInNewWindow" {
                    items.RemoveValueAtIndex(i)?;
                    index = i;
                    break;
                }
            }
            let item = environment.CreateContextMenuItem(w!("Ouvrir dans un nouvel onglet"), None, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND)?;
            let app = app_menu.clone();
            let on_select = CustomItemSelectedEventHandler::create(Box::new(move |_, _| {
                crate::browser::open_from_tab(&app, tab, &url, true);
                Ok(())
            }));
            let mut token = 0i64;
            item.add_CustomItemSelected(&on_select, &mut token)?;
            items.InsertValueAtIndex(index, &item)?;
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core11.add_ContextMenuRequested(&on_menu, &mut token);
    });
}

/// Badge du profil posé sur l'icône de Calti dans la barre des tâches. Quand Calti est épinglé, Windows affiche
/// l'icône du raccourci et ignore celle de la fenêtre : la pastille superposée reste, elle, visible.
#[tauri::command]
pub fn taskbar_overlay(app: AppHandle, window: tauri::Window, png: Vec<u8>, label: String) -> Result<(), String> {
    let image = tauri::image::Image::from_bytes(&png).map_err(|e| e.to_string())?;
    let (width, height) = (image.width() as i32, image.height() as i32);
    // Bitmap 32 bits attendu en BGRA.
    let mut bgra = image.rgba().to_vec();
    for px in bgra.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    // Objets COM de l'interface : sur le fil principal, déjà initialisé pour COM.
    app.run_on_main_thread(move || unsafe {
        use windows::core::HSTRING;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject};
        use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
        use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList};
        use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, DestroyIcon, ICONINFO};

        let color = CreateBitmap(width, height, 1, 32, Some(bgra.as_ptr() as _));
        let mask_bits = vec![0u8; (((width + 15) / 16) * 2 * height) as usize];
        let mask = CreateBitmap(width, height, 1, 1, Some(mask_bits.as_ptr() as _));
        let icon = CreateIconIndirect(&ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: color });
        let _ = DeleteObject(color.into());
        let _ = DeleteObject(mask.into());
        let Ok(icon) = icon else { return };
        if let Ok(taskbar) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_INPROC_SERVER) {
            if taskbar.HrInit().is_ok() {
                let _ = taskbar.SetOverlayIcon(HWND(hwnd as _), icon, &HSTRING::from(label));
            }
        }
        let _ = DestroyIcon(icon);
    })
    .map_err(|e| e.to_string())
}

/// Plein écran demandé par la page (vidéo YouTube…) : WebView2 ne remplit que la vue de l'onglet ;
/// l'interface est prévenue (`browser:page-fullscreen`) pour passer la fenêtre en plein écran, page seule.
pub fn install_fullscreen(app: &AppHandle, webview: &Webview, tab: u64) {
    let app = app.clone();
    let _ = webview.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        let handler = ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender, _| {
            let Some(sender) = sender else { return Ok(()) };
            let mut full = windows::core::BOOL::default();
            sender.ContainsFullScreenElement(&mut full)?;
            crate::browser::emit_to_tab(&app, tab, "browser:page-fullscreen", (tab, full.as_bool()));
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_ContainsFullScreenElementChanged(&handler, &mut token);
    });
}

/// Identité de la fenêtre dans la barre des tâches (AppUserModelID). Une fenêtre secondaire reçoit celle de son
/// profil : elle a alors son propre bouton, avec l'icône de ce profil, au lieu d'être rangée sous Calti épinglé.
#[tauri::command]
pub fn window_identity(app: AppHandle, window: tauri::Window, app_id: String) -> Result<(), String> {
    if app_id.is_empty() || app_id.len() > 120 || !app_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err("identité invalide".into());
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    app.run_on_main_thread(move || unsafe {
        use windows::core::PWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
        use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
        use windows::Win32::System::Variant::VT_LPWSTR;
        use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow};

        let Ok(store) = SHGetPropertyStoreForWindow::<IPropertyStore>(HWND(hwnd as _)) else { return };
        // Chaîne gardée en vie le temps de l'appel ; la valeur n'est pas libérée par PropVariantClear.
        let wide: Vec<u16> = app_id.encode_utf16().chain(Some(0)).collect();
        let mut value = PROPVARIANT::default();
        (*value.Anonymous.Anonymous).vt = VT_LPWSTR;
        (*value.Anonymous.Anonymous).Anonymous.pwszVal = PWSTR(wide.as_ptr() as *mut _);
        if store.SetValue(&PKEY_AppUserModel_ID, &value).is_ok() {
            let _ = store.Commit();
        }
        std::mem::forget(value);
    })
    .map_err(|e| e.to_string())
}
