//! Menu contextuel des pages : WebView2 fournit les entrées (copier, coller, enregistrer l'image, inspecter…),
//! l'interface de Calti les dessine aux couleurs du thème (événement `browser:page-menu`) et renvoie le choix
//! (`page_menu_pick`), que WebView2 exécute.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2ContextMenuItemCollection, ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2Deferral, ICoreWebView2_11,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_CHECK_BOX, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_RADIO,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU,
};
use webview2_com::{take_pwstr, ContextMenuRequestedEventHandler};
use windows::core::{Interface, BOOL, PWSTR};
use windows::Win32::Foundation::POINT;

/// Entrée ajoutée par Calti : le lien s'ouvre dans un nouvel onglet (à la place d'une nouvelle fenêtre).
const OPEN_IN_TAB: i32 = -1000;

#[derive(Serialize, Clone)]
struct Item {
    id: i32,
    name: String,
    label: String,
    shortcut: String,
    kind: &'static str,
    enabled: bool,
    checked: bool,
    children: Vec<Item>,
}

#[derive(Serialize, Clone)]
struct Request {
    request: u64,
    tab: u64,
    /// Point du clic dans la page, en pixels physiques.
    x: i32,
    y: i32,
    items: Vec<Item>,
    link: String,
}

struct Pending {
    args: ICoreWebView2ContextMenuRequestedEventArgs,
    deferral: ICoreWebView2Deferral,
    tab: u64,
    link: String,
    /// Fenêtres du navigateur à l'ouverture du menu (pour repérer celle des outils après « Inspecter »).
    before: Option<(u32, std::collections::HashSet<isize>)>,
}

thread_local! {
    static PENDING: RefCell<HashMap<u64, Pending>> = RefCell::new(HashMap::new());
    static NEXT: Cell<u64> = const { Cell::new(1) };
}

/// « &Copier » → « Copier » (« && » reste une esperluette).
fn clean(label: String) -> String {
    label.replace("&&", "\u{0}").replace('&', "").replace('\u{0}', "&")
}

unsafe fn read(items: &ICoreWebView2ContextMenuItemCollection) -> windows::core::Result<Vec<Item>> {
    let mut count = 0u32;
    items.Count(&mut count)?;
    let mut out = Vec::new();
    for i in 0..count {
        let item = items.GetValueAtIndex(i)?;
        let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
        item.Kind(&mut kind)?;
        let text = |get: &dyn Fn(&mut PWSTR) -> windows::core::Result<()>| -> String {
            let mut raw = PWSTR::null();
            if get(&mut raw).is_ok() { take_pwstr(raw) } else { String::new() }
        };
        let name = text(&|r| item.Name(r));
        let label = clean(text(&|r| item.Label(r)));
        let shortcut = text(&|r| item.ShortcutKeyDescription(r));
        let mut id = 0i32;
        item.CommandId(&mut id)?;
        let (mut enabled, mut checked) = (BOOL::default(), BOOL::default());
        item.IsEnabled(&mut enabled)?;
        item.IsChecked(&mut checked)?;
        let children = if kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU { read(&item.Children()?)? } else { Vec::new() };
        let kind = match kind {
            COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR => "sep",
            COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU => "sub",
            COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_CHECK_BOX => "check",
            COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_RADIO => "radio",
            _ => "command",
        };
        out.push(Item { id, name, label, shortcut, kind, enabled: enabled.as_bool(), checked: checked.as_bool(), children });
    }
    Ok(out)
}

/// Menu resté ouvert (nouveau clic droit) : WebView2 est libéré sans choix.
fn release_all() {
    let old: Vec<Pending> = PENDING.with(|m| m.borrow_mut().drain().map(|(_, p)| p).collect());
    for p in old {
        unsafe {
            let _ = p.deferral.Complete();
        }
    }
}

pub fn install(app: &AppHandle, webview: &Webview, tab: u64) {
    let app = app.clone();
    let _ = webview.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        let Ok(core11) = core.cast::<ICoreWebView2_11>() else { return };
        let handler = ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            // Sans fenêtre pour le dessiner, WebView2 garde son propre menu.
            let Some(window) = crate::browser::tab_window(&app, tab) else { return Ok(()) };
            release_all();

            let target = args.ContextMenuTarget()?;
            let mut has_link = BOOL::default();
            target.HasLinkUri(&mut has_link)?;
            let link = if has_link.as_bool() {
                let mut raw = PWSTR::null();
                target.LinkUri(&mut raw)?;
                take_pwstr(raw)
            } else {
                String::new()
            };
            let mut items = read(&args.MenuItems()?)?;
            if !link.is_empty() {
                // « Ouvrir dans une nouvelle fenêtre » devient « Ouvrir dans un nouvel onglet ».
                let at = items.iter().position(|i| i.name == "openLinkInNewWindow");
                if let Some(i) = at {
                    items.remove(i);
                }
                items.insert(at.unwrap_or(0), Item {
                    id: OPEN_IN_TAB, name: "openLinkInNewTab".into(), label: "Ouvrir dans un nouvel onglet".into(),
                    shortcut: String::new(), kind: "command", enabled: true, checked: false, children: Vec::new(),
                });
            }
            let mut point = POINT::default();
            args.Location(&mut point)?;

            args.SetHandled(true)?;
            let deferral = args.GetDeferral()?;
            let request = NEXT.with(|n| {
                let id = n.get();
                n.set(id + 1);
                id
            });
            PENDING.with(|m| m.borrow_mut().insert(request, Pending { args, deferral, tab, link: link.clone(), before: crate::devtools::snapshot(&core) }));
            // L'interface prend le focus : un clic ailleurs (dans la page) referme le menu.
            if let Some(ui) = app.get_webview(&window) {
                let _ = ui.set_focus();
            }
            let sent = app.emit_to(window.as_str(), "browser:page-menu", Request { request, tab, x: point.x, y: point.y, items, link });
            if sent.is_err() {
                release_all();
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core11.add_ContextMenuRequested(&handler, &mut token);
    });
}

/// Choix fait dans le menu dessiné par l'interface (`None` : menu refermé sans choix).
#[tauri::command]
pub fn page_menu_pick(app: AppHandle, request: u64, command: Option<i32>, dock: Option<bool>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || unsafe {
        let Some(p) = PENDING.with(|m| m.borrow_mut().remove(&request)) else { return };
        match command {
            Some(OPEN_IN_TAB) => crate::browser::open_from_tab(&handle, p.tab, &p.link, true),
            Some(id) => {
                // « Inspecter » : la fenêtre des outils qui s'ouvre est ancrée dans Calti.
                let watch = if dock == Some(true) && !crate::devtools::is_docked(p.tab) {
                    let window = crate::browser::tab_window(&handle, p.tab);
                    let parent = window.as_deref().and_then(|w| handle.get_window(w)).and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize);
                    window.zip(parent).zip(p.before)
                } else {
                    None
                };
                let _ = p.args.SetSelectedCommandId(id);
                if let Some(((label, parent), before)) = watch {
                    crate::devtools::watch(handle.clone(), label, parent, p.tab, before);
                }
            }
            None => {}
        }
        let _ = p.deferral.Complete();
    });
}
