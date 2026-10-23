/**
 * Decisões de Battle Phase: ordem de ataques, lethal e trades.
 */

import { BotActionCandidate } from './bot-action.types';

function atkOf(m: any): number {
  return Number(m?.atk ?? m?.attack ?? 0) || 0;
}
function defOf(m: any): number {
  return Number(m?.def ?? m?.defense ?? 0) || 0;
}

export interface AttackEval {
  action: BotActionCandidate;
  score: number;
  reason: string;
  damage: number;
  destroys: boolean;
  lethalLine: boolean;
}

function monsterAt(ctxMonsters: Array<{ m: any; i: number }>, idx: number | null | undefined) {
  if (idx === null || idx === undefined) return null;
  return ctxMonsters.find((x) => x.i === idx)?.m || null;
}

/**
 * Avalia um único ataque.
 */
export function evaluateAttack(
  action: BotActionCandidate,
  myMonsters: Array<{ m: any; i: number }>,
  oppMonsters: Array<{ m: any; i: number }>,
  myLp: number,
  oppLp: number,
  risk: number,
): AttackEval {
  const data = action.actionData || {};
  const attacker = monsterAt(myMonsters, data.attackerZoneIndex);
  const atk = atkOf(attacker);
  if (!attacker) {
    return { action, score: -200, reason: 'sem atacante', damage: 0, destroys: false, lethalLine: false };
  }

  // Direto
  if (data.targetZoneIndex === null || data.targetZoneIndex === undefined) {
    if (oppMonsters.length > 0) {
      return { action, score: -250, reason: 'direto ilegal', damage: 0, destroys: false, lethalLine: false };
    }
    const lethal = atk >= oppLp;
    return {
      action,
      score: lethal ? 400 : 170 + atk / 25,
      reason: lethal ? `letal direto (${atk})` : `direto ${atk}`,
      damage: atk,
      destroys: false,
      lethalLine: lethal,
    };
  }

  const target = monsterAt(oppMonsters, data.targetZoneIndex);
  if (!target) {
    return { action, score: -100, reason: 'alvo inválido', damage: 0, destroys: false, lethalLine: false };
  }

  const pos = String(target.position || '').toLowerCase();
  const faceDown = pos === 'set' || pos.includes('face-down') || pos.includes('facedown');
  const defMode = pos.includes('defense') || pos.includes('defence') || faceDown;
  // Proteções públicas conhecidas
  const protectedDestroy =
    target.cannotBeDestroyedByBattle === true ||
    target.indestructible === true ||
    /spirit.?reaper|marshmallon|god/i.test(String(target.name || target.cardName || ''));

  // Monstros virados para baixo escondem ATK/DEF e identidade: não usar
  // estatísticas privadas da engine para antecipar seu resultado.
  const oppAtk = faceDown ? 0 : atkOf(target);
  const oppDef = faceDown ? 0 : defOf(target);
  const strength = defMode ? oppDef : oppAtk;
  const wins = !faceDown && atk > strength && !protectedDestroy;
  const damage = defMode ? 0 : Math.max(0, atk - oppAtk);
  const selfDamage = !faceDown && defMode
    ? Math.max(0, oppDef - atk)
    : !faceDown ? Math.max(0, oppAtk - atk) : 0;
  const suicide = !faceDown && !defMode && selfDamage > 0;

  let score = 0;
  let reason = action.label;

  if (faceDown) {
    // Risco calculado só com informação pública. Monstro fraco não deve
    // atacar cegamente quando há alternativa mais segura.
    score = Math.max(-70, Math.min(75, (atk - 1600) / 30 + 25 * risk));
    if (myLp <= 1500 && atk < 1800) score -= 30;
    reason = 'investigar monstro oculto (DEF desconhecida)';
  } else if (wins) {
    score = 155 + strength / 22 + damage / 18;
    reason = `destrói (dano ${damage})`;
    // Abre direto no restante apenas quando realmente destrói o bloqueador.
    const otherAtk = myMonsters
      .filter((x) => x.i !== data.attackerZoneIndex)
      .reduce((s, x) => s + (String(x.m.position || '').includes('attack') && !x.m.attackedThisTurn ? atkOf(x.m) : 0), 0);
    if (oppMonsters.length === 1 && otherAtk + damage >= oppLp) {
      score += 80;
      reason += ' → abre lethal';
    }
  } else if (suicide || selfDamage > 0) {
    if (myLp <= selfDamage) score = -350;
    else if (myLp < 1500) score = -115 + risk * 20;
    else score = -95 + risk * 25;
    reason = `perde LP sem eliminar alvo (-${selfDamage})`;
  } else if (!defMode && atk === oppAtk && !protectedDestroy) {
    score = myLp > oppLp ? -15 : 40;
    reason = 'troca de monstros';
  } else if (protectedDestroy) {
    score = damage > 0 ? 40 + damage / 24 : -35;
    reason = 'alvo protegido contra destruição';
  } else {
    score = -25;
    reason = 'ataque sem vantagem';
  }

  // Atingir um monstro em defesa não gera dano de batalha ao oponente
  // sem um efeito explícito de perfuração: jamais marcar ataque letal aqui.
  const lethalLine = !defMode && wins && damage >= oppLp;
  if (lethalLine) score += 120;

  return { action, score, reason, damage, destroys: wins, lethalLine };
}

/**
 * Ordena ataques para maximizar lethal / limpeza.
 * Em dificuldade alta, prioriza linhas que matam neste turno.
 */
export function orderAttackActions(
  attacks: BotActionCandidate[],
  myMonsters: Array<{ m: any; i: number }>,
  oppMonsters: Array<{ m: any; i: number }>,
  myLp: number,
  oppLp: number,
  risk: number,
): AttackEval[] {
  const evaluated = attacks.map((a) => evaluateAttack(a, myMonsters, oppMonsters, myLp, oppLp, risk));

  // Preferir lethal direto > lethal após limpeza > melhor trade
  evaluated.sort((a, b) => {
    if (a.lethalLine !== b.lethalLine) return a.lethalLine ? -1 : 1;
    if (a.destroys !== b.destroys) return a.destroys ? -1 : 1;
    return b.score - a.score;
  });

  // Simulação rasa: se múltiplos diretos, atacar com o maior primeiro só se não for overkill necessário
  const directs = evaluated.filter((e) => e.action.actionData?.targetZoneIndex == null);
  if (directs.length && oppMonsters.length === 0) {
    const sorted = [...directs].sort((a, b) => b.damage - a.damage);
    let remaining = oppLp;
    for (const d of sorted) {
      if (remaining <= 0) d.score -= 50; // overkill desnecessário no fim
      remaining -= d.damage;
      if (d.damage >= oppLp) d.score += 50; // um monstro já mata
    }
    evaluated.sort((a, b) => b.score - a.score);
  }

  return evaluated;
}

export function bestAttackScore(
  legal: BotActionCandidate[],
  myMonsters: Array<{ m: any; i: number }>,
  oppMonsters: Array<{ m: any; i: number }>,
  myLp: number,
  oppLp: number,
  risk: number,
): number {
  const attacks = legal.filter((a) => a.category === 'attack');
  if (!attacks.length) return -999;
  const ordered = orderAttackActions(attacks, myMonsters, oppMonsters, myLp, oppLp, risk);
  return ordered[0]?.score ?? -999;
}
