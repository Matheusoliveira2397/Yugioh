/**
 * Bateria rápida de decisões da IA (sem DB/gateway).
 * Uso: node scripts/simulate-bot-ai.js
 * Ou via ts-node apontando para bot-simulation após build.
 *
 * Este script espelha cenários do spec para smoke manual.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

async function main() {
  // Preferir dist compilado; senão orientar a rodar os testes Jest
  const dist = path.join(__dirname, '..', 'dist', 'modules', 'bots', 'bot-simulation.js');
  let sim;
  try {
    sim = require(dist);
  } catch {
    console.log('Dist não encontrado. Rode: npm test -- --testPathPattern=bot-ai.spec');
    console.log('Ou: npm run build && node scripts/simulate-bot-ai.js');
    process.exit(0);
  }

  const { makeTestCard, makeTestDuel, runDecisionBattery } = sim;
  const { BotDifficulty } = require(path.join(__dirname, '..', 'dist', 'modules', 'bots', 'entities', 'managed-bot.entity.js'));
  const { TurnPhase } = require(path.join(__dirname, '..', 'dist', 'modules', 'duels', 'entities', 'duel.entity.js'));

  const scenarios = [];
  for (const diff of [BotDifficulty.EASY, BotDifficulty.NORMAL, BotDifficulty.HARD, BotDifficulty.EXPERT]) {
    scenarios.push({
      name: `draw-${diff}`,
      duel: makeTestDuel({
        hand: [makeTestCard({ name: 'Pot of Greed', idCarta: 'PotOfGreed', type: 'Spell' })],
      }),
      botUserId: 1,
      difficulty: diff,
    });
    scenarios.push({
      name: `lethal-${diff}`,
      duel: makeTestDuel({
        phase: TurnPhase.BATTLE,
        oppLp: 1500,
        myMonsters: [makeTestCard({ name: 'BEWD', type: 'Monster', atk: 3000, position: 'attack' })],
      }),
      botUserId: 1,
      difficulty: diff,
    });
  }

  const { results, summary } = runDecisionBattery(scenarios);
  console.log(JSON.stringify({ summary, sample: results.slice(0, 4) }, null, 2));
  console.log(`OK: ${summary.withDecision}/${summary.total} decisões`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
