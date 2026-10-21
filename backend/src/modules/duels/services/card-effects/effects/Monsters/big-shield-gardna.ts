/**
 * Big Shield Gardna / YGOPRO_65240384
 *
 * 1) When a Spell Card is activated that targets this face-down card (and no other cards) (Quick Effect):
 *    Change this card to face-up Defense Position, and if you do, negate the activation.
 * 2) If this card is attacked, change it to Attack Position at the end of the Damage Step.
 */

import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const BIG_SHIELD_GARDNA_KEY = 'big-shield-gardna';

export const BIG_SHIELD_GARDNA_CARD_IDS = [
  'BigShieldGardna',
  'YGOPRO_65240384',
  '65240384',
] as const;

export const BIG_SHIELD_GARDNA_CARD_NAMES = [
  'big shield gardna',
  'grande escudo gardna',
] as const;

export function isBigShieldGardna(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of BIG_SHIELD_GARDNA_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of BIG_SHIELD_GARDNA_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  if (nameCompact.includes('bigshieldgardna') || nameCompact.includes('grandeescudogardna')) {
    return true;
  }
  if (id.includes('65240384')) {
    return true;
  }
  return false;
}
