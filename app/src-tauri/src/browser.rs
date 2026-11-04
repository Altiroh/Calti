//! Navigateur intégré : chaque onglet est une vue WebView2 enfant d'une fenêtre de Calti,
//! placée par l'interface à l'endroit de sa zone de contenu. Chaque profil a son dossier de données.
//! Plusieurs fenêtres peuvent coexister ; un onglet appartient à une fenêtre et peut en changer.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::window::Color;
use tauri::utils::config::WindowEffectsConfig;
use tauri::window::Effect;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Url, Webview, WebviewBuilder, WebviewUrl,
    WebviewWindowBuilder, Window,
};
use windows_sys::Win32::Graphics::Gdi::{CombineRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, RGN_DIFF};
use windows_sys::Win32::UI::WindowsAndMessaging::GetParent;

/// Délai avant la suspension d'un onglet caché (mémoire réduite dès qu'il est caché).
const SLEEP_AFTER: Duration = Duration::from_secs(5 * 60);

/// Arrondi des pages par défaut, en pixels logiques (réglable dans l'interface).
const CORNER_RADIUS: f64 = 16.0;

fn default_radius() -> f64 {
    CORNER_RADIUS
}

/// Identifiant de profil valide (nom du dossier de données) : minuscules, chiffres et tirets.
fn valid_profile(id: &str) -> bool {
    (1..=40).contains(&id.len()) && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Mots de passe et formulaires : WebView2 propose de les enregistrer, puis les remplit (par profil).
fn enable_autofill(webview: &Webview) {
    let _ = webview.with_webview(|platform| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4;
        use windows::core::Interface;
        let Ok(core) = platform.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings().and_then(|s| s.cast::<ICoreWebView2Settings4>()) else { return };
        let _ = settings.SetIsPasswordAutosaveEnabled(true);
        let _ = settings.SetIsGeneralAutofillEnabled(true);
    });
}

#[derive(Default)]
pub struct Browser(Mutex<State>);

#[derive(Default)]
struct State {
    next: u64,
    tabs: Vec<Tab>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub(crate) id: u64,
    /// Fenêtre qui affiche l'onglet.
    window: String,
    profile: String,
    url: String,
    title: String,
    loading: bool,
    /// Onglet suspendu (caché depuis longtemps) ou pas encore chargé (session restaurée).
    sleeping: bool,
    /// Zoom de la page (1 = 100 %).
    pub(crate) zoom: f64,
    /// La page joue du son ; son coupé.
    pub(crate) audible: bool,
    pub(crate) muted: bool,
    /// Publicités et traqueurs bloqués sur la page affichée.
    pub(crate) blocked: u32,
    /// Icône déclarée par la page (vide : pas encore connue).
    pub(crate) icon: String,
    #[serde(skip)]
    shown: bool,
    /// Incrémenté à chaque masquage : une mise en veille programmée ne s'applique qu'au dernier.
    #[serde(skip)]
    hidden_gen: u64,
    /// Adresse à charger au premier affichage (chargement différé).
    #[serde(skip)]
    pending_url: Option<Url>,
}

/// Onglet à afficher et sa zone, en pixels logiques de la fenêtre.
#[derive(Deserialize)]
pub struct Placement {
    id: u64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    /// Arrondi des coins de la page.
    #[serde(default = "default_radius")]
    radius: f64,
    /// Zones découpées dans la page (relatives à la page), pour laisser voir l’interface dessous.
    #[serde(default)]
    cutouts: Vec<Cutout>,
    /// Panneau des outils de développement ancrés (dans la fenêtre), s’ils sont ouverts pour cette page.
    #[serde(default)]
    devtools: Option<Cutout>,
}

/// Rectangle arrondi retiré de la page (badge du plein écran, dialogue) ; sans arrondi donné, une pilule.
#[derive(Deserialize, Clone, Copy)]
pub struct Cutout {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    radius: Option<f64>,
}

fn label(id: u64) -> String {
    format!("tab-{id}")
}

/// Adresses ouvrables : le web (http, https) et les fichiers locaux (file).
fn web_url(input: &str) -> Result<Url, String> {
    match Url::parse(input) {
        Ok(u) if matches!(u.scheme(), "http" | "https" | "file") => Ok(u),
        _ => Err("adresse non prise en charge (http, https ou file)".into()),
    }
}

/// Découpe la vue native avec des coins arrondis. La région ne s'applique qu'à une fenêtre enfant,
/// jamais à la fenêtre principale de Calti.
fn round_corners(webview: &Webview, width: f64, height: f64, radius: f64, cutouts: Vec<Cutout>) {
    let scale = webview.window().scale_factor().unwrap_or(1.0);
    let w = (width * scale).round() as i32;
    let h = (height * scale).round() as i32;
    let r = (radius.max(0.0) * 2.0 * scale).round() as i32;
    let px = |v: f64| (v * scale).round() as i32;
    let holes: Vec<_> = cutouts.iter()
        .map(|c| (px(c.x), px(c.y), px(c.x + c.width), px(c.y + c.height), px(c.radius.map_or(c.height, |r| r * 2.0))))
        .collect();
    let _ = webview.with_webview(move |platform| unsafe {
        let mut parent = windows::Win32::Foundation::HWND::default();
        if platform.controller().ParentWindow(&mut parent).is_err() {
            return;
        }
        let hwnd = parent.0;
        if hwnd.is_null() || GetParent(hwnd).is_null() {
            return;
        }
        let region = CreateRoundRectRgn(0, 0, w + 1, h + 1, r, r);
        for (left, top, right, bottom, d) in holes {
            let cut = CreateRoundRectRgn(left, top, right + 1, bottom + 1, d, d);
            CombineRgn(region, region, cut, RGN_DIFF);
            DeleteObject(cut);
        }
        // Le système prend possession de la région : rien à libérer.
        SetWindowRgn(hwnd, region, 1);
    });
}

/// Événement propre à un onglet : envoyé à la seule fenêtre qui l’affiche (les autres n’ont pas à réagir).
pub(crate) fn emit_to_tab<S: Serialize + Clone>(app: &AppHandle, tab: u64, event: &str, payload: S) {
    if let Some(window) = tab_window(app, tab) {
        let _ = app.emit_to(window.as_str(), event, payload);
    }
}

/// Une notification d'onglets est déjà prévue : les changements suivants la rejoignent.
static EMIT_PENDING: AtomicBool = AtomicBool::new(false);

/// Liste des onglets envoyée aux fenêtres. Titre, adresse et chargement changent par rafales pendant qu'une page
/// se charge : ils sont regroupés en une seule notification toutes les 40 ms au plus (moins de rendus de l'interface).
fn emit_tabs(app: &AppHandle) {
    if EMIT_PENDING.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(40)).await;
        EMIT_PENDING.store(false, Ordering::Release);
        let tabs = app.state::<Browser>().0.lock().unwrap().tabs.clone();
        let _ = app.emit("browser:tabs", tabs);
    });
}

pub(crate) fn update(app: &AppHandle, id: u64, change: impl FnOnce(&mut Tab)) {
    {
        let state = app.state::<Browser>();
        let mut state = state.0.lock().unwrap();
        match state.tabs.iter_mut().find(|t| t.id == id) {
            Some(tab) => change(tab),
            None => return,
        }
    }
    emit_tabs(app);
}

pub(crate) fn tab_window(app: &AppHandle, id: u64) -> Option<String> {
    let state = app.state::<Browser>();
    let state = state.0.lock().unwrap();
    state.tabs.iter().find(|t| t.id == id).map(|t| t.window.clone())
}

pub(crate) fn tab_profile(app: &AppHandle, id: u64) -> Option<String> {
    app.state::<Browser>().0.lock().unwrap().tabs.iter().find(|t| t.id == id).map(|t| t.profile.clone())
}

/// Onglets ouverts : (identifiant, profil, adresse).
pub(crate) fn tab_pages(app: &AppHandle) -> Vec<(u64, String, String)> {
    app.state::<Browser>().0.lock().unwrap().tabs.iter().map(|t| (t.id, t.profile.clone(), t.url.clone())).collect()
}

/// Un onglet du profil, le premier venu.
pub(crate) fn any_tab_of(app: &AppHandle, profile: &str) -> Option<u64> {
    app.state::<Browser>().0.lock().unwrap().tabs.iter().find(|t| t.profile == profile).map(|t| t.id)
}

pub(crate) fn webview(app: &AppHandle, id: u64) -> Result<Webview, String> {
    app.get_webview(&label(id)).ok_or_else(|| "onglet introuvable".to_string())
}

/// Crée l'onglet (masqué : l'interface l'affiche ensuite à sa place).
/// Lien ouvert depuis un onglet : nouvel onglet dans la même fenêtre et le même profil, affiché ou en arrière-plan.
pub(crate) fn open_from_tab(app: &AppHandle, opener: u64, url: &str, background: bool) {
    let Ok(url) = web_url(url) else { return };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(window) = tab_window(&app, opener) else { return };
        let Some(profile) = app.state::<Browser>().0.lock().unwrap().tabs.iter().find(|t| t.id == opener).map(|t| t.profile.clone()) else { return };
        if let Ok(new_id) = open_tab(&app, &window, &profile, url, None) {
            emit_to_tab(&app, new_id, "browser:opened", (new_id, opener, background));
        }
    });
}

fn open_tab(app: &AppHandle, window_label: &str, profile: &str, url: Url, lazy: Option<String>) -> Result<u64, String> {
    if !valid_profile(profile) {
        return Err("profil invalide".into());
    }
    let id = {
        let state = app.state::<Browser>();
        let mut state = state.0.lock().unwrap();
        state.next += 1;
        let id = state.next;
        state.tabs.push(Tab {
            id,
            window: window_label.to_string(),
            profile: profile.to_string(),
            url: url.to_string(),
            title: lazy.clone().filter(|t| !t.is_empty()).unwrap_or_else(|| url.host_str().unwrap_or_default().to_string()),
            loading: lazy.is_none(),
            sleeping: lazy.is_some(),
            zoom: 1.0,
            audible: false,
            muted: false,
            blocked: 0,
            icon: String::new(),
            shown: false,
            hidden_gen: 0,
            pending_url: lazy.as_ref().map(|_| url.clone()),
        });
        id
    };

    let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("profiles").join(profile);
    let window = app.get_window(window_label).ok_or("fenêtre introuvable")?;
    let (on_title, on_load, on_popup) = (app.clone(), app.clone(), app.clone());
    let popup_profile = profile.to_string();

    let start = if lazy.is_some() { Url::parse("about:blank").unwrap() } else { url };
    let builder = WebviewBuilder::new(label(id), WebviewUrl::External(start))
        .data_directory(data_dir)
        // Outils de développement (F12, Ctrl+Maj+I, menus) : disponibles aussi dans la version installée.
        .devtools(true)
        // Fond transparent : pas de flash blanc avant le premier affichage de la page.
        .background_color(Color(0, 0, 0, 0))
        .on_document_title_changed(move |_, title| update(&on_title, id, |t| if t.pending_url.is_none() { t.title = title }))
        .on_page_load(move |_, page| {
            let url = page.url().to_string();
            let loading = matches!(page.event(), PageLoadEvent::Started);
            update(&on_load, id, |t| {
                // Onglet pas encore chargé : on garde l'adresse et le titre de la session.
                if t.pending_url.is_some() {
                    return;
                }
                t.url = url;
                t.loading = loading;
            });
        })
        // Les liens vers d'autres schémas (mailto:, applications…) ne sont pas suivis.
        .on_navigation(|url| matches!(url.scheme(), "http" | "https" | "file" | "about" | "data" | "blob"))
        // Clic molette et Ctrl+clic sur un lien : nouvel onglet en arrière-plan (voir native::LINK_SCRIPT).
        .initialization_script(crate::native::LINK_SCRIPT)
        // « Ouvrir dans une nouvelle fenêtre » devient un nouvel onglet du même profil.
        .on_new_window(move |url, features| {
            // Fenêtre surgissante demandée avec une taille (connexion Google, paiement…) : elle doit rester liée
            // à la page qui l'ouvre (`window.opener`), sinon la connexion reste blanche. WebView2 l'ouvre alors
            // dans sa propre fenêtre, avec le même profil.
            if features.size().is_some() {
                return NewWindowResponse::Allow;
            }
            let app = on_popup.clone();
            let profile = popup_profile.clone();
            tauri::async_runtime::spawn(async move {
                // L'onglet d'origine a pu changer de fenêtre : on ouvre dans sa fenêtre actuelle.
                let Some(window) = tab_window(&app, id) else { return };
                if let Ok(new_id) = open_tab(&app, &window, &profile, url, None) {
                    emit_to_tab(&app, new_id, "browser:opened", (new_id, id, false));
                }
            });
            NewWindowResponse::Deny
        });

    let created = window
        .add_child(builder, LogicalPosition::new(0.0, 0.0), LogicalSize::new(1.0, 1.0))
        .and_then(|w| w.hide().map(|_| w));
    if let Ok(w) = &created {
        enable_autofill(w);
        crate::native::install_shortcuts(app, w, id);
        crate::native::install_link_handling(app, w, id);
        crate::native::install_fullscreen(app, w, id);
        crate::features::install(app, w, id, profile);
    }
    if let Err(e) = created {
        app.state::<Browser>().0.lock().unwrap().tabs.retain(|t| t.id != id);
        return Err(e.to_string());
    }
    emit_tabs(app);
    Ok(id)
}

#[tauri::command]
pub fn browser_tabs(state: tauri::State<'_, Browser>) -> Vec<Tab> {
    state.0.lock().unwrap().tabs.clone()
}

// Les commandes qui créent ou manipulent des vues sont asynchrones : sous Windows, une commande
// synchrone bloquerait le fil principal dont la création de vue a besoin.

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    window: Window,
    profile: String,
    url: String,
    lazy_title: Option<String>,
) -> Result<u64, String> {
    // `lazy_title` : onglet de session restauré, chargé seulement quand on l'affiche.
    open_tab(&app, window.label(), &profile, web_url(&url)?, lazy_title)
}

#[tauri::command]
pub async fn browser_close(app: AppHandle, id: u64) -> Result<(), String> {
    if let Ok(w) = webview(&app, id) {
        w.close().map_err(|e| e.to_string())?;
    }
    app.state::<Browser>().0.lock().unwrap().tabs.retain(|t| t.id != id);
    emit_tabs(&app);
    Ok(())
}

/// Affiche les onglets demandés à leur place et masque tous les autres.
#[tauri::command]
pub async fn browser_layout(app: AppHandle, window: Window, visible: Vec<Placement>) -> Result<(), String> {
    // Seuls les onglets de la fenêtre appelante sont concernés.
    let ids: Vec<u64> = app.state::<Browser>().0.lock().unwrap().tabs.iter()
        .filter(|t| t.window == window.label())
        .map(|t| t.id)
        .collect();
    // D'abord afficher les pages demandées, ensuite masquer les autres : pas de trou au changement d'onglet.
    for p in visible.iter().filter(|p| ids.contains(&p.id)) {
        let w = webview(&app, p.id)?;
        let (width, height) = (p.width.max(1.0), p.height.max(1.0));
        w.set_bounds(Rect {
            position: LogicalPosition::new(p.x, p.y).into(),
            size: LogicalSize::new(width, height).into(),
        })
        .map_err(|e| e.to_string())?;
        round_corners(&w, width, height, p.radius, p.cutouts.clone());
        w.show().map_err(|e| e.to_string())?;
        wake(&app, &w, p.id);
        let scale = window.scale_factor().unwrap_or(1.0);
        let px = |v: f64| (v * scale).round() as i32;
        crate::devtools::place(p.id, p.devtools.map(|d| (px(d.x), px(d.y), px(d.width), px(d.height))));
    }
    for id in &ids {
        if !visible.iter().any(|p| p.id == *id) {
            crate::devtools::place(*id, None);
            if let Ok(w) = webview(&app, *id) {
                let _ = w.hide();
                put_to_sleep(&app, &w, *id);
            }
        }
    }
    Ok(())
}

/// Premier affichage d'un onglet caché : réveil, et chargement s'il était différé.
fn wake(app: &AppHandle, webview: &Webview, id: u64) {
    let (was_hidden, pending) = {
        let state = app.state::<Browser>();
        let mut state = state.0.lock().unwrap();
        let Some(tab) = state.tabs.iter_mut().find(|t| t.id == id) else { return };
        let was_hidden = !tab.shown;
        tab.shown = true;
        tab.sleeping = false;
        let pending = tab.pending_url.take();
        if pending.is_some() {
            tab.loading = true;
        }
        (was_hidden, pending)
    };
    if !was_hidden {
        return;
    }
    crate::native::set_awake(webview, true);
    if let Some(url) = pending {
        let _ = webview.navigate(url);
    }
    emit_tabs(app);
}

/// Onglet qui vient d'être caché : mémoire réduite tout de suite, suspension après `SLEEP_AFTER`.
fn put_to_sleep(app: &AppHandle, webview: &Webview, id: u64) {
    let generation = {
        let state = app.state::<Browser>();
        let mut state = state.0.lock().unwrap();
        let Some(tab) = state.tabs.iter_mut().find(|t| t.id == id && t.shown) else { return };
        tab.shown = false;
        tab.hidden_gen += 1;
        tab.hidden_gen
    };
    crate::native::set_awake(webview, false);
    let (app, webview) = (app.clone(), webview.clone());
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SLEEP_AFTER).await;
        let still_hidden = app.state::<Browser>().0.lock().unwrap().tabs.iter()
            .any(|t| t.id == id && !t.shown && t.hidden_gen == generation);
        if still_hidden {
            crate::native::suspend(&webview);
            update(&app, id, |t| t.sleeping = true);
        }
    });
}

#[tauri::command]
pub async fn browser_navigate(app: AppHandle, id: u64, url: String) -> Result<(), String> {
    webview(&app, id)?.navigate(web_url(&url)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_action(app: AppHandle, id: u64, action: String) -> Result<(), String> {
    let w = webview(&app, id)?;
    let result = match action.as_str() {
        "back" => w.eval("history.back()"),
        "forward" => w.eval("history.forward()"),
        "reload" => w.reload(),
        // Sans le cache (Ctrl+F5).
        "hard-reload" => {
            crate::native::hard_reload(&w);
            Ok(())
        }
        "empty-cache-reload" => {
            crate::native::empty_cache_reload(&w);
            Ok(())
        }
        "stop" => w.eval("window.stop()"),
        "mute" | "unmute" => {
            crate::features::set_muted(&w, action == "mute");
            Ok(())
        }
        "zoom-in" | "zoom-out" | "zoom-reset" => {
            crate::features::zoom_step(&app, id, match action.as_str() { "zoom-in" => 1, "zoom-out" => -1, _ => 0 });
            Ok(())
        }
        "focus" => w.set_focus(),
        "devtools" => {
            w.open_devtools();
            Ok(())
        }
        _ => return Err("action inconnue".into()),
    };
    result.map_err(|e| e.to_string())
}

/// Glisser-déposer d'un onglet : il passe juste avant `before` (ou à la fin), ce qui fixe l'ordre affiché et enregistré.
#[tauri::command]
pub fn browser_move(app: AppHandle, id: u64, before: Option<u64>) -> Result<(), String> {
    {
        let state = app.state::<Browser>();
        let mut state = state.0.lock().unwrap();
        let from = state.tabs.iter().position(|t| t.id == id).ok_or("onglet inconnu")?;
        let tab = state.tabs.remove(from);
        let to = before.and_then(|b| state.tabs.iter().position(|t| t.id == b)).unwrap_or(state.tabs.len());
        state.tabs.insert(to, tab);
    }
    emit_tabs(&app);
    Ok(())
}

/// Exécute un script de l’interface dans un onglet (outils de développement : règle et grille).
#[tauri::command]
pub async fn browser_eval(app: AppHandle, id: u64, script: String) -> Result<(), String> {
    webview(&app, id)?.eval(script).map_err(|e| e.to_string())
}

static NEXT_WINDOW: AtomicU64 = AtomicU64::new(1);

/// Ouvre une nouvelle fenêtre Calti sur un profil. Avec `detach`, les onglets de ce profil quittent
/// la fenêtre appelante pour la nouvelle, sans être rechargés.
#[tauri::command]
pub async fn browser_new_window(
    app: AppHandle,
    window: Window,
    profile: String,
    detach: bool,
    session: Option<String>,
    tab: Option<u64>,
) -> Result<String, String> {
    if !valid_profile(&profile) {
        return Err("profil invalide".into());
    }
    // `session` : clé de stockage de la session à rouvrir (fenêtre encore ouverte à la dernière fermeture).
    let session = session.filter(|s| s.starts_with("calti.browser.calti-") && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-'));
    // Fenêtre rouverte : elle reprend son nom (donc sa clé de session), et les suivantes sont numérotées après elle,
    // pour qu'aucune nouvelle fenêtre n'écrase la session d'une autre.
    let reopened = session.as_deref()
        .and_then(|key| key.strip_prefix("calti.browser.calti-"))
        .and_then(|n| n.parse::<u64>().ok())
        .filter(|n| app.get_webview_window(&format!("calti-{n}")).is_none());
    let label = match reopened {
        Some(n) => {
            NEXT_WINDOW.fetch_max(n + 1, Ordering::Relaxed);
            format!("calti-{n}")
        }
        None => format!("calti-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed)),
    };
    let query = match &session {
        Some(key) => format!("index.html?profile={profile}&session={key}"),
        None => format!("index.html?profile={profile}"),
    };
    let url = WebviewUrl::App(query.into());
    // Mêmes réglages que la fenêtre principale (tauri.conf.json).
    let new_window = WebviewWindowBuilder::new(&app, &label, url)
        .title("Calti")
        .inner_size(1320.0, 840.0)
        .min_inner_size(960.0, 620.0)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .effects(WindowEffectsConfig { effects: vec![Effect::Acrylic], ..Default::default() })
        .build()
        .map_err(|e| e.to_string())?;

    // `detach` : les onglets du profil quittent la fenêtre appelante ; `tab` : ce seul onglet (glissé hors de la fenêtre).
    if detach || tab.is_some() {
        let moving: Vec<u64> = app.state::<Browser>().0.lock().unwrap().tabs.iter()
            .filter(|t| t.window == window.label() && match tab { Some(id) => t.id == id, None => t.profile == profile })
            .map(|t| t.id)
            .collect();
        let target = new_window.as_ref().window();
        for id in moving {
            let w = webview(&app, id)?;
            w.reparent(&target).map_err(|e| e.to_string())?;
            let _ = w.hide();
            update(&app, id, |t| t.window = label.clone());
        }
    }
    Ok(label)
}

/// Fenêtre fermée : ses onglets (fermés avec elle) sont oubliés.
pub fn forget_window(app: &AppHandle, label: &str) {
    app.state::<Browser>().0.lock().unwrap().tabs.retain(|t| t.window != label);
    emit_tabs(app);
}
