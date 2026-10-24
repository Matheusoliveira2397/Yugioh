/**
 * Primitivas compartilhadas pelo motor de efeitos.
 *
 * Operações puras: alteram apenas o estado de duelo informado, nunca persistem
 * ou enviam eventos. O executor da carta fica responsável pela resolução
 * atômica de efeitos e pelo estado final.
 */
export type EffectField = {
  deck?: any[];
  hand?: any[];
  monsters?: Array<any | null>;
  spellTrap?: Array<any | null>;
  graveyard?: any[];
  banished?: any[];
  extraDeck?: any[];
};

export type EffectSide = 'player1' | 'player2';

export function fieldForSide<T extends { player1Field: any; player2Field: any }>(
  duel: T,
  side: EffectSide,
): EffectField {
  return side === 'player1' ? duel.player1Field : duel.player2Field;
}

export function opponentOf(side: EffectSide): EffectSide {
  return side === 'player1' ? 'player2' : 'player1';
}

/** Nunca transforma custo em ganho e nunca permite pontos negativos. */
export function changeLifePoints(current: number, delta: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(delta) || !Number.isInteger(delta)) {
    throw new Error('Pontos de vida inválidos');
  }
  return Math.max(0, current + delta);
}

/** Paga custo somente quando há LP suficientes e nunca aceita custo negativo. */
export function payLifePoints(current: number, cost: number): number | null {
  if (!Number.isInteger(cost) || cost < 0 || !Number.isFinite(current)) {
    throw new Error('Custo de LP inválido');
  }
  return current >= cost ? current - cost : null;
}

/** Compra cartas do topo (índice 0), preservando cópias e instâncias distintas.
 * Se o deck acabar, o chamador resolve as regras de derrota por deck-out.
 */
export function drawFromDeck(field: EffectField, count: number): any[] {
  if (!Number.isInteger(count) || count < 0) throw new Error('Quantidade de compra inválida');
  field.deck ??= [];
  field.hand ??= [];
  const result: any[] = [];
  for (let i = 0; i < count && field.deck.length; i++) {
    const card = field.deck.shift();
    if (card != null) {
      field.hand.push(card);
      result.push(card);
    }
  }
  return result;
}

/** Carta mágica/armadilha resolvida sai da zona e vai ao cemitério.
 * Equipamentos e contínuas NÃO devem chamar esta função até saírem do campo.
 */
export function sendSpellTrapToGraveyard(field: EffectField, zoneIndex: number): any | null {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0 || !field.spellTrap?.[zoneIndex]) return null;
  const card = field.spellTrap[zoneIndex];
  field.graveyard ??= [];
  field.graveyard.push(card);
  field.spellTrap[zoneIndex] = null;
  return card;
}

/** Destruição básica. O motor deve verificar proteção, targeting e replacement
 * antes de chamar esta primitiva; isso não é um bypass dessas regras.
 */
export function moveMonsterToGraveyard(field: EffectField, zoneIndex: number): any | null {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0 || !field.monsters?.[zoneIndex]) return null;
  const card = field.monsters[zoneIndex];
  field.graveyard ??= [];
  field.graveyard.push(card);
  field.monsters[zoneIndex] = null;
  return card;
}
