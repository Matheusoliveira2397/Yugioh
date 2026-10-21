/**
 * Dark Magician of Chaos / Mago Negro do Caos
 *
 * 1) End Phase: se foi NS/SS neste turno → opcionalmente adicione 1 Magia do seu GY à mão (1x/turno).
 * 2) Se destruir monstro do oponente em batalha → depois do cálculo de dano, bane esse monstro.
 * 3) Se este card face-up deixaria o campo → em vez disso, bane-o.
 */

import { logger } from '../../../../../../common/utils/logger.util';
import { compactCardKey, normalizeCardKey } from '../../utils/card-key.util';

export const DARK_MAGICIAN_OF_CHAOS_KEY = 'dark-magician-of-chaos';

export const DMOC_CARD_IDS = [
  'DarkMagicianOfChaos',
  'YGOPRO_30208479',
  '30208479',
] as const;

export const DMOC_CARD_NAMES = [
  'dark magician of chaos',
  'mago negro do caos',
] as const;

export function isDarkMagicianOfChaos(card: any): boolean {
  if (!card) return false;
  const id = compactCardKey(card.idCarta || card.id || card.cardId || '');
  const name = normalizeCardKey(card.name || card.cardName || '');
  const nameCompact = compactCardKey(name);

  for (const known of DMOC_CARD_IDS) {
    if (id === compactCardKey(known)) return true;
  }
  for (const known of DMOC_CARD_NAMES) {
    if (name === normalizeCardKey(known)) return true;
  }
  // Match flexível (ex.: "Dark Magician Of Chaos", id parcial YGOPRO)
  if (nameCompact.includes('darkmagicianofchaos') || nameCompact.includes('magonegrodocaos')) {
    return true;
  }
  if (id.includes('darkmagicianofchaos') || id.includes('30208479')) {
    return true;
  }
  return false;
}

/** Face-up no campo (ataque ou defesa revelada). */
export function isFaceUpMonster(card: any): boolean {
  if (!card) return false;
  const p = String(card.position || '').toLowerCase();
  return p === 'attack' || p === 'defense' || p === 'face-up';
}

export function getDuelTurnCounter(duel: any): number {
  const a = Number(duel?.turnCounter) || 0;
  const b = Number((duel as any)?.player1Field?.turnCounter) || 0;
  const c = Number((duel as any)?.player2Field?.turnCounter) || 0;
  return Math.max(a, b, c, 1);
}

export function wasSummonedThisTurn(monster: any, duel: any): boolean {
  if (!monster) return false;
  const current = getDuelTurnCounter(duel);
  const summoned = monster.summonedTurnNumber;
  if (summoned == null) {
    // Fallback: se acabou de ser colocado e não tem flag, ainda assim trata como este turno
    // apenas se marcado explicitamente (evita falso positivo em monstros antigos)
    return false;
  }
  return Number(summoned) === current;
}

export function isSpellCard(card: any): boolean {
  if (!card) return false;
  const t = String(card.type || card.cardType || card.frameType || '').toLowerCase();
  if (t.includes('trap') || t.includes('armadilha')) return false;
  return (
    t === 'spell' ||
    t === 'magia' ||
    t.includes('spell') ||
    t.includes('magia')
  );
}

export function listSpellsInGraveyard(graveyard: any[] | undefined): Array<{ card: any; index: number }> {
  if (!Array.isArray(graveyard)) return [];
  const out: Array<{ card: any; index: number }> = [];
  for (let i = 0; i < graveyard.length; i++) {
    const c = graveyard[i];
    if (c && isSpellCard(c)) out.push({ card: c, index: i });
  }
  return out;
}

/**
 * Pode ativar o efeito de End Phase?
 * - Face-up DMoC no campo
 * - Invocado NS/SS neste turno
 * - Ainda não usou o efeito neste turno
 * - Há pelo menos 1 Magia no GY
 */
export function canActivateDmocEndPhase(
  monster: any,
  duel: any,
  playerField: any,
): boolean {
  if (!isDarkMagicianOfChaos(monster)) return false;
  if (!isFaceUpMonster(monster)) return false;
  if (!wasSummonedThisTurn(monster, duel)) return false;
  // Só o flag próprio do DMoC (não effectUsedThisTurn genérico de outros efeitos)
  if (monster.dmocEndPhaseUsedThisTurn === true) {
    return false;
  }
  return listSpellsInGraveyard(playerField?.graveyard).length > 0;
}

export function findDmocEndPhaseCandidate(
  duel: any,
  isPlayer1: boolean,
): { monster: any; zoneIndex: number } | null {
  const field = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const monsters = field?.monsters;
  if (!Array.isArray(monsters)) return null;
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    if (m && canActivateDmocEndPhase(m, duel, field)) {
      return { monster: m, zoneIndex: i };
    }
  }
  return null;
}

/**
 * Destino ao sair do campo / ser destruído.
 * - DMoC face-up saindo → banished
 * - Destruído em batalha por DMoC → banished
 * - Caso contrário → graveyard
 */
export function resolveMonsterLeaveDestination(
  monster: any,
  opts?: { destroyedByBattleBy?: any },
): 'banished' | 'graveyard' {
  if (isDarkMagicianOfChaos(monster) && isFaceUpMonster(monster)) {
    return 'banished';
  }
  if (opts?.destroyedByBattleBy && isDarkMagicianOfChaos(opts.destroyedByBattleBy)) {
    return 'banished';
  }
  return 'graveyard';
}

/**
 * Envia monstro para GY ou banished no campo do DONO.
 * Mutates ownerField; limpeza da zona do controlador fica a cargo do caller.
 */
export function sendMonsterOffField(
  ownerField: any,
  monster: any,
  opts?: { destroyedByBattleBy?: any },
): 'banished' | 'graveyard' {
  const dest = resolveMonsterLeaveDestination(monster, opts);
  if (dest === 'banished') {
    if (!ownerField.banished) ownerField.banished = [];
    ownerField.banished.push(monster);
    logger.info(
      `🌑 [DMoC] ${monster?.name || monster?.cardName || '?'} → banished`,
    );
  } else {
    if (!ownerField.graveyard) ownerField.graveyard = [];
    ownerField.graveyard.push(monster);
  }
  return dest;
}
