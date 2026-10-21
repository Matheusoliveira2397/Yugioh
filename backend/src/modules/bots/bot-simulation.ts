/**
 * Simulador leve de decisões da IA (sem gateway/DB).
 * Útil para validar heurísticas, combos e diferenças de dificuldade.
 */

import { BotDifficulty } from './entities/managed-bot.entity';
import { buildLegalActions, situationKey } from './bot-legal-actions';
import { scoreLegalActions } from './bot-strategy';
import { detectCombos } from './bot-combo';
import { analyzeDeck, getDeckProfile } from './bot-deck-profile';
import { evaluateBoard } from './bot-evaluator';
import { classifyCardEffect } from './bot-effect-taxonomy';
import { decidePendingChoice } from './bot-response';
import { TurnPhase } from '../duels/entities/duel.entity';
import { BotLesson } from './bot-action.types';
import {
  appendLessons,
  defaultMemoryPath,
  loadLessons,
  recallLessons,
  memoryStats,
} from './bot-memory-store';

export interface SimDecisionLog {
  turn: number;
  phase: string;
  botUserId: number;
  difficulty: BotDifficulty;
  actionLabel: string;
  actionType: string;
  reason: string;
  score: number;
  legalCount: number;
  combos: string[];
  situationKey?: string;
  category?: string;
  actionData?: Record<string, any>;
  lpMine?: number;
  lpOpp?: number;
}

export interface SimDuelResult {
  winner: number | null;
  turns: number;
  decisions: SimDecisionLog[];
  invalidAttempts: number;
  errors: string[];
  deckStyles: Record<number, string>;
}

function emptyField() {
  return {
    hand: [] as any[],
    deck: [] as any[],
    monsters: [null, null, null, null, null] as any[],
    spellTrap: [null, null, null, null, null] as any[],
    graveyard: [] as any[],
  };
}

export function makeTestCard(partial: Record<string, any>): any {
  return {
    idCarta: partial.idCarta || partial.name?.replace(/\s/g, '') || 'Card',
    name: partial.name || 'Card',
    type: partial.type || 'Spell',
    atk: partial.atk ?? 0,
    def: partial.def ?? 0,
    level: partial.level ?? 4,
    position: partial.position,
    description: partial.description || '',
    ...partial,
  };
}

/** Monta um duelo mínimo para testes unitários / simulação. */
export function makeTestDuel(opts: {
  botId?: number;
  oppId?: number;
  phase?: TurnPhase;
  turn?: 1 | 2;
  myLp?: number;
  oppLp?: number;
  hand?: any[];
  myMonsters?: any[];
  oppMonsters?: any[];
  mySpells?: any[];
  oppSpells?: any[];
  myGy?: any[];
  oppGy?: any[];
  pendingChoice?: any;
}): any {
  const botId = opts.botId ?? 1;
  const oppId = opts.oppId ?? 2;
  const p1 = emptyField();
  const p2 = emptyField();
  const fill = (zones: any[], cards: any[] | undefined) => {
    if (!cards) return;
    cards.forEach((c, i) => {
      if (i < 5) zones[i] = c;
    });
  };
  p1.hand = opts.hand || [];
  fill(p1.monsters, opts.myMonsters);
  fill(p1.spellTrap, opts.mySpells);
  fill(p2.monsters, opts.oppMonsters);
  fill(p2.spellTrap, opts.oppSpells);
  p1.graveyard = opts.myGy || [];
  p2.graveyard = opts.oppGy || [];

  return {
    id: 'sim-duel',
    player1Id: botId,
    player2Id: oppId,
    player1LifePoints: opts.myLp ?? 8000,
    player2LifePoints: opts.oppLp ?? 8000,
    currentTurn: opts.turn ?? 1,
    currentPhase: opts.phase ?? TurnPhase.MAIN1,
    turnCounter: 1,
    player1Field: p1,
    player2Field: p2,
    pendingChoice: opts.pendingChoice || null,
  };
}

/**
 * Uma decisão da IA em estado estático (não avança o duelo real).
 */
export function simulateDecision(
  duel: any,
  botUserId: number,
  difficulty: BotDifficulty,
  lessons: BotLesson[] = [],
): SimDecisionLog | null {
  const legal = buildLegalActions(duel, botUserId);
  if (!legal.length) return null;
  const sit = situationKey(duel, botUserId);
  const recalled = lessons.length ? recallLessons(lessons, sit, 12) : [];
  const scored = scoreLegalActions(duel, botUserId, difficulty, legal, recalled);
  if (!scored) return null;
  const combos = detectCombos(duel, botUserId, legal);
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  return {
    turn: duel.turnCounter || 1,
    phase: String(duel.currentPhase),
    botUserId,
    difficulty,
    actionLabel: scored.action.label,
    actionType: scored.action.actionType,
    reason: scored.reason,
    score: scored.score,
    legalCount: legal.length,
    combos: combos.map((c) => c.id),
    situationKey: sit,
    category: scored.action.category,
    actionData: scored.action.actionData,
    lpMine: isP1 ? duel.player1LifePoints : duel.player2LifePoints,
    lpOpp: isP1 ? duel.player2LifePoints : duel.player1LifePoints,
  };
}

/**
 * Simula vários “ticks” de decisão em estados fornecidos (para stress/heurística).
 * Não executa o motor de regras — apenas registra o que a IA escolheria.
 */
export function runDecisionBattery(
  scenarios: Array<{ name: string; duel: any; botUserId: number; difficulty: BotDifficulty }>,
): {
  results: Array<{ name: string; decision: SimDecisionLog | null; board: number }>;
  summary: { total: number; withDecision: number; avgLegal: number };
} {
  const results = scenarios.map((s) => {
    const decision = simulateDecision(s.duel, s.botUserId, s.difficulty);
    const board = evaluateBoard(s.duel, s.botUserId).total;
    return { name: s.name, decision, board };
  });
  const withDecision = results.filter((r) => r.decision).length;
  const avgLegal =
    results.reduce((s, r) => s + (r.decision?.legalCount || 0), 0) / Math.max(1, results.length);
  return { results, summary: { total: results.length, withDecision, avgLegal } };
}

export function analyzeCoverage(cards: any[]): {
  total: number;
  knownRoles: number;
  fromDescription: number;
  fallbackOnly: number;
  byRole: Record<string, number>;
} {
  const byRole: Record<string, number> = {};
  let knownRoles = 0;
  let fromDescription = 0;
  let fallbackOnly = 0;
  for (const c of cards) {
    const before = classifyCardEffect(c);
    const hasDesc = !!(c.description || c.effect || c.cardText);
    if (before.roles.includes('generic_spell') || before.roles.includes('generic_trap') || before.roles.includes('utility_monster')) {
      if (!hasDesc) fallbackOnly += 1;
      else fromDescription += 1;
    } else {
      knownRoles += 1;
    }
    for (const r of before.roles) byRole[r] = (byRole[r] || 0) + 1;
  }
  return { total: cards.length, knownRoles, fromDescription, fallbackOnly, byRole };
}

/** Cenários-padrão para regressão da heurística (Tag Force-style checks). */
export function buildBenchmarkScenarios(difficulty: BotDifficulty = BotDifficulty.EXPERT) {
  return [
    {
      name: 'draw-first',
      duel: makeTestDuel({
        hand: [makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' })],
      }),
      botUserId: 1,
      difficulty,
      expectActionType: 'ACTIVATE_SPELL_TRAP',
    },
    {
      name: 'breaker-backrow',
      duel: makeTestDuel({
        myMonsters: [
          makeTestCard({
            name: 'Breaker the Magical Warrior',
            idCarta: 'BreakerTheMagicalWarrior',
            type: 'Monster',
            atk: 1900,
            position: 'attack',
            spellCounters: 1,
          }),
        ],
        oppSpells: [makeTestCard({ name: 'Mirror Force', type: 'Trap', position: 'set' })],
      }),
      botUserId: 1,
      difficulty,
      expectActionType: 'BREAKER_REMOVE_COUNTER',
    },
    {
      name: 'chaos-removal',
      duel: makeTestDuel({
        myMonsters: [
          makeTestCard({
            name: 'Chaos Sorcerer',
            idCarta: 'ChaosSorcerer',
            type: 'Monster',
            atk: 2300,
            position: 'attack',
          }),
        ],
        oppMonsters: [
          makeTestCard({ name: 'Boss', type: 'Monster', atk: 3000, position: 'attack' }),
        ],
      }),
      botUserId: 1,
      difficulty,
      expectActionType: 'START_CHAOS_SORCERER_EFFECT',
    },
    {
      name: 'hand-overflow-no-end',
      duel: makeTestDuel({
        phase: TurnPhase.MAIN2,
        hand: [
          makeTestCard({ name: 'Mystical Space Typhoon', idCarta: 'MysticalSpaceTyphoon', type: 'Spell' }),
          ...Array.from({ length: 7 }, (_, i) =>
            makeTestCard({ name: `Filler${i}`, idCarta: `F${i}`, type: 'Spell' }),
          ),
        ],
        oppSpells: [makeTestCard({ name: 'Set', type: 'Trap', position: 'set' })],
      }),
      botUserId: 1,
      difficulty,
      expectNotActionType: 'END_TURN',
    },
    {
      name: 'lethal-direct',
      duel: makeTestDuel({
        phase: TurnPhase.BATTLE,
        oppLp: 1500,
        myMonsters: [
          makeTestCard({ name: 'BEWD', type: 'Monster', atk: 3000, position: 'attack' }),
        ],
      }),
      botUserId: 1,
      difficulty,
      expectActionType: 'ATTACK',
    },
    {
      name: 'skilled-dm',
      duel: makeTestDuel({
        myMonsters: [
          makeTestCard({
            name: 'Skilled Dark Magician',
            idCarta: 'SkilledDarkMagician',
            type: 'Monster',
            atk: 1900,
            position: 'attack',
            spellCounters: 3,
          }),
        ],
        hand: [makeTestCard({ name: 'Dark Magician', idCarta: 'DarkMagician', type: 'Monster', atk: 2500 })],
      }),
      botUserId: 1,
      difficulty,
      expectActionType: 'START_SKILLED_DARK_MAGICIAN_EFFECT',
    },
  ];
}

export function runBenchmark(difficulty: BotDifficulty = BotDifficulty.EXPERT): {
  passed: number;
  failed: Array<{ name: string; got?: string; expected?: string }>;
  results: ReturnType<typeof runDecisionBattery>['results'];
} {
  const scenarios = buildBenchmarkScenarios(difficulty);
  const { results } = runDecisionBattery(scenarios);
  const failed: Array<{ name: string; got?: string; expected?: string }> = [];
  let passed = 0;
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i] as any;
    const d = results[i]?.decision;
    const got = d?.actionType;
    if (s.expectActionType && got !== s.expectActionType) {
      failed.push({ name: s.name, got, expected: s.expectActionType });
    } else if (s.expectNotActionType && got === s.expectNotActionType) {
      failed.push({ name: s.name, got, expected: `NOT ${s.expectNotActionType}` });
    } else {
      passed += 1;
    }
  }
  return { passed, failed, results };
}

/**
 * Self-play heurístico: aplica mutações simples no estado (não é o motor real).
 * Serve para stress-test de decisões e detectar loops / END_TURN com overflow.
 */
export function runHeuristicSelfPlay(opts?: {
  turns?: number;
  difficulty?: BotDifficulty;
}): {
  decisions: SimDecisionLog[];
  warnings: string[];
  finalHandP1: number;
  finalHandP2: number;
} {
  const difficulty = opts?.difficulty ?? BotDifficulty.EXPERT;
  const maxTurns = opts?.turns ?? 12;
  const warnings: string[] = [];
  const decisions: SimDecisionLog[] = [];

  const p1Hand = [
    makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' }),
    makeTestCard({ name: 'Gemini Elf', type: 'Monster', atk: 1900, level: 4 }),
    makeTestCard({ name: 'Trap Hole', idCarta: 'TrapHole', type: 'Trap' }),
    makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' }),
  ];
  const p2Hand = [
    makeTestCard({ name: 'Breaker the Magical Warrior', idCarta: 'BreakerTheMagicalWarrior', type: 'Monster', atk: 1600, level: 4 }),
    makeTestCard({ name: 'Mystical Space Typhoon', idCarta: 'MysticalSpaceTyphoon', type: 'Spell' }),
    makeTestCard({ name: 'Sakuretsu Armor', type: 'Trap' }),
  ];

  let duel = makeTestDuel({
    botId: 1,
    oppId: 2,
    turn: 1,
    phase: TurnPhase.MAIN1,
    hand: p1Hand,
    myMonsters: [],
    oppMonsters: [],
  });
  // Espelha mão do P2
  (duel as any).player2Field.hand = p2Hand;

  const advanceTurn = () => {
    const ending = Number(duel.currentTurn) === 1 ? (duel as any).player1Field : (duel as any).player2Field;
    for (const m of ending?.monsters || []) {
      if (!m) continue;
      m.attackedThisTurn = false;
      m.attacksThisTurn = 0;
      m.positionChangedThisTurn = false;
    }
    duel.currentTurn = duel.currentTurn === 1 ? 2 : 1;
    duel.turnCounter = (duel.turnCounter || 1) + 1;
    duel.currentPhase = TurnPhase.MAIN1;
  };

  for (let t = 0; t < maxTurns; t++) {
    const seat = Number(duel.currentTurn) === 1 ? 1 : 2;
    const botUserId = seat === 1 ? 1 : 2;
    const log = simulateDecision(duel, botUserId, difficulty);
    if (!log) {
      warnings.push(`turno ${t}: sem decisão (seat ${seat})`);
      break;
    }
    decisions.push(log);

    // Anti-loop: mesma jogada 3× seguidas → força avanço de turno
    const last3 = decisions.slice(-3);
    if (
      last3.length === 3 &&
      last3.every((d) => d.actionType === log.actionType && d.actionLabel === log.actionLabel)
    ) {
      warnings.push(`loop detectado (${log.actionType}); forçando END_TURN`);
      advanceTurn();
      continue;
    }

    const isP1 = botUserId === 1;
    const own = isP1 ? (duel as any).player1Field : (duel as any).player2Field;
    const handLen = Array.isArray(own.hand) ? own.hand.length : 0;

    if (log.actionType === 'END_TURN' && handLen > 6) {
      warnings.push(`END_TURN com mão=${handLen} (overflow)`);
    }

    // Mutação rasa só para avançar o loop (não simula efeitos reais)
    if (log.actionType === 'END_TURN') {
      advanceTurn();
    } else if (log.actionType === 'NEXT_PHASE') {
      if (duel.currentPhase === TurnPhase.MAIN1) duel.currentPhase = TurnPhase.BATTLE;
      else if (duel.currentPhase === TurnPhase.BATTLE) duel.currentPhase = TurnPhase.MAIN2;
      else advanceTurn();
    } else if (log.actionType === 'ATTACK') {
      const attacker = (own.monsters || []).find(
        (m: any) => m && String(m.position || '').includes('attack') && !m.attackedThisTurn,
      );
      if (attacker) {
        attacker.attackedThisTurn = true;
        attacker.attacksThisTurn = (Number(attacker.attacksThisTurn) || 0) + 1;
      }
      const opp = isP1 ? (duel as any).player2Field : (duel as any).player1Field;
      if (!(opp.monsters || []).some(Boolean) && attacker) {
        if (isP1) duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 8000) - (attacker.atk || 0));
        else duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 8000) - (attacker.atk || 0));
      }
    } else if (log.actionType === 'SUMMON_MONSTER' || log.actionType === 'SET_MONSTER') {
      const card = own.hand?.shift();
      if (card) {
        const zi = (own.monsters || []).findIndex((m: any) => !m);
        if (zi >= 0) {
          card.position = log.actionType === 'SET_MONSTER' ? 'set' : 'attack';
          if (/breaker/i.test(String(card.name || card.idCarta || ''))) card.spellCounters = 1;
          own.monsters[zi] = card;
        }
      }
    } else if (log.actionType === 'SET_SPELL_TRAP') {
      const card = own.hand?.shift();
      if (card) {
        const zi = (own.spellTrap || []).findIndex((c: any) => !c);
        if (zi >= 0) {
          card.position = 'set';
          own.spellTrap[zi] = card;
        }
      }
    } else if (log.actionType === 'ACTIVATE_SPELL_TRAP') {
      // Preferir remover do campo (já setada); senão da mão
      const fieldIdx = (own.spellTrap || []).findIndex((c: any) => !!c);
      if (fieldIdx >= 0) {
        const used = own.spellTrap[fieldIdx];
        own.spellTrap[fieldIdx] = null;
        own.graveyard = own.graveyard || [];
        own.graveyard.push(used);
      } else if (own.hand?.length) {
        own.graveyard = own.graveyard || [];
        own.graveyard.push(own.hand.shift());
      }
    } else if (log.actionType === 'BREAKER_REMOVE_COUNTER') {
      const m = (own.monsters || []).find(
        (c: any) => c && Number(c.spellCounters || 0) > 0,
      );
      if (m) m.spellCounters = Math.max(0, Number(m.spellCounters || 0) - 1);
      const opp = isP1 ? (duel as any).player2Field : (duel as any).player1Field;
      const si = (opp.spellTrap || []).findIndex((c: any) => !!c);
      if (si >= 0) opp.spellTrap[si] = null;
    } else if (log.actionType.startsWith('START_')) {
      // Consome 1 tick; pending real não é simulado aqui
      const m = (own.monsters || []).find(Boolean);
      if (m) m.effectUsedThisTurn = true;
    }
  }

  return {
    decisions,
    warnings,
    finalHandP1: ((duel as any).player1Field?.hand || []).length,
    finalHandP2: ((duel as any).player2Field?.hand || []).length,
  };
}

/** Pool GOAT-ish para self-play (treino). */
const TRAIN_POOL: Array<Record<string, any>> = [
  { name: 'Blue-Eyes White Dragon', type: 'Monster', atk: 3000, def: 2500, level: 8 },
  { name: 'Dark Magician', idCarta: 'DarkMagician', type: 'Monster', atk: 2500, def: 2100, level: 7 },
  { name: 'Gemini Elf', type: 'Monster', atk: 1900, def: 900, level: 4 },
  { name: 'Breaker the Magical Warrior', idCarta: 'BreakerTheMagicalWarrior', type: 'Monster', atk: 1600, def: 1000, level: 4 },
  { name: 'Chaos Sorcerer', idCarta: 'ChaosSorcerer', type: 'Monster', atk: 2300, def: 2000, level: 6 },
  { name: 'Skilled Dark Magician', idCarta: 'SkilledDarkMagician', type: 'Monster', atk: 1900, def: 1700, level: 4 },
  { name: 'Sangan', type: 'Monster', atk: 1000, def: 600, level: 3 },
  { name: 'Spirit Reaper', type: 'Monster', atk: 200, def: 200, level: 3 },
  { name: 'Snowman Eater', idCarta: 'SnowmanEater', type: 'Monster', atk: 0, def: 1900, level: 4 },
  { name: 'Exiled Force', idCarta: 'ExiledForce', type: 'Monster', atk: 1000, def: 1000, level: 4 },
  { name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' },
  { name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' },
  { name: 'Dark Hole', idCarta: 'DarkHole', type: 'Spell' },
  { name: 'Mystical Space Typhoon', idCarta: 'MysticalSpaceTyphoon', type: 'Spell' },
  { name: 'Monster Reborn', idCarta: 'MonsterReborn', type: 'Spell' },
  { name: 'Change of Heart', idCarta: 'ChangeOfHeart', type: 'Spell' },
  { name: 'Heavy Storm', idCarta: 'HeavyStorm', type: 'Spell' },
  { name: 'Premature Burial', idCarta: 'PrematureBurial', type: 'Spell' },
  { name: 'Snatch Steal', idCarta: 'SnatchSteal', type: 'Spell' },
  { name: 'Graceful Charity', idCarta: 'GracefulCharity', type: 'Spell' },
  { name: 'Mirror Force', idCarta: 'MirrorForce', type: 'Trap' },
  { name: 'Sakuretsu Armor', idCarta: 'SakuretsuArmor', type: 'Trap' },
  { name: 'Trap Hole', idCarta: 'TrapHole', type: 'Trap' },
  { name: 'Call of the Haunted', idCarta: 'CallOfTheHaunted', type: 'Trap' },
  { name: 'Torrential Tribute', idCarta: 'TorrentialTribute', type: 'Trap' },
  { name: 'Ring of Destruction', idCarta: 'RingOfDestruction', type: 'Trap' },
];

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTrainDeck(size = 20): any[] {
  const deck: any[] = [];
  const pool = shuffle(TRAIN_POOL);
  let i = 0;
  while (deck.length < size) {
    const base = pool[i % pool.length];
    deck.push(makeTestCard({ ...base, uid: `${base.name}-${deck.length}-${Math.random().toString(36).slice(2, 7)}` }));
    i += 1;
  }
  return shuffle(deck);
}

function drawCards(field: any, n: number) {
  field.deck = field.deck || [];
  field.hand = field.hand || [];
  for (let i = 0; i < n && field.deck.length; i++) {
    field.hand.push(field.deck.shift());
  }
}

function discardToHandLimit(field: any) {
  field.hand = field.hand || [];
  field.graveyard = field.graveyard || [];
  while (field.hand.length > 6) {
    // Descarta a de menor ATK / magia genérica (heurística de treino)
    let worst = 0;
    let worstScore = Infinity;
    field.hand.forEach((c: any, idx: number) => {
      const t = String(c.type || '').toLowerCase();
      let s = 50;
      if (t.includes('monster')) s = Number(c.atk || 0);
      if (/pot.?of.?greed|raigeki|reborn|change/i.test(String(c.name || ''))) s = 9999;
      if (s < worstScore) {
        worstScore = s;
        worst = idx;
      }
    });
    field.graveyard.push(field.hand.splice(worst, 1)[0]);
  }
}

export interface TrainingMatchResult {
  winner: 1 | 2 | null;
  ticks: number;
  decisions: SimDecisionLog[];
  lessonsCreated: number;
  finalLp: { p1: number; p2: number };
  warnings: string[];
}

/**
 * Partida completa heurística bot vs bot + recompensas → memória.
 */
export function runTrainingMatch(opts?: {
  difficultyP1?: BotDifficulty;
  difficultyP2?: BotDifficulty;
  maxTicks?: number;
  lessons?: BotLesson[];
  persist?: boolean;
  memoryPath?: string;
}): TrainingMatchResult {
  const diff1 = opts?.difficultyP1 ?? BotDifficulty.EXPERT;
  const diff2 = opts?.difficultyP2 ?? BotDifficulty.HARD;
  const maxTicks = opts?.maxTicks ?? 48;
  const memoryPath = opts?.memoryPath ?? defaultMemoryPath();
  const lessons = opts?.lessons ?? loadLessons(memoryPath);
  const warnings: string[] = [];
  const decisions: SimDecisionLog[] = [];

  const deck1 = buildTrainDeck(22);
  const deck2 = buildTrainDeck(22);
  const hand1 = deck1.splice(0, 5);
  const hand2 = deck2.splice(0, 5);

  let duel = makeTestDuel({
    botId: 1,
    oppId: 2,
    turn: 1,
    phase: TurnPhase.MAIN1,
    hand: hand1,
    myLp: 8000,
    oppLp: 8000,
  });
  (duel as any).player1Field.deck = deck1;
  (duel as any).player2Field.hand = hand2;
  (duel as any).player2Field.deck = deck2;

  const advanceTurn = () => {
    const endingSeat = Number(duel.currentTurn);
    const ending = endingSeat === 1 ? (duel as any).player1Field : (duel as any).player2Field;
    discardToHandLimit(ending);
    for (const m of ending?.monsters || []) {
      if (!m) continue;
      m.attackedThisTurn = false;
      m.attacksThisTurn = 0;
      m.positionChangedThisTurn = false;
      m.effectUsedThisTurn = false;
    }
    duel.currentTurn = endingSeat === 1 ? 2 : 1;
    duel.turnCounter = (duel.turnCounter || 1) + 1;
    duel.currentPhase = TurnPhase.DRAW;
    const starter = Number(duel.currentTurn) === 1 ? (duel as any).player1Field : (duel as any).player2Field;
    drawCards(starter, 1);
    duel.currentPhase = TurnPhase.MAIN1;
  };

  let winner: 1 | 2 | null = null;

  for (let t = 0; t < maxTicks; t++) {
    if (duel.player1LifePoints <= 0) {
      winner = 2;
      break;
    }
    if (duel.player2LifePoints <= 0) {
      winner = 1;
      break;
    }

    const seat = Number(duel.currentTurn) === 1 ? 1 : 2;
    const botUserId = seat;
    const difficulty = seat === 1 ? diff1 : diff2;
    const log = simulateDecision(duel, botUserId, difficulty, lessons);
    if (!log) {
      warnings.push(`tick ${t}: sem decisão seat=${seat}`);
      advanceTurn();
      continue;
    }
    decisions.push(log);

    const last3 = decisions.slice(-3);
    if (
      last3.length === 3 &&
      last3.every((d) => d.actionType === log.actionType && d.actionLabel === log.actionLabel)
    ) {
      warnings.push(`loop ${log.actionType}; END_TURN`);
      advanceTurn();
      continue;
    }

    const isP1 = botUserId === 1;
    const own = isP1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opp = isP1 ? (duel as any).player2Field : (duel as any).player1Field;
    const handLen = (own.hand || []).length;

    if (log.actionType === 'END_TURN' && handLen > 6) {
      warnings.push(`overflow END_TURN mão=${handLen}`);
    }

    if (log.actionType === 'END_TURN') {
      advanceTurn();
    } else if (log.actionType === 'NEXT_PHASE') {
      if (duel.currentPhase === TurnPhase.MAIN1) duel.currentPhase = TurnPhase.BATTLE;
      else if (duel.currentPhase === TurnPhase.BATTLE) duel.currentPhase = TurnPhase.MAIN2;
      else advanceTurn();
    } else if (log.actionType === 'ATTACK') {
      const attacker = (own.monsters || []).find(
        (m: any) => m && String(m.position || '').includes('attack') && !m.attackedThisTurn,
      );
      if (attacker) {
        attacker.attackedThisTurn = true;
        attacker.attacksThisTurn = (Number(attacker.attacksThisTurn) || 0) + 1;
        const targets = (opp.monsters || [])
          .map((m: any, i: number) => ({ m, i }))
          .filter((x: { m: any; i: number }) => !!x.m);
        if (!targets.length) {
          if (isP1) duel.player2LifePoints = Math.max(0, duel.player2LifePoints - (attacker.atk || 0));
          else duel.player1LifePoints = Math.max(0, duel.player1LifePoints - (attacker.atk || 0));
        } else {
          // Ataca o de menor ATK (mutação rasa)
          targets.sort((a: { m: any; i: number }, b: { m: any; i: number }) => (a.m.atk || 0) - (b.m.atk || 0));
          const tgt = targets[0];
          if ((attacker.atk || 0) > (tgt.m.atk || 0)) {
            const dmg = (attacker.atk || 0) - (tgt.m.atk || 0);
            opp.graveyard = opp.graveyard || [];
            opp.graveyard.push(tgt.m);
            opp.monsters[tgt.i] = null;
            if (isP1) duel.player2LifePoints = Math.max(0, duel.player2LifePoints - dmg);
            else duel.player1LifePoints = Math.max(0, duel.player1LifePoints - dmg);
          } else if ((attacker.atk || 0) < (tgt.m.atk || 0)) {
            const dmg = (tgt.m.atk || 0) - (attacker.atk || 0);
            const ai = (own.monsters || []).indexOf(attacker);
            own.graveyard = own.graveyard || [];
            own.graveyard.push(attacker);
            if (ai >= 0) own.monsters[ai] = null;
            if (isP1) duel.player1LifePoints = Math.max(0, duel.player1LifePoints - dmg);
            else duel.player2LifePoints = Math.max(0, duel.player2LifePoints - dmg);
          } else {
            const ai = (own.monsters || []).indexOf(attacker);
            own.graveyard = own.graveyard || [];
            opp.graveyard = opp.graveyard || [];
            own.graveyard.push(attacker);
            opp.graveyard.push(tgt.m);
            if (ai >= 0) own.monsters[ai] = null;
            opp.monsters[tgt.i] = null;
          }
        }
      }
    } else if (log.actionType === 'SUMMON_MONSTER' || log.actionType === 'SET_MONSTER') {
      const idx = (own.hand || []).findIndex((c: any) =>
        String(c?.type || '').toLowerCase().includes('monster'),
      );
      if (idx >= 0) {
        const card = own.hand.splice(idx, 1)[0];
        const zi = (own.monsters || []).findIndex((m: any) => !m);
        if (zi >= 0) {
          card.position = log.actionType === 'SET_MONSTER' ? 'set' : 'attack';
          if (/breaker/i.test(String(card.name || card.idCarta || ''))) card.spellCounters = 1;
          if (/skilled.?dark/i.test(String(card.name || card.idCarta || ''))) card.spellCounters = 3;
          own.monsters[zi] = card;
        }
      }
    } else if (log.actionType === 'SET_SPELL_TRAP') {
      const idx = (own.hand || []).findIndex(
        (c: any) =>
          String(c?.type || '').toLowerCase().includes('spell') ||
          String(c?.type || '').toLowerCase().includes('trap'),
      );
      if (idx >= 0) {
        const card = own.hand.splice(idx, 1)[0];
        const zi = (own.spellTrap || []).findIndex((c: any) => !c);
        if (zi >= 0) {
          card.position = 'set';
          own.spellTrap[zi] = card;
        }
      }
    } else if (log.actionType === 'ACTIVATE_SPELL_TRAP') {
      const fieldIdx = (own.spellTrap || []).findIndex((c: any) => !!c);
      let used: any = null;
      if (fieldIdx >= 0) {
        used = own.spellTrap[fieldIdx];
        own.spellTrap[fieldIdx] = null;
      } else {
        const hi = (own.hand || []).findIndex(
          (c: any) =>
            String(c?.type || '').toLowerCase().includes('spell') ||
            String(c?.type || '').toLowerCase().includes('trap'),
        );
        if (hi >= 0) used = own.hand.splice(hi, 1)[0];
      }
      if (used) {
        own.graveyard = own.graveyard || [];
        own.graveyard.push(used);
        const key = String(used.name || used.idCarta || '').toLowerCase();
        // Efeitos rasos úteis pro treino
        if (/pot.?of.?greed/.test(key)) drawCards(own, 2);
        if (/raigeki|dark.?hole/.test(key)) {
          for (let i = 0; i < 5; i++) {
            if (opp.monsters[i]) {
              opp.graveyard = opp.graveyard || [];
              opp.graveyard.push(opp.monsters[i]);
              opp.monsters[i] = null;
            }
          }
        }
        if (/mystical.?space|typhoon|heavy.?storm|harpie/.test(key)) {
          for (let i = 0; i < 5; i++) {
            if (opp.spellTrap[i]) {
              opp.graveyard = opp.graveyard || [];
              opp.graveyard.push(opp.spellTrap[i]);
              opp.spellTrap[i] = null;
              if (!/heavy|harpie/.test(key)) break;
            }
          }
        }
        if (/reborn|call.?of.?the.?haunted|premature/.test(key)) {
          const gy = (own.graveyard || []).filter((c: any) =>
            String(c?.type || '').toLowerCase().includes('monster'),
          );
          gy.sort((a: any, b: any) => (b.atk || 0) - (a.atk || 0));
          if (gy[0]) {
            const zi = (own.monsters || []).findIndex((m: any) => !m);
            if (zi >= 0) {
              const card = { ...gy[0], position: 'attack' };
              own.monsters[zi] = card;
            }
          }
        }
      }
    } else if (log.actionType === 'BREAKER_REMOVE_COUNTER') {
      const m = (own.monsters || []).find((c: any) => c && Number(c.spellCounters || 0) > 0);
      if (m) m.spellCounters = Math.max(0, Number(m.spellCounters || 0) - 1);
      const si = (opp.spellTrap || []).findIndex((c: any) => !!c);
      if (si >= 0) {
        opp.graveyard = opp.graveyard || [];
        opp.graveyard.push(opp.spellTrap[si]);
        opp.spellTrap[si] = null;
      }
    } else if (log.actionType.startsWith('START_') || log.actionType.includes('CHAOS') || log.actionType.includes('EXILED')) {
      const m = (own.monsters || []).find(Boolean);
      if (m) m.effectUsedThisTurn = true;
      // Remoção rasa do monstro oponente mais forte
      const targets = (opp.monsters || [])
        .map((x: any, i: number) => ({ x, i }))
        .filter((t: { x: any; i: number }) => !!t.x)
        .sort((a: { x: any; i: number }, b: { x: any; i: number }) => (b.x.atk || 0) - (a.x.atk || 0));
      if (targets[0] && /CHAOS|DARK_ARMED|EXILED|BLS|SNOWMAN/i.test(log.actionType)) {
        opp.graveyard = opp.graveyard || [];
        opp.graveyard.push(targets[0].x);
        opp.monsters[targets[0].i] = null;
      }
      if (/SKILLED_DARK/i.test(log.actionType)) {
        const hi = (own.hand || []).findIndex((c: any) => /dark.?magician/i.test(String(c?.name || '')) && !/girl|skilled/i.test(String(c?.name || '')));
        const zi = (own.monsters || []).findIndex((c: any) => c && /skilled/i.test(String(c.name || c.idCarta || '')));
        if (zi >= 0) {
          own.graveyard = own.graveyard || [];
          own.graveyard.push(own.monsters[zi]);
          own.monsters[zi] = null;
        }
        if (hi >= 0) {
          const dm = own.hand.splice(hi, 1)[0];
          const free = (own.monsters || []).findIndex((c: any) => !c);
          if (free >= 0) {
            dm.position = 'attack';
            own.monsters[free] = dm;
          }
        }
      }
    }
  }

  if (!winner) {
    if (duel.player1LifePoints > duel.player2LifePoints) winner = 1;
    else if (duel.player2LifePoints > duel.player1LifePoints) winner = 2;
    else winner = null;
  }

  // Recompensas: vencedor reforça jogadas; dano conta; overflow penaliza (não grava)
  const toPersist: Array<Omit<BotLesson, 'id' | 'createdAt'>> = [];
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    const isWinner = winner !== null && d.botUserId === winner;
    const isLoser = winner !== null && d.botUserId !== winner;
    let reward = 0;

    if (d.category === 'monster_effect') reward += isWinner ? 8 : 2;
    if (d.category === 'spell') reward += isWinner ? 6 : 1.5;
    if (d.category === 'attack') reward += isWinner ? 5 : 1;
    if (d.actionType === 'SET_SPELL_TRAP') reward += isWinner ? 3 : 0.5;
    if (d.actionType === 'BREAKER_REMOVE_COUNTER') reward += 10;
    if (d.actionType.includes('SKILLED_DARK')) reward += 9;
    if (d.actionType === 'END_TURN' && (d.reason || '').includes('mão')) reward = 0;

    // Dano causado no tick seguinte (aprox)
    const nextSame = decisions.slice(i + 1).find((x) => x.botUserId === d.botUserId);
    if (d.lpOpp != null && nextSame?.lpOpp != null && nextSame.lpOpp < d.lpOpp) {
      reward += Math.min(15, (d.lpOpp - nextSame.lpOpp) / 250);
    }

    if (isWinner) reward += 4;
    if (isLoser && d.actionType === 'END_TURN') reward = Math.max(0, reward - 2);
    if (winner === null) reward *= 0.4;

    if (reward > 0.5 && d.situationKey) {
      toPersist.push({
        situationKey: d.situationKey,
        actionType: d.actionType,
        actionData: d.actionData || {},
        label: d.actionLabel,
        reward: Math.round(reward * 10) / 10,
        difficulty: String(d.difficulty),
      });
    }
  }

  let lessonsCreated = 0;
  if (opts?.persist !== false && toPersist.length) {
    const before = loadLessons(memoryPath).length;
    appendLessons(toPersist, memoryPath);
    lessonsCreated = loadLessons(memoryPath).length - before;
    // append pode substituir por sort/trim — reporta quantas tentamos
    lessonsCreated = toPersist.length;
  }

  return {
    winner,
    ticks: decisions.length,
    decisions,
    lessonsCreated,
    finalLp: { p1: duel.player1LifePoints, p2: duel.player2LifePoints },
    warnings,
  };
}

export interface TrainingSessionResult {
  games: number;
  winsP1: number;
  winsP2: number;
  draws: number;
  lessonsAdded: number;
  memory: ReturnType<typeof memoryStats>;
  sample: Array<{ winner: 1 | 2 | null; lp: { p1: number; p2: number }; ticks: number }>;
}

/** Sessão de treino: N partidas bot vs bot gravando memória. */
export function runTrainingSession(opts?: {
  games?: number;
  difficultyP1?: BotDifficulty;
  difficultyP2?: BotDifficulty;
  maxTicks?: number;
  memoryPath?: string;
}): TrainingSessionResult {
  const games = opts?.games ?? 20;
  const memoryPath = opts?.memoryPath ?? defaultMemoryPath();
  let winsP1 = 0;
  let winsP2 = 0;
  let draws = 0;
  let lessonsAdded = 0;
  const sample: TrainingSessionResult['sample'] = [];

  for (let g = 0; g < games; g++) {
    const lessons = loadLessons(memoryPath);
    const match = runTrainingMatch({
      difficultyP1: opts?.difficultyP1 ?? BotDifficulty.EXPERT,
      difficultyP2: opts?.difficultyP2 ?? BotDifficulty.HARD,
      maxTicks: opts?.maxTicks ?? 48,
      lessons,
      persist: true,
      memoryPath,
    });
    if (match.winner === 1) winsP1 += 1;
    else if (match.winner === 2) winsP2 += 1;
    else draws += 1;
    lessonsAdded += match.lessonsCreated;
    if (sample.length < 5) {
      sample.push({ winner: match.winner, lp: match.finalLp, ticks: match.ticks });
    }
  }

  return {
    games,
    winsP1,
    winsP2,
    draws,
    lessonsAdded,
    memory: memoryStats(memoryPath),
    sample,
  };
}

export {
  analyzeDeck,
  getDeckProfile,
  decidePendingChoice,
  buildLegalActions,
  scoreLegalActions,
  classifyCardEffect,
  loadLessons,
  memoryStats,
  defaultMemoryPath,
};
