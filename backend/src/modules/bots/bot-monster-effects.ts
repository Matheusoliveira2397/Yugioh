/**
 * Completa efeitos de monstro em 2 passos (START → CHOICE).
 * O gateway só emite eventos de modal no frontend — o bot precisa enviar a escolha.
 */

function atkOf(m: any): number {
  return Number(m?.atk ?? m?.attack ?? 0) || 0;
}
function keyOf(c: any): string {
  return String(c?.idCarta || c?.id || c?.cardId || c?.name || c?.cardName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function isMonster(c: any): boolean {
  return String(c?.type || c?.cardType || '')
    .toLowerCase()
    .includes('monster');
}
function isFaceUp(m: any): boolean {
  const p = String(m?.position || '').toLowerCase();
  return p === 'attack' || p === 'defense';
}
function isDragon(c: any): boolean {
  const t = String(c?.monsterType || c?.race || c?.attribute || '').toLowerCase();
  const n = String(c?.name || c?.cardName || '').toLowerCase();
  return t.includes('dragon') || n.includes('dragon');
}
function isDark(c: any): boolean {
  const a = String(c?.attribute || c?.attr || '').toLowerCase();
  return a === 'dark' || a.includes('dark') || a.includes('trevas');
}

function board(duel: any, botUserId: number) {
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
  return { isP1, own, opp, ownMonsters, oppMonsters, oppSpells };
}

function strongestOppFaceUp(oppMonsters: Array<{ m: any; i: number }>) {
  return [...oppMonsters]
    .filter((x) => isFaceUp(x.m))
    .sort((a, b) => atkOf(b.m) - atkOf(a.m))[0];
}

export function isMonsterEffectStart(actionType: string): boolean {
  const t = actionType.toUpperCase();
  return (
    t === 'START_CHAOS_SORCERER_EFFECT' ||
    t === 'START_CYBER_STEIN_EFFECT' ||
    t === 'START_DARK_ARMED_DRAGON_EFFECT' ||
    t === 'START_BLS_EFFECT' ||
    t === 'START_EXILED_FORCE_EFFECT' ||
    t === 'START_RED_EYES_DARKNESS_METAL_DRAGON_EFFECT'
    // START_SKILLED_DARK_MAGICIAN_EFFECT cria pendingChoice — resolvePending cuida
  );
}

/** START que cria pendingChoice no servidor (não precisa CHOICE imediato no mesmo tick). */
export function isPendingCreatingEffectStart(actionType: string): boolean {
  return actionType.toUpperCase() === 'START_SKILLED_DARK_MAGICIAN_EFFECT';
}

export function isSpecialSummonStart(actionType: string): boolean {
  const t = actionType.toUpperCase();
  return (
    t === 'START_DARK_ARMED_DRAGON_SUMMON' ||
    t === 'START_CHAOS_SORCERER_SUMMON' ||
    t === 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON'
  );
}

/**
 * Completa invocações especiais START → CHOICE (quando possível automaticamente).
 */
export function buildSpecialSummonChoice(
  startActionType: string,
  startData: Record<string, any>,
  duel: any,
  botUserId: number,
): { actionType: string; actionData: Record<string, any>; reason: string } | null {
  const { own, ownMonsters } = board(duel, botUserId);
  const freeZone = (Array.isArray(own?.monsters) ? own.monsters : []).findIndex((m: any) => !m);
  const t = startActionType.toUpperCase();

  if (t === 'START_DARK_ARMED_DRAGON_SUMMON') {
    const zoneIndex = freeZone >= 0 ? freeZone : startData?.zoneIndex;
    const cardId = startData?.cardId;
    if (zoneIndex === undefined || zoneIndex < 0 || !cardId) return null;
    return {
      actionType: 'DARK_ARMED_DRAGON_SUMMON_CHOICE',
      actionData: { cardId, zoneIndex },
      reason: `invocar DAD zona ${zoneIndex}`,
    };
  }

  if (t === 'START_CHAOS_SORCERER_SUMMON') {
    const gy: any[] = Array.isArray(own?.graveyard) ? own.graveyard : [];
    const lights = gy
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        const a = String(c?.attribute || '').toLowerCase();
        return isMonster(c) && (a.includes('light') || a.includes('luz'));
      });
    const darks = gy
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => isMonster(c) && isDark(c));
    if (!lights.length || !darks.length || freeZone < 0) return null;
    const light = lights[0];
    const dark = darks.find((d) => d.i !== light.i) || darks[0];
    if (light.i === dark.i && darks.length < 2) return null;
    return {
      actionType: 'CHAOS_SORCERER_SUMMON_CHOICE',
      actionData: {
        cardId: startData?.cardId,
        lightMonsterIndex: light.i,
        darkMonsterIndex: dark.i,
        lightMonsterGraveyardIndex: light.i,
        darkMonsterGraveyardIndex: dark.i,
        zoneIndex: freeZone >= 0 ? freeZone : startData?.zoneIndex ?? 0,
        position: startData?.position || 'attack',
      },
      reason: 'invocar Chaos Sorcerer',
    };
  }

  if (t === 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON') {
    const dragons = ownMonsters.filter(
      (x: { m: any; i: number }) => isDragon(x.m) && !keyOf(x.m).includes('redeyesdarknessmetal'),
    );
    if (!dragons.length || freeZone < 0) return null;
    const fodder = [...dragons].sort((a, b) => atkOf(a.m) - atkOf(b.m))[0];
    return {
      actionType: 'RED_EYES_DARKNESS_METAL_DRAGON_SUMMON_CHOICE',
      actionData: {
        cardId: startData?.cardId,
        dragonZoneIndex: fodder.i,
        zoneIndex: freeZone,
        position: startData?.position || 'attack',
      },
      reason: `REDMD sacrificando zona ${fodder.i}`,
    };
  }

  return null;
}

export function isMonsterEffectImmediate(actionType: string): boolean {
  const t = actionType.toUpperCase();
  return (
    t === 'ACTIVATE_CHAOS_EMPEROR_DRAGON_EFFECT' ||
    t === 'OBELISK_EFFECT' ||
    t === 'BREAKER_REMOVE_COUNTER'
  );
}

/**
 * Monta o payload *_CHOICE após um START_*_EFFECT bem-sucedido.
 * Retorna null se não houver alvo/condição válida.
 */
export function buildMonsterEffectChoice(
  startActionType: string,
  startData: Record<string, any>,
  duel: any,
  botUserId: number,
): { actionType: string; actionData: Record<string, any>; reason: string } | null {
  const { own, ownMonsters, oppMonsters, oppSpells } = board(duel, botUserId);
  const monsterZoneIndex = startData?.monsterZoneIndex;
  const strongest = strongestOppFaceUp(oppMonsters);
  const t = startActionType.toUpperCase();

  if (t === 'START_CHAOS_SORCERER_EFFECT') {
    if (!strongest) return null;
    return {
      actionType: 'CHAOS_SORCERER_EFFECT_CHOICE',
      actionData: {
        monsterZoneIndex,
        targetPlayer: 'opponent',
        targetZoneIndex: strongest.i,
      },
      reason: `banir ${strongest.m?.name || 'alvo'}`,
    };
  }

  if (t === 'START_EXILED_FORCE_EFFECT') {
    if (!strongest) return null;
    return {
      actionType: 'EXILED_FORCE_CHOICE',
      actionData: {
        monsterZoneIndex,
        targetPlayer: 'opponent',
        targetZoneIndex: strongest.i,
      },
      reason: `destruir ${strongest.m?.name || 'alvo'}`,
    };
  }

  if (t === 'START_BLS_EFFECT') {
    if (strongest) {
      return {
        actionType: 'BLS_EFFECT_CHOICE',
        actionData: {
          monsterZoneIndex,
          effectNumber: 1,
          targetPlayer: 'opponent',
          targetZoneIndex: strongest.i,
        },
        reason: `BLS banir ${strongest.m?.name || 'alvo'}`,
      };
    }
    // Sem alvo: efeito 2 (ataque adicional) se o motor aceitar sem target
    return {
      actionType: 'BLS_EFFECT_CHOICE',
      actionData: {
        monsterZoneIndex,
        effectNumber: 2,
        targetPlayer: undefined,
        targetZoneIndex: undefined,
      },
      reason: 'BLS segundo ataque',
    };
  }

  if (t === 'START_DARK_ARMED_DRAGON_EFFECT') {
    const gy: any[] = Array.isArray(own?.graveyard) ? own.graveyard : [];
    const darkIdx = gy.findIndex((c) => isMonster(c) && isDark(c));
    if (darkIdx < 0) return null;

    // Preferir monstro oponente; senão backrow
    if (strongest) {
      return {
        actionType: 'DARK_ARMED_DRAGON_EFFECT_CHOICE',
        actionData: {
          monsterZoneIndex,
          darkGraveyardIndex: darkIdx,
          targetPlayer: 'opponent',
          targetType: 'monster',
          targetZoneIndex: strongest.i,
        },
        reason: `DAD destruir ${strongest.m?.name || 'monstro'}`,
      };
    }
    if (oppSpells.length) {
      return {
        actionType: 'DARK_ARMED_DRAGON_EFFECT_CHOICE',
        actionData: {
          monsterZoneIndex,
          darkGraveyardIndex: darkIdx,
          targetPlayer: 'opponent',
          targetType: 'spellTrap',
          targetZoneIndex: oppSpells[0].i,
        },
        reason: `DAD destruir backrow zona ${oppSpells[0].i}`,
      };
    }
    return null;
  }

  if (t === 'START_CYBER_STEIN_EFFECT') {
    const extra: any[] = Array.isArray(own?.extraDeck) ? own.extraDeck : [];
    if (!extra.length) return null;
    let bestIdx = 0;
    let bestAtk = -1;
    extra.forEach((c, i) => {
      const a = atkOf(c);
      if (a > bestAtk) {
        bestAtk = a;
        bestIdx = i;
      }
    });
    return {
      actionType: 'CYBER_STEIN_EFFECT_CHOICE',
      actionData: { monsterZoneIndex, extraDeckIndex: bestIdx },
      reason: `Cyber Stein → ${extra[bestIdx]?.name || 'Extra'}`,
    };
  }

  if (t === 'START_RED_EYES_DARKNESS_METAL_DRAGON_EFFECT') {
    const hand: any[] = Array.isArray(own?.hand) ? own.hand : [];
    const gy: any[] = Array.isArray(own?.graveyard) ? own.graveyard : [];
    const freeZone = (Array.isArray(own?.monsters) ? own.monsters : []).findIndex((m: any) => !m);
    if (freeZone < 0) return null;

    const handDragons = hand
      .map((c, i) => ({ c, i }))
      .filter((x) => isMonster(x.c) && isDragon(x.c) && !keyOf(x.c).includes('redeyesdarknessmetal'));
    const gyDragons = gy
      .map((c, i) => ({ c, i }))
      .filter((x) => isMonster(x.c) && isDragon(x.c));

    const bestHand = [...handDragons].sort((a, b) => atkOf(b.c) - atkOf(a.c))[0];
    const bestGy = [...gyDragons].sort((a, b) => atkOf(b.c) - atkOf(a.c))[0];

    let pick: { source: 'hand' | 'graveyard'; cardIndex: number; name: string } | null = null;
    if (bestHand && bestGy) {
      pick =
        atkOf(bestHand.c) >= atkOf(bestGy.c)
          ? { source: 'hand', cardIndex: bestHand.i, name: bestHand.c?.name }
          : { source: 'graveyard', cardIndex: bestGy.i, name: bestGy.c?.name };
    } else if (bestHand) {
      pick = { source: 'hand', cardIndex: bestHand.i, name: bestHand.c?.name };
    } else if (bestGy) {
      pick = { source: 'graveyard', cardIndex: bestGy.i, name: bestGy.c?.name };
    }
    if (!pick) return null;

    return {
      actionType: 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT_CHOICE',
      actionData: {
        monsterZoneIndex,
        source: pick.source,
        cardIndex: pick.cardIndex,
        zoneIndex: freeZone,
        position: 'attack',
      },
      reason: `REDMD invocar ${pick.name || 'dragão'}`,
    };
  }

  void ownMonsters;
  return null;
}

/** Pode o monstro ainda usar efeito neste turno? */
export function canUseMonsterEffect(monster: any): boolean {
  if (!monster) return false;
  if (monster.effectUsedThisTurn === true) return false;
  if (monster.effectUsed === true) return false;
  if (monster.cannotActivateEffect === true) return false;
  return true;
}
