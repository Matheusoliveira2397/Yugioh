/**
 * Avaliação heurística do estado do duelo (perspectiva do bot).
 * Usada para pontuar jogadas e comparar linhas de jogo.
 */

export interface BoardEval {
  total: number;
  cardAdvantage: number;
  fieldPresence: number;
  lifePressure: number;
  backrow: number;
  threat: number;
  winNow: number;
  loseSoon: number;
  details: string[];
}

function atkOf(m: any): number {
  return Number(m?.atk ?? m?.attack ?? 0) || 0;
}
function defOf(m: any): number {
  return Number(m?.def ?? m?.defense ?? 0) || 0;
}
function isAtkPos(m: any): boolean {
  return String(m?.position || '').toLowerCase().includes('attack');
}

export function evaluateBoard(duel: any, botUserId: number): BoardEval {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const myLp = Number(isP1 ? duel.player1LifePoints : duel.player2LifePoints) || 0;
  const oppLp = Number(isP1 ? duel.player2LifePoints : duel.player1LifePoints) || 0;

  const myHand = Array.isArray(own?.hand) ? own.hand.length : 0;
  const oppHand = Array.isArray(opp?.hand) ? opp.hand.length : 0;
  const myMons = (Array.isArray(own?.monsters) ? own.monsters : []).filter(Boolean);
  const oppMons = (Array.isArray(opp?.monsters) ? opp.monsters : []).filter(Boolean);
  const mySt = (Array.isArray(own?.spellTrap) ? own.spellTrap : []).filter(Boolean);
  const oppSt = (Array.isArray(opp?.spellTrap) ? opp.spellTrap : []).filter(Boolean);

  const myAtkSum = myMons.reduce((s: number, m: any) => s + (isAtkPos(m) ? atkOf(m) : defOf(m) * 0.4), 0);
  const oppAtkSum = oppMons.reduce((s: number, m: any) => s + (isAtkPos(m) ? atkOf(m) : defOf(m) * 0.5), 0);
  const myBest = Math.max(0, ...myMons.map(atkOf));
  const oppBest = Math.max(0, ...oppMons.map(atkOf));

  const details: string[] = [];

  const cardAdvantage = (myHand - oppHand) * 180 + (myMons.length - oppMons.length) * 220;
  details.push(`cards ${cardAdvantage.toFixed(0)}`);

  const fieldPresence = myAtkSum * 0.55 - oppAtkSum * 0.65 + myBest * 0.15;
  details.push(`field ${fieldPresence.toFixed(0)}`);

  const lifePressure = (myLp - oppLp) * 0.12;
  details.push(`lp ${lifePressure.toFixed(0)}`);

  const backrow = mySt.length * 140 - oppSt.length * 160;
  details.push(`st ${backrow.toFixed(0)}`);

  const threat = -Math.max(0, oppAtkSum - myLp) * 0.8 - (oppBest > myBest ? 200 : 0);
  details.push(`threat ${threat.toFixed(0)}`);

  let winNow = 0;
  if (oppLp <= 0) winNow = 100000;
  else if (oppMons.length === 0 && myAtkSum >= oppLp) winNow = 8000 + myAtkSum;
  else if (myAtkSum - oppAtkSum >= oppLp && oppMons.every((m: any) => isAtkPos(m) && atkOf(m) < myBest)) {
    winNow = 4000;
  }

  let loseSoon = 0;
  if (myLp <= 0) loseSoon = -100000;
  else if (oppMons.length && oppAtkSum >= myLp && myMons.length === 0) loseSoon = -5000;
  else if (myLp < 1500 && oppAtkSum > myAtkSum) loseSoon = -2000;

  const total = cardAdvantage + fieldPresence + lifePressure + backrow + threat + winNow + loseSoon;
  return {
    total,
    cardAdvantage,
    fieldPresence,
    lifePressure,
    backrow,
    threat,
    winNow,
    loseSoon,
    details,
  };
}

/** Delta aproximado se uma remoção limpar o board inimigo. */
export function removalDelta(oppAtkRemoved: number, cardsRemoved: number): number {
  return oppAtkRemoved * 0.6 + cardsRemoved * 250;
}

/** Estimativa de dano direto disponível (monstros em ATK que ainda podem atacar). */
export function estimableBattleDamage(duel: any, botUserId: number): number {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const myMons = (Array.isArray(own?.monsters) ? own.monsters : []).filter(Boolean);
  const oppMons = (Array.isArray(opp?.monsters) ? opp.monsters : []).filter(Boolean);

  const attackers = myMons.filter((m: any) => {
    if (!isAtkPos(m)) return false;
    if (m.cannotAttackThisTurn === true) return false;
    const attacks = Number(m.attacksThisTurn || 0);
    const id = String(m.idCarta || m.id || m.cardId || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const name = String(m.name || m.cardName || '').toLowerCase();
    const twoAtks =
      m.canAttackAgainThisTurn === true ||
      id.includes('matazathezapper') ||
      name.includes('mataza') ||
      id.includes('cybertwindragon') ||
      name.includes('cyber twin');
    const max = twoAtks ? 2 : 1;
    if (m.attackedThisTurn === true && max < 2) return false;
    return attacks < max;
  });

  if (!oppMons.length) {
    return attackers.reduce((s: number, m: any) => s + atkOf(m), 0);
  }

  // Heurística: soma ATKs que vencem o maior monstro oponente em ATK
  const oppFaceUpAtk = oppMons
    .filter((m: any) => isAtkPos(m))
    .map(atkOf)
    .sort((a: number, b: number) => b - a);
  let dmg = 0;
  const sorted = [...attackers].sort((a, b) => atkOf(b) - atkOf(a));
  const remaining = [...oppFaceUpAtk];
  for (const a of sorted) {
    const av = atkOf(a);
    const idx = remaining.findIndex((o) => av > o);
    if (idx >= 0) {
      dmg += av - remaining[idx];
      remaining.splice(idx, 1);
    } else if (!remaining.length) {
      dmg += av;
    }
  }
  return dmg;
}
