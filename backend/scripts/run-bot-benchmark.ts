/**
 * Benchmark da heurística da IA (sem DB/gateway).
 * Uso: npx ts-node -r tsconfig-paths/register scripts/run-bot-benchmark.ts
 */
import { BotDifficulty } from '../src/modules/bots/entities/managed-bot.entity';
import { runBenchmark, runHeuristicSelfPlay } from '../src/modules/bots/bot-simulation';

function main() {
  console.log('=== Bot AI Benchmark (heurística) ===\n');

  for (const diff of [
    BotDifficulty.EASY,
    BotDifficulty.NORMAL,
    BotDifficulty.HARD,
    BotDifficulty.EXPERT,
  ]) {
    const { passed, failed } = runBenchmark(diff);
    console.log(`[${diff}] ${passed} ok, ${failed.length} falha(s)`);
    for (const f of failed) {
      console.log(`  ✗ ${f.name}: got=${f.got} expected=${f.expected}`);
    }
  }

  console.log('\n=== Self-play heurístico (12 ticks) ===\n');
  const sp = runHeuristicSelfPlay({ turns: 12, difficulty: BotDifficulty.EXPERT });
  console.log(`Decisões: ${sp.decisions.length}`);
  console.log(`Mão final P1/P2: ${sp.finalHandP1}/${sp.finalHandP2}`);
  console.log(`Warnings: ${sp.warnings.length ? sp.warnings.join('; ') : '(nenhum)'}`);
  console.log('\nÚltimas 5 jogadas:');
  for (const d of sp.decisions.slice(-5)) {
    console.log(`  t${d.turn} ${d.phase} P${d.botUserId}: ${d.actionType} — ${d.actionLabel}`);
  }

  const bench = runBenchmark(BotDifficulty.EXPERT);
  if (bench.failed.length) {
    console.error('\nBenchmark EXPERT falhou.');
    process.exit(1);
  }
  console.log('\nOK.');
}

main();
