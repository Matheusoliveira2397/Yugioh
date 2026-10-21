import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Duel, DuelStatus } from '../duels/entities/duel.entity';
import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../users/entities/user.entity';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { BotDifficulty, BotParticipation, ManagedBot } from './entities/managed-bot.entity';

export interface BotInput {
  name: string;
  deckId: string;
  difficulty?: BotDifficulty;
  level?: number;
  participation?: BotParticipation;
  intervalMinutes?: number;
  enabled?: boolean;
}

@Injectable()
export class BotsService {
  constructor(
    @InjectRepository(ManagedBot) private readonly bots: Repository<ManagedBot>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Deck) private readonly decks: Repository<Deck>,
    @InjectRepository(DeckCard) private readonly cards: Repository<DeckCard>,
    @InjectRepository(Duel) private readonly duels: Repository<Duel>,
  ) {}

  list() { return this.bots.find({ order: { createdAt: 'DESC' } }); }

  private validate(input: Partial<BotInput>, creating = false) {
    if (creating && (!input.name || !input.deckId)) throw new BadRequestException('Nome e deck são obrigatórios');
    if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 100))
      throw new BadRequestException('Nome: 2 a 100 caracteres');
    if (input.level !== undefined && (!Number.isInteger(input.level) || input.level < 1 || input.level > 100))
      throw new BadRequestException('Nível inválido (1–100)');
    if (input.intervalMinutes !== undefined && (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes < 1 || input.intervalMinutes > 10080))
      throw new BadRequestException('Intervalo inválido (1–10080 minutos)');
    if (input.difficulty !== undefined && !Object.values(BotDifficulty).includes(input.difficulty))
      throw new BadRequestException('Dificuldade inválida');
    if (input.participation !== undefined && !Object.values(BotParticipation).includes(input.participation))
      throw new BadRequestException('Modo inválido');

  }

  private async source(deckId: string) {
    const deck = await this.decks.findOne({ where: { id: deckId } });
    if (!deck) throw new NotFoundException('Deck não encontrado');
    if (!(await this.cards.count({ where: { deckId } }))) throw new BadRequestException('Deck vazio');
    return deck;
  }

  private async duplicate(source: Deck, userId: number) {
    const cards = await this.cards.find({ where: { deckId: source.id } });
    const deck = await this.decks.save(this.decks.create({ name: source.name, userId, coverCardId: source.coverCardId }));
    await this.cards.save(cards.map(card => this.cards.create({ deckId: deck.id, cardId: card.cardId, isExtraDeck: card.isExtraDeck })));
    return deck;
  }

  async create(input: BotInput) {
    this.validate(input, true);
    const source = await this.source(input.deckId);
    const nickname = input.name.trim();
    if (await this.users.exist({ where: { nickname } })) throw new BadRequestException('Nickname já utilizado');
    const slug = randomUUID().replace(/-/g, '');
    const user = await this.users.save(this.users.create({
      nickname, username: 'bot_' + slug,
      email: 'bot_' + slug + '@bots.invalid',
      password: await bcrypt.hash(randomBytes(48).toString('hex'), 12),
      role: UserRole.PLAYER, isOnline: false, isEmailVerified: true, level: input.level ?? 1,
    }));
    try {
      const deck = await this.duplicate(source, user.id);
      await this.users.update(user.id, { equippedDeckId: deck.id, equippedDeckName: deck.name });
      return await this.bots.save(this.bots.create({
        userId: user.id, name: nickname, level: input.level ?? 1,
        difficulty: input.difficulty ?? BotDifficulty.EXPERT,
        sourceDeckId: source.id, botDeckId: deck.id,
        participation: input.participation ?? BotParticipation.NONE,
        intervalMinutes: input.intervalMinutes ?? 30, enabled: input.enabled ?? false,
      }));
    } catch (error) {
      await this.users.delete(user.id);
      throw error;
    }
  }

  async update(id: string, input: Partial<BotInput>) {
    this.validate(input);
    const bot = await this.bots.findOne({ where: { id } });
    if (!bot) throw new NotFoundException('Bot não encontrado');
    if (input.name !== undefined) {
      const found = await this.users.findOne({ where: { nickname: input.name.trim() } });
      if (found && found.id !== bot.userId) throw new BadRequestException('Nickname já utilizado');
      bot.name = input.name.trim();
      await this.users.update(bot.userId, { nickname: bot.name });
    }
    if (input.level !== undefined) {
      bot.level = input.level;
      await this.users.update(bot.userId, { level: input.level });
    }
    if (input.difficulty !== undefined) bot.difficulty = input.difficulty;
    if (input.participation !== undefined) bot.participation = input.participation;
    if (input.intervalMinutes !== undefined) bot.intervalMinutes = input.intervalMinutes;
    if (input.enabled !== undefined) bot.enabled = input.enabled;
    if (input.deckId && input.deckId !== bot.sourceDeckId) {
      const src = await this.source(input.deckId);
      const deck = await this.duplicate(src, bot.userId);
      const oldId = bot.botDeckId;
      bot.sourceDeckId = src.id;
      bot.botDeckId = deck.id;
      await this.users.update(bot.userId, { equippedDeckId: deck.id, equippedDeckName: deck.name });
      await this.decks.delete(oldId);
    }
    return this.bots.save(bot);
  }

  async remove(id: string) {
    const bot = await this.bots.findOne({ where: { id } });
    if (!bot) throw new NotFoundException('Bot não encontrado');
    const active = await this.duels.exist({ where: [
      { player1Id: bot.userId, status: In([DuelStatus.WAITING, DuelStatus.IN_PROGRESS]) },
      { player2Id: bot.userId, status: In([DuelStatus.WAITING, DuelStatus.IN_PROGRESS]) },
    ] });
    if (active) throw new BadRequestException('Não é possível remover um bot durante um duelo ativo');
    await this.bots.delete(id);
    // Preserve user and duel history references.
    await this.users.update(bot.userId, { isBanned: true, isOnline: false });
    return { deleted: true };
  }
}
