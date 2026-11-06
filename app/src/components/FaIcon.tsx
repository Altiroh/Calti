// Icônes Font Awesome (Free, SVG) des groupes d'onglets, dessinées dans la couleur du texte (currentColor).
import {
  faBolt, faBook, faBriefcase, faBug, faCalendarDays, faCamera, faCar, faCartShopping, faChartLine, faCloud, faCode,
  faDatabase, faDumbbell, faEnvelope, faFileLines, faFilm, faFire, faFlask, faFolder, faGamepad, faGear, faGlobe,
  faGraduationCap, faHeadphones, faHeart, faHouse, faImage, faLayerGroup, faLeaf, faLightbulb, faListCheck, faLock,
  faMap, faMoneyBill, faMugHot, faMusic, faNewspaper, faPalette, faPenNib, faPlane, faRocket, faServer, faShieldHalved,
  faStar, faTag, faUser, faUsers, faUtensils, faVideo, faWrench,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

/** Icônes proposées pour un groupe, par nom (enregistré avec le groupe). */
export const faIcons: Record<string, IconDefinition> = {
  briefcase: faBriefcase, house: faHouse, code: faCode, palette: faPalette, "pen-nib": faPenNib, music: faMusic,
  film: faFilm, video: faVideo, gamepad: faGamepad, "cart-shopping": faCartShopping, plane: faPlane, map: faMap,
  book: faBook, "graduation-cap": faGraduationCap, flask: faFlask, lightbulb: faLightbulb, heart: faHeart, star: faStar,
  bolt: faBolt, fire: faFire, leaf: faLeaf, globe: faGlobe, newspaper: faNewspaper, envelope: faEnvelope,
  "calendar-days": faCalendarDays, "chart-line": faChartLine, "list-check": faListCheck, "file-lines": faFileLines,
  folder: faFolder, tag: faTag, bug: faBug, wrench: faWrench, gear: faGear, server: faServer, database: faDatabase,
  cloud: faCloud, "shield-halved": faShieldHalved, lock: faLock, user: faUser, users: faUsers, camera: faCamera,
  image: faImage, headphones: faHeadphones, "mug-hot": faMugHot, utensils: faUtensils, dumbbell: faDumbbell, car: faCar,
  "money-bill": faMoneyBill, rocket: faRocket, "layer-group": faLayerGroup,
};

export function FaIcon({ name, size = 14 }: { name: string; size?: number }) {
  const def = faIcons[name];
  if (!def) return null;
  const [width, height, , , path] = def.icon;
  return (
    <svg className="fa" width={size} height={size} viewBox={`0 0 ${width} ${height}`} fill="currentColor" aria-hidden="true">
      {(Array.isArray(path) ? path : [path]).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
