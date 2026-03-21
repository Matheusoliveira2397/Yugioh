/**
 * Custos de LP para ativar spells conhecidas (ativação, não dano de batalha).
 * Retorna null se não há custo fixo mapeado — outras validações ficam nos handlers específicos.
 */
export function getSpellActivationLifePointCost(card: {
  idCarta?: string;
  id?: string;
  cardId?: string;
  name?: string;
  cardName?: string;
} | null | undefined): number | null {
  if (!card) return null;
  const id = String(card.idCarta || card.id || card.cardId || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const name = String(card.name || card.cardName || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const hay = `${id} ${name}`;
  if (hay.includes('confiscation')) return 1000;
  if (hay.includes('braincontrol')) return 800;
  if (hay.includes('prematureburial')) return 800;
  if (hay.includes('autonomousactionunit')) return 1500;
  return null;
}

export function assertActivatorHasLpForSpell(
  duel: { player1Id?: number | string; player2Id?: number | string; player1LifePoints?: number; player2LifePoints?: number },
  userId: number,
  card: { idCarta?: string; id?: string; cardId?: string; name?: string; cardName?: string } | null | undefined,
): { ok: true } | { ok: false; message: string } {
  const cost = getSpellActivationLifePointCost(card);
  if (cost == null) return { ok: true };
  const p1 = Number(duel.player1Id) === Number(userId);
  const lp = Number(p1 ? duel.player1LifePoints : duel.player2LifePoints);
  if (!Number.isFinite(lp) || lp < cost) {
    return {
      ok: false,
      message: `Você precisa de pelo menos ${cost} LP para ativar esta carta.`,
    };
  }
  return { ok: true };
}
