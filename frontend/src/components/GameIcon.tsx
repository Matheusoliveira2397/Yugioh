import type { ReactNode } from 'react';

/**
 * Ícones vetoriais do jogo: sem dependência de PNGs, com contraste e dimensões consistentes.
 * Use sempre o caminho da tela (não o rótulo traduzido) para escolher a metáfora visual.
 */
interface GameIconProps {
  route: string;
  size?: number;
  className?: string;
}


/**
 * Atlas ilustrado original em 4x4: artes inspiradas na ambientação dos duelos,
 * com 16 cenas/relíquias em vez de pictogramas monocromáticos.
 * A ordem corresponde à posição de cada célula em /images/ui/yugioh-fantasy-icons.webp.
 * SVG permanece como fallback somente para rotas sem arte própria.
 */
const ILLUSTRATED_ICONS: Record<string, number> = {
  '/': 0, '/home': 0,
  '/random-duel': 1, '/duel': 1,
  '/arena': 2,
  '/tournaments': 3, '/tournament': 3,
  '/deck-builder': 4, '/deck-edit': 4, '/decks': 4,
  '/collection': 5, '/marketplace/cards': 5, '/inventory': 5,
  '/shop': 6, '/marketplace/accounts': 6,
  '/loot-boxes': 7, '/drops': 7,
  '/ranking': 8,
  '/missions': 9,
  '/story': 10, '/story-mode': 10,
  '/battle-pass': 11,
  '/groups': 12, '/clans': 12,
  '/chat': 13, '/friends': 13,
  '/credit': 14, '/redeem': 14,
  '/help': 15, '/feedback': 15,
};

function illustratedIconForRoute(route: string): number | undefined {
  const path = route.split('?')[0].replace(/\/$/, '') || '/';
  if (Object.prototype.hasOwnProperty.call(ILLUSTRATED_ICONS, path)) {
    return ILLUSTRATED_ICONS[path];
  }
  // Menus podem ser configurados no banco; mantém a identidade nas sub-rotas.
  const match = Object.keys(ILLUSTRATED_ICONS)
    .filter((prefix) => prefix !== '/' && path.startsWith(prefix + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return match === undefined ? undefined : ILLUSTRATED_ICONS[match];
}

function iconArtwork(route: string): ReactNode {
  const path = route.split('?')[0].replace(/\/$/, '') || '/';
  if (path === '/' || path === '/home') {
    return <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-7h6v7"/></>;
  }
  if (path.startsWith('/random-duel') || path.startsWith('/duel')) {
    return <><path d="M4 4 20 20M20 4 4 20"/><path d="m3 7 4-4m10 18 4-4M17 3l4 4M3 17l4 4"/><path d="M9 9l6 6m0-6-6 6" opacity=".4"/></>;
  }
  if (path.startsWith('/arena')) {
    return <><path d="m12 2 8 4v6c0 5-3.2 8-8 10-4.8-2-8-5-8-10V6l8-4Z"/><path d="m12 6 1.7 3.6 4 .6-2.9 2.7.7 4-3.5-1.9-3.5 1.9.7-4-2.9-2.7 4-.6L12 6Z"/></>;
  }
  if (path.startsWith('/tournament')) {
    return <><path d="M8 3h8v6a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4"/><path d="M12 13v5m-4 3h8m-7-3h6v3H9z"/></>;
  }
  if (path.startsWith('/story')) {
    return <><path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Z"/><path d="M12 6v14m-7-11h4m6 0h4m-14 4h4m6 0h4"/></>;
  }
  if (path.startsWith('/deck-builder') || path.startsWith('/deck-edit')) {
    return <><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7H3v13a2 2 0 0 0 2 2h12"/><path d="m13.5 7 1.2 2.8 3 .3-2.2 2 .6 3-2.6-1.5-2.6 1.5.6-3-2.2-2 3-.3L13.5 7Z"/></>;
  }
  if (path.startsWith('/collection') || path.startsWith('/marketplace/cards')) {
    return <><rect x="8" y="3" width="12" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h11"/><path d="M11 7h6m-6 4h6m-6 4h3"/></>;
  }
  if (path.startsWith('/shop') || path.startsWith('/marketplace/accounts')) {
    return <><path d="M4 8h16l-1.2 13H5.2L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M9 14h6"/></>;
  }
  if (path.startsWith('/loot-box') || path.startsWith('/drops')) {
    return <><path d="m3 8 9-5 9 5v10l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5m-9 5v10"/><path d="m12 3 2 5m-4 0 2-5"/></>;
  }
  if (path.startsWith('/ranking')) {
    return <><path d="M3 21h18"/><path d="M5 21v-8h4v8m2 0V6h4v15m2 0v-11h4v11"/><path d="m13 2 .5 1.1 1.2.2-.9.9.2 1.2L13 4.8l-1 .6.2-1.2-.9-.9 1.2-.2L13 2Z"/></>;
  }
  if (path.startsWith('/missions')) {
    return <><rect x="5" y="3" width="14" height="19" rx="2"/><path d="M9 3.5V2h6v1.5M9 10l2 2 4-4M9 17h6"/></>;
  }
  if (path.startsWith('/battle-pass')) {
    return <><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6V4Z"/><path d="M12 5v2m0 3v2m0 3v2m0 2v1"/></>;
  }
  if (path.startsWith('/groups')) {
    return <><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2H5Z"/><path d="M5 11a3 3 0 1 1 2-5m12 5a3 3 0 1 0-2-5M2 20v-2a5 5 0 0 1 3-4m17 6v-2a5 5 0 0 0-3-4"/></>;
  }
  if (path.startsWith('/chat') || path.startsWith('/friends')) {
    return <><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 9h8m-8 4h5"/></>;
  }
  if (path.startsWith('/credit')) {
    return <><circle cx="12" cy="12" r="9"/><path d="M15 9.3a3 3 0 0 0-3-1.5c-1.8 0-3 .7-3 2 0 3.2 6 1.2 6 4.4 0 1.3-1.2 2.2-3 2.2-1.4 0-2.6-.6-3.4-1.7M12 5v2m0 10v2"/></>;
  }
  if (path.startsWith('/redeem')) {
    return <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m7 12 2 2 4-4m3-1h2m-2 4h2"/></>;
  }
  if (path.startsWith('/help') || path.startsWith('/feedback')) {
    return <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7c-1.2 1-1.8 1.3-1.8 3.3"/><circle cx="12" cy="17.5" r=".75" fill="currentColor" stroke="none"/></>;
  }
  if (path.startsWith('/patch-notes') || path.startsWith('/news')) {
    return <><path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h4M8 12h8m-8 4h8"/></>;
  }
  if (path.startsWith('/profile')) {
    return <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>;
  }
  if (path.startsWith('/inventory')) {
    return <><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 8V5a4 4 0 0 1 8 0v3M3 13h18m-11-1v3h4v-3"/></>;
  }
  if (path.startsWith('/admin')) {
    return <><path d="m12 2 2.3 2 3.2-.3.7 3.1L21 9l-1.2 3 1.2 3-2.8 2.2-.7 3.1-3.2-.3L12 22l-2.3-2-3.2.3-.7-3.1L3 15l1.2-3L3 9l2.8-2.2.7-3.1 3.2.3L12 2Z"/><circle cx="12" cy="12" r="3"/></>;
  }
  return <><path d="m12 2 2.6 6.7L21 11l-6.4 2.3L12 20l-2.6-6.7L3 11l6.4-2.3L12 2Z"/></>;
}

export default function GameIcon({ route, size = 22, className = '' }: GameIconProps) {
  const slot = illustratedIconForRoute(route);
  if (slot !== undefined) {
    const column = slot % 4;
    const row = Math.floor(slot / 4);
    const artSize = Math.min(44, size + 8);
    return (
      <span
        className={`game-icon-illustrated ${className}`}
        style={{
          width: artSize,
          height: artSize,
          backgroundImage: "url('/images/ui/yugioh-fantasy-icons.webp')",
          backgroundSize: '400% 400%',
          backgroundPosition: `${column * (100 / 3)}% ${row * (100 / 3)}%`,
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {iconArtwork(route)}
    </svg>
  );
}
