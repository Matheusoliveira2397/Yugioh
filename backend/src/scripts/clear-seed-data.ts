/**
 * Apaga apenas os dados simulados (seed) do banco.
 * Mantém todos os outros dados (usuários reais, cartas reais, etc).
 *
 * Uso (na pasta backend): npm run seed:clear
 * Requer DATABASE_URL no .env.
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '..', '..', '.env') });
config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [],
  synchronize: false,
  logging: false,
});

const CLEAR_SEED_STEPS: { name: string; sql: string }[] = [
  { name: 'season_rankings (seed)', sql: "DELETE FROM season_rankings WHERE \"seasonId\" IN (SELECT id FROM seasons WHERE name LIKE 'Temporada Seed %')" },
  { name: 'seasons (seed)', sql: "DELETE FROM seasons WHERE name LIKE 'Temporada Seed %'" },
  { name: 'duels (seed)', sql: "DELETE FROM duels WHERE \"player1_nickname\" LIKE 'seed_user_%'" },
  { name: 'deck_cards (seed)', sql: "DELETE FROM deck_cards WHERE \"deckId\" IN (SELECT id FROM decks WHERE name LIKE 'Deck Seed %')" },
  { name: 'user_cards (seed)', sql: "DELETE FROM user_cards WHERE \"userId\" IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%')" },
  { name: 'decks (seed)', sql: "DELETE FROM decks WHERE name LIKE 'Deck Seed %'" },
  { name: 'users (seed)', sql: "DELETE FROM users WHERE nickname LIKE 'seed_user_%'" },
  { name: 'cards (seed)', sql: "DELETE FROM cards WHERE \"idCarta\" LIKE 'SEED-%'" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definida no .env');
    process.exit(1);
  }

  try {
    await AppDataSource.initialize();
    console.log('✅ Conectado ao banco. A apagar apenas dados do seed...\n');
  } catch (e: any) {
    console.error('❌ Erro ao conectar:', e?.message ?? e);
    process.exit(1);
  }

  try {
    for (const { name, sql } of CLEAR_SEED_STEPS) {
      const result = await AppDataSource.query(sql);
      const rowCount = (result as any)?.rowCount ?? (Array.isArray(result) ? result.length : 0);
      console.log(`   ${name}: ${rowCount} linha(s) removida(s)`);
    }
    console.log('\n✅ Dados simulados apagados. O resto do banco foi mantido.');
  } catch (e: any) {
    console.error('❌ Erro ao apagar:', e?.message ?? e);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

main();
