/**
 * Respostas inteligentes: escolha de alvos em pending, e ativação manual
 * de traps/quick plays quando o motor permite (ex.: Ring of Destruction).
 */

import { BotActionCandidate } from './bot-action.types';
import { classifyCardEffect, hasRole, situationalEffectValue } from './bot-effect-taxonomy';
import { BotDifficulty } from './entities/managed-bot.entity';

function atkOf(m: any): number {
  return Number(m?.atk ?? m?.attack ?? 0) || 0;
}
function isMonster(c: any): boolean {
  return String(c?.type || c?.cardType || '').toLowerCase().includes('monster');
}
function keyOf(c: any): string {
  return String(c?.idCarta || c?.id || c?.cardId || c?.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface PendingDecision {
  actionType: string;
  actionData: Record<string, any>;
  reason: string;
  /** Se true, preferir cancelar/auto-resolve em vez de gastar. */
  skip?: boolean;
}

function boardSides(duel: any, botUserId: number) {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const ownMonsters = (Array.isArray(own?.monsters) ? own.monsters : [])
    .map((m: any, i: number) => ({ m, i }))
    .filter((x: { m: any }) => !!x.m);
  const oppMonsters = (Array.isArray(opp?.monsters) ? opp.monsters : [])
    .map((m: any, i: number) => ({ m, i }))
    .filter((x: { m: any }) => !!x.m);
  const oppSpells = (Array.isArray(opp?.spellTrap) ? opp.spellTrap : [])
    .map((c: any, i: number) => ({ c, i }))
    .filter((x: { c: any }) => !!x.c);
  const ownGy: any[] = Array.isArray(own?.graveyard) ? own.graveyard : [];
  const oppGy: any[] = Array.isArray(opp?.graveyard) ? opp.graveyard : [];
  const myLp = Number(isP1 ? duel.player1LifePoints : duel.player2LifePoints) || 0;
  const oppLp = Number(isP1 ? duel.player2LifePoints : duel.player1LifePoints) || 0;
  return { own, opp, ownMonsters, oppMonsters, oppSpells, ownGy, oppGy, myLp, oppLp, isP1 };
}

/**
 * Decide alvo/opción para pendingChoice do bot.
 */
export function decidePendingChoice(
  duel: any,
  botUserId: number,
  difficulty: BotDifficulty,
): PendingDecision | null {
  const pc: any = duel?.pendingChoice;
  if (!pc || Number(pc.userId) !== Number(botUserId)) return null;

  const { ownMonsters, oppMonsters, oppSpells, ownGy, oppGy, myLp, oppLp } = boardSides(duel, botUserId);
  const strongestOpp = [...oppMonsters].sort((a, b) => atkOf(b.m) - atkOf(a.m))[0];
  const weakestOwn = [...ownMonsters].sort((a, b) => atkOf(a.m) - atkOf(b.m))[0];
  const strongestOwn = [...ownMonsters].sort((a, b) => atkOf(b.m) - atkOf(a.m))[0];

  // Em EASY, ocasionalmente escolhe o 2º melhor
  const pickOpp =
    difficulty === BotDifficulty.EASY && oppMonsters.length > 1 && Math.random() < 0.35
      ? [...oppMonsters].sort((a, b) => atkOf(b.m) - atkOf(a.m))[1]
      : strongestOpp;

  switch (pc.type) {
    case 'CHANGE_OF_HEART':
    case 'BRAIN_CONTROL':
    case 'SOUL_TAKER': {
      if (!pickOpp) return { actionType: 'AUTO', actionData: {}, reason: 'sem alvo', skip: true };
      const actionType =
        pc.type === 'CHANGE_OF_HEART'
          ? 'CHANGE_OF_HEART_CHOICE'
          : pc.type === 'BRAIN_CONTROL'
            ? 'BRAIN_CONTROL_CHOICE'
            : 'SOUL_TAKER_CHOICE';
      return {
        actionType,
        actionData: { chosenMonsterZoneIndex: pickOpp.i },
        reason: `alvo ${pickOpp.m?.name || pickOpp.i} ATK ${atkOf(pickOpp.m)}`,
      };
    }
    case 'UNITED_WE_STAND':
    case 'MAGE_POWER': {
      if (!strongestOwn) return { actionType: 'AUTO', actionData: {}, reason: 'sem monstro', skip: true };
      return {
        actionType: pc.type === 'UNITED_WE_STAND' ? 'UNITED_WE_STAND_CHOICE' : 'MAGE_POWER_CHOICE',
        actionData: { chosenMonsterZoneIndex: strongestOwn.i },
        reason: `buff em ${strongestOwn.m?.name || strongestOwn.i}`,
      };
    }
    case 'MYSTICAL_SPACE_TYPHOON': {
      // Preferir backrow setada (possível trap) em HARD+
      const ranked = [...oppSpells].sort((a, b) => {
        const aSet = String(a.c.position || '') === 'set' ? 1 : 0;
        const bSet = String(b.c.position || '') === 'set' ? 1 : 0;
        return bSet - aSet;
      });
      const target = ranked[0];
      if (!target) return { actionType: 'AUTO', actionData: {}, reason: 'sem backrow', skip: true };
      return {
        actionType: 'MYSTICAL_SPACE_TYPHOON_CHOICE',
        actionData: {
          targetPlayer: 'opponent',
          targetZoneIndex: target.i,
          spellTrapZoneIndex: pc.data?.zoneIndex,
        },
        reason: `MST zona ${target.i}`,
      };
    }
    case 'MONSTER_REBORN':
    case 'PREMATURE_BURIAL':
    case 'AUTONOMOUS_ACTION_UNIT':
    case 'LAST_WILL': {
      const pool = [...ownGy, ...oppGy]
        .map((c) => ({
          c,
          graveyard: ownGy.includes(c) ? 'player' : 'opponent',
          gy: ownGy.includes(c) ? ownGy : oppGy,
        }))
        .filter((x) => isMonster(x.c))
        .sort((a, b) => atkOf(b.c) - atkOf(a.c));
      // HARD+: preferir próprio GY se ATK similar (menos riscos de efeitos)
      let pick = pool[0];
      if (difficulty === BotDifficulty.HARD || difficulty === BotDifficulty.EXPERT) {
        const ownBest = pool.find((x) => x.graveyard === 'player');
        if (ownBest && pick && atkOf(ownBest.c) >= atkOf(pick.c) * 0.85) pick = ownBest;
      }
      if (!pick) return { actionType: 'AUTO', actionData: {}, reason: 'GY vazio', skip: true };
      const gyIndex = pick.gy.findIndex((c) => c === pick!.c || keyOf(c) === keyOf(pick!.c));
      const actionType =
        pc.type === 'MONSTER_REBORN'
          ? 'MONSTER_REBORN_CHOICE'
          : pc.type === 'PREMATURE_BURIAL'
            ? 'PREMATURE_BURIAL_CHOICE'
            : pc.type === 'LAST_WILL'
              ? 'LAST_WILL_CHOICE'
              : 'AUTONOMOUS_ACTION_UNIT_CHOICE';
      return {
        actionType,
        actionData: { chosenMonster: { graveyard: pick.graveyard, index: gyIndex >= 0 ? gyIndex : 0 } },
        reason: `revive ${pick.c?.name || 'monstro'}`,
      };
    }
    case 'LIGHTNING_STORM': {
      const monstersThreat = oppMonsters.reduce((s: number, x: { m: any; i: number }) => s + atkOf(x.m), 0);
      const effect =
        monstersThreat >= oppSpells.length * 800 || oppMonsters.length >= oppSpells.length
          ? 'destroy_attack_monsters'
          : 'destroy_spells_traps';
      return {
        actionType: 'LIGHTNING_STORM_CHOICE',
        actionData: { effect },
        reason: `Lightning Storm → ${effect}`,
      };
    }
    case 'SKILLED_DARK_MAGICIAN': {
      const options: Array<{ source: string; index: number; name?: string }> = Array.isArray(pc.data?.options)
        ? pc.data.options
        : [];
      if (!options.length) {
        return {
          actionType: 'SKILLED_DARK_MAGICIAN_SKIP',
          actionData: {},
          reason: 'Skilled DM: sem Dark Magician',
        };
      }
      const pick = options[0];
      return {
        actionType: 'SKILLED_DARK_MAGICIAN_CHOICE',
        actionData: { source: pick.source, index: pick.index },
        reason: `Skilled DM → ${pick.name || 'Dark Magician'} (${pick.source})`,
      };
    }
    case 'SNOWMAN_EATER': {
      if (!pickOpp) return { actionType: 'AUTO', actionData: {}, reason: 'Snowman: sem alvo', skip: true };
      return {
        actionType: 'SNOWMAN_EATER_CHOICE',
        actionData: {
          targetPlayer: 'opponent',
          targetZoneIndex: pickOpp.i,
          monsterZoneIndex: pc.data?.monsterZoneIndex ?? pc.data?.zoneIndex ?? 0,
        },
        reason: `Snowman destruir ${pickOpp.m?.name || pickOpp.i}`,
      };
    }
    case 'CHAOS_SORCERER':
    case 'CHAOS_SORCERER_EFFECT':
    case 'DARK_ARMED_DRAGON':
    case 'DARK_ARMED_DRAGON_EFFECT':
    case 'BLS':
    case 'BLS_EFFECT':
    case 'EXILED_FORCE':
    case 'EXILED_FORCE_EFFECT': {
      if (!pickOpp) return { actionType: 'AUTO', actionData: {}, reason: 'sem alvo', skip: true };
      // EXPERT: não gastar remoção em monstro fraco se há ameaça maior e LP confortável
      if (
        (difficulty === BotDifficulty.EXPERT || difficulty === BotDifficulty.HARD) &&
        atkOf(pickOpp.m) < 1500 &&
        myLp > 4000 &&
        oppMonsters.length === 1
      ) {
        return {
          actionType: 'AUTO',
          actionData: {},
          reason: 'ameaça baixa — preservar efeito',
          skip: true,
        };
      }
      const casterZone =
        pc.data?.monsterZoneIndex ??
        pc.data?.zoneIndex ??
        ownMonsters.find((x: { m: any; i: number }) =>
          /chaos|darkarmed|exiled|blackluster|envoy/i.test(keyOf(x.m)),
        )?.i;
      const choiceType = String(pc.type).includes('CHAOS_SORCERER')
        ? 'CHAOS_SORCERER_EFFECT_CHOICE'
        : String(pc.type).includes('DARK_ARMED')
          ? 'DARK_ARMED_DRAGON_EFFECT_CHOICE'
          : String(pc.type).includes('BLS')
            ? 'BLS_EFFECT_CHOICE'
            : 'EXILED_FORCE_CHOICE';
      const payload: any = {
        monsterZoneIndex: casterZone,
        targetPlayer: 'opponent',
        targetZoneIndex: pickOpp.i,
        targetType: 'monster',
      };
      if (choiceType === 'DARK_ARMED_DRAGON_EFFECT_CHOICE') {
        payload.darkGraveyardIndex = pc.data?.darkGraveyardIndex ?? 0;
      }
      return { actionType: choiceType, actionData: payload, reason: `remover ${pickOpp.m?.name}` };
    }
    case 'PLAYER_TARGET_SPELL':
    case 'RING_OF_DESTRUCTION': {
      // Alvo: monstro oponente forte; se burn letal, priorizar
      if (!pickOpp) return { actionType: 'AUTO', actionData: {}, reason: 'sem alvo', skip: true };
      const burnLethal = atkOf(pickOpp.m) >= oppLp;
      const selfDanger = atkOf(pickOpp.m) >= myLp && difficulty !== BotDifficulty.EASY;
      if (selfDanger && !burnLethal) {
        // Preferir monstro próprio fraco se o efeito também causa dano a si
        if (weakestOwn && atkOf(weakestOwn.m) < myLp) {
          return {
            actionType: pc.data?.choiceAction || 'PLAYER_TARGET_SPELL_CHOICE',
            actionData: {
              targetPlayer: 'self',
              targetZoneIndex: weakestOwn.i,
              ...(pc.data || {}),
            },
            reason: 'Ring: sacrificar próprio fraco',
          };
        }
        return { actionType: 'AUTO', actionData: {}, reason: 'Ring suicida', skip: true };
      }
      return {
        actionType: pc.data?.choiceAction || 'PLAYER_TARGET_SPELL_CHOICE',
        actionData: {
          targetPlayer: 'opponent',
          targetZoneIndex: pickOpp.i,
          ...(pc.data || {}),
        },
        reason: burnLethal ? 'Ring letal' : `Ring em ${pickOpp.m?.name}`,
      };
    }
    default:
      return null;
  }
}

/**
 * Avalia se vale ativar uma trap/quick setada manualmente (turno do oponente ou próprio).
 */
export function scoreManualResponse(
  card: any,
  duel: any,
  botUserId: number,
  difficulty: BotDifficulty,
): { score: number; reason: string } {
  const { oppMonsters, oppSpells, ownMonsters, myLp, oppLp } = boardSides(duel, botUserId);
  const profile = classifyCardEffect(card);
  const oppAtkSum = oppMonsters.reduce((s: number, x: { m: any; i: number }) => s + atkOf(x.m), 0);
  const bestGy = 0;
  let score = situationalEffectValue(profile, {
    oppMonsters: oppMonsters.length,
    oppSpells: oppSpells.length,
    gyMonsters: 0,
    ownMonsters: ownMonsters.length,
    oppLp,
    myLp,
    oppAtkSum,
    bestGyAtk: bestGy,
  });

  // Guardar negação/remoção se ameaça baixa (HARD+)
  const patience =
    difficulty === BotDifficulty.EXPERT ? 0.9 : difficulty === BotDifficulty.HARD ? 0.7 : 0.4;
  if (hasRole(profile, 'target_destroy_monster') || hasRole(profile, 'burn')) {
    const threat = Math.max(0, ...oppMonsters.map((x: { m: any; i: number }) => atkOf(x.m)));
    if (threat < 1800 && myLp > 3000) score -= 40 * patience;
    if (threat >= myLp) score += 50;
    if (threat >= oppLp && hasRole(profile, 'burn')) score += 80;
  }

  return { score, reason: `resposta ${card?.name || 'carta'} (${score.toFixed(0)})` };
}

/**
 * Gera candidatos de resposta no turno do oponente (traps manuais setadas).
 */
export function buildOpponentTurnResponses(duel: any, botUserId: number): BotActionCandidate[] {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  if (Number(duel.currentTurn) === (isP1 ? 1 : 2)) return []; // próprio turno — não usar aqui

  const own = isP1 ? duel.player1Field : duel.player2Field;
  const spellTrap: any[] = Array.isArray(own?.spellTrap) ? own.spellTrap : [];
  const out: BotActionCandidate[] = [];
  let n = 0;
  spellTrap.forEach((card, zoneIndex) => {
    if (!card || card.position !== 'set') return;
    const k = keyOf(card);
    const profile = classifyCardEffect(card);
    // Motor só permite traps manuais tipo player-target (Ring etc.)
    const manual =
      k.includes('ringofdestruction') ||
      hasRole(profile, 'burn') ||
      hasRole(profile, 'target_destroy_monster');
    if (!manual) return;
    n += 1;
    out.push({
      id: `resp${n}`,
      actionType: 'ACTIVATE_SPELL_TRAP',
      actionData: {
        cardId: card.idCarta || card.id || card.cardId,
        cardName: card.name || card.cardName,
        zoneIndex,
        position: 'face-up',
        spellActivatedFromField: true,
        originalSpellTrapPosition: 'set',
        instanceId: card.instanceId,
      },
      label: `Responder com ${card.name || card.cardName || 'armadilha'}`,
      category: 'trap',
    });
  });
  return out;
}
