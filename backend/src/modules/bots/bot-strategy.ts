import { BotDifficulty } from './entities/managed-bot.entity';
import { BotActionCandidate, BotLesson } from './bot-action.types';
import { classifyCardEffect, evaluatePublicMonsterThreat, situationalEffectValue } from './bot-effect-taxonomy';
import { detectCombos, comboBonusForAction, isKeyComboResource } from './bot-combo';
import { getDeckProfile, styleAdjust } from './bot-deck-profile';
import { evaluateBoard, estimableBattleDamage } from './bot-evaluator';
import { evaluateAttack, bestAttackScore } from './bot-battle';
import { handSize, handSizeScoreAdjust, hasHandReliefPlays, overflowIfEndTurn } from './bot-hand-policy';

/** Perfil de jogo por dificuldade — mesma engine, qualidade de avaliação diferente. */
export function difficultyProfile(d: BotDifficulty) {
  switch (d) {
    case BotDifficulty.EASY:
      return {
        skill: 0.45,
        risk: 0.35,
        blunder: 0.22,
        tempo: 0.7,
        depth: 0,
        preserve: 0.25,
        comboWeight: 0.4,
      };
    case BotDifficulty.NORMAL:
      return {
        skill: 0.7,
        risk: 0.55,
        blunder: 0.1,
        tempo: 0.9,
        depth: 1,
        preserve: 0.5,
        comboWeight: 0.75,
      };
    case BotDifficulty.HARD:
      return {
        skill: 0.9,
        risk: 0.75,
        blunder: 0.03,
        tempo: 1.05,
        depth: 2,
        preserve: 0.8,
        comboWeight: 1.0,
      };
    case BotDifficulty.EXPERT:
      return {
        skill: 1.0,
        risk: 0.88,
        blunder: 0,
        tempo: 1.15,
        depth: 3,
        preserve: 0.95,
        comboWeight: 1.2,
      };
    default:
      return {
        skill: 0.7,
        risk: 0.55,
        blunder: 0.1,
        tempo: 0.9,
        depth: 1,
        preserve: 0.5,
        comboWeight: 0.75,
      };
  }
}

function keyOf(card: any): string {
  return String(card?.idCarta || card?.id || card?.cardId || card?.name || card?.cardName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function atkOf(m: any): number {
  return Number(m?.atk ?? m?.attack ?? 0) || 0;
}
function isMonster(c: any): boolean {
  return String(c?.type || c?.cardType || '').toLowerCase().includes('monster');
}

export interface StrategyCtx {
  myLp: number;
  oppLp: number;
  phase: string;
  hand: any[];
  myMonsters: Array<{ m: any; i: number }>;
  oppMonsters: Array<{ m: any; i: number }>;
  mySpells: Array<{ c: any; i: number }>;
  oppSpells: Array<{ c: any; i: number }>;
  gyMonsters: any[];
  myAtkSum: number;
  oppAtkSum: number;
  strongestOppAtk: number;
  strongestOwnAtk: number;
  canDirect: boolean;
  lethalDirect: boolean;
  boardThreat: number;
  boardScore: number;
  battleDamage: number;
}

export function buildStrategyCtx(duel: any, botUserId: number): StrategyCtx {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const myLp = Number(isP1 ? duel.player1LifePoints : duel.player2LifePoints) || 8000;
  const oppLp = Number(isP1 ? duel.player2LifePoints : duel.player1LifePoints) || 8000;
  const myMonsters = (Array.isArray(own?.monsters) ? own.monsters : [])
    .map((m: any, i: number) => ({ m, i }))
    .filter((x: { m: any }) => !!x.m);
  const oppMonsters = (Array.isArray(opp?.monsters) ? opp.monsters : [])
    .map((m: any, i: number) => ({ m, i }))
    .filter((x: { m: any }) => !!x.m);
  const mySpells = (Array.isArray(own?.spellTrap) ? own.spellTrap : [])
    .map((c: any, i: number) => ({ c, i }))
    .filter((x: { c: any }) => !!x.c);
  const oppSpells = (Array.isArray(opp?.spellTrap) ? opp.spellTrap : [])
    .map((c: any, i: number) => ({ c, i }))
    .filter((x: { c: any }) => !!x.c);
  const gyMonsters = [...(own?.graveyard || []), ...(opp?.graveyard || [])].filter(isMonster);
  const myAtkSum = myMonsters.reduce(
    (s: number, x: { m: any }) => s + (String(x.m.position || '').includes('attack') ? atkOf(x.m) : 0),
    0,
  );
  const oppAtkSum = oppMonsters.reduce(
    (s: number, x: { m: any }) => s + (String(x.m.position || '').includes('attack') ? atkOf(x.m) : 0),
    0,
  );
  const strongestOppAtk = Math.max(0, ...oppMonsters.map((x: { m: any }) => atkOf(x.m)));
  const strongestOwnAtk = Math.max(0, ...myMonsters.map((x: { m: any }) => atkOf(x.m)));
  const canDirect = oppMonsters.length === 0;
  const lethalDirect = canDirect && myAtkSum >= oppLp;
  const board = evaluateBoard(duel, botUserId);
  const battleDamage = estimableBattleDamage(duel, botUserId);
  return {
    myLp,
    oppLp,
    phase: String(duel.currentPhase || ''),
    hand: Array.isArray(own?.hand) ? own.hand : [],
    myMonsters,
    oppMonsters,
    mySpells,
    oppSpells,
    gyMonsters,
    myAtkSum,
    oppAtkSum,
    strongestOppAtk,
    strongestOwnAtk,
    canDirect,
    lethalDirect,
    boardThreat: oppAtkSum + oppSpells.length * 400,
    boardScore: board.total,
    battleDamage,
  };
}

function findCardForAction(action: BotActionCandidate, ctx: StrategyCtx): any {
  const id = action.actionData?.cardId;
  const name = String(action.actionData?.cardName || '');
  const zoneIdx = action.actionData?.monsterZoneIndex;
  if (zoneIdx !== undefined && zoneIdx !== null) {
    const onField = ctx.myMonsters.find((x) => x.i === zoneIdx)?.m;
    if (onField) return onField;
  }
  const pools = [...ctx.hand, ...ctx.myMonsters.map((x) => x.m), ...ctx.mySpells.map((x) => x.c)];
  return (
    pools.find(
      (c) =>
        String(c?.idCarta || c?.id || c?.cardId) === String(id) ||
        (name && String(c?.name || c?.cardName || '').toLowerCase() === name.toLowerCase()),
    ) || { name: name || action.label, idCarta: id, description: '' }
  );
}

function monsterEffectStartBonus(actionType: string, ctx: StrategyCtx): number {
  const t = actionType.toUpperCase();
  if (
    t.includes('DARK_ARMED_DRAGON_EFFECT') ||
    t.includes('CHAOS_SORCERER_EFFECT') ||
    t.includes('BLS_EFFECT') ||
    t.includes('EXILED_FORCE')
  ) {
    if (!ctx.oppMonsters.length) return -40;
    return 115 + Math.min(50, ctx.strongestOppAtk / 35);
  }
  if (t.includes('CHAOS_EMPEROR')) {
    return ctx.oppMonsters.length + ctx.oppSpells.length >= 2 ? 125 : 45;
  }
  if (t.includes('OBELISK')) return ctx.oppMonsters.length ? 120 : -30;
  if (t.includes('CYBER_STEIN') || t.includes('RED_EYES_DARKNESS_METAL_DRAGON_EFFECT')) return 95;
  if (t.includes('BREAKER_REMOVE_COUNTER')) {
    if (!ctx.oppSpells.length) return -50;
    // Acima de ataque direto típico (~246 @1900): limpar backrow antes de bater
    return 260 + ctx.oppSpells.length * 20;
  }
  if (t.includes('SKILLED_DARK_MAGICIAN')) return 270; // tributa → DM 2500
  if (t.includes('FLIP_MONSTER')) return ctx.oppMonsters.length ? 200 : 40;
  if (t.includes('CHANGE_POSITION')) return 45;
  return 0;
}

function effectActionScore(action: BotActionCandidate, ctx: StrategyCtx): number {
  const card = findCardForAction(action, ctx);
  const profile = classifyCardEffect(card);
  const bestGy = Math.max(0, ...ctx.gyMonsters.map(atkOf));
  let v = situationalEffectValue(profile, {
    oppMonsters: ctx.oppMonsters.length,
    oppSpells: ctx.oppSpells.length,
    gyMonsters: ctx.gyMonsters.length,
    ownMonsters: ctx.myMonsters.length,
    oppLp: ctx.oppLp,
    myLp: ctx.myLp,
    oppAtkSum: ctx.oppAtkSum,
    bestGyAtk: bestGy,
  });
  // Considerar os efeitos públicos dos monstros inimigos ao decidir quando
  // remover ameaças ou buscar proteção. Cartas setadas são tratadas como desconhecidas.
  const visibleThreat = ctx.oppMonsters.reduce(
    (sum, entry) => sum + evaluatePublicMonsterThreat(entry.m), 0,
  );
  const removesMonster = profile.roles.some((r) =>
    ['target_destroy_monster', 'banish_remove', 'steal', 'board_wipe_monster'].includes(r),
  );
  if (removesMonster && ctx.oppMonsters.length > 0) {
    v += Math.min(85, visibleThreat * 0.35);
  }
  if (profile.roles.includes('protection') && visibleThreat >= 130) {
    v += Math.min(40, visibleThreat * 0.15);
  }
  if (profile.roles.includes('target_destroy_spell') || profile.roles.includes('board_wipe_spell')) {
    // Backrow setada é potencialmente perigosa, mas sem acesso ao seu conteúdo.
    v += Math.min(24, ctx.oppSpells.length * 8);
  }
  // START_* sem cardName claramente classificado: boost explícito por actionType
  const startBoost = monsterEffectStartBonus(action.actionType, ctx);
  if (startBoost !== 0) v = Math.max(v, startBoost);
  return v;
}

function guessAtkFromLabel(label: string): number {
  const m = label.match(/\((\d+)\)/);
  return m ? Number(m[1]) : 0;
}

function summonScore(action: BotActionCandidate, ctx: StrategyCtx, skill: number): number {
  const data = action.actionData || {};
  const atk = Number(data.atk ?? 0) || guessAtkFromLabel(action.label);
  const isSet = action.actionType === 'SET_MONSTER' || /setar/i.test(action.label);

  if (
    action.actionType.includes('CYBER_DRAGON') ||
    action.actionType.includes('CHAOS') ||
    action.actionType.includes('DARK_ARMED') ||
    action.actionType.includes('RED_EYES')
  ) {
    return 105 + atk / 40;
  }

  let score = 38 + atk / 42;
  if (action.actionType.includes('SPECIAL') || action.actionType.startsWith('START_')) score += 25;

  const canBeat = atk > ctx.strongestOppAtk || ctx.oppMonsters.length === 0;
  if (isSet) {
    score = 30 + (canBeat ? -10 : 18);
    if (ctx.myLp < 2000) score += 12;
  } else {
    if (canBeat) score += 22 * skill;
    else score -= 15;
    if (ctx.phase.includes('MAIN1')) score += 12;
  }

  if (!isSet && atk < 1400 && ctx.strongestOwnAtk >= 2000) score -= 20;
  return score;
}

/**
 * Lookahead raso: se remover o board agora, o dano de batalha estimado sobe?
 */
function lookaheadRemovalBonus(action: BotActionCandidate, ctx: StrategyCtx, depth: number): number {
  if (depth < 2) return 0;
  if (action.category !== 'spell' && action.category !== 'monster_effect') return 0;
  const card = findCardForAction(action, ctx);
  const p = classifyCardEffect(card);
  const isRemoval = p.roles.some((r) =>
    ['board_wipe_monster', 'target_destroy_monster', 'banish_remove', 'steal'].includes(r),
  );
  if (!isRemoval || !ctx.oppMonsters.length) return 0;
  const projectedDamage = ctx.myAtkSum + (p.roles.includes('steal') ? ctx.strongestOppAtk : 0);
  if (projectedDamage >= ctx.oppLp) return 90;
  if (ctx.oppMonsters.length <= 2 && projectedDamage > ctx.battleDamage + 500) return 35;
  return 10;
}

/**
 * Pontua todas as ações legais com avaliação de estado, combos e perfil de deck.
 */
export function scoreLegalActions(
  duel: any,
  botUserId: number,
  difficulty: BotDifficulty,
  legal: BotActionCandidate[],
  lessons: BotLesson[] = [],
): { action: BotActionCandidate; score: number; reason: string } | null {
  if (!legal.length) return null;
  const ctx = buildStrategyCtx(duel, botUserId);
  const p = difficultyProfile(difficulty);
  const deck = getDeckProfile(duel, botUserId);
  const combos = detectCombos(duel, botUserId, legal);
  const handCount = handSize(duel, botUserId);
  const handOverflow = overflowIfEndTurn(handCount);

  const lessonBoost = new Map<string, number>();
  for (const l of lessons) {
    const exact = `${l.actionType}|${l.label}`;
    const byType = `type:${l.actionType}`;
    const capped = Math.min(28, l.reward);
    lessonBoost.set(exact, Math.max(lessonBoost.get(exact) || 0, capped));
    // Reforço por tipo (self-play: labels mudam com zona/ATK)
    lessonBoost.set(byType, Math.max(lessonBoost.get(byType) || 0, capped * 0.55));
  }

  let best: { action: BotActionCandidate; score: number; reason: string } | null = null;
  const ranked: Array<{ action: BotActionCandidate; score: number; reason: string }> = [];

  for (const action of legal) {
    let score = 0;
    let reason = action.label;

    switch (action.category) {
      case 'spell': {
        score = effectActionScore(action, ctx) * (0.85 + 0.2 * p.skill);
        reason = `magia: ${action.label}`;
        if (ctx.boardThreat > 2000 && score > 0) score += 15 * p.skill;
        // Preservar remoção cara se já tem lethal
        if (ctx.lethalDirect && score < 120) score -= 40 * p.preserve;
        if (ctx.phase.includes('MAIN2') && score < 70) score -= 60;
        // Se pode atacar com vantagem, não gastar magia fraca
        if (
          (ctx.canDirect || ctx.strongestOwnAtk > ctx.strongestOppAtk) &&
          score < 75 &&
          !/pot|greed|rota|reborn|change|brain|raigeki|mst/i.test(action.label)
        ) {
          score -= 50;
        }
        break;
      }
      case 'trap':
        if (action.actionType === 'SET_SPELL_TRAP') {
          if (ctx.mySpells.length >= 2) score = 5;
          else if (ctx.mySpells.length >= 1) score = 18 + deck.resourcePatience * 10;
          else {
            score =
              (42 + (ctx.oppMonsters.length ? 12 : 0) + (ctx.myLp < 3000 ? 15 : 0)) *
              (0.7 + 0.4 * p.skill) *
              (0.8 + deck.resourcePatience * 0.4);
          }
          reason = `setup: ${action.label}`;
        } else {
          score = effectActionScore(action, ctx) * (0.7 + 0.3 * p.skill);
          reason = `trap: ${action.label}`;
        }
        break;
      case 'monster_effect':
        score = effectActionScore(action, ctx) * (0.9 + 0.15 * p.skill);
        // Fallback: efeitos START_* mal classificados ainda devem competir com summon/END_TURN
        if (score < 60) {
          score = Math.max(score, 90 + (ctx.oppMonsters.length ? 35 : -20));
        }
        score += lookaheadRemovalBonus(action, ctx, p.depth);
        // Prioridade alta sobre passar o turno em MAIN1/MAIN2
        if (ctx.phase.includes('MAIN') && score > 0) score += 25 * p.skill;
        reason = `efeito: ${action.label}`;
        break;
      case 'summon':
        score = summonScore(action, ctx, p.skill);
        reason = `invocar: ${action.label}`;
        break;
      case 'attack': {
        const ev = evaluateAttack(
          action,
          ctx.myMonsters,
          ctx.oppMonsters,
          ctx.myLp,
          ctx.oppLp,
          p.risk,
        );
        score = ev.score * p.tempo * (0.9 + 0.2 * deck.aggression);
        reason = `batalha: ${ev.reason}`;
        // Tag Force / WindBot: não bater no ar com backrow setada se ainda dá para limpar
        if (p.depth >= 2 && ctx.oppSpells.length > 0 && !ev.lethalLine) {
          score -= 35 * ctx.oppSpells.length;
          const canClearBackrow = legal.some(
            (a) =>
              a.actionType === 'BREAKER_REMOVE_COUNTER' ||
              (a.category === 'spell' &&
                /mst|typhoon|heavy.?storm|harpie|lightning/i.test(a.label)),
          );
          if (canClearBackrow) {
            score -= 90;
            reason += ' (limpar backrow antes)';
          }
        }
        // Preferir upgrade de board (Skilled DM → Dark Magician) antes de atacar com o tributo
        if (
          !ev.lethalLine &&
          legal.some((a) => a.actionType === 'START_SKILLED_DARK_MAGICIAN_EFFECT')
        ) {
          score -= 100;
          reason += ' (ativar Skilled DM antes)';
        }
        break;
      }
      case 'phase':
        if (action.actionType === 'NEXT_PHASE') {
          const hasAttackActions = legal.some((a) => a.category === 'attack');
          const bestAtk = bestAttackScore(
            legal,
            ctx.myMonsters,
            ctx.oppMonsters,
            ctx.myLp,
            ctx.oppLp,
            p.risk,
          );
          const hasWinningAttack = bestAtk >= 140;
          if (ctx.phase.includes('MAIN1') && hasAttackActions) {
            score = hasWinningAttack ? 40 : 15;
            reason = 'avançar (ataques já disponíveis)';
          } else if (ctx.phase.includes('BATTLE')) {
            score = hasWinningAttack ? -40 : 25;
            reason = hasWinningAttack ? 'ainda há ataques bons' : 'sair da batalha';
          } else {
            score = hasWinningAttack ? 90 : 12;
            if (ctx.lethalDirect) score = 160;
            reason = hasWinningAttack ? 'Battle com pressão' : 'avançar fase';
          }
          // HARD+: se ainda há draw/removal legal forte, não avançar
          if (p.depth >= 2) {
            const strongSpell = legal.some((a) => {
              if (a.category !== 'spell') return false;
              return effectActionScore(a, ctx) >= 85;
            });
            if (strongSpell && ctx.phase.includes('MAIN1')) score -= 50;
          }
        } else if (action.actionType === 'END_TURN') {
          const bestAtk = bestAttackScore(
            legal,
            ctx.myMonsters,
            ctx.oppMonsters,
            ctx.myLp,
            ctx.oppLp,
            p.risk,
          );
          const hasWinningAttack = bestAtk >= 140;
          const needsFirstBackrow =
            ctx.phase.includes('MAIN2') &&
            ctx.mySpells.length === 0 &&
            legal.some((a) => a.actionType === 'SET_SPELL_TRAP');
          if (ctx.phase.includes('MAIN2')) {
            score = 200;
            if (needsFirstBackrow) score = 50;
            if (hasWinningAttack) score = -50;
            if (isKeyComboResource(action, combos) && combos[0] && combos[0].priority >= 90) {
              score -= 30 * p.comboWeight;
            }
            // Tag Force-style: não passar com mão > 6 se ainda dá para gastar cartas
            if (handOverflow > 0 && hasHandReliefPlays(legal, handCount)) {
              score = Math.min(score, 25);
              reason = `passar (mas mão=${handCount}, aliviar antes)`;
            }
          } else {
            score = 30;
            if (hasWinningAttack) score -= 80;
          }
          if (!reason.startsWith('passar')) reason = 'passar o turno';
        } else {
          score = 10;
        }
        break;
      default:
        score = 10;
    }

    // Política de mão (evitar discard / não comprar com mão cheia)
    const handAdj = handSizeScoreAdjust(action, handCount, p.skill);
    if (handAdj.delta) {
      score += handAdj.delta;
      if (handAdj.note) reason += ` [${handAdj.note}]`;
    }

    score = styleAdjust(action.category, action.label, score, deck);
    score += comboBonusForAction(action, combos, p.comboWeight);

    const boostExact = lessonBoost.get(`${action.actionType}|${action.label}`) || 0;
    const boostType = lessonBoost.get(`type:${action.actionType}`) || 0;
    const boost = Math.max(boostExact, boostType);
    if (boost && !/last\s*will/i.test(action.label)) {
      score += boost * p.skill;
      reason += boostExact ? ' (+memória)' : ' (+memória/tipo)';
    }

    if (
      ctx.oppLp <= 2000 &&
      (action.category === 'attack' || /hinotama|change|brain|raigeki|burn/i.test(action.label))
    ) {
      score += 30 * p.skill;
    }
    if (ctx.myLp <= 1500 && action.category === 'spell') {
      const card = findCardForAction(action, ctx);
      const prof = classifyCardEffect(card);
      if (prof.roles.some((r) => ['board_wipe_monster', 'steal', 'protection'].includes(r))) {
        score += 35;
      }
    }

    // EXPERT: leve atrativo a manter boardScore alto (não suicidar)
    if (p.depth >= 3 && action.category === 'attack' && score < 0 && ctx.boardScore > 0) {
      score -= 15;
    }

    if (p.blunder > 0) {
      score += (Math.random() * 2 - 1) * 40 * p.blunder;
    }

    ranked.push({ action, score, reason });
    if (!best || score > best.score) {
      best = { action, score, reason };
    }
  }

  // EXPERT/HARD: entre as top-N, preferir a que habilita combo de maior prioridade
  if (p.depth >= 2 && ranked.length > 1) {
    ranked.sort((a, b) => b.score - a.score);
    const top = ranked.slice(0, Math.min(5, ranked.length));
    for (const cand of top) {
      const bonus = comboBonusForAction(cand.action, combos, p.comboWeight);
      if (bonus > 0 && combos[0] && combos[0].actionIds.includes(cand.action.id)) {
        if (!best || cand.score + bonus * 0.3 >= best.score) {
          best = {
            action: cand.action,
            score: cand.score + bonus * 0.3,
            reason: cand.reason + ` [combo: ${combos[0].label}]`,
          };
        }
      }
    }
    // Se empate próximo, escolher top
    if (best && top[0] && top[0].score > best.score + 5) {
      best = top[0];
    }
  }

  void keyOf;
  return best;
}
