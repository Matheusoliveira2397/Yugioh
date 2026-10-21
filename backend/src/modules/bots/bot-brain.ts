import { BotDifficulty } from './entities/managed-bot.entity';
import { TurnPhase } from '../duels/entities/duel.entity';

export type BotIntent =
  | { kind: 'ACTIVATE_SPELL'; card: any; zoneIndex: number; score: number; reason: string }
  | { kind: 'SUMMON'; card: any; zoneIndex: number; position: 'attack' | 'set'; special?: 'CYBER_DRAGON'; score: number; reason: string }
  | { kind: 'SET_TRAP'; card: any; zoneIndex: number; score: number; reason: string }
  | { kind: 'ATTACK'; attackerZoneIndex: number; targetZoneIndex: number | null; score: number; reason: string }
  | { kind: 'NEXT_PHASE'; score: number; reason: string }
  | { kind: 'END_TURN'; score: number; reason: string };

const SIMPLE_SPELL_KEYS = [
  'potofgreed',
  'upstartgoblin',
  'raigeki',
  'darkhole',
  'heavystorm',
  'harpiesfeatherduster',
  'carddestruction',
  'reload',
  'fissure',
  'smashingground',
  'hammershot',
  'gianttrunade',
  'swordsofrevealinglight',
  'hinotama',
  'waboku',
  'bannerofcourage',
  'doublesummon',
  'jarofgreed',
];

const TARGET_SPELL_KEYS = [
  'mysticalspacetyphoon',
  'changeofheart',
  'braincontrol',
  'monsterreborn',
  'soultaker',
  'confiscation',
  'gracefulcharity',
  'theforcefulsentry',
  'forcefulsentry',
  'lightningstorm',
  'unitedwestand',
  'magepower',
  'prematureburial',
  'autonomousactionunit',
  'monsterreincarnation',
  'reinforcementofthearmy',
];

function cardKey(card: any): string {
  return String(card?.idCarta || card?.id || card?.cardId || card?.name || card?.cardName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function cardName(card: any): string {
  return String(card?.name || card?.cardName || 'carta');
}

function isSpell(card: any): boolean {
  return String(card?.type || card?.cardType || '').toLowerCase().includes('spell');
}
function isTrap(card: any): boolean {
  return String(card?.type || card?.cardType || '').toLowerCase().includes('trap');
}
function isMonster(card: any): boolean {
  return String(card?.type || card?.cardType || '').toLowerCase().includes('monster');
}
function atkOf(m: any): number {
  return Number(m?.atk ?? m?.attack ?? 0) || 0;
}
function defOf(m: any): number {
  return Number(m?.def ?? m?.defense ?? 0) || 0;
}
function freeZone(zones: any[]): number | undefined {
  const arr = Array.isArray(zones) ? zones : [];
  for (let i = 0; i < 5; i++) if (!arr[i]) return i;
  return undefined;
}
function canAttack(m: any): boolean {
  if (!m || m.position !== 'attack') return false;
  if (m.cannotAttackThisTurn === true) return false;
  const attacks = Number(m.attacksThisTurn || 0);
  const max =
    m.canAttackAgainThisTurn === true ||
    cardKey(m).includes('matazathezapper') ||
    cardKey(m).includes('cybertwindragon')
      ? 2
      : 1;
  if (attacks >= max) return false;
  if (m.attackedThisTurn === true && m.canAttackAgainThisTurn !== true && attacks >= 1) return false;
  return true;
}

function difficultyProfile(d: BotDifficulty) {
  switch (d) {
    case BotDifficulty.EASY:
      return { aggression: 0.55, spellBias: 0.7, risk: 0.35, trapBias: 0.4, noiseNoise: 0.25 };
    case BotDifficulty.NORMAL:
      return { aggression: 0.85, spellBias: 1.0, risk: 0.55, trapBias: 0.75, scoreNoise: 0.08 };
    case BotDifficulty.HARD:
      return { aggression: 1.1, spellBias: 1.2, risk: 0.75, trapBias: 1.0, scoreNoise: 0.03 };
    case BotDifficulty.EXPERT:
      return { aggression: 1.25, spellBias: 1.35, risk: 0.9, trapBias: 1.1, scoreNoise: 0 };
    default:
      return { aggression: 0.85, spellBias: 1.0, risk: 0.55, trapBias: 0.75, scoreNoise: 0.08 };
  }
}

function spellBaseScore(key: string, ctx: BoardCtx): number {
  const oppAtkBoard = ctx.oppMonsters.reduce((s, x) => s + atkOf(x.m), 0);
  const ownAtkBoard = ctx.ownMonsters.reduce((s, x) => s + atkOf(x.m), 0);
  if (key.includes('potofgreed') || key.includes('upstartgoblin') || key.includes('jarofgreed')) return 90;
  if (key.includes('raigeki') || key.includes('darkhole')) return ctx.oppMonsters.length ? 70 + oppAtkBoard / 40 : -50;
  if (key.includes('heavystorm') || key.includes('harpiesfeatherduster') || key.includes('gianttrunade'))
    return ctx.oppSpells.length ? 65 + ctx.oppSpells.length * 15 : -40;
  if (key.includes('fissure') || key.includes('smashingground') || key.includes('hammershot') || key.includes('soultaker'))
    return ctx.oppMonsters.length ? 55 + Math.min(40, oppAtkBoard / 50) : -40;
  if (key.includes('mysticalspacetyphoon')) return ctx.oppSpells.length ? 60 : -30;
  if (key.includes('changeofheart') || key.includes('braincontrol'))
    return ctx.oppMonsters.length ? 75 + Math.min(50, Math.max(...ctx.oppMonsters.map((x) => atkOf(x.m)), 0) / 40) : -40;
  if (key.includes('monsterreborn') || key.includes('premature') || key.includes('autonomous'))
    return ctx.gyMonsters.length ? 70 + Math.min(40, Math.max(...ctx.gyMonsters.map(atkOf), 0) / 50) : -40;
  if (key.includes('unitedwestand') || key.includes('magepower'))
    return ctx.ownMonsters.length ? 50 + ownAtkBoard / 80 : -40;
  if (key.includes('swordsofrevealinglight') || key.includes('waboku')) return ctx.oppMonsters.length ? 45 : 10;
  if (key.includes('hinotama')) return ctx.oppLp <= 1200 ? 95 : 25;
  if (key.includes('confiscation') || key.includes('forcefulsentry') || key.includes('gracefulcharity')) return 55;
  if (key.includes('lightningstorm')) return ctx.oppMonsters.length >= 2 || ctx.oppSpells.length >= 2 ? 70 : 20;
  if (key.includes('doublesummon') || key.includes('reinforcementofthearmy') || key.includes('reload') || key.includes('carddestruction'))
    return 40;
  return 30;
}

interface BoardCtx {
  ownLp: number;
  oppLp: number;
  hand: any[];
  ownMonsters: Array<{ m: any; i: number }>;
  oppMonsters: Array<{ m: any; i: number }>;
  ownSpells: Array<{ c: any; i: number }>;
  oppSpells: Array<{ c: any; i: number }>;
  gyMonsters: any[];
  freeMonster: number | undefined;
  freeSpell: number | undefined;
  phase: TurnPhase;
}

function buildCtx(duel: any, botUserId: number): BoardCtx {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const ownLp = Number(isP1 ? duel.player1LifePoints : duel.player2LifePoints) || 8000;
  const oppLp = Number(isP1 ? duel.player2LifePoints : duel.player1LifePoints) || 8000;
  const ownMonsters = (Array.isArray(own?.monsters) ? own.monsters : [])
    .map((m: any, i: number) => ({ m, i }))
    .filter((x: { m: any }) => !!x.m);
  const oppMonsters = (Array.isArray(opp?.monsters) ? opp.monsters : [])
    .map((m: any, i: number) => ({ m, i }))
    .filter((x: { m: any }) => !!x.m);
  const ownSpells = (Array.isArray(own?.spellTrap) ? own.spellTrap : [])
    .map((c: any, i: number) => ({ c, i }))
    .filter((x: { c: any }) => !!x.c);
  const oppSpells = (Array.isArray(opp?.spellTrap) ? opp.spellTrap : [])
    .map((c: any, i: number) => ({ c, i }))
    .filter((x: { c: any }) => !!x.c);
  const gyMonsters = [...(own?.graveyard || []), ...(opp?.graveyard || [])].filter((c) => isMonster(c));
  return {
    ownLp,
    oppLp,
    hand: Array.isArray(own?.hand) ? own.hand : [],
    ownMonsters,
    oppMonsters,
    ownSpells,
    oppSpells,
    gyMonsters,
    freeMonster: freeZone(own?.monsters),
    freeSpell: freeZone(own?.spellTrap),
    phase: duel.currentPhase,
  };
}

function attackScore(
  attacker: any,
  target: { m: any; i: number } | null,
  ctx: BoardCtx,
  profile: ReturnType<typeof difficultyProfile>,
): { score: number; reason: string; targetZoneIndex: number | null } {
  const atk = atkOf(attacker);
  if (!target) {
    // direto
    const lethal = atk >= ctx.oppLp;
    const score = (lethal ? 200 : 40 + atk / 50) * profile.aggression + (ctx.oppMonsters.length ? -80 : 30);
    return {
      score,
      reason: lethal ? `ataque direto letal (${atk})` : `ataque direto (${atk})`,
      targetZoneIndex: null,
    };
  }
  const pos = String(target.m.position || '');
  const faceDown = pos === 'set';
  const strength = pos.includes('defense') || faceDown ? defOf(target.m) : atkOf(target.m);
  const destroys = atk > strength;
  const damage = pos.includes('defense') || faceDown ? 0 : Math.max(0, atk - strength);
  const suicide = !destroys && !faceDown && atk < strength;
  let score = 0;
  if (destroys) score = 70 + strength / 40 + damage / 30;
  else if (faceDown) score = 15 * profile.risk; // risco
  else if (suicide) score = -60 + profile.risk * 20;
  else score = 10 + damage / 40;
  score *= profile.aggression;
  return {
    score,
    reason: destroys
      ? `destrói ${cardName(target.m)}`
      : faceDown
        ? `atacar set ${cardName(target.m)}`
        : `troca com ${cardName(target.m)}`,
    targetZoneIndex: target.i,
  };
}

/**
 * Cérebro heurístico: gera candidatos, pontua o estado e escolhe a melhor jogada.
 * Não é machine learning — melhora com regras/avaliação, não com "treino" automático.
 */
export class BotBrain {
  choose(duel: any, botUserId: number, difficulty: BotDifficulty): BotIntent | null {
    const ctx = buildCtx(duel, botUserId);
    const profile = difficultyProfile(difficulty);
    const intents: BotIntent[] = [];

    if (ctx.phase === TurnPhase.MAIN1 || ctx.phase === TurnPhase.MAIN2) {
      // Magias
      if (ctx.freeSpell !== undefined) {
        for (const card of ctx.hand.filter(isSpell)) {
          const key = cardKey(card);
          const isSimple = SIMPLE_SPELL_KEYS.some((k) => key.includes(k));
          const isTarget = TARGET_SPELL_KEYS.some((k) => key.includes(k));
          if (!isSimple && !isTarget) continue;
          if (key.includes('mysticalspacetyphoon') && !ctx.oppSpells.length) continue;
          if ((key.includes('changeofheart') || key.includes('braincontrol') || key.includes('soultaker')) && !ctx.oppMonsters.length)
            continue;
          if ((key.includes('monsterreborn') || key.includes('premature') || key.includes('autonomous')) && !ctx.gyMonsters.length)
            continue;
          if ((key.includes('unitedwestand') || key.includes('magepower')) && !ctx.ownMonsters.length) continue;
          let score = spellBaseScore(key, ctx) * profile.spellBias;
          if (ctx.phase === TurnPhase.MAIN2) score += isTarget ? 8 : -5;
          if (ctx.ownLp < 2000 && (key.includes('raigeki') || key.includes('changeofheart') || key.includes('darkhole')))
            score += 25;
          intents.push({
            kind: 'ACTIVATE_SPELL',
            card,
            zoneIndex: ctx.freeSpell,
            score,
            reason: `ativar ${cardName(card)}`,
          });
        }
      }

      // Invocações (MAIN1 preferencial)
      if (ctx.phase === TurnPhase.MAIN1 && ctx.freeMonster !== undefined) {
        const cyber = ctx.hand.find((c) => cardKey(c).includes('cyberdragon') && !cardKey(c).includes('twin'));
        if (cyber && ctx.oppMonsters.length) {
          intents.push({
            kind: 'SUMMON',
            card: cyber,
            zoneIndex: ctx.freeMonster,
            position: 'attack',
            special: 'CYBER_DRAGON',
            score: 85 + atkOf(cyber) / 40,
            reason: `invocação especial ${cardName(cyber)}`,
          });
        }
        for (const card of ctx.hand.filter((c) => isMonster(c) && Number(c?.level || 0) > 0 && Number(c.level) <= 4)) {
          const atk = atkOf(card);
          const def = defOf(card);
          const strongestOpp = Math.max(0, ...ctx.oppMonsters.map((x) => atkOf(x.m)));
          const canBeat = atk > strongestOpp || !ctx.oppMonsters.length;
          let position: 'attack' | 'set' = 'attack';
          let score = 35 + atk / 45;
          if (!canBeat && def >= atk) {
            position = 'set';
            score = 28 + def / 50;
          }
          if (difficulty === BotDifficulty.EASY && atk < 1500) {
            position = 'set';
            score = 20 + def / 60;
          }
          if (ctx.phase === TurnPhase.MAIN1) score += 10;
          intents.push({
            kind: 'SUMMON',
            card,
            zoneIndex: ctx.freeMonster,
            position,
            score,
            reason: `${position === 'attack' ? 'invocar' : 'setar'} ${cardName(card)}`,
          });
        }
      }

      // Traps
      if (ctx.freeSpell !== undefined && difficulty !== BotDifficulty.EASY) {
        for (const card of ctx.hand.filter(isTrap)) {
          intents.push({
            kind: 'SET_TRAP',
            card,
            zoneIndex: ctx.freeSpell,
            score: 22 * profile.trapBias + (ctx.oppMonsters.length ? 8 : 0),
            reason: `setar armadilha ${cardName(card)}`,
          });
        }
      }

      // Avançar / encerrar
      const attackers = ctx.ownMonsters.filter((x) => canAttack(x.m));
      if (ctx.phase === TurnPhase.MAIN1) {
        const battleValue =
          attackers.length > 0
            ? 30 + attackers.reduce((s, x) => s + atkOf(x.m), 0) / 60
            : ctx.ownMonsters.length
              ? 5
              : -10;
        intents.push({
          kind: 'NEXT_PHASE',
          score: battleValue * profile.aggression,
          reason: attackers.length ? 'ir para batalha com atacantes' : 'avançar fase',
        });
      } else {
        intents.push({ kind: 'END_TURN', score: 15, reason: 'encerrar turno' });
      }
    }

    if (ctx.phase === TurnPhase.BATTLE) {
      for (const { m, i } of ctx.ownMonsters.filter((x) => canAttack(x.m))) {
        // direto
        const direct = attackScore(m, null, ctx, profile);
        intents.push({
          kind: 'ATTACK',
          attackerZoneIndex: i,
          targetZoneIndex: direct.targetZoneIndex,
          score: direct.score,
          reason: `${cardName(m)}: ${direct.reason}`,
        });
        for (const t of ctx.oppMonsters) {
          const scored = attackScore(m, t, ctx, profile);
          intents.push({
            kind: 'ATTACK',
            attackerZoneIndex: i,
            targetZoneIndex: scored.targetZoneIndex,
            score: scored.score,
            reason: `${cardName(m)}: ${scored.reason}`,
          });
        }
      }
      intents.push({
        kind: 'NEXT_PHASE',
        score: 12,
        reason: 'sair da batalha',
      });
    }

    if (!intents.length) return null;

    // Ruído leve em dificuldades baixas (menos "robótico", mais erros)
    const noise = profile.scoreNoise ?? 0;
    for (const intent of intents) {
      if (noise > 0) {
        intent.score += (Math.random() * 2 - 1) * 20 * noise;
      }
    }

    intents.sort((a, b) => b.score - a.score);
    return intents[0];
  }
}
