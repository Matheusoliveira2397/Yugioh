/**
 * Inscreve N bots no torneio ativo (registration_open, senão in_progress/registration_closed).
 * Uso (pasta backend):
 *   npx ts-node -r tsconfig-paths/register scripts/register-bots-in-active-tournament.ts
 *   npx ts-node -r tsconfig-paths/register scripts/register-bots-in-active-tournament.ts 3
 */
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

config({ path: path.join(__dirname, '..', '.env') });
config({ path: path.join(__dirname, '..', '..', '.env') });

const COUNT = Math.max(1, Math.min(32, parseInt(process.argv[2] || '3', 10) || 3));

function applySupabaseTransactionPooler(url: string): string {
  if (!url) return url;
  if (process.env.SUPABASE_TRANSACTION_POOLER === 'false') return url;
  const isSupabase = url.includes('supabase.co') || url.includes('pooler.supabase');
  if (!isSupabase) return url;
  if (url.includes(':5432/') || url.includes(':5432?')) {
    return url.replace(':5432', ':6543');
  }
  return url;
}

async function main() {
  const rawUrl = process.env.DATABASE_URL || '';
  if (!rawUrl) {
    console.error('DATABASE_URL não definido.');
    process.exit(1);
  }

  const ds = new DataSource({
    type: 'postgres',
    url: applySupabaseTransactionPooler(rawUrl),
    entities: [],
    synchronize: false,
    logging: false,
  });

  await ds.initialize();
  console.log('Conectado ao banco.');

  try {
    const tournaments: Array<{
      id: string;
      name: string;
      status: string;
      maxParticipants: number;
      currentParticipants: number;
      entryFee: number;
      entryFeeType: string | null;
      minLevel: number | null;
      maxLevel: number | null;
    }> = await ds.query(`
      SELECT id, name, status, "maxParticipants", "currentParticipants",
             "entryFee", "entryFeeType", "minLevel", "maxLevel"
      FROM tournaments
      WHERE status IN ('registration_open', 'registration_closed', 'in_progress', 'scheduled')
      ORDER BY
        CASE status
          WHEN 'registration_open' THEN 0
          WHEN 'in_progress' THEN 1
          WHEN 'registration_closed' THEN 2
          WHEN 'scheduled' THEN 3
          ELSE 9
        END,
        "createdAt" DESC
      LIMIT 5
    `);

    if (!tournaments.length) {
      console.error('Nenhum torneio ativo encontrado.');
      process.exit(1);
    }

    console.log('Torneios candidatos:');
    for (const t of tournaments) {
      console.log(`  - ${t.name} [${t.status}] ${t.currentParticipants}/${t.maxParticipants} (id=${t.id})`);
    }

    const tournament =
      tournaments.find((t) => t.status === 'registration_open') ||
      tournaments.find((t) => t.status === 'in_progress') ||
      tournaments.find((t) => t.status === 'registration_closed') ||
      tournaments[0];

    console.log(`\nUsando: ${tournament.name} [${tournament.status}]`);

    const slotsLeft = tournament.maxParticipants - tournament.currentParticipants;
    if (slotsLeft <= 0) {
      console.error('Torneio sem vagas.');
      process.exit(1);
    }
    const toRegister = Math.min(COUNT, slotsLeft);

    const bots: Array<{ id: string; user_id: number; name: string; level: number }> = await ds.query(`
      SELECT mb.id, mb.user_id, mb.name, mb.level
      FROM managed_bots mb
      WHERE mb.user_id NOT IN (
        SELECT tp."userId" FROM tournament_participants tp WHERE tp."tournamentId" = $1
      )
      ORDER BY mb.created_at DESC
      LIMIT $2
    `, [tournament.id, toRegister]);

    if (bots.length === 0) {
      console.error('Nenhum bot disponível (sem inscrição neste torneio).');
      process.exit(1);
    }
    if (bots.length < toRegister) {
      console.warn(`Só ${bots.length} bot(s) disponível(is); pediu ${toRegister}.`);
    }

    const fee = Number(tournament.entryFee) || 0;
    const feeType = (tournament.entryFeeType === 'cash' ? 'cash' : 'credit') as 'cash' | 'credit';
    const minLevel = tournament.minLevel ?? 1;
    const maxLevel = tournament.maxLevel;

    const registered: string[] = [];

    await ds.transaction(async (manager) => {
      for (const bot of bots) {
        const users: Array<{ id: number; level: number; credits: number; cash: number }> = await manager.query(
          `SELECT id, level, credits, cash FROM users WHERE id = $1 FOR UPDATE`,
          [bot.user_id],
        );
        const user = users[0];
        if (!user) {
          console.warn(`  skip ${bot.name}: user não encontrado`);
          continue;
        }

        let level = user.level ?? 1;
        if (level < minLevel || (maxLevel != null && level > maxLevel)) {
          const target = Math.max(minLevel, maxLevel != null ? Math.min(maxLevel, level) : level);
          await manager.query(`UPDATE users SET level = $1 WHERE id = $2`, [target, user.id]);
          level = target;
          console.log(`  ajustou nível de ${bot.name} → ${level}`);
        }

        if (fee > 0) {
          if (feeType === 'cash') {
            if ((user.cash ?? 0) < fee) {
              await manager.query(`UPDATE users SET cash = $1 WHERE id = $2`, [fee + 100, user.id]);
            }
            await manager.query(`UPDATE users SET cash = cash - $1 WHERE id = $2`, [fee, user.id]);
          } else {
            if ((user.credits ?? 0) < fee) {
              await manager.query(`UPDATE users SET credits = $1 WHERE id = $2`, [fee + 100, user.id]);
            }
            await manager.query(`UPDATE users SET credits = credits - $1 WHERE id = $2`, [fee, user.id]);
          }
        }

        const participantId = uuidv4();
        await manager.query(
          `
          INSERT INTO tournament_participants
            (id, "tournamentId", "userId", status, wins, losses, draws, "registeredAt")
          VALUES
            ($1, $2, $3, 'registered', 0, 0, 0, NOW())
          `,
          [participantId, tournament.id, bot.user_id],
        );

        registered.push(bot.name);
        console.log(`  ✓ inscrito: ${bot.name} (userId=${bot.user_id})`);
      }

      if (registered.length > 0) {
        await manager.query(
          `UPDATE tournaments SET "currentParticipants" = "currentParticipants" + $1 WHERE id = $2`,
          [registered.length, tournament.id],
        );
        const after: Array<{ currentParticipants: number; maxParticipants: number; status: string }> =
          await manager.query(
            `SELECT "currentParticipants", "maxParticipants", status FROM tournaments WHERE id = $1`,
            [tournament.id],
          );
        const row = after[0];
        if (row && row.currentParticipants >= row.maxParticipants && row.status === 'registration_open') {
          await manager.query(`UPDATE tournaments SET status = $1 WHERE id = $2`, [
            'registration_closed',
            tournament.id,
          ]);
        } else if (row && row.status === 'scheduled') {
          await manager.query(`UPDATE tournaments SET status = $1 WHERE id = $2`, [
            'registration_open',
            tournament.id,
          ]);
        }
      }
    });

    const updated = await ds.query(
      `SELECT name, status, "currentParticipants", "maxParticipants" FROM tournaments WHERE id = $1`,
      [tournament.id],
    );
    const t = updated[0];
    console.log(`\nFeito: ${registered.length} bot(s) inscrito(s) em "${t.name}".`);
    console.log(`Status: ${t.status} | Participantes: ${t.currentParticipants}/${t.maxParticipants}`);
    if (registered.length) console.log(`Bots: ${registered.join(', ')}`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Falha:', err?.message || err);
  process.exit(1);
});
