import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { Card, CardRarity } from '../cards/entities/card.entity';
import { User } from '../users/entities/user.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import {
  CreditRewardEntry,
  LootBox,
  LootBoxOpening,
  LootPoolEntry,
  PackReward,
  RarityChances,
} from './loot-box.entity';
import { MissionsService } from '../missions/missions.service';
import { MissionObjectiveType } from '../missions/mission-objective.types';

export interface LootBoxInput {
  name: string;
  description?: string;
  cardsPerOpening: number;
  priceCredits: number;
  priceCash: number;
  isActive: boolean;
  chances: RarityChances;
  /** Chance % de dropar créditos em vez de carta (0–100). Soma com raridades = 100. */
  creditChance?: number;
  pool: LootPoolEntry[];
  creditRewards?: CreditRewardEntry[];
}

const rarities = Object.values(CardRarity);

@Injectable()
export class LootBoxesService implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(LootBox) private readonly boxes: Repository<LootBox>,
    @InjectRepository(Card) private readonly cards: Repository<Card>,
    private readonly missionsService: MissionsService,
  ) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  /** Garante colunas novas sem exigir migração manual. */
  private async ensureSchema() {
    try {
      await this.db.query(`
        ALTER TABLE "loot_boxes"
        ADD COLUMN IF NOT EXISTS "creditChance" numeric(6,2) NOT NULL DEFAULT 0
      `);
      await this.db.query(`
        ALTER TABLE "loot_boxes"
        ADD COLUMN IF NOT EXISTS "creditRewards" jsonb NOT NULL DEFAULT '[]'::jsonb
      `);
    } catch {
      /* tabela ainda não existe — TypeORM sincroniza depois */
    }
  }

  async publicList() {
    const boxes = await this.boxes.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
    return boxes.map((b) => this.publicView(b));
  }

  async adminList() {
    return this.boxes.find({ order: { createdAt: 'DESC' } });
  }

  private publicView(box: LootBox) {
    return {
      id: box.id,
      name: box.name,
      description: box.description,
      cardsPerOpening: box.cardsPerOpening,
      priceCredits: box.priceCredits,
      priceCash: box.priceCash,
      chances: box.chances,
      creditChance: Number(box.creditChance) || 0,
      creditRewards: (box.creditRewards || []).map((r) => ({
        amount: r.amount,
        weight: r.weight,
      })),
      possibleCards: box.pool.length,
    };
  }

  private normalizeCreditChance(value: unknown): number {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 100 || Math.round(n * 100) !== n * 100) {
      throw new BadRequestException('Chance de créditos inválida (0–100, até 2 casas)');
    }
    return n;
  }

  async validate(input: LootBoxInput) {
    if (!input || typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.length > 120) {
      throw new BadRequestException('Nome inválido');
    }
    if (!Number.isInteger(input.cardsPerOpening) || input.cardsPerOpening < 1 || input.cardsPerOpening > 50) {
      throw new BadRequestException('Quantidade de drops deve ser entre 1 e 50');
    }
    for (const price of [input.priceCredits, input.priceCash]) {
      if (!Number.isSafeInteger(price) || price < 0) throw new BadRequestException('Preço inválido');
    }
    if (typeof input.isActive !== 'boolean') throw new BadRequestException('isActive deve ser booleano');

    const creditChance = this.normalizeCreditChance(input.creditChance);
    const creditRewards = Array.isArray(input.creditRewards) ? input.creditRewards : [];

    if (creditChance > 0) {
      if (!creditRewards.length || creditRewards.length > 50) {
        throw new BadRequestException('Com chance de créditos > 0, informe de 1 a 50 valores de crédito');
      }
      const seenAmounts = new Set<number>();
      for (const reward of creditRewards) {
        if (
          !reward ||
          !Number.isInteger(reward.amount) ||
          reward.amount < 1 ||
          reward.amount > 1_000_000 ||
          !Number.isInteger(reward.weight) ||
          reward.weight < 1 ||
          reward.weight > 100_000 ||
          seenAmounts.has(reward.amount)
        ) {
          throw new BadRequestException('Recompensa de créditos inválida (valor/peso)');
        }
        seenAmounts.add(reward.amount);
      }
    } else if (creditRewards.length > 0) {
      throw new BadRequestException('Remova as recompensas de créditos ou defina a chance > 0');
    }

    const needsCards = rarities.some((r) => (input.chances?.[r] ?? 0) > 0);
    if (needsCards) {
      if (!Array.isArray(input.pool) || !input.pool.length || input.pool.length > 1000) {
        throw new BadRequestException('Selecione de 1 a 1000 cartas');
      }
    } else if (Array.isArray(input.pool) && input.pool.length > 1000) {
      throw new BadRequestException('Pool de cartas inválido');
    }

    const pool = Array.isArray(input.pool) ? input.pool : [];
    const seen = new Set<string>();
    for (const item of pool) {
      if (
        !item ||
        typeof item.cardId !== 'string' ||
        seen.has(item.cardId) ||
        !Number.isInteger(item.weight) ||
        item.weight < 1 ||
        item.weight > 100000 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        throw new BadRequestException('Cartas duplicadas ou peso/quantidade inválidos');
      }
      seen.add(item.cardId);
    }

    if (!input.chances || Object.keys(input.chances).some((x) => !rarities.includes(x as CardRarity))) {
      throw new BadRequestException('Raridades inválidas');
    }

    let chanceTotal = Math.round(creditChance * 100);
    for (const rarity of rarities) {
      const chance = input.chances[rarity];
      if (
        typeof chance !== 'number' ||
        !Number.isFinite(chance) ||
        chance < 0 ||
        chance > 100 ||
        Math.round(chance * 100) !== chance * 100
      ) {
        throw new BadRequestException('Percentuais devem ter até duas casas, entre 0 e 100');
      }
      chanceTotal += Math.round(chance * 100);
    }
    if (chanceTotal !== 10000) {
      throw new BadRequestException('Soma das raridades + créditos precisa ser 100%');
    }

    if (seen.size > 0) {
      const cards = await this.cards.find({ where: { id: In([...seen]) } });
      if (cards.length !== seen.size || cards.some((c) => !c.isActive)) {
        throw new BadRequestException('Uma ou mais cartas não existem ou estão inativas');
      }
      for (const rarity of rarities) {
        if (input.chances[rarity] > 0 && !cards.some((c) => c.rarity === rarity)) {
          throw new BadRequestException('Raridade sem cartas elegíveis: ' + rarity);
        }
      }
    }
  }

  async create(input: LootBoxInput) {
    await this.validate(input);
    const creditChance = this.normalizeCreditChance(input.creditChance);
    return this.boxes.save(
      this.boxes.create({
        ...input,
        name: input.name.trim(),
        creditChance,
        creditRewards: creditChance > 0 ? input.creditRewards || [] : [],
        pool: input.pool || [],
      }),
    );
  }

  async update(id: string, patch: Partial<LootBoxInput>) {
    const box = await this.boxes.findOne({ where: { id } });
    if (!box) throw new NotFoundException('Pacote não encontrado');
    const merged: LootBoxInput = {
      name: patch.name ?? box.name,
      description: patch.description ?? box.description ?? undefined,
      cardsPerOpening: patch.cardsPerOpening ?? box.cardsPerOpening,
      priceCredits: patch.priceCredits ?? box.priceCredits,
      priceCash: patch.priceCash ?? box.priceCash,
      isActive: patch.isActive ?? box.isActive,
      chances: patch.chances ?? box.chances,
      creditChance: patch.creditChance !== undefined ? patch.creditChance : Number(box.creditChance) || 0,
      pool: patch.pool ?? box.pool,
      creditRewards: patch.creditRewards ?? box.creditRewards ?? [],
    };
    await this.validate(merged);
    Object.assign(box, {
      ...merged,
      creditChance: this.normalizeCreditChance(merged.creditChance),
      creditRewards: (merged.creditChance ?? 0) > 0 ? merged.creditRewards || [] : [],
      pool: merged.pool || [],
    });
    return this.boxes.save(box);
  }

  async remove(id: string) {
    const box = await this.boxes.findOne({ where: { id } });
    if (!box) throw new NotFoundException('Pacote não encontrado');
    box.isActive = false;
    await this.boxes.save(box);
    return { disabled: true };
  }

  private drawWeighted<T>(entries: Array<{ value: T; weight: number }>): T {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    if (!Number.isSafeInteger(total) || total <= 0) throw new BadRequestException('Pool sem pesos válidos');
    let roll = randomInt(total);
    for (const e of entries) {
      roll -= e.weight;
      if (roll < 0) return e.value;
    }
    return entries[entries.length - 1].value;
  }

  /**
   * Abre um pacote (compra na loja). Também exportável para outros módulos
   * via openForUser se paymentMethod for omitido e options.free = true no futuro.
   */
  async open(id: string, userId: number, paymentMethod: 'credits' | 'cash') {
    if (paymentMethod !== 'credits' && paymentMethod !== 'cash') {
      throw new BadRequestException('Moeda inválida');
    }
    return this.db
      .transaction(async (manager) => {
        const user = await manager.getRepository(User).findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Usuário não encontrado');

        const box = await manager.getRepository(LootBox).findOne({ where: { id } });
        if (!box || !box.isActive) throw new NotFoundException('Pacote indisponível');

        const creditChance = Number(box.creditChance) || 0;
        const creditRewards = box.creditRewards || [];

        await this.validate({
          name: box.name,
          description: box.description ?? undefined,
          cardsPerOpening: box.cardsPerOpening,
          priceCredits: box.priceCredits,
          priceCash: box.priceCash,
          isActive: box.isActive,
          chances: box.chances,
          creditChance,
          pool: box.pool || [],
          creditRewards,
        });

        const price = paymentMethod === 'credits' ? box.priceCredits : box.priceCash;
        if (price <= 0) throw new BadRequestException('Essa moeda não está habilitada para este pacote');
        if (Number(user[paymentMethod]) < price) throw new BadRequestException('Saldo insuficiente');

        const cardIds = (box.pool || []).map((x) => x.cardId);
        const cards =
          cardIds.length > 0
            ? await manager.getRepository(Card).find({ where: { id: In(cardIds) } })
            : [];
        const byId = new Map(cards.map((c) => [c.id, c]));
        const poolByRarity = new Map<CardRarity, LootPoolEntry[]>();
        for (const rarity of rarities) poolByRarity.set(rarity, []);
        for (const entry of box.pool || []) {
          const card = byId.get(entry.cardId);
          if (!card || !card.isActive) throw new BadRequestException('Carta do pool indisponível');
          poolByRarity.get(card.rarity)!.push(entry);
        }

        type DropKind = CardRarity | '__credits__';
        const dropBuckets: Array<{ value: DropKind; weight: number }> = rarities
          .filter((r) => box.chances[r] > 0)
          .map((r) => ({ value: r as DropKind, weight: Math.round(box.chances[r] * 100) }));
        if (creditChance > 0) {
          dropBuckets.push({ value: '__credits__', weight: Math.round(creditChance * 100) });
        }

        /** Um item por drop (para animação de abertura). */
        const drawResults: PackReward[] = [];
        /** Agregado por carta para inventário. */
        const cardRewards = new Map<
          string,
          {
            type: 'card';
            cardId: string;
            idCarta?: string;
            name: string;
            rarity: CardRarity;
            quantity: number;
            cardImage?: string | null;
          }
        >();
        let creditsGained = 0;

        for (let i = 0; i < box.cardsPerOpening; i++) {
          const kind = this.drawWeighted(dropBuckets);
          if (kind === '__credits__') {
            const picked = this.drawWeighted(
              creditRewards.map((e) => ({ value: e, weight: e.weight })),
            );
            creditsGained += picked.amount;
            drawResults.push({ type: 'credits', amount: picked.amount });
            continue;
          }
          const candidate = this.drawWeighted(
            poolByRarity.get(kind)!.map((e) => ({ value: e, weight: e.weight })),
          );
          const card = byId.get(candidate.cardId)!;
          for (let q = 0; q < candidate.quantity; q++) {
            drawResults.push({
              type: 'card',
              cardId: card.id,
              idCarta: card.idCarta,
              name: card.name,
              rarity: card.rarity,
              quantity: 1,
              cardImage: card.cardImage,
            });
          }
          const previous = cardRewards.get(card.id);
          cardRewards.set(card.id, {
            type: 'card',
            cardId: card.id,
            idCarta: card.idCarta,
            name: card.name,
            rarity: card.rarity,
            quantity: (previous?.quantity || 0) + candidate.quantity,
            cardImage: card.cardImage,
          });
        }

        const incomingCards = [...cardRewards.values()].reduce((s, x) => s + x.quantity, 0);
        if (incomingCards > 0) {
          const sum = await manager
            .getRepository(UserCard)
            .createQueryBuilder('uc')
            .select('COALESCE(SUM(uc.quantity), 0)', 'total')
            .where('uc.userId = :userId', { userId })
            .getRawOne();
          if (Number(sum?.total || 0) + incomingCards > user.maletaCapacity) {
            throw new BadRequestException('Maleta sem espaço para receber as cartas');
          }
        }

        user[paymentMethod] = Number(user[paymentMethod]) - price;
        if (creditsGained > 0) {
          user.credits = Number(user.credits || 0) + creditsGained;
        }
        await manager.getRepository(User).save(user);

        for (const reward of cardRewards.values()) {
          let owned = await manager.getRepository(UserCard).findOne({
            where: { userId, cardId: reward.cardId },
          });
          if (owned) {
            owned.quantity += reward.quantity;
            await manager.getRepository(UserCard).save(owned);
          } else {
            await manager.getRepository(UserCard).save(
              manager.getRepository(UserCard).create({
                userId,
                cardId: reward.cardId,
                quantity: reward.quantity,
                acquiredBy: 'DROP',
              }),
            );
          }
        }

        const record = await manager.getRepository(LootBoxOpening).save(
          manager.getRepository(LootBoxOpening).create({
            lootBoxId: box.id,
            userId,
            currency: paymentMethod,
            price,
            rewards: drawResults,
          }),
        );

        return {
          openingId: record.id,
          rewards: drawResults,
          remainingBalance: { credits: user.credits, cash: user.cash },
        };
      })
      .then(async (result) => {
        try {
          await this.missionsService.trackEvent(userId, MissionObjectiveType.OPEN_LOOT_BOX, 1);
        } catch {
          /* não falha a abertura */
        }
        return result;
      });
  }
}
