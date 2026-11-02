import { useState } from "react";
import { Icon } from "./Icon";

/** Favicon fourni par Brave, avec repli sur un globe si l'image n'est pas chargeable. */
export function Favicon({ src, size = 16 }: { src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const usable = src && /^(https?:|data:)/.test(src) && !failed;
  return usable ? (
    <img className="favicon" src={src} width={size} height={size} alt="" onError={() => setFailed(true)} />
  ) : (
    <span className="favicon favicon--fallback"><Icon name="globe" size={size} /></span>
  );
}
