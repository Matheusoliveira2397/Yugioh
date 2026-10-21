import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';
import { BattlePassSeason } from './entities/battle-pass-season.entity';
import {
  BattlePassLevel,
  BattlePassRewardType,
} from './entities/battle-pass-level.entity';
import { UserBattlePass } from './entities/user-battle-pass.entity';
import { EconomyService } from '../economy/economy.service';
import { CurrencyType, TransactionType } from '../economy/entities/transaction.entity';
import { ShopService } from '../shop/shop.service';
import { Card } from '../cards/entities/card.entity';

export type BattlePassTrack = 'free' | 'premium';

export interface BattlePassLevelInput {
  level: number;
  xpRequired: number;
  freeRewardType?: BattlePassRewardType | string;
  freeRewardAmount?: number;
  freeRewardCardId?: string | null;
  premiumRewardType?: BattlePassRewardType | string;
  premiumRewardAmount?: number;
  premiumRewardCardId?: string | null;
}

@Injectable()
export class BattlePassService implements OnModuleInit {
  private readonly logger = new Logger(BattlePassService.name);

  constructor(
    @InjectRepository(BattlePassSeason)
    private readonly seasonRepo: Repository<BattlePassSeason>,
    @InjectRepository(BattlePassLevel)
    private readonly levelRepo: Repository<BattlePassLevel>,
    @InjectRepository(UserBattlePass)
    private readonly progressRepo: Repository<UserBattlePass>,
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    private readonly economyService: EconomyService,
    private readonly shopService: ShopService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await new Promise((r) => setTimeout(r, 600));
    try {
      await this.ensureTables();
    } catch (e) {
      this.logger.error('Erro ao garantir tabelas do battle pass:', e);
    }
  }

  private async ensureTables() {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      try {
        await qr.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
      } catch {
        /* já existe ou sem permissão — gen_random_uuid pode estar nativo */
      }
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "battle_pass_seasons" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" varchar(120) NOT NULL,
          "description" text,
          "startsAt" TIMESTAMPTZ NOT NULL,
          "endsAt" TIMESTAMPTZ NOT NULL,
          "isActive" boolean NOT NULL DEFAULT false,
          "premiumPriceCredits" int NOT NULL DEFAULT 500,
          "xpPerWin" int NOT NULL DEFAULT 100,
          "xpPerLoss" int NOT NULL DEFAULT 40,
          "bannerUrl" varchar(500),
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "battle_pass_levels" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "seasonId" uuid NOT NULL REFERENCES "battle_pass_seasons"("id") ON DELETE CASCADE,
          "level" int NOT NULL,
          "xpRequired" int NOT NULL,
          "freeRewardType" varchar(20) NOT NULL DEFAULT 'none',
          "freeRewardAmount" int NOT NULL DEFAULT 0,
          "freeRewardCardId" uuid,
          "premiumRewardType" varchar(20) NOT NULL DEFAULT 'none',
          "premiumRewardAmount" int NOT NULL DEFAULT 0,
          "premiumRewardCardId" uuid,
          CONSTRAINT "UQ_battle_pass_levels_season_level" UNIQUE ("seasonId", "level")
        )
      `);
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "user_battle_pass" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "seasonId" uuid NOT NULL REFERENCES "battle_pass_seasons"("id") ON DELETE CASCADE,
          "xp" int NOT NULL DEFAULT 0,
          "hasPremium" boolean NOT NULL DEFAULT false,
          "claimedFreeLevels" jsonb NOT NULL DEFAULT '[]',
          "claimedPremiumLevels" jsonb NOT NULL DEFAULT '[]',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_user_battle_pass_user_season" UNIQUE ("userId", "seasonId")
        )
      `);
      await qr.query(
        `CREATE INDEX IF NOT EXISTS "IDX_user_battle_pass_seasonId" ON "user_battle_pass" ("seasonId")`,
      );
      this.logger.log('Tabelas do battle pass verificadas/criadas.');
    } finally {
      await qr.release();
    }
  }

  private normalizeRewardType(value?: string | BattlePassRewardType): BattlePassRewardType {
    const v = String(value || BattlePassRewardType.NONE).toLowerCase();
    if (v === BattlePassRewardType.CREDITS) return BattlePassRewardType.CREDITS;
    if (v === BattlePassRewardType.CASH) return BattlePassRewardType.CASH;
    if (v === BattlePassRewardType.CARD) return BattlePassRewardType.CARD;
    return BattlePassRewardType.NONE;
  }

  private computeCurrentLevel(xp: number, levels: BattlePassLevel[]): number {
    let current = 0;
    for (const lvl of levels) {
      if (xp >= lvl.xpRequired) current = Math.max(current, lvl.level);
    }
    return current;
  }

  private async getCardMap(cardIds: string[]): Promise<Map<string, { id: string; name: string; cardImage: string }>> {
    const unique = [...new Set(cardIds.filter(Boolean))];
    const map = new Map<string, { id: string; name: string; cardImage: string }>();
    if (!unique.length) return map;
    const cards = await this.cardRepo.find({
      where: { id: In(unique) },
      select: ['id', 'name', 'cardImage'],
    });
    for (const c of cards) {
      map.set(c.id, { id: c.id, name: c.name, cardImage: c.cardImage });
    }
    return map;
  }

  private enrichLevels(levels: BattlePassLevel[], cardMap: Map<string, { id: string; name: string; cardImage: string }>) {
    return levels.map((lvl) => ({
      id: lvl.id,
      level: lvl.level,
      xpRequired: lvl.xpRequired,
      freeRewardType: lvl.freeRewardType,
      freeRewardAmount: lvl.freeRewardAmount,
      freeRewardCardId: lvl.freeRewardCardId,
      freeRewardCard: lvl.freeRewardCardId ? cardMap.get(lvl.freeRewardCardId) || null : null,
      premiumRewardType: lvl.premiumRewardType,
      premiumRewardAmount: lvl.premiumRewardAmount,
      premiumRewardCardId: lvl.premiumRewardCardId,
      premiumRewardCard: lvl.premiumRewardCardId ? cardMap.get(lvl.premiumRewardCardId) || null : null,
    }));
  }

  // ==================== ADMIN ====================

  async findAllSeasonsAdmin() {
    const seasons = await this.seasonRepo.find({ order: { startsAt: 'DESC' } });
    const counts = await this.levelRepo
      .createQueryBuilder('l')
      .select('l.seasonId', 'seasonId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.seasonId')
      .getRawMany<{ seasonId: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.seasonId, Number(c.count)]));
    return seasons.map((s) => ({ ...s, levelsCount: countMap.get(s.id) || 0 }));
  }

  async createSeason(body: {
    name: string;
    description?: string | null;
    startsAt: string | Date;
    endsAt: string | Date;
    premiumPriceCredits?: number;
    xpPerWin?: number;
    xpPerLoss?: number;
    bannerUrl?: string | null;
    isActive?: boolean;
  }) {
    if (!body.name?.trim()) throw new BadRequestException('Nome é obrigatório');
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      throw new BadRequestException('Datas inválidas');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('A data de término deve ser após o início');
    }

    if (body.isActive) {
      await this.seasonRepo.update({ isActive: true }, { isActive: false });
    }

    const season = this.seasonRepo.create({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      startsAt,
      endsAt,
      isActive: !!body.isActive,
      premiumPriceCredits: Math.max(0, Math.floor(body.premiumPriceCredits ?? 500)),
      xpPerWin: Math.max(0, Math.floor(body.xpPerWin ?? 100)),
      xpPerLoss: Math.max(0, Math.floor(body.xpPerLoss ?? 40)),
      bannerUrl: body.bannerUrl?.trim() || null,
    });
    return this.seasonRepo.save(season);
  }

  async updateSeason(
    id: string,
    body: Partial<{
      name: string;
      description: string | null;
      startsAt: string | Date;
      endsAt: string | Date;
      premiumPriceCredits: number;
      xpPerWin: number;
      xpPerLoss: number;
      bannerUrl: string | null;
      isActive: boolean;
    }>,
  ) {
    const season = await this.seasonRepo.findOne({ where: { id } });
    if (!season) throw new NotFoundException('Season do passe não encontrada');

    if (body.name !== undefined) season.name = body.name.trim();
    if (body.description !== undefined) season.description = body.description?.trim() || null;
    if (body.startsAt !== undefined) season.startsAt = new Date(body.startsAt);
    if (body.endsAt !== undefined) season.endsAt = new Date(body.endsAt);
    if (body.premiumPriceCredits !== undefined) {
      season.premiumPriceCredits = Math.max(0, Math.floor(body.premiumPriceCredits));
    }
    if (body.xpPerWin !== undefined) season.xpPerWin = Math.max(0, Math.floor(body.xpPerWin));
    if (body.xpPerLoss !== undefined) season.xpPerLoss = Math.max(0, Math.floor(body.xpPerLoss));
    if (body.bannerUrl !== undefined) season.bannerUrl = body.bannerUrl?.trim() || null;

    if (body.isActive === true && !season.isActive) {
      await this.seasonRepo.update({ isActive: true }, { isActive: false });
      season.isActive = true;
    } else if (body.isActive === false) {
      season.isActive = false;
    }

    if (season.endsAt <= season.startsAt) {
      throw new BadRequestException('A data de término deve ser após o início');
    }

    return this.seasonRepo.save(season);
  }

  async activateSeason(id: string) {
    const season = await this.seasonRepo.findOne({ where: { id } });
    if (!season) throw new NotFoundException('Season do passe não encontrada');
    await this.seasonRepo.update({ isActive: true }, { isActive: false });
    season.isActive = true;
    return this.seasonRepo.save(season);
  }

  async deleteSeason(id: string) {
    const season = await this.seasonRepo.findOne({ where: { id } });
    if (!season) throw new NotFoundException('Season do passe não encontrada');
    await this.seasonRepo.remove(season);
    return { ok: true };
  }

  async getLevelsAdmin(seasonId: string) {
    const season = await this.seasonRepo.findOne({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season do passe não encontrada');
    const levels = await this.levelRepo.find({
      where: { seasonId },
      order: { level: 'ASC' },
    });
    const cardIds = levels.flatMap((l) =>
      [l.freeRewardCardId, l.premiumRewardCardId].filter(Boolean) as string[],
    );
    const cardMap = await this.getCardMap(cardIds);
    return { season, levels: this.enrichLevels(levels, cardMap) };
  }

  async replaceLevels(seasonId: string, levelsInput: BattlePassLevelInput[]) {
    const season = await this.seasonRepo.findOne({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season do passe não encontrada');
    if (!Array.isArray(levelsInput) || levelsInput.length === 0) {
      throw new BadRequestException('Informe ao menos um nível');
    }

    const normalized = levelsInput
      .map((l) => ({
        level: Math.floor(Number(l.level)),
        xpRequired: Math.max(0, Math.floor(Number(l.xpRequired))),
        freeRewardType: this.normalizeRewardType(l.freeRewardType),
        freeRewardAmount: Math.max(0, Math.floor(Number(l.freeRewardAmount ?? 0))),
        freeRewardCardId: l.freeRewardCardId || null,
        premiumRewardType: this.normalizeRewardType(l.premiumRewardType),
        premiumRewardAmount: Math.max(0, Math.floor(Number(l.premiumRewardAmount ?? 0))),
        premiumRewardCardId: l.premiumRewardCardId || null,
      }))
      .sort((a, b) => a.level - b.level);

    const levelsSet = new Set(normalized.map((l) => l.level));
    if (levelsSet.size !== normalized.length) {
      throw new BadRequestException('Há níveis duplicados');
    }
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i].xpRequired < normalized[i - 1].xpRequired) {
        throw new BadRequestException('xpRequired deve ser crescente entre os níveis');
      }
    }

    await this.levelRepo.delete({ seasonId });
    const entities = normalized.map((l) =>
      this.levelRepo.create({
        seasonId,
        ...l,
      }),
    );
    await this.levelRepo.save(entities);
    return this.getLevelsAdmin(seasonId);
  }

  async grantXpAdmin(userId: number, amount: number) {
    if (!userId || amount <= 0) throw new BadRequestException('userId e amount inválidos');
    return this.addXp(userId, Math.floor(amount), 'admin_grant');
  }

  // ==================== PLAYER ====================

  async getActiveSeason(): Promise<BattlePassSeason | null> {
    const now = new Date();
    let season = await this.seasonRepo.findOne({
      where: { isActive: true },
      order: { startsAt: 'DESC' },
    });
    if (season && (now < season.startsAt || now > season.endsAt)) {
      // Ainda listamos se marcada ativa, mas o front pode avisar; não auto-desativa
    }
    if (!season) {
      season = await this.seasonRepo
        .createQueryBuilder('s')
        .where('s.startsAt <= :now AND s.endsAt >= :now', { now })
        .orderBy('s.startsAt', 'DESC')
        .getOne();
    }
    return season;
  }

  async getOrCreateProgress(userId: number, seasonId: string): Promise<UserBattlePass> {
    let progress = await this.progressRepo.findOne({ where: { userId, seasonId } });
    if (!progress) {
      progress = this.progressRepo.create({
        userId,
        seasonId,
        xp: 0,
        hasPremium: false,
        claimedFreeLevels: [],
        claimedPremiumLevels: [],
      });
      progress = await this.progressRepo.save(progress);
    }
    return progress;
  }

  async getCurrentForUser(userId: number) {
    const season = await this.getActiveSeason();
    if (!season) {
      return { season: null, levels: [], progress: null };
    }

    const levels = await this.levelRepo.find({
      where: { seasonId: season.id },
      order: { level: 'ASC' },
    });
    const progress = await this.getOrCreateProgress(userId, season.id);
    const cardIds = levels.flatMap((l) =>
      [l.freeRewardCardId, l.premiumRewardCardId].filter(Boolean) as string[],
    );
    const cardMap = await this.getCardMap(cardIds);
    const enriched = this.enrichLevels(levels, cardMap);
    const currentLevel = this.computeCurrentLevel(progress.xp, levels);
    const nextLevel = levels.find((l) => l.level === currentLevel + 1) || null;
    const prevXp = levels.find((l) => l.level === currentLevel)?.xpRequired ?? 0;
    const nextXp = nextLevel?.xpRequired ?? null;

    return {
      season,
      levels: enriched,
      progress: {
        xp: progress.xp,
        hasPremium: progress.hasPremium,
        claimedFreeLevels: progress.claimedFreeLevels || [],
        claimedPremiumLevels: progress.claimedPremiumLevels || [],
        currentLevel,
        nextLevelXp: nextXp,
        prevLevelXp: prevXp,
      },
    };
  }

  /**
   * Adiciona XP do passe ao jogador na season ativa.
   * Seguro para chamar ao fim de duelos (não lança se não houver season).
   */
  async addXp(
    userId: number,
    amount: number,
    reason = 'duel',
  ): Promise<{ xp: number; currentLevel: number; seasonId: string } | null> {
    const intAmount = Math.floor(amount);
    if (!userId || intAmount <= 0) return null;

    const season = await this.getActiveSeason();
    if (!season) return null;

    const now = new Date();
    if (now < season.startsAt || now > season.endsAt) return null;

    const progress = await this.getOrCreateProgress(userId, season.id);
    progress.xp = (progress.xp || 0) + intAmount;
    await this.progressRepo.save(progress);

    const levels = await this.levelRepo.find({
      where: { seasonId: season.id },
      order: { level: 'ASC' },
    });
    const currentLevel = this.computeCurrentLevel(progress.xp, levels);
    this.logger.debug(
      `BattlePass XP +${intAmount} user=${userId} reason=${reason} total=${progress.xp} lvl=${currentLevel}`,
    );
    return { xp: progress.xp, currentLevel, seasonId: season.id };
  }

  /** Concede XP de vitória/derrota usando config da season ativa */
  async addXpFromDuelResult(userId: number, won: boolean): Promise<void> {
    try {
      const season = await this.getActiveSeason();
      if (!season) return;
      const amount = won ? season.xpPerWin : season.xpPerLoss;
      if (amount > 0) {
        await this.addXp(userId, amount, won ? 'duel_win' : 'duel_loss');
      }
    } catch (e: any) {
      this.logger.warn(`Falha ao dar XP do passe: ${e?.message || e}`);
    }
  }

  async buyPremium(userId: number) {
    const season = await this.getActiveSeason();
    if (!season) throw new NotFoundException('Nenhum passe ativo no momento');

    const now = new Date();
    if (now < season.startsAt || now > season.endsAt) {
      throw new BadRequestException('Este passe não está no período válido');
    }

    const progress = await this.getOrCreateProgress(userId, season.id);
    if (progress.hasPremium) {
      throw new BadRequestException('Você já possui o passe premium desta season');
    }

    const price = Math.max(0, season.premiumPriceCredits);
    if (price > 0) {
      await this.economyService.removeCurrency(
        userId,
        CurrencyType.CREDITS,
        price,
        TransactionType.PURCHASE,
        `Passe de Batalha Premium: ${season.name}`,
        { battlePassSeasonId: season.id },
      );
    }

    progress.hasPremium = true;
    await this.progressRepo.save(progress);
    return this.getCurrentForUser(userId);
  }

  private async grantReward(
    userId: number,
    type: BattlePassRewardType,
    amount: number,
    cardId: string | null,
    label: string,
  ) {
    if (type === BattlePassRewardType.NONE) return;
    if (type === BattlePassRewardType.CREDITS) {
      if (amount > 0) {
        await this.economyService.addCurrency(
          userId,
          CurrencyType.CREDITS,
          amount,
          TransactionType.REWARD,
          label,
        );
      }
      return;
    }
    if (type === BattlePassRewardType.CASH) {
      if (amount > 0) {
        await this.economyService.addCurrency(
          userId,
          CurrencyType.CASH,
          amount,
          TransactionType.REWARD,
          label,
        );
      }
      return;
    }
    if (type === BattlePassRewardType.CARD) {
      if (!cardId) throw new BadRequestException('Recompensa de carta sem cardId');
      const qty = Math.max(1, amount || 1);
      await this.shopService.addCardToUserInventory(userId, cardId, 'REWARD', qty);
    }
  }

  async claimReward(userId: number, levelNumber: number, track: BattlePassTrack) {
    const season = await this.getActiveSeason();
    if (!season) throw new NotFoundException('Nenhum passe ativo no momento');

    const level = await this.levelRepo.findOne({
      where: { seasonId: season.id, level: levelNumber },
    });
    if (!level) throw new NotFoundException('Nível não encontrado');

    const progress = await this.getOrCreateProgress(userId, season.id);
    if (progress.xp < level.xpRequired) {
      throw new BadRequestException('XP insuficiente para este nível');
    }

    if (track === 'premium') {
      if (!progress.hasPremium) {
        throw new BadRequestException('Desbloqueie o passe premium para resgatar');
      }
      const claimed = progress.claimedPremiumLevels || [];
      if (claimed.includes(levelNumber)) {
        throw new BadRequestException('Recompensa já resgatada');
      }
      if (level.premiumRewardType === BattlePassRewardType.NONE) {
        throw new BadRequestException('Este nível não tem recompensa premium');
      }
      await this.grantReward(
        userId,
        level.premiumRewardType,
        level.premiumRewardAmount,
        level.premiumRewardCardId,
        `Passe Premium Nv.${levelNumber} — ${season.name}`,
      );
      progress.claimedPremiumLevels = [...claimed, levelNumber];
    } else {
      const claimed = progress.claimedFreeLevels || [];
      if (claimed.includes(levelNumber)) {
        throw new BadRequestException('Recompensa já resgatada');
      }
      if (level.freeRewardType === BattlePassRewardType.NONE) {
        throw new BadRequestException('Este nível não tem recompensa gratuita');
      }
      await this.grantReward(
        userId,
        level.freeRewardType,
        level.freeRewardAmount,
        level.freeRewardCardId,
        `Passe Grátis Nv.${levelNumber} — ${season.name}`,
      );
      progress.claimedFreeLevels = [...claimed, levelNumber];
    }

    await this.progressRepo.save(progress);
    return this.getCurrentForUser(userId);
  }

  async claimAll(userId: number) {
    const season = await this.getActiveSeason();
    if (!season) throw new NotFoundException('Nenhum passe ativo no momento');

    const levels = await this.levelRepo.find({
      where: { seasonId: season.id },
      order: { level: 'ASC' },
    });
    const progress = await this.getOrCreateProgress(userId, season.id);
    let claimedCount = 0;

    for (const level of levels) {
      if (progress.xp < level.xpRequired) continue;

      const freeClaimed = progress.claimedFreeLevels || [];
      if (
        level.freeRewardType !== BattlePassRewardType.NONE &&
        !freeClaimed.includes(level.level)
      ) {
        await this.grantReward(
          userId,
          level.freeRewardType,
          level.freeRewardAmount,
          level.freeRewardCardId,
          `Passe Grátis Nv.${level.level} — ${season.name}`,
        );
        progress.claimedFreeLevels = [...(progress.claimedFreeLevels || []), level.level];
        claimedCount++;
      }

      if (progress.hasPremium) {
        const premClaimed = progress.claimedPremiumLevels || [];
        if (
          level.premiumRewardType !== BattlePassRewardType.NONE &&
          !premClaimed.includes(level.level)
        ) {
          await this.grantReward(
            userId,
            level.premiumRewardType,
            level.premiumRewardAmount,
            level.premiumRewardCardId,
            `Passe Premium Nv.${level.level} — ${season.name}`,
          );
          progress.claimedPremiumLevels = [
            ...(progress.claimedPremiumLevels || []),
            level.level,
          ];
          claimedCount++;
        }
      }
    }

    await this.progressRepo.save(progress);
    const data = await this.getCurrentForUser(userId);
    return { ...data, claimedCount };
  }
}
