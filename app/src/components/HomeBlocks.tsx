import type { Brave } from "../browser/adapter";
import type { Suggestion } from "../browser/library";
import type { Block } from "../settings/layout";
import type { HomeTheme } from "../settings/settings";
import { ActiveTabWidget } from "../widgets/ActiveTabWidget";
import { BookmarksWidget } from "../widgets/BookmarksWidget";
import { ClockWidget } from "../widgets/ClockWidget";
import { ClipboardWidget, HistoryWidget, type HistoryView } from "../widgets/LibraryWidgets";
import { NotesWidget } from "../widgets/NotesWidget";
import { MediaWidget } from "../widgets/MediaWidget";
import { QuickAccessWidget } from "../widgets/QuickAccessWidget";
import { TabsWidget } from "../widgets/TabsWidget";
import { TextWidget } from "../widgets/TextWidget";
import { TitleWidget } from "../widgets/TitleWidget";
import { SearchBar } from "./SearchBar";

/** Ce que les blocs de l'accueil d'un profil affichent. */
export interface HomeContext {
  /** Suggestions de la recherche (recherches passées, favoris, historique du profil). */
  suggest: (input: string) => Suggestion[];
  /** Moteur pour les suggestions en ligne, ou null si elles sont désactivées. */
  searchEngine: string | null;
  brave: Brave;
  theme: HomeTheme;
  profile: { id: string; name: string };
  history: HistoryView;
  onShowAllBookmarks: () => void;
}

/** Contenu de chaque bloc de l'accueil. Pour ajouter un type de bloc : layout.ts puis ici. */
export function renderBlock(block: Block, { brave, theme, profile, history, onShowAllBookmarks, suggest, searchEngine }: HomeContext) {
  switch (block.kind) {
    case "title": return <TitleWidget theme={theme} block={block} profileName={profile.name} />;
    case "clock": return <ClockWidget block={block} />;
    case "search": return <SearchBar send={brave.send} style={block.style} suggest={suggest} engine={searchEngine} />;
    case "activeTab": return <ActiveTabWidget brave={brave} />;
    case "tabs": return <TabsWidget brave={brave} />;
    case "bookmarks": return <BookmarksWidget brave={brave} onShowAll={onShowAllBookmarks} />;
    case "quickAccess": return <QuickAccessWidget brave={brave} profile={profile.id} />;
    case "history": return <HistoryWidget brave={brave} history={history} />;
    case "clipboard": return <ClipboardWidget brave={brave} />;
    case "notes": return <NotesWidget profile={profile.id} />;
    case "media": return <MediaWidget brave={brave} />;
    case "text": return <TextWidget block={block} />;
  }
}
