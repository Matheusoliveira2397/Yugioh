/**
 * Perfil automático do deck do bot — adapta estilo sem programação manual por bot.
 */

import { classifyCardEffect, EffectRole, hasRole } from './bot-effect-taxonomy';

export type DeckStyle = 'aggro' | 'control' | 'combo' | 'midrange' | 'stall';

export interface DeckProfile {
  style: DeckStyle;
  winConditions: string[];
  keyCards: string[];
  supportRoles: EffectRole[];
  aggression: number; // 0–1
  resourcePatience: number; // 0–1 (quanto guarda remoção/negação)
  tags: string[];
  summary: string;
}

function cardName(c: any): string {
  return String(c?.name || c?.cardName || c?.idCarta || 'carta');
}

function atkOf(c: any): number {
  return Number(c?.atk ?? c?.attack ?? 0) || 0;
}

/**
 * Analisa cartas do deck (ou mão+campo+GY como proxy em duelo).
 */
export function analyzeDeck(cards: any[]): DeckProfile {
  const list = (cards || []).filter(Boolean);
  const profiles = list.map((c) => ({ c, p: classifyCardEffect(c) }));

  const roleCount = (role: EffectRole) => profiles.filter((x) => hasRole(x.p, role)).length;
  const draw = roleCount('draw') + roleCount('discard_draw') + roleCount('search');
  const removal =
    roleCount('board_wipe_monster') +
    roleCount('target_destroy_monster') +
    roleCount('banish_remove') +
    roleCount('steal');
  const protection = roleCount('protection') + roleCount('generic_trap');
  const revive = roleCount('revive') + roleCount('special_summon');
  const burn = roleCount('burn');
  const monsters = list.filter((c) =>
    String(c?.type || c?.cardType || '')
      .toLowerCase()
      .includes('monster'),
  );
  const avgAtk =
    monsters.length > 0 ? monsters.reduce((s, c) => s + atkOf(c), 0) / monsters.length : 0;
  const highAtk = monsters.filter((c) => atkOf(c) >= 2000).length;

  const tags = new Set<string>();
  for (const x of profiles) x.p.comboTags.forEach((t) => tags.add(t));

  let style: DeckStyle = 'midrange';
  let aggression = 0.55;
  let resourcePatience = 0.5;

  if (draw >= 4 && revive >= 2) {
    style = 'combo';
    aggression = 0.45;
    resourcePatience = 0.75;
  } else if (removal >= 5 && protection >= 3) {
    style = 'control';
    aggression = 0.35;
    resourcePatience = 0.85;
  } else if (protection >= 4 && avgAtk < 1600) {
    style = 'stall';
    aggression = 0.25;
    resourcePatience = 0.7;
  } else if (highAtk >= 5 || (burn >= 2 && highAtk >= 2)) {
    style = 'aggro';
    aggression = 0.85;
    resourcePatience = 0.3;
  } else if (avgAtk >= 1800 && removal >= 2) {
    style = 'midrange';
    aggression = 0.65;
    resourcePatience = 0.55;
  }

  const keyCards = profiles
    .filter((x) => x.p.baseValue >= 80)
    .sort((a, b) => b.p.baseValue - a.p.baseValue)
    .slice(0, 8)
    .map((x) => cardName(x.c));

  const winConditions: string[] = [];
  if (highAtk >= 3) winConditions.push('pressão de ATK / OTK');
  if (burn >= 2) winConditions.push('dano de efeito (burn)');
  if (revive >= 2) winConditions.push('loops de revive / recursão');
  if (removal >= 4) winConditions.push('controle de campo até exaustão');
  if (!winConditions.length) winConditions.push('vantagem de cartas e trades');

  const supportRoles: EffectRole[] = [];
  if (draw) supportRoles.push('draw', 'search');
  if (removal) supportRoles.push('target_destroy_monster', 'board_wipe_monster');
  if (protection) supportRoles.push('protection');
  if (revive) supportRoles.push('revive');

  return {
    style,
    winConditions,
    keyCards,
    supportRoles,
    aggression,
    resourcePatience,
    tags: [...tags],
    summary: `${style}: ${winConditions.join('; ')} | chaves: ${keyCards.slice(0, 3).join(', ') || 'n/a'}`,
  };
}

/** Extrai cartas visíveis do duelo para perfil dinâmico. */
export function deckCardsFromDuel(duel: any, botUserId: number): any[] {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  return [
    ...(Array.isArray(own?.deck) ? own.deck : []),
    ...(Array.isArray(own?.hand) ? own.hand : []),
    ...(Array.isArray(own?.monsters) ? own.monsters : []),
    ...(Array.isArray(own?.spellTrap) ? own.spellTrap : []),
    ...(Array.isArray(own?.graveyard) ? own.graveyard : []),
  ].filter(Boolean);
}

const profileCache = new Map<string, { at: number; profile: DeckProfile }>();

export function getDeckProfile(duel: any, botUserId: number): DeckProfile {
  const key = `${duel?.id || 'x'}:${botUserId}`;
  const hit = profileCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.profile;
  const profile = analyzeDeck(deckCardsFromDuel(duel, botUserId));
  profileCache.set(key, { at: Date.now(), profile });
  return profile;
}

/** Modula score conforme estilo do deck. */
export function styleAdjust(
  category: string,
  label: string,
  baseScore: number,
  profile: DeckProfile,
): number {
  let s = baseScore;
  const L = label.toLowerCase();
  if (profile.style === 'aggro') {
    if (category === 'attack') s *= 1.15;
    if (category === 'summon' && !/setar/i.test(L)) s *= 1.1;
    if (/waboku|swords|stall|protection/i.test(L)) s *= 0.7;
  } else if (profile.style === 'control') {
    if (/raigeki|dark.?hole|mst|change|brain|fissure|smash|confiscation|forceful/i.test(L)) s *= 1.15;
    if (category === 'trap') s *= 1.2;
    if (category === 'attack' && baseScore < 100) s *= 0.85;
  } else if (profile.style === 'combo') {
    if (/pot|greed|graceful|reload|rota|reborn|double/i.test(L)) s *= 1.2;
    if (category === 'monster_effect') s *= 1.15;
    if (category === 'attack' && baseScore < 140) s *= 0.8;
  } else if (profile.style === 'stall') {
    if (/swords|waboku|mirror|sakuretsu/i.test(L)) s *= 1.25;
    if (category === 'attack') s *= 0.75;
  }
  return s;
}
