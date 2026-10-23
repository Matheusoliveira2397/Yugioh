/** Critério único para encerramentos administrativos por choque de horário. */
export interface TiebreakSnapshot {
  player1LifePoints: number;
  player2LifePoints: number;
  player1Field: any;
  player2Field: any;
}

const countZone = (field: any, key: string): number =>
  Array.isArray(field?.[key]) ? field[key].filter(Boolean).length : 0;

/** Cartas ainda disponíveis ao duelista (deck, mão, campo e extra deck).
 * Cemitério e banidas não contam como recursos restantes. */
export function countRemainingCards(field: any): number {
  const parsed = typeof field === 'string' ? (() => { try { return JSON.parse(field); } catch { return {}; } })() : field;
  return ['deck', 'hand', 'monsters', 'spellTrap', 'extraDeck'].reduce(
    (total, zone) => total + countZone(parsed, zone), 0,
  );
}

export function decideForcedWinner(snapshot: TiebreakSnapshot, random: () => number = Math.random): 1 | 2 {
  const p1 = Number(snapshot.player1LifePoints) || 0;
  const p2 = Number(snapshot.player2LifePoints) || 0;
  if (p1 !== p2) return p1 > p2 ? 1 : 2;

  const c1 = countRemainingCards(snapshot.player1Field);
  const c2 = countRemainingCards(snapshot.player2Field);
  if (c1 !== c2) return c1 > c2 ? 1 : 2;

  return random() < 0.5 ? 1 : 2;
}
