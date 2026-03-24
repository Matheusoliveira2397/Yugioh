/**
 * Largura da carta na mão (desktop) ≈ largura da coluna do campo × fator (levemente maior que o slot).
 */
export const DUEL_HAND_CARD_WIDTH_MULTIPLIER = 1.1;

/**
 * Escala extra das cartas dentro dos slots no layout mobile (scroll). ~1.18 = ~18% maior; `gridFitScale` + vão de coluna compensam.
 */
export const DUEL_FIELD_MOBILE_CARD_VISUAL_MULT = 1.18;

/** Escala leve das cartas nos slots no layout desktop (arena com `scale`). */
export const DUEL_FIELD_DESKTOP_CARD_VISUAL_MULT = 1.06;

/**
 * O retângulo do playmat no DuelField é sempre largura∶altura = 12∶5 (object-cover).
 * Exemplos: 2400×1000, 1920×800, 3840×1600 — mesma proporção evita corte nas bordas.
 */
export const DUEL_PLAYMAT_ASPECT = { width: 12, height: 5 } as const;
