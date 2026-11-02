import type { Brave } from "../brave/useBrave";
import type { Block } from "../settings/layout";
import type { HomeTheme } from "../settings/settings";
import { ActiveTabWidget } from "../widgets/ActiveTabWidget";
import { BookmarksWidget } from "../widgets/BookmarksWidget";
import { ClockWidget } from "../widgets/ClockWidget";
import { QuickAccessWidget } from "../widgets/QuickAccessWidget";
import { TabsWidget } from "../widgets/TabsWidget";
import { TextWidget } from "../widgets/TextWidget";
import { TitleWidget } from "../widgets/TitleWidget";
import { SearchBar } from "./SearchBar";

/** Contenu de chaque bloc de l'accueil. Pour ajouter un type de bloc : layout.ts puis ici. */
export function renderBlock(block: Block, brave: Brave, theme: HomeTheme, onShowAllBookmarks: () => void) {
  switch (block.kind) {
    case "title": return <TitleWidget theme={theme} block={block} />;
    case "clock": return <ClockWidget block={block} />;
    case "search": return <SearchBar send={brave.send} style={block.style} />;
    case "activeTab": return <ActiveTabWidget brave={brave} />;
    case "tabs": return <TabsWidget brave={brave} />;
    case "bookmarks": return <BookmarksWidget brave={brave} onShowAll={onShowAllBookmarks} />;
    case "quickAccess": return <QuickAccessWidget brave={brave} />;
    case "text": return <TextWidget block={block} />;
  }
}
