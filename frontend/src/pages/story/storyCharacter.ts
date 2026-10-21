/** Personagem do Modo História — arte estilo Yu-Gi-Oh! Tag Force. */

export type StoryGender = 'male' | 'female';

/** Presets de cor sobre a arte Tag Force (hue-rotate). */
export type ColorSchemeId =
  | 'crimson'
  | 'azure'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'obsidian'
  | 'rose'
  | 'orange';

export interface ColorScheme {
  id: ColorSchemeId;
  label: string;
  /** Graus de hue-rotate a partir do vermelho original da arte */
  hue: number;
  saturate: number;
  brightness: number;
  contrast: number;
  /** Cor de UI / nome no mapa */
  accent: string;
}

export const COLOR_SCHEMES: ColorScheme[] = [
  { id: 'crimson', label: 'Vermelho', hue: 0, saturate: 1.05, brightness: 1, contrast: 1.05, accent: '#ef4444' },
  { id: 'azure', label: 'Azul', hue: 195, saturate: 1.1, brightness: 1.02, contrast: 1.05, accent: '#3b82f6' },
  { id: 'emerald', label: 'Verde', hue: 100, saturate: 1.05, brightness: 1, contrast: 1.05, accent: '#22c55e' },
  { id: 'violet', label: 'Roxo', hue: 255, saturate: 1.15, brightness: 1.02, contrast: 1.05, accent: '#a855f7' },
  { id: 'amber', label: 'Dourado', hue: 35, saturate: 1.2, brightness: 1.08, contrast: 1.05, accent: '#f59e0b' },
  { id: 'obsidian', label: 'Preto', hue: 0, saturate: 0.25, brightness: 0.72, contrast: 1.15, accent: '#64748b' },
  { id: 'rose', label: 'Rosa', hue: 310, saturate: 1.2, brightness: 1.05, contrast: 1.05, accent: '#f472b6' },
  { id: 'orange', label: 'Laranja', hue: 18, saturate: 1.15, brightness: 1.05, contrast: 1.05, accent: '#f97316' },
];

export interface StoryCharacter {
  name: string;
  gender: StoryGender;
  colorScheme: ColorSchemeId;
  createdAt: string;
}

/** Arte base Tag Force (protagonista). */
export const TAGFORCE_ART = '/images/story/tagforce-duelist.png';

export function getScheme(id: ColorSchemeId | string | undefined): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === id) || COLOR_SCHEMES[0];
}

export function schemeCssFilter(scheme: ColorScheme): string {
  return `hue-rotate(${scheme.hue}deg) saturate(${scheme.saturate}) brightness(${scheme.brightness}) contrast(${scheme.contrast})`;
}

export function defaultCharacter(seedName = 'Duelista'): StoryCharacter {
  return {
    name: seedName.slice(0, 12),
    gender: 'male',
    colorScheme: 'crimson',
    createdAt: new Date().toISOString(),
  };
}

export function characterStorageKey(userId: number | string) {
  return `yugioh-story-character-v2-${userId}`;
}

export function loadCharacter(userId: number | string): StoryCharacter | null {
  try {
    // v2
    const raw = window.localStorage.getItem(characterStorageKey(userId));
    if (raw) {
      const data = JSON.parse(raw) as StoryCharacter;
      if (!data?.name || typeof data.name !== 'string') return null;
      if (data.gender !== 'male' && data.gender !== 'female') return null;
      return {
        ...defaultCharacter(data.name),
        ...data,
        name: data.name.trim().slice(0, 12),
        colorScheme: getScheme(data.colorScheme).id,
      };
    }
    // migração leve da v1
    const legacy = window.localStorage.getItem(`yugioh-story-character-v1-${userId}`);
    if (legacy) {
      const old = JSON.parse(legacy) as { name?: string; gender?: StoryGender; jacketColor?: string };
      if (!old?.name) return null;
      const scheme =
        COLOR_SCHEMES.find((s) => old.jacketColor && s.accent.toLowerCase() === old.jacketColor.toLowerCase())?.id ||
        'crimson';
      return {
        name: String(old.name).trim().slice(0, 12),
        gender: old.gender === 'female' ? 'female' : 'male',
        colorScheme: scheme,
        createdAt: new Date().toISOString(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveCharacter(userId: number | string, character: StoryCharacter) {
  window.localStorage.setItem(
    characterStorageKey(userId),
    JSON.stringify({
      ...character,
      name: character.name.trim().slice(0, 12),
      createdAt: character.createdAt || new Date().toISOString(),
    }),
  );
}

export function clearCharacter(userId: number | string) {
  window.localStorage.removeItem(characterStorageKey(userId));
  window.localStorage.removeItem(`yugioh-story-character-v1-${userId}`);
}

let artImage: HTMLImageElement | null = null;
let artPromise: Promise<HTMLImageElement> | null = null;

/** Carrega a arte Tag Force (cache). */
export function loadTagForceArt(): Promise<HTMLImageElement> {
  if (artImage?.complete && artImage.naturalWidth > 0) return Promise.resolve(artImage);
  if (artPromise) return artPromise;
  artPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      artImage = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error('Falha ao carregar arte Tag Force'));
    img.src = TAGFORCE_ART;
  });
  return artPromise;
}

/**
 * Desenha o duelista Tag Force no canvas (mapa).
 * x,y = canto da célula; desenha o personagem centrado na célula.
 */
export function drawStoryCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  char: StoryCharacter,
  scale = 1,
  _facing: 'up' | 'down' | 'left' | 'right' = 'down',
  mode: 'map' | 'preview' = 'map',
) {
  const img = artImage;
  if (!img || !img.complete || img.naturalWidth === 0) {
    // fallback mínimo enquanto carrega
    ctx.fillStyle = getScheme(char.colorScheme).accent;
    ctx.fillRect(x + 10 * scale, y + 8 * scale, 12 * scale, 20 * scale);
    return;
  }

  const scheme = getScheme(char.colorScheme);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = schemeCssFilter(scheme);

  if (mode === 'preview') {
    const maxH = 360 * scale;
    const ratio = img.naturalWidth / img.naturalHeight;
    const h = maxH;
    const w = h * ratio;
    ctx.drawImage(img, x, y, w, h);
  } else {
    // mapa: sprite ~1.6 tiles de altura
    const h = 44 * scale;
    const ratio = img.naturalWidth / img.naturalHeight;
    const w = h * ratio;
    const dx = x + (32 * scale - w) / 2;
    const dy = y + 32 * scale - h + 2 * scale;
    // sombra
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 16 * scale, y + 30 * scale, 10 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.filter = schemeCssFilter(scheme);
    ctx.drawImage(img, dx, dy, w, h);
  }

  ctx.restore();
}

/** Garante arte carregada e redesenha (para o mapa). */
export async function ensureArtLoaded(): Promise<void> {
  await loadTagForceArt();
}
