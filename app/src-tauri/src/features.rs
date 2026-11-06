//! Fonctions de navigateur propres aux pages : téléchargements, blocage des publicités et traqueurs,
//! zoom mémorisé par site, son par onglet, autorisations des sites et effacement des données d'un profil.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Url, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::{
    take_pwstr, BytesReceivedChangedEventHandler, FaviconChangedEventHandler, ClearBrowsingDataCompletedHandler, DownloadStartingEventHandler,
    GetNonDefaultPermissionSettingsCompletedHandler, IsDocumentPlayingAudioChangedEventHandler, IsMutedChangedEventHandler,
    SetPermissionStateCompletedHandler, SourceChangedEventHandler, StateChangedEventHandler,
    WebResourceRequestedEventHandler, ZoomFactorChangedEventHandler,
};
use windows::core::{w, Interface, HSTRING, PWSTR};

/* --- Blocage des publicités et traqueurs --- */

/// Domaines de régies publicitaires et de mesure d'audience les plus courants (et tous leurs sous-domaines).
const BLOCKED: &[&str] = &[
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagmanager.com",
    "googletagservices.com", "adservice.google.com", "pagead2.googlesyndication.com", "imasdk.googleapis.com",
    "amazon-adsystem.com", "adnxs.com", "adsrvr.org", "criteo.com", "criteo.net", "taboola.com", "outbrain.com",
    "pubmatic.com", "rubiconproject.com", "openx.net", "casalemedia.com", "indexww.com", "smartadserver.com",
    "teads.tv", "yieldmo.com", "sharethrough.com", "33across.com", "adform.net", "bidswitch.net", "contextweb.com",
    "lijit.com", "sovrn.com", "media.net", "moatads.com", "adsafeprotected.com", "doubleverify.com",
    "scorecardresearch.com", "quantserve.com", "quantcount.com", "chartbeat.com", "chartbeat.net", "hotjar.com",
    "hotjar.io", "mouseflow.com", "fullstory.com", "crazyegg.com", "clarity.ms", "mixpanel.com", "amplitude.com",
    "segment.io", "segment.com", "heap.io", "heapanalytics.com", "newrelic.com", "nr-data.net", "branch.io",
    "adjust.com", "appsflyer.com", "kochava.com", "connect.facebook.net", "ads-twitter.com", "analytics.twitter.com",
    "ads.linkedin.com", "px.ads.linkedin.com", "snap.licdn.com", "analytics.tiktok.com", "ads.tiktok.com",
    "bat.bing.com", "ads.yahoo.com", "advertising.com", "yieldlab.net", "zemanta.com", "mgid.com", "revcontent.com",
    "propellerads.com", "popads.net", "popcash.net", "exoclick.com", "juicyads.com", "trafficjunky.net",
    "adcolony.com", "applovin.com", "unityads.unity3d.com", "inmobi.com", "smaato.net", "mopub.com", "vungle.com",
    "onesignal.com", "pushwoosh.com", "addthis.com", "sharethis.com", "omtrdc.net", "demdex.net", "everesttech.net",
    "krxd.net", "bluekai.com", "exelator.com", "rlcdn.com", "tapad.com", "agkn.com", "mathtag.com", "turn.com",
    "eyeota.net", "liadm.com", "id5-sync.com", "crwdcntrl.net", "adroll.com", "perfectaudience.com", "steelhousemedia.com",
    "zedo.com", "serving-sys.com", "flashtalking.com", "innovid.com", "spotxchange.com", "springserve.com",
    "stickyadstv.com", "tremorhub.com", "undertone.com", "gumgum.com", "kargo.com", "triplelift.com", "3lift.com",
    "emxdgt.com", "districtm.io", "aniview.com", "adition.com", "ligatus.com", "plista.com", "xiti.com",
    "at-internet.com", "eulerian.net", "weborama.fr", "weborama.com", "mediarithmics.com", "sddan.com", "ad.gt",
    "cdn.taboola.com", "trc.taboola.com", "static.ads-twitter.com", "stats.g.doubleclick.net", "yandex.ru/ads",
    "mc.yandex.ru", "an.yandex.ru", "adfox.ru", "ad.mail.ru", "top-fwz1.mail.ru", "matomo.cloud", "statcounter.com",
    "histats.com", "addtoany.com", "cookielaw.org.analytics", "kameleoon.eu", "abtasty.com", "optimizely.com",
    "contentsquare.net", "dynatrace.com", "bugsnag.com", "sentry-cdn.com", "permutive.com", "permutive.app",
    "piano.io", "tinypass.com", "cxense.com", "parsely.com", "comscore.com", "nielsen.com", "imrworldwide.com",
];

fn blocked_domains() -> &'static HashSet<&'static str> {
    static SET: OnceLock<HashSet<&'static str>> = OnceLock::new();
    SET.get_or_init(|| BLOCKED.iter().copied().collect())
}

/// L'hôte ou l'un de ses domaines parents est dans la liste.
fn is_blocked_host(host: &str) -> bool {
    let set = blocked_domains();
    let mut rest = host;
    loop {
        if set.contains(rest) {
            return true;
        }
        match rest.split_once('.') {
            Some((_, parent)) if parent.contains('.') => rest = parent,
            _ => return false,
        }
    }
}

/// Profils dont le blocage est activé.
fn blocking() -> &'static RwLock<HashSet<String>> {
    static PROFILES: OnceLock<RwLock<HashSet<String>>> = OnceLock::new();
    PROFILES.get_or_init(Default::default)
}

/// Sites où le blocage est suspendu, par profil (« profil|hôte »).
fn allowed_sites() -> &'static RwLock<HashSet<String>> {
    static SITES: OnceLock<RwLock<HashSet<String>>> = OnceLock::new();
    SITES.get_or_init(Default::default)
}

/// Réglages du blocage, envoyés par l'interface au lancement et à chaque changement.
#[tauri::command]
pub fn blocker_configure(profiles: Vec<String>, allowed: Vec<String>) {
    *blocking().write().unwrap() = profiles.into_iter().collect();
    *allowed_sites().write().unwrap() = allowed.into_iter().collect();
}

fn host_of(url: &str) -> Option<String> {
    Url::parse(url).ok()?.host_str().map(|h| h.trim_start_matches("www.").to_string())
}

/* --- Zoom mémorisé par site --- */

fn zoom_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    crate::state::data_dir(app).map(|d| d.join("zoom.json"))
}

/// Zoom acceptable : celui des réglages (25 à 300 %), avec une marge pour Ctrl+molette (jusqu'à 500 %).
fn valid_zoom(factor: f64) -> bool {
    factor.is_finite() && (0.25..=5.0).contains(&factor)
}

/// Zoom par « profil|hôte » (absent : 100 %). Valeurs aberrantes (une visionneuse de PDF a pu en signaler, 0,1 %)
/// écartées au chargement et le fichier réécrit sans elles.
fn zooms(app: &AppHandle) -> &'static Mutex<HashMap<String, f64>> {
    static ZOOMS: OnceLock<Mutex<HashMap<String, f64>>> = OnceLock::new();
    ZOOMS.get_or_init(|| {
        let mut saved: HashMap<String, f64> = zoom_file(app)
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let before = saved.len();
        saved.retain(|_, f| valid_zoom(*f));
        if saved.len() != before {
            save_zooms(app, &saved);
        }
        Mutex::new(saved)
    })
}

/// Zoom par défaut des pages (clé « * »), 100 % s'il n'est pas réglé.
fn default_zoom(zooms: &HashMap<String, f64>) -> f64 {
    zooms.get("*").copied().unwrap_or(1.0)
}

/// Zoom d'un site : le sien s'il en a un, sinon le zoom par défaut.
fn zoom_for(app: &AppHandle, key: &str) -> f64 {
    let zooms = zooms(app).lock().unwrap();
    zooms.get(key).copied().filter(|f| valid_zoom(*f)).unwrap_or_else(|| default_zoom(&zooms))
}

fn save_zooms(app: &AppHandle, map: &HashMap<String, f64>) {
    if let (Some(path), Ok(text)) = (zoom_file(app), serde_json::to_string(map)) {
        let _ = std::fs::write(path, text);
    }
}

fn remember_zoom(app: &AppHandle, key: String, factor: f64) {
    if !valid_zoom(factor) {
        return;
    }
    let map = {
        let mut zooms = zooms(app).lock().unwrap();
        // Revenir au zoom par défaut efface la valeur propre au site.
        let unchanged = if (factor - default_zoom(&zooms)).abs() < 0.001 { zooms.remove(&key).is_none() } else { zooms.insert(key, factor) == Some(factor) };
        if unchanged {
            return;
        }
        zooms.clone()
    };
    save_zooms(app, &map);
}

#[derive(Serialize)]
pub struct ZoomSettings {
    /// Zoom par défaut des pages.
    default: f64,
    /// Sites avec leur propre zoom : (profil, site, zoom).
    sites: Vec<(String, String, f64)>,
}

#[tauri::command]
pub fn zoom_settings(app: AppHandle) -> ZoomSettings {
    let zooms = zooms(&app).lock().unwrap();
    let mut sites: Vec<_> = zooms.iter()
        .filter_map(|(k, v)| k.split_once('|').map(|(p, h)| (p.to_string(), h.to_string(), *v)))
        .collect();
    sites.sort_by(|a, b| (&a.0, &a.1).cmp(&(&b.0, &b.1)));
    ZoomSettings { default: default_zoom(&zooms), sites }
}

/// Zoom par défaut (`site` absent) ou d'un site (`site` = « profil|hôte ») ; `factor` absent : oublié.
/// Les onglets ouverts sont mis à jour tout de suite.
#[tauri::command]
pub fn zoom_set(app: AppHandle, site: Option<String>, factor: Option<f64>) -> Result<(), String> {
    if factor.is_some_and(|f| !(0.25..=3.0).contains(&f)) {
        return Err("zoom hors limites (25 à 300 %)".into());
    }
    let key = site.unwrap_or_else(|| "*".into());
    let map = {
        let mut zooms = zooms(&app).lock().unwrap();
        match factor {
            Some(f) if key == "*" && (f - 1.0).abs() < 0.001 => { zooms.remove("*"); }
            Some(f) => { zooms.insert(key, f); }
            None => { zooms.remove(&key); }
        }
        zooms.clone()
    };
    save_zooms(&app, &map);
    for (tab, profile, url) in crate::browser::tab_pages(&app) {
        let Some(host) = host_of(&url) else { continue };
        let factor = zoom_for(&app, &format!("{profile}|{host}"));
        let Some(webview) = app.get_webview(&format!("tab-{tab}")) else { continue };
        let on_set = app.clone();
        let _ = webview.with_webview(move |platform| unsafe {
            if platform.controller().SetZoomFactor(factor).is_ok() {
                crate::browser::update(&on_set, tab, |t| t.zoom = factor);
            }
        });
    }
    Ok(())
}

/* --- Téléchargements --- */

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    id: u64,
    profile: String,
    url: String,
    path: String,
    received: i64,
    /// Taille totale, inconnue : -1.
    total: i64,
    /// "progress", "done", "failed" ou "cancelled".
    state: &'static str,
    started: u64,
}

fn downloads() -> &'static Mutex<Vec<Download>> {
    static LIST: OnceLock<Mutex<Vec<Download>>> = OnceLock::new();
    LIST.get_or_init(Default::default)
}

thread_local! {
    /// Téléchargements en cours (objets COM du fil principal), pour pouvoir les annuler.
    static OPERATIONS: std::cell::RefCell<HashMap<u64, ICoreWebView2DownloadOperation>> = Default::default();
}

fn emit_downloads(app: &AppHandle, force: bool) {
    static LAST: Mutex<Option<Instant>> = Mutex::new(None);
    {
        let mut last = LAST.lock().unwrap();
        if !force && last.is_some_and(|t| t.elapsed() < Duration::from_millis(300)) {
            return;
        }
        *last = Some(Instant::now());
    }
    let _ = app.emit("browser:downloads", downloads().lock().unwrap().clone());
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

unsafe fn track_download(app: &AppHandle, profile: &str, op: ICoreWebView2DownloadOperation) -> windows::core::Result<()> {
    static NEXT: Mutex<u64> = Mutex::new(0);
    let id = {
        let mut n = NEXT.lock().unwrap();
        *n += 1;
        *n
    };
    let mut raw = PWSTR::null();
    op.Uri(&mut raw)?;
    let url = take_pwstr(raw);
    let mut raw = PWSTR::null();
    op.ResultFilePath(&mut raw)?;
    let path = take_pwstr(raw);
    let mut total = 0i64;
    let _ = op.TotalBytesToReceive(&mut total);
    {
        let mut list = downloads().lock().unwrap();
        list.insert(0, Download { id, profile: profile.into(), url, path, received: 0, total, state: "progress", started: now_ms() });
        list.truncate(100);
    }
    OPERATIONS.with(|ops| ops.borrow_mut().insert(id, op.clone()));
    emit_downloads(app, true);

    let on_bytes = app.clone();
    let mut token = 0i64;
    op.add_BytesReceivedChanged(
        &BytesReceivedChangedEventHandler::create(Box::new(move |op, _| {
            let Some(op) = op else { return Ok(()) };
            let (mut received, mut total) = (0i64, 0i64);
            op.BytesReceived(&mut received)?;
            let _ = op.TotalBytesToReceive(&mut total);
            if let Some(d) = downloads().lock().unwrap().iter_mut().find(|d| d.id == id) {
                d.received = received;
                d.total = total;
            }
            emit_downloads(&on_bytes, false);
            Ok(())
        })),
        &mut token,
    )?;
    let on_state = app.clone();
    op.add_StateChanged(
        &StateChangedEventHandler::create(Box::new(move |op, _| {
            let Some(op) = op else { return Ok(()) };
            let mut state = COREWEBVIEW2_DOWNLOAD_STATE::default();
            op.State(&mut state)?;
            let mut reason = COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default();
            let _ = op.InterruptReason(&mut reason);
            let mut raw = PWSTR::null();
            let path = op.ResultFilePath(&mut raw).map(|_| take_pwstr(raw)).ok();
            let label = match state {
                COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED => "done",
                COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED if reason == COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED => "cancelled",
                COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED => "failed",
                _ => "progress",
            };
            if let Some(d) = downloads().lock().unwrap().iter_mut().find(|d| d.id == id) {
                d.state = label;
                if let Some(path) = path.filter(|p| !p.is_empty()) {
                    d.path = path;
                }
                if label == "done" {
                    d.received = d.received.max(d.total);
                }
            }
            if label != "progress" {
                OPERATIONS.with(|ops| ops.borrow_mut().remove(&id));
            }
            emit_downloads(&on_state, true);
            Ok(())
        })),
        &mut token,
    )?;
    Ok(())
}

#[tauri::command]
pub fn downloads_list() -> Vec<Download> {
    downloads().lock().unwrap().clone()
}

/// Annule un téléchargement en cours.
#[tauri::command]
pub fn download_cancel(app: AppHandle, id: u64) -> Result<(), String> {
    app.run_on_main_thread(move || {
        OPERATIONS.with(|ops| {
            if let Some(op) = ops.borrow().get(&id) {
                let _ = unsafe { op.Cancel() };
            }
        })
    })
    .map_err(|e| e.to_string())
}

/// Ouvre le fichier téléchargé, ou le montre dans l'Explorateur (`reveal`).
#[tauri::command]
pub fn download_open(id: u64, reveal: bool) -> Result<(), String> {
    let path = downloads().lock().unwrap().iter().find(|d| d.id == id).map(|d| d.path.clone()).ok_or("téléchargement inconnu")?;
    if !std::path::Path::new(&path).exists() {
        return Err("fichier introuvable (déplacé ou supprimé)".into());
    }
    let result = if reveal {
        std::process::Command::new("explorer.exe").arg(format!("/select,{path}")).spawn()
    } else {
        std::process::Command::new("explorer.exe").arg(&path).spawn()
    };
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Liste vidée des téléchargements terminés (les fichiers restent).
#[tauri::command]
pub fn downloads_clear(app: AppHandle) {
    downloads().lock().unwrap().retain(|d| d.state == "progress");
    emit_downloads(&app, true);
}

/* --- Installation sur chaque onglet --- */

pub fn install(app: &AppHandle, webview: &Webview, tab: u64, profile: &str) {
    let app = app.clone();
    let profile = profile.to_string();
    let _ = webview.with_webview(move |platform| unsafe {
        let controller = platform.controller();
        let Ok(core) = controller.CoreWebView2() else { return };
        let mut token = 0i64;

        // Téléchargements : suivis dans le panneau de Calti (le petit panneau de WebView2 est masqué).
        if let Ok(core4) = core.cast::<ICoreWebView2_4>() {
            let (app, profile) = (app.clone(), profile.clone());
            let _ = core4.add_DownloadStarting(
                &DownloadStartingEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    args.SetHandled(true)?;
                    track_download(&app, &profile, args.DownloadOperation()?)?;
                    if let Some(window) = crate::browser::tab_window(&app, tab) {
                        let _ = app.emit_to(window.as_str(), "browser:download-started", tab);
                    }
                    Ok(())
                })),
                &mut token,
            );
        }

        // Publicités et traqueurs : requêtes vers les domaines listés refusées, page comprise dans ses cadres.
        if let Ok(environment) = core.cast::<ICoreWebView2_2>().and_then(|c| c.Environment()) {
            let added = core.cast::<ICoreWebView2_22>().and_then(|c| {
                c.AddWebResourceRequestedFilterWithRequestSourceKinds(
                    w!("*"),
                    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                    COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
                )
            });
            if added.is_err() {
                let _ = core.AddWebResourceRequestedFilter(w!("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
            }
            let (app, profile) = (app.clone(), profile.clone());
            let _ = core.add_WebResourceRequested(
                &WebResourceRequestedEventHandler::create(Box::new(move |sender, args| {
                    let Some(args) = args else { return Ok(()) };
                    if !blocking().read().unwrap().contains(&profile) {
                        return Ok(());
                    }
                    let mut context = COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();
                    args.ResourceContext(&mut context)?;
                    if context == COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT {
                        return Ok(());
                    }
                    let mut raw = PWSTR::null();
                    args.Request()?.Uri(&mut raw)?;
                    let Some(host) = host_of(&take_pwstr(raw)) else { return Ok(()) };
                    if !is_blocked_host(&host) {
                        return Ok(());
                    }
                    // Site où l'utilisateur a suspendu le blocage.
                    if let Some(sender) = sender {
                        let mut raw = PWSTR::null();
                        sender.Source(&mut raw)?;
                        if let Some(page) = host_of(&take_pwstr(raw)) {
                            if allowed_sites().read().unwrap().contains(&format!("{profile}|{page}")) {
                                return Ok(());
                            }
                        }
                    }
                    let response = environment.CreateWebResourceResponse(None, 403, w!("Blocked"), w!(""))?;
                    args.SetResponse(&response)?;
                    crate::browser::update(&app, tab, |t| t.blocked += 1);
                    Ok(())
                })),
                &mut token,
            );
        }

        // Changement de page : compteur de blocage remis à zéro, zoom du site réappliqué.
        {
            let (app, profile, controller) = (app.clone(), profile.clone(), controller.clone());
            let _ = core.add_SourceChanged(
                &SourceChangedEventHandler::create(Box::new(move |sender, args| {
                    let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
                    let mut raw = PWSTR::null();
                    sender.Source(&mut raw)?;
                    let Some(host) = host_of(&take_pwstr(raw)) else { return Ok(()) };
                    let mut new_document = windows::core::BOOL::default();
                    args.IsNewDocument(&mut new_document)?;
                    if new_document.as_bool() {
                        crate::browser::update(&app, tab, |t| t.blocked = 0);
                    }
                    let factor = zoom_for(&app, &format!("{profile}|{host}"));
                    let mut current = 1.0f64;
                    controller.ZoomFactor(&mut current)?;
                    if (current - factor).abs() > 0.001 {
                        controller.SetZoomFactor(factor)?;
                        crate::browser::update(&app, tab, |t| t.zoom = factor);
                    }
                    Ok(())
                })),
                &mut token,
            );
        }

        // Zoom changé (Ctrl+molette, Ctrl+plus…) : mémorisé pour le site, affiché dans la barre.
        {
            let (app, profile, core) = (app.clone(), profile.clone(), core.clone());
            let _ = controller.add_ZoomFactorChanged(
                &ZoomFactorChangedEventHandler::create(Box::new(move |controller, _| {
                    let Some(controller) = controller else { return Ok(()) };
                    let mut factor = 1.0f64;
                    controller.ZoomFactor(&mut factor)?;
                    let mut raw = PWSTR::null();
                    core.Source(&mut raw)?;
                    let host = host_of(&take_pwstr(raw));
                    // Zoom aberrant (visionneuse de PDF qui se redimensionne…) : ni gardé, ni laissé — le zoom du site revient.
                    if !valid_zoom(factor) {
                        let back = host.as_ref().map_or(1.0, |h| zoom_for(&app, &format!("{profile}|{h}")));
                        controller.SetZoomFactor(back)?;
                        crate::browser::update(&app, tab, |t| t.zoom = back);
                        return Ok(());
                    }
                    crate::browser::update(&app, tab, |t| t.zoom = factor);
                    if let Some(host) = host {
                        remember_zoom(&app, format!("{profile}|{host}"), factor);
                    }
                    Ok(())
                })),
                &mut token,
            );
        }

        // Icône de la page (celle qu'elle déclare, pas seulement /favicon.ico).
        if let Ok(core15) = core.cast::<ICoreWebView2_15>() {
            let on_icon = app.clone();
            let _ = core15.add_FaviconChanged(
                &FaviconChangedEventHandler::create(Box::new(move |sender, _| {
                    let Some(sender) = sender else { return Ok(()) };
                    let mut raw = PWSTR::null();
                    sender.cast::<ICoreWebView2_15>()?.FaviconUri(&mut raw)?;
                    let icon = take_pwstr(raw);
                    if icon.starts_with("https://") || icon.starts_with("http://") {
                        crate::browser::update(&on_icon, tab, |t| t.icon = icon);
                    }
                    Ok(())
                })),
                &mut token,
            );
        }

        // Son : onglet qui joue du son, onglet coupé.
        if let Ok(core8) = core.cast::<ICoreWebView2_8>() {
            let on_audio = app.clone();
            let _ = core8.add_IsDocumentPlayingAudioChanged(
                &IsDocumentPlayingAudioChangedEventHandler::create(Box::new(move |sender, _| {
                    let Some(sender) = sender else { return Ok(()) };
                    let mut playing = windows::core::BOOL::default();
                    sender.cast::<ICoreWebView2_8>()?.IsDocumentPlayingAudio(&mut playing)?;
                    crate::browser::update(&on_audio, tab, |t| t.audible = playing.as_bool());
                    Ok(())
                })),
                &mut token,
            );
            let on_mute = app.clone();
            let _ = core8.add_IsMutedChanged(
                &IsMutedChangedEventHandler::create(Box::new(move |sender, _| {
                    let Some(sender) = sender else { return Ok(()) };
                    let mut muted = windows::core::BOOL::default();
                    sender.cast::<ICoreWebView2_8>()?.IsMuted(&mut muted)?;
                    crate::browser::update(&on_mute, tab, |t| t.muted = muted.as_bool());
                    Ok(())
                })),
                &mut token,
            );
        }
    });
}

/// Son de l'onglet coupé ou rétabli.
pub fn set_muted(webview: &Webview, muted: bool) {
    let _ = webview.with_webview(move |platform| unsafe {
        if let Ok(core8) = platform.controller().CoreWebView2().and_then(|c| c.cast::<ICoreWebView2_8>()) {
            let _ = core8.SetIsMuted(muted);
        }
    });
}

/// Zoom de l'onglet : `step` +1 / -1 (paliers usuels), 0 pour revenir à 100 % ; retenu pour le site.
pub fn zoom_step(app: &AppHandle, tab: u64, step: i32) {
    const LEVELS: [f64; 15] = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    let Some(webview) = app.get_webview(&format!("tab-{tab}")) else { return };
    let Some(profile) = crate::browser::tab_profile(app, tab) else { return };
    let app = app.clone();
    let _ = webview.with_webview(move |platform| unsafe {
        let controller = platform.controller();
        let mut current = 1.0f64;
        if controller.ZoomFactor(&mut current).is_err() {
            return;
        }
        let next = match step {
            0 => default_zoom(&zooms(&app).lock().unwrap()),
            s if s > 0 => LEVELS.iter().copied().find(|l| *l > current + 0.001).unwrap_or(3.0),
            _ => LEVELS.iter().rev().copied().find(|l| *l < current - 0.001).unwrap_or(0.25),
        };
        if controller.SetZoomFactor(next).is_err() {
            return;
        }
        crate::browser::update(&app, tab, |t| t.zoom = next);
        let mut raw = PWSTR::null();
        if let Ok(core) = controller.CoreWebView2() {
            if core.Source(&mut raw).is_ok() {
                if let Some(host) = host_of(&take_pwstr(raw)) {
                    remember_zoom(&app, format!("{profile}|{host}"), next);
                }
            }
        }
    });
}

/* --- Autorisations des sites et données d'un profil --- */

const PERMISSIONS: [(COREWEBVIEW2_PERMISSION_KIND, &str); 11] = [
    (COREWEBVIEW2_PERMISSION_KIND_CAMERA, "camera"),
    (COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, "microphone"),
    (COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, "geolocation"),
    (COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, "notifications"),
    (COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, "clipboard"),
    (COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY, "autoplay"),
    (COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS, "downloads"),
    (COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE, "files"),
    (COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS, "fonts"),
    (COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS, "sensors"),
    (COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES, "midi"),
];

#[derive(Serialize)]
pub struct SitePermission {
    origin: String,
    kind: &'static str,
    allowed: bool,
}

/// Un onglet ouvert du profil : WebView2 n'expose ses données qu'à travers une vue.
fn profile_webview(app: &AppHandle, profile: &str) -> Result<Webview, String> {
    let id = crate::browser::any_tab_of(app, profile).ok_or("ouvrez d'abord un onglet de ce profil")?;
    app.get_webview(&format!("tab-{id}")).ok_or_else(|| "onglet introuvable".into())
}

/// Exécute `f` sur le profil WebView2 (fil principal) et attend la réponse qu'il renvoie.
async fn with_profile<T: Send + 'static>(
    app: &AppHandle,
    profile: &str,
    f: impl FnOnce(ICoreWebView2Profile, std::sync::mpsc::Sender<Result<T, String>>) + Send + 'static,
) -> Result<T, String> {
    let webview = profile_webview(app, profile)?;
    let (tx, rx) = std::sync::mpsc::channel();
    let fail = tx.clone();
    webview
        .with_webview(move |platform| unsafe {
            match platform.controller().CoreWebView2().and_then(|c| c.cast::<ICoreWebView2_13>()).and_then(|c| c.Profile()) {
                Ok(p) => f(p, tx),
                Err(e) => {
                    let _ = fail.send(Err(e.to_string()));
                }
            }
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(20)).map_err(|_| "pas de réponse de WebView2".to_string())?)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn site_permissions(app: AppHandle, profile: String) -> Result<Vec<SitePermission>, String> {
    with_profile(&app, &profile, |p, tx| unsafe {
        let result = p.cast::<ICoreWebView2Profile4>().and_then(|p4| {
            let tx = tx.clone();
            p4.GetNonDefaultPermissionSettings(&GetNonDefaultPermissionSettingsCompletedHandler::create(Box::new(move |_, view| {
                let mut list = Vec::new();
                if let Some(view) = view {
                    let mut count = 0u32;
                    view.Count(&mut count)?;
                    for i in 0..count {
                        let setting = view.GetValueAtIndex(i)?;
                        let (mut kind, mut state, mut raw) = (COREWEBVIEW2_PERMISSION_KIND::default(), COREWEBVIEW2_PERMISSION_STATE::default(), PWSTR::null());
                        setting.PermissionKind(&mut kind)?;
                        setting.PermissionState(&mut state)?;
                        setting.PermissionOrigin(&mut raw)?;
                        let origin = take_pwstr(raw);
                        if let Some((_, name)) = PERMISSIONS.iter().find(|(k, _)| *k == kind) {
                            list.push(SitePermission { origin, kind: name, allowed: state == COREWEBVIEW2_PERMISSION_STATE_ALLOW });
                        }
                    }
                }
                let _ = tx.send(Ok(list));
                Ok(())
            })))
        });
        if let Err(e) = result {
            let _ = tx.send(Err(e.to_string()));
        }
    })
    .await
}

/// Autorisation d'un site : "allow", "deny" ou "default" (le site redemandera).
#[tauri::command]
pub async fn site_permission_set(app: AppHandle, profile: String, origin: String, kind: String, state: String) -> Result<(), String> {
    let kind = PERMISSIONS.iter().find(|(_, n)| *n == kind).map(|(k, _)| *k).ok_or("autorisation inconnue")?;
    let state = match state.as_str() {
        "allow" => COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        "deny" => COREWEBVIEW2_PERMISSION_STATE_DENY,
        _ => COREWEBVIEW2_PERMISSION_STATE_DEFAULT,
    };
    with_profile(&app, &profile, move |p, tx| unsafe {
        let done = tx.clone();
        let result = p.cast::<ICoreWebView2Profile4>().and_then(|p4| {
            p4.SetPermissionState(kind, &HSTRING::from(origin), state, &SetPermissionStateCompletedHandler::create(Box::new(move |r| {
                let _ = done.send(r.map_err(|e| e.to_string()));
                Ok(())
            })))
        });
        if let Err(e) = result {
            let _ = tx.send(Err(e.to_string()));
        }
    })
    .await
}

/// Efface des données du profil : "history", "cookies", "cache", "storage", "passwords", "autofill" ou "all".
#[tauri::command]
pub async fn clear_browsing_data(app: AppHandle, profile: String, kinds: Vec<String>) -> Result<(), String> {
    let mut mask = 0i32;
    for kind in &kinds {
        mask |= match kind.as_str() {
            "history" => COREWEBVIEW2_BROWSING_DATA_KINDS_BROWSING_HISTORY.0,
            "cookies" => COREWEBVIEW2_BROWSING_DATA_KINDS_COOKIES.0,
            "cache" => COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE.0 | COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE.0,
            "storage" => COREWEBVIEW2_BROWSING_DATA_KINDS_ALL_DOM_STORAGE.0,
            "passwords" => COREWEBVIEW2_BROWSING_DATA_KINDS_PASSWORD_AUTOSAVE.0,
            "autofill" => COREWEBVIEW2_BROWSING_DATA_KINDS_GENERAL_AUTOFILL.0,
            "downloads" => COREWEBVIEW2_BROWSING_DATA_KINDS_DOWNLOAD_HISTORY.0,
            "all" => COREWEBVIEW2_BROWSING_DATA_KINDS_ALL_PROFILE.0,
            _ => return Err(format!("donnée inconnue : {kind}")),
        };
    }
    with_profile(&app, &profile, move |p, tx| unsafe {
        let done = tx.clone();
        let result = p.cast::<ICoreWebView2Profile2>().and_then(|p2| {
            p2.ClearBrowsingData(COREWEBVIEW2_BROWSING_DATA_KINDS(mask), &ClearBrowsingDataCompletedHandler::create(Box::new(move |r| {
                let _ = done.send(r.map_err(|e| e.to_string()));
                Ok(())
            })))
        });
        if let Err(e) = result {
            let _ = tx.send(Err(e.to_string()));
        }
    })
    .await
}
