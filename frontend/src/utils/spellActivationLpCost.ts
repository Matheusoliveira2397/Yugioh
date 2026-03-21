/** Custo de LP na ativação — espelha o backend (spell-activation-lp.util). */
export function getSpellActivationLpCost(card: {
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

export function canPaySpellActivationLp(activatorLp: number | undefined, card: any): boolean {
  if (activatorLp === undefined) return true;
  const cost = getSpellActivationLpCost(card);
  if (cost === null) return true;
  return activatorLp >= cost;
}
