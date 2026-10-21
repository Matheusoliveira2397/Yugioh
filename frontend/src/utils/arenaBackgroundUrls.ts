/**
 * Extensões comuns para o fundo da arena / login.
 * Coloque o arquivo em `public/images/` com o nome base (ex.: `background`) e qualquer uma destas extensões.
 */
/** Ordem curta: evita cascata de 404 no fundo a cada montagem. */
export const ARENA_BACKGROUND_EXTENSIONS = [
  '.webp',
  '.jpg',
  '.png',
] as const;

/** Caminho absoluto a partir da raiz do site (pasta `public`). */
export function arenaBackgroundUrls(basePathWithoutExt = '/images/background'): string[] {
  const base = basePathWithoutExt.replace(/\/$/, '');
  return ARENA_BACKGROUND_EXTENSIONS.map((ext) => `${base}${ext}`);
}
