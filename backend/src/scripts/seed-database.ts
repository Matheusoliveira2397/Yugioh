/**
 * Script para popular o banco com dados simulados e testar capacidade.
 * Simula: usuários, maleta (user_cards), vários decks com cartas (deck_cards),
 * duelos e várias seasons com rankings.
 *
 * Uso (rodar a partir da pasta backend):
 *   npm run seed
 *   npm run seed -- 500 2000    # 500 users, 2000 cards (resto proporcional)
 *   SEED_USERS=1000 SEED_DECKS_PER_USER=5 SEED_SEASONS=10 npm run seed
 *
 * Requer DATABASE_URL no .env (backend ou raiz do projeto).
 *
 * Para limpar apenas dados do seed (ordem por FKs):
 *   DELETE FROM season_rankings WHERE "seasonId" IN (SELECT id FROM seasons WHERE name LIKE 'Temporada Seed %');
 *   DELETE FROM seasons WHERE name LIKE 'Temporada Seed %';
 *   DELETE FROM duels WHERE "player1_nickname" LIKE 'seed_user_%';
 *   DELETE FROM deck_cards WHERE "deckId" IN (SELECT id FROM decks WHERE name LIKE 'Deck Seed %');
 *   DELETE FROM user_cards WHERE "userId" IN (SELECT id FROM users WHERE nickname LIKE 'seed_user_%');
 *   DELETE FROM decks WHERE name LIKE 'Deck Seed %';
 *   DELETE FROM users WHERE nickname LIKE 'seed_user_%';
 *   DELETE FROM cards WHERE "idCarta" LIKE 'SEED-%';
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole } from '../modules/users/entities/user.entity';
import { Card } from '../modules/cards/entities/card.entity';
import { Deck } from '../modules/decks/entities/deck.entity';
import { Season } from '../modules/seasons/entities/season.entity';

// Carrega .env do backend ou da raiz
config({ path: path.join(__dirname, '..', '..', '.env') });
config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const BATCH_SIZE = 500;
const BATCH_SIZE_SMALL = 200;

const DEFAULT_USERS = 200;
const DEFAULT_CARDS = 1000;
const DEFAULT_DECKS_PER_USER = 3;
const DEFAULT_USER_CARDS_PER_USER = 60;  // cartas na maleta por usuário
const DEFAULT_CARDS_PER_DECK = 45;       // main + extra por deck
const DEFAULT_SEASONS = 5;
const DEFAULT_DUELS = 2000;

const CardType = ['Monster', 'Spell', 'Trap'];
const CardAttribute = ['DARK', 'LIGHT', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE'];
const MonsterType = ['Normal', 'Effect', 'Ritual', 'Fusion', 'Synchro', 'Xyz', 'Pendulum', 'Link'];
const MonsterRace = ['Warrior', 'Spellcaster', 'Dragon', 'Machine', 'Fiend', 'Fairy', 'Zombie', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Cyberse'];
const SpellType = ['Normal', 'Continuous', 'Equip', 'Field', 'Quick-Play', 'Ritual'];
const TrapType = ['Normal', 'Continuous', 'Counter'];
const CardRarity = ['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Card, Deck, Season],
  synchronize: false,
  logging: false,
});

async function seedUsers(dataSource: DataSource, count: number): Promise<number[]> {
  if (count <= 0) return [];
  const hashedPassword = await bcrypt.hash('Senha123!', 10);
  const repo = dataSource.getRepository(User);
  const now = new Date();

  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, count - offset);
    const batch = Array.from({ length: batchSize }, (_, i) => {
      const n = offset + i + 1;
      const nick = `seed_user_${n}_${Date.now()}`;
      return {
        nickname: nick,
        username: `seed_${n}_${uuidv4().slice(0, 8)}`,
        email: `seed${n}+${uuidv4().slice(0, 8)}@test.local`,
        password: hashedPassword,
        role: UserRole.PLAYER,
        winsGeral: Math.floor(Math.random() * 100),
        lossesGeral: Math.floor(Math.random() * 80),
        winsSeason: 0,
        lossesSeason: 0,
        credits: Math.floor(Math.random() * 500),
        cash: 0,
        level: 1,
        totalScore: 0,
        tournamentPoints: 0,
        profileImage: '/images/default.png',
        isOnline: false,
        isBanned: false,
        isEmailVerified: true,
        playerClass: 'Novato',
        division: 'Bronze',
        ownedSleeveIds: [],
        ownedPlaymatIds: [],
      };
    });
    await repo.insert(batch as any);
  }

  const idResult = await dataSource.query(
    `SELECT id FROM users WHERE nickname LIKE 'seed_user_%' ORDER BY id`
  );
  return idResult.map((r: { id: number }) => r.id);
}

/** Cartas famosas com texto em português (ex.: Slifer, Obelisk). */
async function seedFamousCards(dataSource: DataSource): Promise<string[]> {
  const repo = dataSource.getRepository(Card);
  const ids: string[] = [];

  const existingSlifer = await repo.findOne({ where: { idCarta: 'SLIFER-001' } });
  if (!existingSlifer) {
    const sliferDescription =
      'Requer 3 Tributos para Invocação Normal. A Invocação Normal desta carta não pode ser negada. Quando Invocado Normal, cartas e efeitos não podem ser ativados. Uma vez por turno, durante a Fase Final, se esta carta foi Invocada Especialmente: Envie-a para o GY. Ganha 1000 ATQ/DEF para cada carta em sua mão. Se um monstro(s) for Normal ou Especial Convocado para o campo do seu oponente na Posição de Ataque: Esse monstro(s) perde 2000 ATQ, então se o seu ATQ foi reduzido a 0 como resultado, destrua-o.';
    const famous = {
      idCarta: 'SLIFER-001',
      name: 'Slifer the Sky Dragon',
      description: sliferDescription,
      cardImage: '/images/cards/default.png',
      type: 'Monster',
      monsterType: 'Effect',
      attribute: 'DIVINE',
      race: 'Divine-Beast',
      level: 10,
      atk: 0,
      def: 0,
      rarity: 'Legendary',
      isActive: true,
      isBanned: false,
      maxCopiesInDeck: 1,
      isForSale: false,
      priceCredits: undefined as number | undefined,
      priceCash: undefined as number | undefined,
    };
    await repo.insert(famous as any);
  }
  const sliferRows = await dataSource.query(`SELECT id FROM cards WHERE "idCarta" = 'SLIFER-001'`);
  ids.push(...sliferRows.map((r: { id: string }) => r.id));

  const existingObelisk = await repo.findOne({ where: { idCarta: 'OBELISK-001' } });
  if (!existingObelisk) {
    const obeliskDescription =
      'Requer 3 Tributos para Invocação Normal. A Invocação Normal desta carta não pode ser negada. Quando esta carta estiver no campo, ela não pode ser alvo de efeitos de carta. Uma vez por turno, durante o seu turno: você pode escolher 2 monstros que você controla; destrua todos os monstros que seu oponente controla.';
    const obelisk = {
      idCarta: 'OBELISK-001',
      name: 'Obelisk the Tormentor',
      description: obeliskDescription,
      cardImage: '/images/cards/default.png',
      type: 'Monster',
      monsterType: 'Effect',
      attribute: 'DIVINE',
      race: 'Divine-Beast',
      level: 10,
      atk: 4000,
      def: 4000,
      rarity: 'Legendary',
      isActive: true,
      isBanned: false,
      maxCopiesInDeck: 1,
      isForSale: false,
      priceCredits: undefined as number | undefined,
      priceCash: undefined as number | undefined,
    };
    await repo.insert(obelisk as any);
  }
  const obeliskRows = await dataSource.query(`SELECT id FROM cards WHERE "idCarta" = 'OBELISK-001'`);
  ids.push(...obeliskRows.map((r: { id: string }) => r.id));

  return ids;
}

async function seedCards(dataSource: DataSource, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const repo = dataSource.getRepository(Card);

  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, count - offset);
    const batch = Array.from({ length: batchSize }, (_, i) => {
      const n = offset + i + 1;
      const type = pick(CardType);
      const isMonster = type === 'Monster';
      const card: Record<string, unknown> = {
        idCarta: `SEED-${Date.now()}-${n}-${uuidv4().slice(0, 8)}`,
        name: `Carta Simulada ${n}`,
        description: `Descrição da carta de teste #${n}.`,
        cardImage: `/images/cards/default.png`,
        type,
        rarity: pick(CardRarity),
        isActive: true,
        isBanned: false,
        maxCopiesInDeck: 3,
        isForSale: Math.random() > 0.7,
        priceCredits: Math.random() > 0.5 ? 10 + Math.floor(Math.random() * 90) : undefined,
        priceCash: undefined,
      };
      if (isMonster) {
        card.monsterType = pick(MonsterType);
        card.attribute = pick(CardAttribute);
        card.race = pick(MonsterRace);
        card.level = 1 + Math.floor(Math.random() * 12);
        card.atk = Math.floor(Math.random() * 3500);
        card.def = Math.floor(Math.random() * 3500);
      } else if (type === 'Spell') {
        card.spellType = pick(SpellType);
      } else {
        card.trapType = pick(TrapType);
      }
      return card;
    });
    await repo.insert(batch as any);
  }

  const idResult = await dataSource.query(
    `SELECT id FROM cards WHERE "idCarta" LIKE 'SEED-%' ORDER BY "createdAt"`
  );
  return idResult.map((r: { id: string }) => r.id);
}

async function seedDecks(dataSource: DataSource, userIds: number[], decksPerUser: number): Promise<string[]> {
  if (decksPerUser <= 0 || userIds.length === 0) return [];
  const repo = dataSource.getRepository(Deck);
  const deckIds: string[] = [];
  let idx = 0;
  for (const userId of userIds) {
    for (let d = 0; d < decksPerUser; d++) {
      idx++;
      const result = await repo.insert(
        repo.create({ name: `Deck Seed ${idx}`, userId })
      );
      const id = (result as any).identifiers?.[0]?.id ?? (result as any).raw?.[0]?.id;
      if (id) deckIds.push(id);
    }
  }
  return deckIds;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function seedUserCards(
  dataSource: DataSource,
  userIds: number[],
  cardIds: string[],
  cardsPerUser: number
): Promise<void> {
  if (cardsPerUser <= 0 || userIds.length === 0 || cardIds.length === 0) return;
  const acquiredBy = ['PURCHASE', 'REWARD', 'DROP', 'GIFT'];
  const now = new Date().toISOString();
  const nCards = Math.min(cardsPerUser, cardIds.length);

  for (let offset = 0; offset < userIds.length; offset += BATCH_SIZE_SMALL) {
    const userBatch = userIds.slice(offset, offset + BATCH_SIZE_SMALL);
    const rows: Array<{ userId: number; cardId: string; quantity: number; acquiredBy: string }> = [];
    for (const userId of userBatch) {
      const shuffled = shuffle(cardIds).slice(0, nCards);
      for (const cardId of shuffled) {
        rows.push({
          userId,
          cardId,
          quantity: 1 + Math.floor(Math.random() * 3),
          acquiredBy: acquiredBy[Math.floor(Math.random() * acquiredBy.length)],
        });
      }
    }
    if (rows.length === 0) continue;
    const values = rows
      .map(
        (r) =>
          `(${r.userId}, '${r.cardId.replace(/'/g, "''")}', ${r.quantity}, '${r.acquiredBy}', '${now}', '${now}')`
      )
      .join(',');
    await dataSource.query(
      `INSERT INTO user_cards ("userId", "cardId", quantity, "acquiredBy", "createdAt", "updatedAt")
       VALUES ${values}`
    );
  }
}

async function seedDeckCards(
  dataSource: DataSource,
  deckIds: string[],
  cardIds: string[],
  cardsPerDeck: number
): Promise<void> {
  if (cardsPerDeck <= 0 || deckIds.length === 0 || cardIds.length === 0) return;
  const extraCount = Math.min(15, Math.floor(cardsPerDeck * 0.25));
  const mainCount = cardsPerDeck - extraCount;

  for (let offset = 0; offset < deckIds.length; offset += BATCH_SIZE_SMALL) {
    const deckBatch = deckIds.slice(offset, offset + BATCH_SIZE_SMALL);
    const rows: Array<{ deckId: string; cardId: string; isExtraDeck: boolean }> = [];
    for (const deckId of deckBatch) {
      const used = new Set<string>();
      for (let i = 0; i < mainCount; i++) {
        const cardId = cardIds[Math.floor(Math.random() * cardIds.length)];
        used.add(cardId);
        rows.push({ deckId, cardId, isExtraDeck: false });
      }
      for (let i = 0; i < extraCount; i++) {
        const cardId = cardIds[Math.floor(Math.random() * cardIds.length)];
        rows.push({ deckId, cardId, isExtraDeck: true });
      }
    }
    if (rows.length === 0) continue;
    const values = rows
      .map(
        (r) =>
          `('${r.deckId.replace(/'/g, "''")}', '${r.cardId.replace(/'/g, "''")}', ${r.isExtraDeck})`
      )
      .join(',');
    await dataSource.query(
      `INSERT INTO deck_cards ("deckId", "cardId", "isExtraDeck") VALUES ${values}`
    );
  }
}

async function seedSeasons(dataSource: DataSource, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const repo = dataSource.getRepository(Season);
  const ids: string[] = [];
  const now = new Date();
  let start = new Date(now.getFullYear() - count, 0, 1);
  for (let i = 0; i < count; i++) {
    const startDate = new Date(start.getFullYear(), start.getMonth(), 1);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 3, 0);
    const isActive = i === count - 1;
    const result = await repo.insert(
      repo.create({
        name: `Temporada Seed ${i + 1}`,
        seasonNumber: i + 1,
        startDate,
        endDate,
        isActive,
        prizes: { first: { trophy: 'gold', credits: 500 }, second: { trophy: 'silver', credits: 300 }, third: { trophy: 'bronze', credits: 100 } },
        divisionPrizes: null,
        divisionPromotion: null,
      } as any)
    );
    const id = (result as any).identifiers?.[0]?.id ?? (result as any).raw?.[0]?.id;
    if (id) ids.push(id);
    start = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  }
  return ids;
}

async function seedSeasonRankings(
  dataSource: DataSource,
  seasonIds: string[],
  userIds: number[]
): Promise<void> {
  if (seasonIds.length === 0 || userIds.length === 0) return;
  const divisions = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Legendary'];

  for (const seasonId of seasonIds) {
    const rows: Array<{ seasonId: string; userId: number; seasonScore: number; wins: number; losses: number; rank: number; division: string }> = [];
    userIds.forEach((userId, i) => {
      const wins = Math.floor(Math.random() * 80);
      const losses = Math.floor(Math.random() * 60);
      rows.push({
        seasonId,
        userId,
        seasonScore: Math.floor(Math.random() * 5000) / 10,
        wins,
        losses,
        rank: i + 1,
        division: divisions[Math.floor(Math.random() * divisions.length)],
      });
    });
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      const values = batch
        .map(
          (r) =>
            `('${r.seasonId.replace(/'/g, "''")}', ${r.userId}, ${r.seasonScore}, ${r.wins}, ${r.losses}, ${r.rank}, '${r.division}'::"Division", 0, null, NOW(), NOW())`
        )
        .join(',');
      await dataSource.query(
        `INSERT INTO season_rankings ("seasonId", "userId", "seasonScore", wins, losses, rank, division, "divisionPoints", trophy, "createdAt", "updatedAt")
       VALUES ${values}`
      );
    }
  }
}

async function seedDuels(dataSource: DataSource, userIds: number[], count: number): Promise<void> {
  if (count <= 0 || userIds.length < 2) return;
  const now = new Date();

  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, count - offset);
    const batch = Array.from({ length: batchSize }, () => {
      const i1 = Math.floor(Math.random() * userIds.length);
      let i2 = Math.floor(Math.random() * userIds.length);
      while (i2 === i1) i2 = Math.floor(Math.random() * userIds.length);
      const p1 = userIds[i1];
      const p2 = userIds[i2];
      return {
        player1_id: p1,
        player2_id: p2,
        player1_nickname: `seed_user_${p1}`,
        player2_nickname: `seed_user_${p2}`,
        status: 'FINISHED',
        player1_life_points: 0,
        player2_life_points: 8000,
        result: 'PLAYER2_WIN',
        winner_id: p2,
        current_turn: 2,
        turn_counter: 15,
        current_phase: 'END',
        duel_time: 600,
        turn_time: 90,
        origin: 'RANDOM',
        created_at: now,
        updated_at: now,
        finished_at: now,
      };
    });
    await dataSource.query(
      `INSERT INTO duels (
        "player1_id", "player2_id", "player1_nickname", "player2_nickname",
        status, "player1_life_points", "player2_life_points", result, "winner_id",
        "current_turn", "turn_counter", "current_phase", "duel_time", "turn_time", origin,
        "created_at", "updated_at", "finished_at"
      ) SELECT * FROM json_to_recordset($1::json) AS x(
        "player1_id" int, "player2_id" int, "player1_nickname" varchar, "player2_nickname" varchar,
        status varchar, "player1_life_points" int, "player2_life_points" int, result varchar, "winner_id" int,
        "current_turn" int, "turn_counter" int, "current_phase" varchar, "duel_time" int, "turn_time" int, origin varchar,
        "created_at" timestamptz, "updated_at" timestamptz, "finished_at" timestamptz
      )`,
      [JSON.stringify(batch)]
    );
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const seedUsersCount = parseInt(process.env.SEED_USERS ?? argv[0] ?? String(DEFAULT_USERS), 10) || 0;
  const seedCardsCount = parseInt(process.env.SEED_CARDS ?? argv[1] ?? String(DEFAULT_CARDS), 10) || 0;
  const decksPerUser = parseInt(process.env.SEED_DECKS_PER_USER ?? argv[2] ?? String(DEFAULT_DECKS_PER_USER), 10) || 0;
  const userCardsPerUser = parseInt(process.env.SEED_USER_CARDS_PER_USER ?? String(DEFAULT_USER_CARDS_PER_USER), 10) || 0;
  const cardsPerDeck = parseInt(process.env.SEED_CARDS_PER_DECK ?? String(DEFAULT_CARDS_PER_DECK), 10) || 0;
  const seedSeasonsCount = parseInt(process.env.SEED_SEASONS ?? argv[3] ?? String(DEFAULT_SEASONS), 10) || 0;
  const seedDuelsCount = parseInt(process.env.SEED_DUELS ?? argv[4] ?? String(DEFAULT_DUELS), 10) || 0;

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definida. Defina no .env (backend ou raiz do projeto).');
    process.exit(1);
  }

  const totalDecks = seedUsersCount * decksPerUser;
  console.log('📦 Seed de dados simulados (stress test)');
  console.log('   Users:', seedUsersCount, '| Cards (catálogo):', seedCardsCount);
  console.log('   Maleta: ~', userCardsPerUser, 'cartas/usuário | Decks:', decksPerUser, '/user (', totalDecks, ' total) |', cardsPerDeck, 'cartas/deck');
  console.log('   Seasons:', seedSeasonsCount, '| Duels:', seedDuelsCount);
  console.log('');

  const startTotal = Date.now();

  try {
    await AppDataSource.initialize();
    console.log('✅ Conectado ao banco de dados\n');
  } catch (e: any) {
    console.error('❌ Erro ao conectar:', e?.message ?? e);
    process.exit(1);
  }

  try {
    let userIds: number[] = [];
    let cardIds: string[] = [];
    let deckIds: string[] = [];
    let seasonIds: string[] = [];

    if (seedUsersCount > 0) {
      const t0 = Date.now();
      userIds = await seedUsers(AppDataSource, seedUsersCount);
      console.log(`✅ Users: ${userIds.length} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    const t0Famous = Date.now();
    const famousCardIds = await seedFamousCards(AppDataSource);
    if (famousCardIds.length > 0) {
      console.log(`✅ Cartas famosas (ex.: Slifer): ${famousCardIds.length} em ${((Date.now() - t0Famous) / 1000).toFixed(2)}s`);
    }
    if (seedCardsCount > 0) {
      const t0 = Date.now();
      cardIds = await seedCards(AppDataSource, seedCardsCount);
      console.log(`✅ Cards: ${cardIds.length} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }
    cardIds = [...famousCardIds, ...cardIds];

    if (userCardsPerUser > 0 && userIds.length > 0 && cardIds.length > 0) {
      const t0 = Date.now();
      await seedUserCards(AppDataSource, userIds, cardIds, userCardsPerUser);
      const totalMaleta = userIds.length * Math.min(userCardsPerUser, cardIds.length);
      console.log(`✅ Maleta (user_cards): ~${totalMaleta} registos em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    if (decksPerUser > 0 && userIds.length > 0) {
      const t0 = Date.now();
      deckIds = await seedDecks(AppDataSource, userIds, decksPerUser);
      console.log(`✅ Decks: ${deckIds.length} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    if (cardsPerDeck > 0 && deckIds.length > 0 && cardIds.length > 0) {
      const t0 = Date.now();
      await seedDeckCards(AppDataSource, deckIds, cardIds, cardsPerDeck);
      console.log(`✅ Deck_cards: ${deckIds.length * cardsPerDeck} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    if (seedSeasonsCount > 0) {
      const t0 = Date.now();
      seasonIds = await seedSeasons(AppDataSource, seedSeasonsCount);
      console.log(`✅ Seasons: ${seasonIds.length} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    if (seasonIds.length > 0 && userIds.length > 0) {
      const t0 = Date.now();
      await seedSeasonRankings(AppDataSource, seasonIds, userIds);
      console.log(`✅ Season_rankings: ${seasonIds.length * userIds.length} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    if (seedDuelsCount > 0 && userIds.length >= 2) {
      const t0 = Date.now();
      await seedDuels(AppDataSource, userIds, seedDuelsCount);
      console.log(`✅ Duels: ${seedDuelsCount} em ${((Date.now() - t0) / 1000).toFixed(2)}s`);
    }

    const totalTime = ((Date.now() - startTotal) / 1000).toFixed(2);
    console.log('\n📊 Totais no banco (após seed):');
    const [usersRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM users');
    const [cardsRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM cards');
    const [userCardsRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM user_cards');
    const [decksRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM decks');
    const [deckCardsRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM deck_cards');
    const [seasonsRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM seasons');
    const [rankingsRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM season_rankings');
    const [duelsRow] = await AppDataSource.query('SELECT COUNT(*) as c FROM duels');
    console.log('   users:', (usersRow as { c: string }).c);
    console.log('   cards:', (cardsRow as { c: string }).c);
    console.log('   user_cards (maleta):', (userCardsRow as { c: string }).c);
    console.log('   decks:', (decksRow as { c: string }).c);
    console.log('   deck_cards:', (deckCardsRow as { c: string }).c);
    console.log('   seasons:', (seasonsRow as { c: string }).c);
    console.log('   season_rankings:', (rankingsRow as { c: string }).c);
    console.log('   duels:', (duelsRow as { c: string }).c);
    console.log(`\n✅ Seed concluído em ${totalTime}s`);
  } catch (e: any) {
    console.error('❌ Erro durante o seed:', e?.message ?? e);
    if (e?.stack) console.error(e.stack);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

main();
