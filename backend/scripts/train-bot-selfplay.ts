/**
 * Treino bot-vs-bot: partidas heurísticas → uploads/bot-ai-memory.json
 *
 * Uso:
 *   npm run train:bot-ai
 *   npm run train:bot-ai -- --games=50
 *   npm run train:bot-ai -- --games=100 --loop
 *
 * Com --loop, repete sessões até Ctrl+C (treino contínuo).
 */
import { BotDifficulty } from '../src/modules/bots/entities/managed-bot.entity';
import {
  runTrainingSession,
  memoryStats,
  defaultMemoryPath,
} from '../src/modules/bots/bot-simulation';

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function runOnce(games: number) {
  const started = Date.now();
  console.log(`\n▶ Sessão: ${games} partidas EXPERT vs HARD`);
  console.log(`  Memória: ${defaultMemoryPath()}`);

  const result = runTrainingSession({
    games,
    difficultyP1: BotDifficulty.EXPERT,
    difficultyP2: BotDifficulty.HARD,
    maxTicks: 52,
  });

  const ms = Date.now() - started;
  console.log(`  Resultado: P1 ${result.winsP1} | P2 ${result.winsP2} | empates ${result.draws}`);
  console.log(`  Lições nesta sessão: +${result.lessonsAdded}`);
  console.log(`  Memória total: ${result.memory.count} lições`);
  console.log(`  Tempo: ${(ms / 1000).toFixed(1)}s`);
  if (result.sample.length) {
    console.log('  Amostra:');
    for (const s of result.sample) {
      console.log(`    winner=${s.winner ?? 'draw'} LP ${s.lp.p1}/${s.lp.p2} ticks=${s.ticks}`);
    }
  }
  const topTypes = Object.entries(result.memory.byType || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (topTypes.length) {
    console.log('  Top actionTypes na memória:');
    for (const [t, n] of topTypes) console.log(`    ${t}: ${n}`);
  }
  return result;
}

async function main() {
  const games = argNum('games', 25);
  const loop = hasFlag('loop');

  console.log('=== Bot AI Self-Play Training ===');
  const before = memoryStats();
  console.log(`Memória inicial: ${before.count} lições`);

  if (!loop) {
    await runOnce(games);
    console.log('\nOK. Reinicie o backend para a memória entrar no BotExperienceService em runtime.');
    return;
  }

  console.log('Modo --loop ativo (Ctrl+C para parar)\n');
  let session = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    session += 1;
    console.log(`\n======== Sessão #${session} ========`);
    await runOnce(games);
    // Pausa curta para não saturar disco
    await new Promise((r) => setTimeout(r, 400));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
