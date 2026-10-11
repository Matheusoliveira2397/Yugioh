import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { Card, CardRarity } from '../cards/entities/card.entity';
import { User } from '../users/entities/user.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { LootBox, LootBoxOpening, LootPoolEntry, RarityChances } from './loot-box.entity';

export interface LootBoxInput {
  name: string; description?: string; cardsPerOpening: number;
  priceCredits: number; priceCash: number; isActive: boolean;
  chances: RarityChances; pool: LootPoolEntry[];
}
const rarities = Object.values(CardRarity);
@Injectable()
export class LootBoxesService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(LootBox) private readonly boxes: Repository<LootBox>,
    @InjectRepository(Card) private readonly cards: Repository<Card>,
  ) {}
  async publicList() {
    const boxes = await this.boxes.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
    return boxes.map(b => this.publicView(b));
  }
  async adminList() { return this.boxes.find({ order: { createdAt: 'DESC' } }); }
  private publicView(box: LootBox) {
    return { id: box.id, name: box.name, description: box.description,
      cardsPerOpening: box.cardsPerOpening, priceCredits: box.priceCredits,
      priceCash: box.priceCash, chances: box.chances,
      possibleCards: box.pool.length };
  }
  async validate(input: LootBoxInput) {
    if (!input || typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.length > 120)
      throw new BadRequestException('Nome inválido');
    if (!Number.isInteger(input.cardsPerOpening) || input.cardsPerOpening < 1 || input.cardsPerOpening > 50)
      throw new BadRequestException('Quantidade de sorteios deve ser entre 1 e 50');
    for (const price of [input.priceCredits, input.priceCash])
      if (!Number.isSafeInteger(price) || price < 0) throw new BadRequestException('Preço inválido');
    if (typeof input.isActive !== 'boolean') throw new BadRequestException('isActive deve ser booleano');
    if (!Array.isArray(input.pool) || !input.pool.length || input.pool.length > 1000)
      throw new BadRequestException('Selecione de 1 a 1000 cartas');
    const seen = new Set<string>();
    for (const item of input.pool) {
      if (!item || typeof item.cardId !== 'string' || seen.has(item.cardId) ||
        !Number.isInteger(item.weight) || item.weight < 1 || item.weight > 100000 ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)
        throw new BadRequestException('Cartas duplicadas ou peso/quantidade inválidos');
      seen.add(item.cardId);
    }
    if (!input.chances || Object.keys(input.chances).some(x => !rarities.includes(x as CardRarity)))
      throw new BadRequestException('Raridades inválidas');
    const chanceTotal = rarities.reduce((s, rarity) => {
      const chance = input.chances[rarity];
      if (typeof chance !== 'number' || !Number.isFinite(chance) || chance < 0 || chance > 100 ||
        Math.round(chance * 100) !== chance * 100)
        throw new BadRequestException('Percentuais devem ter até duas casas, entre 0 e 100');
      return s + Math.round(chance * 100);
    }, 0);
    if (chanceTotal !== 10000) throw new BadRequestException('Soma das raridades precisa ser 100%');
    const cards = await this.cards.find({ where: { id: In([...seen]) } });
    if (cards.length !== seen.size || cards.some(c => !c.isActive))
      throw new BadRequestException('Uma ou mais cartas não existem ou estão inativas');
    for (const rarity of rarities)
      if (input.chances[rarity] > 0 && !cards.some(c => c.rarity === rarity))
        throw new BadRequestException('Raridade sem cartas elegíveis: ' + rarity);
  }
  async create(input: LootBoxInput) {
    await this.validate(input);
    return this.boxes.save(this.boxes.create({ ...input, name: input.name.trim() }));
  }
  async update(id: string, patch: Partial<LootBoxInput>) {
    const box = await this.boxes.findOne({ where: { id } });
    if (!box) throw new NotFoundException('Loot box não encontrada');
    const merged: LootBoxInput = {
      name: patch.name ?? box.name, description: patch.description ?? box.description ?? undefined,
      cardsPerOpening: patch.cardsPerOpening ?? box.cardsPerOpening,
      priceCredits: patch.priceCredits ?? box.priceCredits,
      priceCash: patch.priceCash ?? box.priceCash,
      isActive: patch.isActive ?? box.isActive,
      chances: patch.chances ?? box.chances, pool: patch.pool ?? box.pool,
    };
    await this.validate(merged);
    Object.assign(box, merged);
    return this.boxes.save(box);
  }
  async remove(id: string) {
    const box = await this.boxes.findOne({ where: { id } });
    if (!box) throw new NotFoundException('Loot box não encontrada');
    box.isActive = false;
    await this.boxes.save(box);
    return { disabled: true };
  }
  private drawWeighted<T>(entries: Array<{ value: T; weight: number }>): T {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    if (!Number.isSafeInteger(total) || total <= 0) throw new BadRequestException('Pool sem pesos válidos');
    let roll = randomInt(total);
    for (const e of entries) { roll -= e.weight; if (roll < 0) return e.value; }
    return entries[entries.length - 1].value;
  }
  async open(id: string, userId: number, paymentMethod: 'credits' | 'cash') {
    if (paymentMethod !== 'credits' && paymentMethod !== 'cash') throw new BadRequestException('Moeda inválida');
    return this.db.transaction(async manager => {
      const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user) throw new NotFoundException('Usuário não encontrado');
      const box = await manager.getRepository(LootBox).findOne({ where: { id } });
      if (!box || !box.isActive) throw new NotFoundException('Loot box indisponível');
      // Reject invalid legacy configurations too; never silently reweight probabilities.
      await this.validate({
        name: box.name, description: box.description ?? undefined, cardsPerOpening: box.cardsPerOpening,
        priceCredits: box.priceCredits, priceCash: box.priceCash, isActive: box.isActive,
        chances: box.chances, pool: box.pool,
      });
      const price = paymentMethod === 'credits' ? box.priceCredits : box.priceCash;
      if (price <= 0) throw new BadRequestException('Essa moeda não está habilitada para esta loot box');
      if (Number(user[paymentMethod]) < price) throw new BadRequestException('Saldo insuficiente');
      const cards = await manager.getRepository(Card).find({ where: { id: In(box.pool.map(x => x.cardId)) } });
      const byId = new Map(cards.map(c => [c.id, c]));
      const poolByRarity = new Map<CardRarity, LootPoolEntry[]>();
      for (const rarity of rarities) poolByRarity.set(rarity, []);
      for (const entry of box.pool) {
        const card = byId.get(entry.cardId);
        if (!card || !card.isActive) throw new BadRequestException('Carta do pool indisponível');
        poolByRarity.get(card.rarity)!.push(entry);
      }
      const rewards = new Map<string, {cardId: string; name: string; rarity: CardRarity; quantity: number}>();
      for (let i = 0; i < box.cardsPerOpening; i++) {
        const rarity = this.drawWeighted(rarities.filter(r => box.chances[r] > 0)
          .map(r => ({ value: r, weight: Math.round(box.chances[r] * 100) })));
        const candidate = this.drawWeighted(poolByRarity.get(rarity)!.map(e => ({ value: e, weight: e.weight })));
        const card = byId.get(candidate.cardId)!;
        const previous = rewards.get(card.id);
        rewards.set(card.id, {cardId: card.id, name: card.name, rarity: card.rarity,
          quantity: (previous?.quantity || 0) + candidate.quantity});
      }
      const sum = await manager.getRepository(UserCard).createQueryBuilder('uc')
        .select('COALESCE(SUM(uc.quantity), 0)', 'total').where('uc.userId = :userId', { userId }).getRawOne();
      const incoming = [...rewards.values()].reduce((s, x) => s + x.quantity, 0);
      if (Number(sum?.total || 0) + incoming > user.maletaCapacity)
        throw new BadRequestException('Maleta sem espaço para receber as cartas');
      user[paymentMethod] = Number(user[paymentMethod]) - price;
      await manager.getRepository(User).save(user);
      for (const reward of rewards.values()) {
        let owned = await manager.getRepository(UserCard).findOne({ where: { userId, cardId: reward.cardId } });
        if (owned) { owned.quantity += reward.quantity; await manager.getRepository(UserCard).save(owned); }
        else await manager.getRepository(UserCard).save(manager.getRepository(UserCard).create({
          userId, cardId: reward.cardId, quantity: reward.quantity, acquiredBy: 'DROP',
        }));
      }
      const record = await manager.getRepository(LootBoxOpening).save(manager.getRepository(LootBoxOpening).create({
        lootBoxId: box.id, userId, currency: paymentMethod, price, rewards: [...rewards.values()],
      }));
      return { openingId: record.id, rewards: [...rewards.values()],
        remainingBalance: { credits: user.credits, cash: user.cash } };
    });
  }
}
