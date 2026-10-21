import { BotDifficulty } from './entities/managed-bot.entity';
import { TurnPhase } from '../duels/entities/duel.entity';
import {
  makeTestCard,
  makeTestDuel,
  simulateDecision,
  runDecisionBattery,
  analyzeCoverage,
  classifyCardEffect,
  buildLegalActions,
  scoreLegalActions,
  decidePendingChoice,
  analyzeDeck,
} from './bot-simulation';
import { detectCombos } from './bot-combo';
import { evaluateAttack, orderAttackActions } from './bot-battle';
import { evaluateBoard } from './bot-evaluator';
import { conditionsMet, situationalEffectValue } from './bot-effect-taxonomy';
import { BotActionCandidate } from './bot-action.types';

describe('Bot AI — taxonomia de efeitos', () => {
  it('classifica cartas conhecidas por papel (não só por nome solto)', () => {
    const raigeki = classifyCardEffect(makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' }));
    expect(raigeki.roles).toContain('board_wipe_monster');
    expect(raigeki.requiresOppMonster).toBe(true);

    const pot = classifyCardEffect(makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed' }));
    expect(pot.roles).toContain('draw');

    const dad = classifyCardEffect(
      makeTestCard({ name: 'Dark Armed Dragon', idCarta: 'DarkArmedDragon', type: 'Monster', atk: 2800 }),
    );
    expect(dad.roles).toContain('target_destroy_monster');
  });

  it('infere papéis a partir da description quando a carta não está no registro', () => {
    const custom = classifyCardEffect(
      makeTestCard({
        name: 'Custom Wipe',
        idCarta: 'CustomWipeXYZ',
        type: 'Spell',
        description: 'Destroy all monsters your opponent controls.',
      }),
    );
    expect(custom.roles).toContain('board_wipe_monster');
  });

  it('bloqueia ativação quando condições não são satisfeitas', () => {
    const profile = classifyCardEffect(makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki' }));
    expect(conditionsMet(profile, { oppMonsters: 0, oppSpells: 0, gyMonsters: 0, ownMonsters: 0 })).toBe(
      false,
    );
    expect(conditionsMet(profile, { oppMonsters: 2, oppSpells: 0, gyMonsters: 0, ownMonsters: 1 })).toBe(
      true,
    );
  });

  it('valoriza burn quando oponente está baixo de LP', () => {
    const burn = classifyCardEffect(makeTestCard({ name: 'Hinotama', idCarta: 'Hinotama' }));
    const low = situationalEffectValue(burn, {
      oppMonsters: 0,
      oppSpells: 0,
      gyMonsters: 0,
      ownMonsters: 0,
      oppLp: 400,
      myLp: 8000,
      oppAtkSum: 0,
      bestGyAtk: 0,
    });
    const high = situationalEffectValue(burn, {
      oppMonsters: 0,
      oppSpells: 0,
      gyMonsters: 0,
      ownMonsters: 0,
      oppLp: 8000,
      myLp: 8000,
      oppAtkSum: 0,
      bestGyAtk: 0,
    });
    expect(low).toBeGreaterThan(high);
  });
});

describe('Bot AI — ações legais e decisões', () => {
  it('gera ações legais para magias, invocação e ataque', () => {
    const duel = makeTestDuel({
      phase: TurnPhase.MAIN1,
      hand: [
        makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' }),
        makeTestCard({ name: 'Gemini Elf', idCarta: 'GeminiElf', type: 'Monster', atk: 1900, level: 4 }),
      ],
      myMonsters: [
        makeTestCard({
          name: 'Summoned Skull',
          idCarta: 'SummonedSkull',
          type: 'Monster',
          atk: 2500,
          position: 'attack',
        }),
      ],
    });
    const legal = buildLegalActions(duel, 1);
    expect(legal.some((a) => a.category === 'spell')).toBe(true);
    expect(legal.some((a) => a.category === 'summon')).toBe(true);
    expect(legal.some((a) => a.category === 'attack')).toBe(true);
  });

  it('não oferece Raigeki sem monstros oponentes', () => {
    const duel = makeTestDuel({
      hand: [makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' })],
      oppMonsters: [],
    });
    const legal = buildLegalActions(duel, 1);
    expect(legal.some((a) => /raigeki/i.test(a.label))).toBe(false);
  });

  it('prioriza Pot of Greed / draw antes de setar trap fraco', () => {
    const duel = makeTestDuel({
      phase: TurnPhase.MAIN1,
      hand: [
        makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' }),
        makeTestCard({ name: 'Trap Hole', idCarta: 'TrapHole', type: 'Trap' }),
      ],
    });
    const decision = simulateDecision(duel, 1, BotDifficulty.EXPERT);
    expect(decision).toBeTruthy();
    expect(decision!.actionLabel.toLowerCase()).toMatch(/pot of greed|greed/);
  });

  it('prioriza ataque letal direto', () => {
    const duel = makeTestDuel({
      phase: TurnPhase.BATTLE,
      oppLp: 2000,
      myMonsters: [
        makeTestCard({
          name: 'Blue-Eyes',
          idCarta: 'BlueEyes',
          type: 'Monster',
          atk: 3000,
          position: 'attack',
        }),
      ],
      oppMonsters: [],
    });
    const decision = simulateDecision(duel, 1, BotDifficulty.HARD);
    expect(decision).toBeTruthy();
    expect(decision!.actionType).toBe('ATTACK');
    expect(decision!.score).toBeGreaterThan(200);
  });

  it('evita ataque suicida óbvio em EXPERT', () => {
    const attacker = makeTestCard({
      name: 'Weakling',
      idCarta: 'Weak',
      type: 'Monster',
      atk: 1000,
      position: 'attack',
    });
    const defender = makeTestCard({
      name: 'Boss',
      idCarta: 'Boss',
      type: 'Monster',
      atk: 3000,
      position: 'attack',
    });
    const duel = makeTestDuel({
      phase: TurnPhase.BATTLE,
      myMonsters: [attacker],
      oppMonsters: [defender],
    });
    const legal = buildLegalActions(duel, 1);
    const attack = legal.find((a) => a.category === 'attack')!;
    const ev = evaluateAttack(
      attack,
      [{ m: attacker, i: 0 }],
      [{ m: defender, i: 0 }],
      8000,
      8000,
      0.88,
    );
    expect(ev.score).toBeLessThan(0);

    const scored = scoreLegalActions(duel, 1, BotDifficulty.EXPERT, legal, []);
    // Deve preferir sair da batalha a suicidar
    expect(scored!.action.category === 'phase' || scored!.score < 50).toBe(true);
  });
});

describe('Bot AI — combos e perfil de deck', () => {
  it('detecta combo draw_first com Pot na mão', () => {
    const duel = makeTestDuel({
      hand: [
        makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' }),
        makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' }),
      ],
      oppMonsters: [
        makeTestCard({ name: 'Goblin', type: 'Monster', atk: 1500, position: 'attack' }),
      ],
    });
    const legal = buildLegalActions(duel, 1);
    const combos = detectCombos(duel, 1, legal);
    expect(combos.some((c) => c.id === 'draw_first')).toBe(true);
  });

  it('detecta revive_engine com Reborn + monstro no GY', () => {
    const duel = makeTestDuel({
      hand: [makeTestCard({ name: 'Monster Reborn', idCarta: 'MonsterReborn', type: 'Spell' })],
      myGy: [makeTestCard({ name: 'B. Skull Dragon', type: 'Monster', atk: 3200 })],
    });
    const legal = buildLegalActions(duel, 1);
    const combos = detectCombos(duel, 1, legal);
    expect(combos.some((c) => c.id === 'revive_engine')).toBe(true);
  });

  it('classifica deck aggro vs control', () => {
    const aggro = analyzeDeck([
      makeTestCard({ name: 'BEWD', type: 'Monster', atk: 3000 }),
      makeTestCard({ name: 'Skull', type: 'Monster', atk: 2500 }),
      makeTestCard({ name: 'Elf', type: 'Monster', atk: 1900 }),
      makeTestCard({ name: 'Hinotama', type: 'Spell', idCarta: 'Hinotama' }),
      makeTestCard({ name: 'Ookazi', type: 'Spell', idCarta: 'Ookazi' }),
    ]);
    expect(['aggro', 'midrange']).toContain(aggro.style);

    const control = analyzeDeck([
      makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' }),
      makeTestCard({ name: 'Dark Hole', idCarta: 'DarkHole', type: 'Spell' }),
      makeTestCard({ name: 'MST', idCarta: 'MysticalSpaceTyphoon', type: 'Spell' }),
      makeTestCard({ name: 'Mirror Force', idCarta: 'MirrorForce', type: 'Trap' }),
      makeTestCard({ name: 'Sakuretsu Armor', idCarta: 'SakuretsuArmor', type: 'Trap' }),
      makeTestCard({ name: 'Waboku', idCarta: 'Waboku', type: 'Trap' }),
      makeTestCard({ name: 'Change of Heart', idCarta: 'ChangeOfHeart', type: 'Spell' }),
      makeTestCard({ name: 'Confiscation', idCarta: 'Confiscation', type: 'Spell' }),
    ]);
    expect(control.style).toBe('control');
  });
});

describe('Bot AI — batalha e avaliação', () => {
  it('ordena ataques priorizando lethal', () => {
    const a1 = makeTestCard({ name: 'A', type: 'Monster', atk: 1000, position: 'attack' });
    const a2 = makeTestCard({ name: 'B', type: 'Monster', atk: 2500, position: 'attack' });
    const attacks: BotActionCandidate[] = [
      {
        id: '1',
        actionType: 'ATTACK',
        actionData: { attackerZoneIndex: 0, targetZoneIndex: null },
        label: 'A direto',
        category: 'attack',
      },
      {
        id: '2',
        actionType: 'ATTACK',
        actionData: { attackerZoneIndex: 1, targetZoneIndex: null },
        label: 'B direto',
        category: 'attack',
      },
    ];
    const ordered = orderAttackActions(
      attacks,
      [
        { m: a1, i: 0 },
        { m: a2, i: 1 },
      ],
      [],
      8000,
      2000,
      0.8,
    );
    expect(ordered[0].lethalLine).toBe(true);
    expect(ordered[0].action.actionData.attackerZoneIndex).toBe(1);
  });

  it('evaluateBoard penaliza ameaça de board oponente', () => {
    const safe = makeTestDuel({ oppMonsters: [] });
    const threatened = makeTestDuel({
      myLp: 1000,
      oppMonsters: [
        makeTestCard({ name: 'Boss', type: 'Monster', atk: 3000, position: 'attack' }),
      ],
    });
    expect(evaluateBoard(safe, 1).total).toBeGreaterThan(evaluateBoard(threatened, 1).total);
  });
});

describe('Bot AI — respostas e pending', () => {
  it('escolhe o monstro oponente mais forte em Change of Heart', () => {
    const duel = makeTestDuel({
      oppMonsters: [
        makeTestCard({ name: 'Small', type: 'Monster', atk: 1200, position: 'attack' }),
        makeTestCard({ name: 'Big', type: 'Monster', atk: 2800, position: 'attack' }),
      ],
      pendingChoice: { type: 'CHANGE_OF_HEART', userId: 1, data: {} },
    });
    // opp monsters are in zones 0 and 1 — strongest should be index 1
    const decision = decidePendingChoice(duel, 1, BotDifficulty.EXPERT);
    expect(decision).toBeTruthy();
    expect(decision!.actionType).toBe('CHANGE_OF_HEART_CHOICE');
    expect(decision!.actionData.chosenMonsterZoneIndex).toBe(1);
  });

  it('escolhe opção Lightning Storm conforme ameaça', () => {
    const duel = makeTestDuel({
      oppMonsters: [
        makeTestCard({ name: 'A', type: 'Monster', atk: 2500, position: 'attack' }),
        makeTestCard({ name: 'B', type: 'Monster', atk: 2000, position: 'attack' }),
      ],
      oppSpells: [makeTestCard({ name: 'Set', type: 'Trap', position: 'set' })],
      pendingChoice: { type: 'LIGHTNING_STORM', userId: 1 },
    });
    const decision = decidePendingChoice(duel, 1, BotDifficulty.HARD);
    expect(decision!.actionData.effect).toBe('destroy_attack_monsters');
  });
});

describe('Bot AI — níveis de dificuldade', () => {
  it('EXPERT e EASY podem divergir na mesma posição (ruído / skill)', () => {
    const duel = makeTestDuel({
      phase: TurnPhase.MAIN1,
      hand: [
        makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' }),
        makeTestCard({ name: 'Gemini Elf', type: 'Monster', atk: 1900, level: 4 }),
        makeTestCard({ name: 'Trap Hole', idCarta: 'TrapHole', type: 'Trap' }),
      ],
      myMonsters: [
        makeTestCard({ name: 'Skull', type: 'Monster', atk: 2500, position: 'attack' }),
      ],
      oppMonsters: [
        makeTestCard({ name: 'Goblin', type: 'Monster', atk: 1500, position: 'attack' }),
      ],
    });
    const expert = simulateDecision(duel, 1, BotDifficulty.EXPERT);
    expect(expert).toBeTruthy();
    // EASY tem blunder — apenas garantir que decide algo legal
    const easy = simulateDecision(duel, 1, BotDifficulty.EASY);
    expect(easy).toBeTruthy();
    expect(easy!.legalCount).toBe(expert!.legalCount);
  });
});

describe('Bot AI — Breaker + gestão de mão', () => {
  it('oferece BREAKER_REMOVE_COUNTER quando há counter e backrow oponente', () => {
    const duel = makeTestDuel({
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
      oppSpells: [makeTestCard({ name: 'Trap Hole', type: 'Trap', position: 'set' })],
    });
    const legal = buildLegalActions(duel, 1);
    expect(legal.some((a) => a.actionType === 'BREAKER_REMOVE_COUNTER')).toBe(true);
  });

  it('com mão > 6, não prioriza END_TURN se ainda há o que gastar', () => {
    const hand = Array.from({ length: 8 }, (_, i) =>
      makeTestCard({ name: `Spell${i}`, idCarta: `Spell${i}`, type: 'Spell' }),
    );
    // Inclui uma magia útil conhecida
    hand[0] = makeTestCard({ name: 'Mystical Space Typhoon', idCarta: 'MysticalSpaceTyphoon', type: 'Spell' });
    const duel = makeTestDuel({
      phase: TurnPhase.MAIN2,
      hand,
      myMonsters: [
        makeTestCard({ name: 'Beater', type: 'Monster', atk: 1900, position: 'attack' }),
      ],
      oppSpells: [makeTestCard({ name: 'Set', type: 'Trap', position: 'set' })],
    });
    const decision = simulateDecision(duel, 1, BotDifficulty.EXPERT);
    expect(decision).toBeTruthy();
    expect(decision!.actionType).not.toBe('END_TURN');
  });

  it('penaliza Pot of Greed com mão já em 6+', () => {
    const { handSizeScoreAdjust } = require('./bot-hand-policy');
    const adj = handSizeScoreAdjust(
      {
        id: '1',
        actionType: 'ACTIVATE_SPELL_TRAP',
        actionData: { cardName: 'Pot of Greed', cardId: 'PotOfGreed' },
        label: 'Ativar magia Pot of Greed da mão',
        category: 'spell',
      },
      6,
      1,
    );
    expect(adj.delta).toBeLessThan(0);
  });
});

describe('Bot AI — efeitos de monstro (START→CHOICE)', () => {
  it('gera CHAOS_SORCERER_EFFECT_CHOICE no monstro oponente mais forte', () => {
    const { buildMonsterEffectChoice } = require('./bot-monster-effects');
    const duel = makeTestDuel({
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
        makeTestCard({ name: 'Small', type: 'Monster', atk: 1200, position: 'attack' }),
        makeTestCard({ name: 'Big', type: 'Monster', atk: 2800, position: 'attack' }),
      ],
    });
    const choice = buildMonsterEffectChoice(
      'START_CHAOS_SORCERER_EFFECT',
      { monsterZoneIndex: 0 },
      duel,
      1,
    );
    expect(choice).toBeTruthy();
    expect(choice.actionType).toBe('CHAOS_SORCERER_EFFECT_CHOICE');
    expect(choice.actionData.targetZoneIndex).toBe(1);
    expect(choice.actionData.targetPlayer).toBe('opponent');
  });

  it('oferece efeito Chaos Sorcerer nas ações legais quando há alvo', () => {
    const duel = makeTestDuel({
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
        makeTestCard({ name: 'Goblin', type: 'Monster', atk: 1500, position: 'attack' }),
      ],
    });
    const legal = buildLegalActions(duel, 1);
    expect(legal.some((a) => a.actionType === 'START_CHAOS_SORCERER_EFFECT')).toBe(true);
  });

  it('prioriza efeito de remoção sobre END_TURN em MAIN1', () => {
    const duel = makeTestDuel({
      phase: TurnPhase.MAIN1,
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
    });
    const decision = simulateDecision(duel, 1, BotDifficulty.EXPERT);
    expect(decision).toBeTruthy();
    expect(decision!.actionType).toBe('START_CHAOS_SORCERER_EFFECT');
  });
});

describe('Bot AI — Mataza double attack', () => {
  it('oferece segundo ATTACK com Mataza após 1 ataque', () => {
    const mataza = makeTestCard({
      name: 'Mataza the Zapper',
      idCarta: 'MatazaTheZapper',
      type: 'Monster',
      atk: 1400,
      position: 'attack',
      attackedThisTurn: true,
      attacksThisTurn: 1,
    });
    const duel = makeTestDuel({
      phase: TurnPhase.BATTLE,
      myMonsters: [mataza],
      oppLp: 8000,
    });
    const legal = buildLegalActions(duel, 1);
    const attacks = legal.filter((a) => a.actionType === 'ATTACK');
    expect(attacks.length).toBeGreaterThanOrEqual(1);
  });

  it('não oferece 3º ataque com Mataza', () => {
    const mataza = makeTestCard({
      name: 'Mataza the Zapper',
      idCarta: 'MatazaTheZapper',
      type: 'Monster',
      atk: 1400,
      position: 'attack',
      attackedThisTurn: true,
      attacksThisTurn: 2,
    });
    const duel = makeTestDuel({
      phase: TurnPhase.BATTLE,
      myMonsters: [mataza],
    });
    const legal = buildLegalActions(duel, 1);
    expect(legal.some((a) => a.actionType === 'ATTACK')).toBe(false);
  });
});

describe('Bot AI — Skilled DM + flip', () => {
  it('oferece START_SKILLED_DARK_MAGICIAN_EFFECT com 3 counters + DM na mão', () => {
    const duel = makeTestDuel({
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
    });
    const legal = buildLegalActions(duel, 1);
    expect(legal.some((a) => a.actionType === 'START_SKILLED_DARK_MAGICIAN_EFFECT')).toBe(true);
  });

  it('resolve pending SKILLED_DARK_MAGICIAN', () => {
    const duel = makeTestDuel({
      pendingChoice: {
        type: 'SKILLED_DARK_MAGICIAN',
        userId: 1,
        data: {
          tributeZoneIndex: 0,
          options: [{ source: 'hand', index: 0, name: 'Dark Magician' }],
        },
      },
    });
    const d = decidePendingChoice(duel, 1, BotDifficulty.EXPERT);
    expect(d?.actionType).toBe('SKILLED_DARK_MAGICIAN_CHOICE');
    expect(d?.actionData.source).toBe('hand');
  });
});

describe('Bot AI — benchmark + self-play', () => {
  it('benchmark EXPERT passa nos cenários-chave', () => {
    const { runBenchmark } = require('./bot-simulation');
    const { passed, failed } = runBenchmark(BotDifficulty.EXPERT);
    expect(failed).toEqual([]);
    expect(passed).toBeGreaterThanOrEqual(5);
  });

  it('self-play heurístico não gera END_TURN com overflow', () => {
    const { runHeuristicSelfPlay } = require('./bot-simulation');
    const sp = runHeuristicSelfPlay({ turns: 10, difficulty: BotDifficulty.EXPERT });
    expect(sp.decisions.length).toBeGreaterThan(0);
    expect(sp.warnings.filter((w: string) => w.includes('overflow'))).toEqual([]);
  });

  it('treino bot-vs-bot gera partida e pode persistir lições em arquivo temp', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const { runTrainingMatch } = require('./bot-simulation');
    const tmp = path.join(os.tmpdir(), `bot-ai-mem-test-${Date.now()}.json`);
    const match = runTrainingMatch({
      difficultyP1: BotDifficulty.EXPERT,
      difficultyP2: BotDifficulty.HARD,
      maxTicks: 24,
      lessons: [],
      persist: true,
      memoryPath: tmp,
    });
    expect(match.ticks).toBeGreaterThan(0);
    expect(match.finalLp.p1).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(tmp)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    expect(Array.isArray(raw.lessons)).toBe(true);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  });
});

describe('Bot AI — bateria de simulação', () => {
  it('executa múltiplos cenários sem travar', () => {
    const scenarios = [
      {
        name: 'draw',
        duel: makeTestDuel({
          hand: [makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' })],
        }),
        botUserId: 1,
        difficulty: BotDifficulty.NORMAL,
      },
      {
        name: 'removal',
        duel: makeTestDuel({
          hand: [makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki', type: 'Spell' })],
          oppMonsters: [
            makeTestCard({ name: 'X', type: 'Monster', atk: 2000, position: 'attack' }),
          ],
        }),
        botUserId: 1,
        difficulty: BotDifficulty.HARD,
      },
      {
        name: 'battle',
        duel: makeTestDuel({
          phase: TurnPhase.BATTLE,
          myMonsters: [
            makeTestCard({ name: 'A', type: 'Monster', atk: 1900, position: 'attack' }),
          ],
          oppMonsters: [
            makeTestCard({ name: 'B', type: 'Monster', atk: 1500, position: 'attack' }),
          ],
        }),
        botUserId: 1,
        difficulty: BotDifficulty.EXPERT,
      },
    ];
    const { summary } = runDecisionBattery(scenarios);
    expect(summary.withDecision).toBe(3);
    expect(summary.avgLegal).toBeGreaterThan(0);
  });

  it('reporta cobertura de classificação de cartas', () => {
    const cards = [
      makeTestCard({ name: 'Raigeki', idCarta: 'Raigeki' }),
      makeTestCard({ name: 'Unknown', idCarta: 'Unknown99', type: 'Spell' }),
      makeTestCard({
        name: 'Search Spell',
        idCarta: 'SearchX',
        description: 'Add 1 Warrior monster from your deck to your hand.',
      }),
    ];
    const cov = analyzeCoverage(cards);
    expect(cov.total).toBe(3);
    expect(cov.knownRoles).toBeGreaterThanOrEqual(1);
  });
});
