/**
 * Detecção de combos e sinergias a partir de papéis de efeito e tags.
 * Genérico: funciona com qualquer deck cujas cartas tenham sido classificadas.
 */

import { BotActionCandidate } from './bot-action.types';
import { classifyCardEffect, EffectProfile, hasRole } from './bot-effect-taxonomy';

export interface ComboHint {
  id: string;
  label: string;
  priority: number;
  /** Tags/roles envolvidas. */
  parts: string[];
  /** Ações legais que avançam o combo (ids). */
  actionIds: string[];
}

function cardsFrom(duel: any, botUserId: number): { hand: any[]; field: any[]; gy: any[]; deck: any[] } {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  return {
    hand: Array.isArray(own?.hand) ? own.hand.filter(Boolean) : [],
    field: [
      ...(Array.isArray(own?.monsters) ? own.monsters.filter(Boolean) : []),
      ...(Array.isArray(own?.spellTrap) ? own.spellTrap.filter(Boolean) : []),
    ],
    gy: Array.isArray(own?.graveyard) ? own.graveyard.filter(Boolean) : [],
    deck: Array.isArray(own?.deck) ? own.deck.filter(Boolean) : [],
  };
}

function profiles(cards: any[]): Array<{ card: any; p: EffectProfile }> {
  return cards.map((card) => ({ card, p: classifyCardEffect(card) }));
}

function nameOf(c: any): string {
  return String(c?.name || c?.cardName || 'carta');
}

/**
 * Identifica combos disponíveis no estado atual.
 */
export function detectCombos(duel: any, botUserId: number, legal: BotActionCandidate[]): ComboHint[] {
  const { hand, field, gy, deck } = cardsFrom(duel, botUserId);
  const all = profiles([...hand, ...field]);
  const hints: ComboHint[] = [];

  const hasSearch = all.some((x) => hasRole(x.p, 'search'));
  const hasDraw = all.some((x) => hasRole(x.p, 'draw') || hasRole(x.p, 'discard_draw'));
  const hasRevive = all.some((x) => hasRole(x.p, 'revive'));
  const hasSummonExtra = all.some((x) => hasRole(x.p, 'summon_extra'));
  const hasSteal = all.some((x) => hasRole(x.p, 'steal'));
  const hasRemoval = all.some(
    (x) =>
      hasRole(x.p, 'board_wipe_monster') ||
      hasRole(x.p, 'target_destroy_monster') ||
      hasRole(x.p, 'banish_remove'),
  );
  const monstersInHand = hand.filter((c) =>
    String(c?.type || c?.cardType || '')
      .toLowerCase()
      .includes('monster'),
  );
  const gyMonsters = gy.filter((c) =>
    String(c?.type || c?.cardType || '')
      .toLowerCase()
      .includes('monster'),
  );

  const pickActions = (...preds: Array<(a: BotActionCandidate) => boolean>) =>
    legal.filter((a) => preds.some((p) => p(a))).map((a) => a.id);

  // Search → summon: ROTA + monstro / busca + peça de combo
  if (hasSearch && (monstersInHand.length >= 1 || deck.length > 0)) {
    const searchActs = pickActions(
      (a) => a.category === 'spell' && /reinforce|rota|search|busca|exército|army/i.test(a.label),
      (a) => a.category === 'spell' && classifyFromAction(a, hand)?.roles.includes('search') === true,
    );
    if (searchActs.length) {
      hints.push({
        id: 'search_into_play',
        label: 'Buscar peça e desenvolver o campo',
        priority: 85,
        parts: ['search', 'summon'],
        actionIds: searchActs,
      });
    }
  }

  // Draw engine antes de jogadas caras
  if (hasDraw) {
    const drawActs = pickActions((a) => {
      const p = classifyFromAction(a, hand);
      return a.category === 'spell' && !!p && (hasRole(p, 'draw') || hasRole(p, 'discard_draw'));
    });
    if (drawActs.length) {
      hints.push({
        id: 'draw_first',
        label: 'Comprar/filtrar mão antes de gastar recursos',
        priority: 90,
        parts: ['draw'],
        actionIds: drawActs,
      });
    }
  }

  // Revive quando há alvo forte no GY
  if (hasRevive && gyMonsters.length) {
    const best = Math.max(0, ...gyMonsters.map((c) => Number(c?.atk ?? c?.attack ?? 0) || 0));
    const reviveActs = pickActions((a) => {
      const p = classifyFromAction(a, [...hand, ...field]);
      return !!p && hasRole(p, 'revive');
    });
    if (reviveActs.length) {
      hints.push({
        id: 'revive_engine',
        label: `Revivir ameaça do cemitério (ATK~${best})`,
        priority: 70 + Math.min(25, best / 100),
        parts: ['revive', nameOf(gyMonsters[0])],
        actionIds: reviveActs,
      });
    }
  }

  // Double Summon + 2+ monstros
  if (hasSummonExtra && monstersInHand.length >= 2) {
    const acts = pickActions((a) => /double\s*summon|invoca[cç][aã]o\s*dupla|doublesummon/i.test(a.label + a.actionType));
    if (acts.length) {
      hints.push({
        id: 'double_summon_swarm',
        label: 'Double Summon + múltiplos monstros na mão',
        priority: 75,
        parts: ['summon_extra', 'swarm'],
        actionIds: acts,
      });
    }
  }

  // Remoção → ataque direto / lethal
  if (hasRemoval) {
    const remActs = pickActions((a) => {
      const p = classifyFromAction(a, [...hand, ...field]);
      return (
        !!p &&
        (hasRole(p, 'board_wipe_monster') ||
          hasRole(p, 'target_destroy_monster') ||
          hasRole(p, 'banish_remove') ||
          hasRole(p, 'steal'))
      );
    });
    if (remActs.length) {
      hints.push({
        id: 'clear_then_swing',
        label: 'Remover ameaças e abrir ataque',
        priority: hasSteal ? 88 : 80,
        parts: ['removal', 'battle'],
        actionIds: remActs,
      });
    }
  }

  // Special summon bosses (Chaos / DAD / REDMD) quando ação legal existe
  const bossActs = pickActions(
    (a) =>
      a.category === 'summon' &&
      /chaos|dark.?armed|red.?eyes|cyber.?dragon|obelisk|stein/i.test(a.label + a.actionType),
    (a) => a.category === 'monster_effect',
  );
  if (bossActs.length) {
    hints.push({
      id: 'boss_line',
      label: 'Linha de invocação/efeito especial',
      priority: 92,
      parts: ['special_summon', 'effect'],
      actionIds: bossActs,
    });
  }

  // Equip + monstro no campo
  const equipActs = pickActions((a) => {
    const p = classifyFromAction(a, hand);
    return !!p && hasRole(p, 'equip_boost');
  });
  if (equipActs.length && field.some((c) => String(c?.type || '').toLowerCase().includes('monster'))) {
    hints.push({
      id: 'equip_boost',
      label: 'Equipar monstro para pressão',
      priority: 55,
      parts: ['equip'],
      actionIds: equipActs,
    });
  }

  return hints.sort((a, b) => b.priority - a.priority);
}

function classifyFromAction(action: BotActionCandidate, cards: any[]): EffectProfile | null {
  const name = String(action.actionData?.cardName || action.label || '');
  const id = action.actionData?.cardId;
  const found =
    cards.find(
      (c) =>
        String(c?.idCarta || c?.id || c?.cardId) === String(id) ||
        String(c?.name || c?.cardName || '')
          .toLowerCase()
          .includes(name.toLowerCase().replace(/^ativar\s+(magia\s+)?/i, '').slice(0, 12)),
    ) || { name, idCarta: id, cardName: name };
  return classifyCardEffect(found);
}

/** Bônus de score se a ação participa de um combo detectado. */
export function comboBonusForAction(action: BotActionCandidate, combos: ComboHint[], skill: number): number {
  let bonus = 0;
  for (const c of combos) {
    if (c.actionIds.includes(action.id)) {
      bonus += (c.priority / 10) * skill;
    }
  }
  return bonus;
}

/** Recursos a preservar: se um combo precisa de carta X, não gastar X em jogada fraca. */
export function isKeyComboResource(action: BotActionCandidate, combos: ComboHint[]): boolean {
  // Evitar END_TURN / magias genéricas quando há combo draw/search/boss ativo
  const critical = combos.filter((c) => c.priority >= 85);
  if (!critical.length) return false;
  if (action.category === 'phase') return true;
  return false;
}
