import { useState } from "react";
import type { BookmarkNode, Command } from "../brave/types";
import { Drawer } from "./Drawer";
import { Favicon } from "./Favicon";
import { Icon } from "./Icon";
import { siteIcon } from "./siteIcon";
import "./BookmarksDrawer.css";

interface Props {
  open: boolean;
  bookmarks: BookmarkNode[] | null;
  send: (c: Command) => void;
  onClose: () => void;
}

/** Arborescence complète des favoris du profil Brave affiché. */
export function BookmarksDrawer({ open, bookmarks, send, onClose }: Props) {
  return (
    <Drawer open={open} title="Favoris" onClose={onClose}>
      {bookmarks?.length
        ? bookmarks.map((root) => <Folder key={root.id} node={root} depth={0} defaultOpen send={send} />)
        : <p className="muted">Aucun favori reçu de Brave.</p>}
    </Drawer>
  );
}

function Folder({ node, depth, defaultOpen = false, send }:
  { node: BookmarkNode; depth: number; defaultOpen?: boolean; send: (c: Command) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!node.children?.length) return null;
  return (
    <div>
      <button className="bm-row" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setOpen(!open)}>
        <span className={`bm-chevron${open ? " bm-chevron--open" : ""}`}><Icon name="chevron" size={12} /></span>
        <Icon name="folder" size={15} />
        <span className="bm-label">{node.title}</span>
      </button>
      {open && node.children.map((child) =>
        child.url ? (
          <button key={child.id} className="bm-row" style={{ paddingLeft: 30 + depth * 14 }} title={child.url}
            onClick={() => send({ type: "openUrl", url: child.url! })}>
            <Favicon src={siteIcon(child.url)} size={15} />
            <span className="bm-label">{child.title || child.url}</span>
          </button>
        ) : (
          <Folder key={child.id} node={child} depth={depth + 1} send={send} />
        ),
      )}
    </div>
  );
}
