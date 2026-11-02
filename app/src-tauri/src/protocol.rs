//! Messages échangés avec l'extension Brave. Toute entrée est typée et validée ici.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: i64,
    pub window_id: i64,
    pub index: u32,
    pub title: String,
    pub url: String,
    pub fav_icon_url: Option<String>,
    pub active: bool,
    pub pinned: bool,
    pub audible: bool,
    pub muted: bool,
    pub incognito: bool,
    pub loading: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub focused_window_id: Option<i64>,
    pub tabs: Vec<Tab>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookmarkNode {
    pub id: String,
    pub title: String,
    pub url: Option<String>,
    pub children: Option<Vec<BookmarkNode>>,
}

/// Extension → application.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum FromBrave {
    /// Identifiant stable du profil Brave, généré une fois par l'extension.
    Hello { profile_id: String },
    Snapshot(Snapshot),
    Bookmarks { tree: Vec<BookmarkNode> },
    Error { message: String },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NavAction {
    Back,
    Forward,
    Reload,
}

/// Application → extension.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ToBrave {
    Identify,
    RequestSnapshot,
    GetBookmarks,
    ActivateTab { tab_id: i64 },
    CloseTab { tab_id: i64 },
    NewTab,
    OpenUrl { url: String },
    Search { text: String },
    Navigate { action: NavAction },
}

impl ToBrave {
    pub fn validate(&self) -> Result<(), String> {
        match self {
            ToBrave::ActivateTab { tab_id } | ToBrave::CloseTab { tab_id } if *tab_id < 0 => {
                Err("identifiant d'onglet invalide".into())
            }
            ToBrave::OpenUrl { url } => match tauri::Url::parse(url) {
                Ok(u) if matches!(u.scheme(), "http" | "https") => Ok(()),
                _ => Err("seules les adresses http(s) sont acceptées".into()),
            },
            ToBrave::Search { text } if text.trim().is_empty() || text.len() > 2048 => {
                Err("recherche vide ou trop longue".into())
            }
            _ => Ok(()),
        }
    }
}
