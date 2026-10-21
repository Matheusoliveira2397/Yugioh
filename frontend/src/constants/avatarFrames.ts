export type AvatarFrameId = 'obelisk' | 'ra' | 'slifer';

export interface AvatarFrameDef {
  id: AvatarFrameId;
  name: string;
  description: string;
  /** Arte da moldura (deus na borda + furo circular no centro) */
  image: string;
  /**
   * Quanto a arte da moldura cresce para fora da foto (%).
   * A foto fica no furo; o deus aparece ao redor.
   */
  outerBleedPercent: number;
  /** Diâmetro da foto em relação à caixa da foto (1 = 100%). Menor = mais borda do deus. */
  photoScale: number;
  /** Cor do brilho ao redor */
  glow: string;
  accentClass: string;
}

/** Molduras dos Deuses Egípcios — disponíveis para todos no inventário */
export const AVATAR_FRAMES: AvatarFrameDef[] = [
  {
    id: 'obelisk',
    name: 'Obelisk',
    description: 'Obelisco envolvendo a moldura',
    image: '/images/frames/obelisk.jpg?v=2',
    outerBleedPercent: 28,
    photoScale: 0.92,
    glow: 'rgba(59, 130, 246, 0.45)',
    accentClass: 'ring-blue-400/50',
  },
  {
    id: 'ra',
    name: 'Rá',
    description: 'Rá com as asas na moldura',
    image: '/images/frames/ra.jpg?v=2',
    outerBleedPercent: 28,
    photoScale: 0.92,
    glow: 'rgba(245, 158, 11, 0.5)',
    accentClass: 'ring-amber-400/50',
  },
  {
    id: 'slifer',
    name: 'Slifer',
    description: 'Slifer enrolado na moldura',
    image: '/images/frames/slifer.jpg?v=2',
    outerBleedPercent: 28,
    photoScale: 0.92,
    glow: 'rgba(239, 68, 68, 0.45)',
    accentClass: 'ring-red-400/50',
  },
];

export function getAvatarFrame(id: string | null | undefined): AvatarFrameDef | null {
  if (!id) return null;
  return AVATAR_FRAMES.find((f) => f.id === id) ?? null;
}

export function isValidAvatarFrameId(id: string): id is AvatarFrameId {
  return AVATAR_FRAMES.some((f) => f.id === id);
}
