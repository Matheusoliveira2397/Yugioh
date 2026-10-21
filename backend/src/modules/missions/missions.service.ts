import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MissionCategory } from './entities/mission-category.entity';
import { Mission } from './entities/mission.entity';
import { MissionObjective } from './entities/mission-objective.entity';
import { UserMissionProgress } from './entities/user-mission-progress.entity';
import { Card } from '../cards/entities/card.entity';
import { EconomyService } from '../economy/economy.service';
import {
  CurrencyType,
  TransactionType,
} from '../economy/entities/transaction.entity';
import { ShopService } from '../shop/shop.service';
import { SeasonsService } from '../seasons/seasons.service';
import { BattlePassService } from '../battle-pass/battle-pass.service';
import {
  isValidObjectiveType,
  MISSION_OBJECTIVE_CATALOG,
  MissionObjectiveMeta,
  MissionObjectiveType,
  MissionResetType,
  MissionRewardType,
} from './mission-objective.types';
import { DuelOrigin } from '../duels/entities/duel.entity';

export interface ObjectiveInput {
  type: string;
  targetAmount: number;
  sortOrder?: number;
  meta?: MissionObjectiveMeta;
}

export interface MissionInput {
  categoryId: string;
  title: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  rewardType?: MissionRewardType | string;
  rewardAmount?: number;
  rewardCardId?: string | null;
  objectives: ObjectiveInput[];
}

export interface TrackContext {
  duelOrigin?: DuelOrigin | string;
  arenaPosition?: number;
  scoreAmount?: number;
}

@Injectable()
export class MissionsService implements OnModuleInit {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    @InjectRepository(MissionCategory)
    private readonly categoryRepo: Repository<MissionCategory>,
    @InjectRepository(Mission)
    private readonly missionRepo: Repository<Mission>,
    @InjectRepository(MissionObjective)
    private readonly objectiveRepo: Repository<MissionObjective>,
    @InjectRepository(UserMissionProgress)
    private readonly progressRepo: Repository<UserMissionProgress>,
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    private readonly economyService: EconomyService,
    private readonly shopService: ShopService,
    private readonly seasonsService: SeasonsService,
    @Inject(forwardRef(() => BattlePassService))
    private readonly battlePassService: BattlePassService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await new Promise((r) => setTimeout(r, 700));
    try {
      await this.ensureTables();
    } catch (e) {
      this.logger.error('Erro ao garantir tabelas de missões:', e);
    }
  }

  private async ensureTables() {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      try {
        await qr.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
      } catch {
        /* ignore */
      }
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "mission_categories" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "name" varchar(120) NOT NULL,
          "description" text,
          "icon" varchar(16) NOT NULL DEFAULT '🎯',
          "sortOrder" int NOT NULL DEFAULT 0,
          "isActive" boolean NOT NULL DEFAULT true,
          "resetType" varchar(20) NOT NULL DEFAULT 'none',
          "startsAt" TIMESTAMPTZ,
          "endsAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "missions" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "categoryId" uuid NOT NULL REFERENCES "mission_categories"("id") ON DELETE CASCADE,
          "title" varchar(160) NOT NULL,
          "description" text,
          "sortOrder" int NOT NULL DEFAULT 0,
          "isActive" boolean NOT NULL DEFAULT true,
          "rewardType" varchar(20) NOT NULL DEFAULT 'none',
          "rewardAmount" int NOT NULL DEFAULT 0,
          "rewardCardId" uuid,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await qr.query(`
        CREATE INDEX IF NOT EXISTS "IDX_missions_category_sort"
        ON "missions" ("categoryId", "sortOrder")
      `);
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "mission_objectives" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "missionId" uuid NOT NULL REFERENCES "missions"("id") ON DELETE CASCADE,
          "type" varchar(40) NOT NULL,
          "targetAmount" int NOT NULL DEFAULT 1,
          "sortOrder" int NOT NULL DEFAULT 0,
          "meta" jsonb NOT NULL DEFAULT '{}'
        )
      `);
      await qr.query(`
        CREATE INDEX IF NOT EXISTS "IDX_mission_objectives_mission_sort"
        ON "mission_objectives" ("missionId", "sortOrder")
      `);
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "user_mission_progress" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "missionId" uuid NOT NULL REFERENCES "missions"("id") ON DELETE CASCADE,
          "periodKey" varchar(64) NOT NULL DEFAULT 'all',
          "progress" jsonb NOT NULL DEFAULT '{}',
          "loginDays" jsonb NOT NULL DEFAULT '[]',
          "completed" boolean NOT NULL DEFAULT false,
          "claimed" boolean NOT NULL DEFAULT false,
          "completedAt" TIMESTAMPTZ,
          "claimedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_user_mission_progress_user_mission_period"
            UNIQUE ("userId", "missionId", "periodKey")
        )
      `);
      await qr.query(`
        CREATE INDEX IF NOT EXISTS "IDX_user_mission_progress_user_period"
        ON "user_mission_progress" ("userId", "periodKey")
      `);
      this.logger.log('Tabelas de missões verificadas/criadas.');
    } finally {
      await qr.release();
    }
  }

  getObjectiveCatalog() {
    return MISSION_OBJECTIVE_CATALOG;
  }

  private normalizeRewardType(value?: string | MissionRewardType): MissionRewardType {
    const v = String(value || 'none').toLowerCase();
    if (v === 'credits') return 'credits';
    if (v === 'cash') return 'cash';
    if (v === 'card') return 'card';
    if (v === 'battle_pass_xp' || v === 'battlepass_xp' || v === 'bp_xp') {
      return 'battle_pass_xp';
    }
    return 'none';
  }

  private normalizeResetType(value?: string): MissionResetType {
    const v = String(value || 'none').toLowerCase();
    if (v === 'daily' || v === 'weekly' || v === 'season' || v === 'manual') {
      return v;
    }
    return 'none';
  }

  private isoWeekKey(d = new Date()): string {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  private dayKey(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async resolvePeriodKey(resetType: MissionResetType): Promise<string> {
    if (resetType === 'daily') return this.dayKey();
    if (resetType === 'weekly') return this.isoWeekKey();
    if (resetType === 'season') {
      try {
        const season = await this.seasonsService.getActiveSeasonOrNull();
        if (season?.id) return `season:${season.id}`;
      } catch {
        /* ignore */
      }
      return 'season:none';
    }
    return 'all';
  }

  private categoryInWindow(cat: MissionCategory, now = new Date()): boolean {
    if (cat.startsAt && now < new Date(cat.startsAt)) return false;
    if (cat.endsAt && now > new Date(cat.endsAt)) return false;
    return true;
  }

  // ─── Admin: categories ───────────────────────────────────────────

  async listCategoriesAdmin() {
    const cats = await this.categoryRepo.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const counts = await this.missionRepo
      .createQueryBuilder('m')
      .select('m.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('m.categoryId')
      .getRawMany<{ categoryId: string; count: string }>();
    const map = new Map(counts.map((c) => [c.categoryId, Number(c.count)]));
    return cats.map((c) => ({ ...c, missionsCount: map.get(c.id) || 0 }));
  }

  async createCategory(body: {
    name: string;
    description?: string | null;
    icon?: string;
    sortOrder?: number;
    isActive?: boolean;
    resetType?: string;
    startsAt?: string | null;
    endsAt?: string | null;
  }) {
    if (!body.name?.trim()) throw new BadRequestException('Nome obrigatório');
    const cat = this.categoryRepo.create({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      icon: body.icon?.trim() || '🎯',
      sortOrder: Number(body.sortOrder) || 0,
      isActive: body.isActive !== false,
      resetType: this.normalizeResetType(body.resetType),
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
    });
    return this.categoryRepo.save(cat);
  }

  async updateCategory(
    id: string,
    body: Partial<{
      name: string;
      description: string | null;
      icon: string;
      sortOrder: number;
      isActive: boolean;
      resetType: string;
      startsAt: string | null;
      endsAt: string | null;
    }>,
  ) {
    const cat = await this.categoryRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    if (body.name !== undefined) cat.name = body.name.trim();
    if (body.description !== undefined) cat.description = body.description?.trim() || null;
    if (body.icon !== undefined) cat.icon = body.icon.trim() || '🎯';
    if (body.sortOrder !== undefined) cat.sortOrder = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) cat.isActive = !!body.isActive;
    if (body.resetType !== undefined) cat.resetType = this.normalizeResetType(body.resetType);
    if (body.startsAt !== undefined) {
      cat.startsAt = body.startsAt ? new Date(body.startsAt) : null;
    }
    if (body.endsAt !== undefined) {
      cat.endsAt = body.endsAt ? new Date(body.endsAt) : null;
    }
    return this.categoryRepo.save(cat);
  }

  async deleteCategory(id: string) {
    const cat = await this.categoryRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    await this.categoryRepo.remove(cat);
    return { ok: true };
  }

  // ─── Admin: missions ─────────────────────────────────────────────

  async listMissionsAdmin(categoryId?: string) {
    const where = categoryId ? { categoryId } : {};
    const missions = await this.missionRepo.find({
      where,
      relations: ['objectives', 'category'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    for (const m of missions) {
      m.objectives = (m.objectives || []).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return this.enrichMissionsWithCards(missions);
  }

  async createMission(input: MissionInput) {
    const category = await this.categoryRepo.findOne({
      where: { id: input.categoryId },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada');
    const objectives = this.validateObjectives(input.objectives);

    const mission = this.missionRepo.create({
      categoryId: input.categoryId,
      title: input.title?.trim(),
      description: input.description?.trim() || null,
      sortOrder: Number(input.sortOrder) || 0,
      isActive: input.isActive !== false,
      rewardType: this.normalizeRewardType(input.rewardType),
      rewardAmount: Math.max(0, Math.floor(Number(input.rewardAmount) || 0)),
      rewardCardId: input.rewardCardId || null,
    });
    if (!mission.title) throw new BadRequestException('Título obrigatório');

    const saved = await this.missionRepo.save(mission);
    const objs = objectives.map((o, i) =>
      this.objectiveRepo.create({
        missionId: saved.id,
        type: o.type as MissionObjectiveType,
        targetAmount: Math.max(1, Math.floor(Number(o.targetAmount) || 1)),
        sortOrder: o.sortOrder ?? i,
        meta: o.meta || {},
      }),
    );
    saved.objectives = await this.objectiveRepo.save(objs);
    const [enriched] = await this.enrichMissionsWithCards([saved]);
    return enriched;
  }

  async updateMission(id: string, input: Partial<MissionInput> & { objectives?: ObjectiveInput[] }) {
    const mission = await this.missionRepo.findOne({
      where: { id },
      relations: ['objectives'],
    });
    if (!mission) throw new NotFoundException('Missão não encontrada');

    if (input.categoryId) {
      const cat = await this.categoryRepo.findOne({ where: { id: input.categoryId } });
      if (!cat) throw new NotFoundException('Categoria não encontrada');
      mission.categoryId = input.categoryId;
    }
    if (input.title !== undefined) {
      if (!input.title.trim()) throw new BadRequestException('Título obrigatório');
      mission.title = input.title.trim();
    }
    if (input.description !== undefined) {
      mission.description = input.description?.trim() || null;
    }
    if (input.sortOrder !== undefined) mission.sortOrder = Number(input.sortOrder) || 0;
    if (input.isActive !== undefined) mission.isActive = !!input.isActive;
    if (input.rewardType !== undefined) {
      mission.rewardType = this.normalizeRewardType(input.rewardType);
    }
    if (input.rewardAmount !== undefined) {
      mission.rewardAmount = Math.max(0, Math.floor(Number(input.rewardAmount) || 0));
    }
    if (input.rewardCardId !== undefined) {
      mission.rewardCardId = input.rewardCardId || null;
    }

    await this.missionRepo.save(mission);

    if (input.objectives) {
      const objectives = this.validateObjectives(input.objectives);
      await this.objectiveRepo.delete({ missionId: id });
      const objs = objectives.map((o, i) =>
        this.objectiveRepo.create({
          missionId: id,
          type: o.type as MissionObjectiveType,
          targetAmount: Math.max(1, Math.floor(Number(o.targetAmount) || 1)),
          sortOrder: o.sortOrder ?? i,
          meta: o.meta || {},
        }),
      );
      mission.objectives = await this.objectiveRepo.save(objs);
    } else {
      mission.objectives = await this.objectiveRepo.find({
        where: { missionId: id },
        order: { sortOrder: 'ASC' },
      });
    }

    const [enriched] = await this.enrichMissionsWithCards([mission]);
    return enriched;
  }

  async deleteMission(id: string) {
    const mission = await this.missionRepo.findOne({ where: { id } });
    if (!mission) throw new NotFoundException('Missão não encontrada');
    await this.missionRepo.remove(mission);
    return { ok: true };
  }

  private validateObjectives(objectives: ObjectiveInput[]): ObjectiveInput[] {
    if (!Array.isArray(objectives) || objectives.length === 0) {
      throw new BadRequestException('Informe ao menos um objetivo');
    }
    return objectives.map((o, i) => {
      if (!isValidObjectiveType(String(o.type))) {
        throw new BadRequestException(`Tipo de objetivo inválido no índice ${i}: ${o.type}`);
      }
      const target = Math.max(1, Math.floor(Number(o.targetAmount) || 1));
      const meta: MissionObjectiveMeta = { ...(o.meta || {}) };
      if (o.type === MissionObjectiveType.ARENA_TOP_N) {
        const maxPos = Math.max(1, Math.floor(Number(meta.maxPosition) || 5));
        meta.maxPosition = maxPos;
      }
      return {
        type: o.type,
        targetAmount: target,
        sortOrder: o.sortOrder ?? i,
        meta,
      };
    });
  }

  private async enrichMissionsWithCards(missions: Mission[]) {
    const cardIds = missions
      .map((m) => m.rewardCardId)
      .filter((id): id is string => !!id);
    const unique = [...new Set(cardIds)];
    const cardMap = new Map<string, { id: string; name: string; cardImage: string }>();
    if (unique.length) {
      const cards = await this.cardRepo.find({
        where: { id: In(unique) },
        select: ['id', 'name', 'cardImage'],
      });
      for (const c of cards) {
        cardMap.set(c.id, { id: c.id, name: c.name, cardImage: c.cardImage });
      }
    }
    return missions.map((m) => ({
      ...m,
      rewardCard: m.rewardCardId ? cardMap.get(m.rewardCardId) || null : null,
    }));
  }

  // ─── Player API ──────────────────────────────────────────────────

  async getPlayerMissions(userId: number) {
    // Auto-progressão: perfil completo
    try {
      const userRows = await this.dataSource.query(
        `SELECT nickname, "profileImage" FROM users WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const u = userRows?.[0];
      if (u?.nickname && u?.profileImage) {
        await this.trackEvent(userId, MissionObjectiveType.COMPLETE_PROFILE, 1);
      }
    } catch {
      /* ignore */
    }

    const categories = await this.categoryRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const visible = categories.filter((c) => this.categoryInWindow(c));
    if (!visible.length) {
      return { categories: [], objectiveCatalog: MISSION_OBJECTIVE_CATALOG };
    }

    const catIds = visible.map((c) => c.id);
    const missions = await this.missionRepo.find({
      where: { categoryId: In(catIds), isActive: true },
      relations: ['objectives'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const enriched = await this.enrichMissionsWithCards(missions);
    const byCat = new Map<string, typeof enriched>();
    for (const m of enriched) {
      const list = byCat.get(m.categoryId) || [];
      list.push(m);
      byCat.set(m.categoryId, list);
    }

    const tabs = [];
    for (const cat of visible) {
      const periodKey = await this.resolvePeriodKey(cat.resetType);
      const catMissions = byCat.get(cat.id) || [];
      const missionViews = [];
      for (const m of catMissions) {
        const progress = await this.getOrCreateProgress(userId, m.id, periodKey);
        const objectives = (m.objectives || [])
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((o) => {
            const current = Math.min(
              Number(progress.progress?.[o.id] || 0),
              o.targetAmount,
            );
            return {
              id: o.id,
              type: o.type,
              targetAmount: o.targetAmount,
              current,
              meta: o.meta || {},
              label:
                MISSION_OBJECTIVE_CATALOG.find((c) => c.type === o.type)?.label ||
                o.type,
              done: current >= o.targetAmount,
            };
          });
        const allDone =
          objectives.length > 0 && objectives.every((o) => o.done);
        if (allDone && !progress.completed) {
          progress.completed = true;
          progress.completedAt = new Date();
          await this.progressRepo.save(progress);
        }
        missionViews.push({
          id: m.id,
          title: m.title,
          description: m.description,
          sortOrder: m.sortOrder,
          rewardType: m.rewardType,
          rewardAmount: m.rewardAmount,
          rewardCardId: m.rewardCardId,
          rewardCard: (m as any).rewardCard || null,
          objectives,
          completed: progress.completed || allDone,
          claimed: progress.claimed,
          periodKey,
        });
      }
      tabs.push({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        resetType: cat.resetType,
        startsAt: cat.startsAt,
        endsAt: cat.endsAt,
        missions: missionViews,
      });
    }

    return { categories: tabs, objectiveCatalog: MISSION_OBJECTIVE_CATALOG };
  }

  private async getOrCreateProgress(
    userId: number,
    missionId: string,
    periodKey: string,
  ): Promise<UserMissionProgress> {
    let row = await this.progressRepo.findOne({
      where: { userId, missionId, periodKey },
    });
    if (!row) {
      row = this.progressRepo.create({
        userId,
        missionId,
        periodKey,
        progress: {},
        loginDays: [],
        completed: false,
        claimed: false,
      });
      try {
        row = await this.progressRepo.save(row);
      } catch {
        row = await this.progressRepo.findOne({
          where: { userId, missionId, periodKey },
        });
        if (!row) throw new BadRequestException('Falha ao criar progresso');
      }
    }
    return row;
  }

  async claimMission(userId: number, missionId: string) {
    const mission = await this.missionRepo.findOne({
      where: { id: missionId, isActive: true },
      relations: ['objectives', 'category'],
    });
    if (!mission || !mission.category?.isActive) {
      throw new NotFoundException('Missão não encontrada');
    }
    if (!this.categoryInWindow(mission.category)) {
      throw new BadRequestException('Esta categoria de missões não está disponível');
    }

    const periodKey = await this.resolvePeriodKey(mission.category.resetType);
    const progress = await this.getOrCreateProgress(userId, missionId, periodKey);

    const objectives = (mission.objectives || []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const allDone =
      objectives.length > 0 &&
      objectives.every(
        (o) => Number(progress.progress?.[o.id] || 0) >= o.targetAmount,
      );
    if (!allDone) {
      throw new BadRequestException('Missão ainda não concluída');
    }
    if (progress.claimed) {
      throw new BadRequestException('Recompensa já resgatada');
    }

    await this.grantReward(
      userId,
      mission.rewardType,
      mission.rewardAmount,
      mission.rewardCardId,
      `Missão: ${mission.title}`,
    );

    progress.completed = true;
    progress.claimed = true;
    progress.completedAt = progress.completedAt || new Date();
    progress.claimedAt = new Date();
    await this.progressRepo.save(progress);

    return this.getPlayerMissions(userId);
  }

  async claimAllInCategory(userId: number, categoryId: string) {
    const cat = await this.categoryRepo.findOne({ where: { id: categoryId, isActive: true } });
    if (!cat) throw new NotFoundException('Categoria não encontrada');
    const missions = await this.missionRepo.find({
      where: { categoryId, isActive: true },
      relations: ['objectives'],
    });
    const periodKey = await this.resolvePeriodKey(cat.resetType);
    let claimed = 0;
    for (const m of missions) {
      const progress = await this.getOrCreateProgress(userId, m.id, periodKey);
      if (progress.claimed) continue;
      const objs = m.objectives || [];
      const allDone =
        objs.length > 0 &&
        objs.every((o) => Number(progress.progress?.[o.id] || 0) >= o.targetAmount);
      if (!allDone) continue;
      try {
        await this.grantReward(
          userId,
          m.rewardType,
          m.rewardAmount,
          m.rewardCardId,
          `Missão: ${m.title}`,
        );
        progress.completed = true;
        progress.claimed = true;
        progress.completedAt = progress.completedAt || new Date();
        progress.claimedAt = new Date();
        await this.progressRepo.save(progress);
        claimed++;
      } catch (e: any) {
        this.logger.warn(`Falha ao resgatar missão ${m.id}: ${e?.message || e}`);
      }
    }
    const data = await this.getPlayerMissions(userId);
    return { ...data, claimedCount: claimed };
  }

  private async grantReward(
    userId: number,
    type: MissionRewardType,
    amount: number,
    cardId: string | null,
    label: string,
  ) {
    if (type === 'none') return;
    if (type === 'credits' && amount > 0) {
      await this.economyService.addCurrency(
        userId,
        CurrencyType.CREDITS,
        amount,
        TransactionType.REWARD,
        label,
      );
      return;
    }
    if (type === 'cash' && amount > 0) {
      await this.economyService.addCurrency(
        userId,
        CurrencyType.CASH,
        amount,
        TransactionType.REWARD,
        label,
      );
      return;
    }
    if (type === 'battle_pass_xp' && amount > 0) {
      const result = await this.battlePassService.addXp(
        userId,
        amount,
        `mission:${label}`,
      );
      if (!result) {
        this.logger.warn(
          `Missão deu XP do passe mas não há season ativa (user=${userId}, +${amount})`,
        );
      }
      return;
    }
    if (type === 'card') {
      if (!cardId) throw new BadRequestException('Recompensa de carta sem cardId');
      const qty = Math.max(1, amount || 1);
      await this.shopService.addCardToUserInventory(userId, cardId, 'REWARD', qty);
    }
  }

  // ─── Progress tracking (called from other modules) ───────────────

  /**
   * Incrementa progresso para todos os objetivos ativos do tipo informado.
   * Seguro: erros são engolidos pelo caller tipicamente.
   */
  async trackEvent(
    userId: number,
    type: MissionObjectiveType,
    amount = 1,
    ctx: TrackContext = {},
  ): Promise<void> {
    if (!userId || amount <= 0) return;

    const objectives = await this.objectiveRepo
      .createQueryBuilder('o')
      .innerJoinAndSelect('o.mission', 'm')
      .innerJoinAndSelect('m.category', 'c')
      .where('o.type = :type', { type })
      .andWhere('m.isActive = true')
      .andWhere('c.isActive = true')
      .getMany();

    if (!objectives.length) return;

    const now = new Date();
    for (const obj of objectives) {
      const cat = obj.mission?.category;
      if (!cat || !this.categoryInWindow(cat, now)) continue;

      if (type === MissionObjectiveType.ARENA_TOP_N) {
        const maxPos = Math.max(1, Number(obj.meta?.maxPosition) || 5);
        const pos = Number(ctx.arenaPosition);
        if (!pos || pos > maxPos) continue;
      }

      const periodKey = await this.resolvePeriodKey(cat.resetType);
      const progress = await this.getOrCreateProgress(userId, obj.missionId, periodKey);
      if (progress.claimed) continue;

      const current = Number(progress.progress?.[obj.id] || 0);
      if (current >= obj.targetAmount) continue;

      const next = Math.min(obj.targetAmount, current + amount);
      progress.progress = { ...(progress.progress || {}), [obj.id]: next };

      const allObjs = await this.objectiveRepo.find({
        where: { missionId: obj.missionId },
      });
      const allDone = allObjs.every(
        (o) => Number(progress.progress?.[o.id] || 0) >= o.targetAmount,
      );
      if (allDone && !progress.completed) {
        progress.completed = true;
        progress.completedAt = new Date();
      }
      await this.progressRepo.save(progress);
    }
  }

  /** Conveniência: resultado de duelo */
  async trackDuelResult(
    userId: number,
    won: boolean,
    origin: DuelOrigin | string,
    scoreEarned = 0,
  ): Promise<void> {
    try {
      const originStr = String(origin || '').toUpperCase();
      await this.trackEvent(userId, MissionObjectiveType.PLAY_ANY_DUEL, 1, {
        duelOrigin: originStr,
      });

      if (originStr === DuelOrigin.RANDOM) {
        await this.trackEvent(userId, MissionObjectiveType.PLAY_RANDOM_DUEL, 1);
      } else if (originStr === DuelOrigin.ARENA) {
        await this.trackEvent(userId, MissionObjectiveType.PLAY_ARENA_DUEL, 1);
      } else if (originStr === DuelOrigin.TOURNAMENT) {
        await this.trackEvent(userId, MissionObjectiveType.PLAY_TOURNAMENT_DUEL, 1);
      }

      if (won) {
        await this.trackEvent(userId, MissionObjectiveType.WIN_ANY_DUEL, 1);
        if (originStr === DuelOrigin.RANDOM) {
          await this.trackEvent(userId, MissionObjectiveType.WIN_RANDOM_DUEL, 1);
        } else if (originStr === DuelOrigin.ARENA) {
          await this.trackEvent(userId, MissionObjectiveType.WIN_ARENA_DUEL, 1);
        } else if (originStr === DuelOrigin.TOURNAMENT) {
          await this.trackEvent(userId, MissionObjectiveType.WIN_TOURNAMENT_DUEL, 1);
        } else if (originStr === DuelOrigin.CHAT) {
          await this.trackEvent(userId, MissionObjectiveType.WIN_CHAT_DUEL, 1);
        } else if (originStr === DuelOrigin.RANDOM_ANIME) {
          await this.trackEvent(userId, MissionObjectiveType.WIN_RANDOM_ANIME_DUEL, 1);
        }
      }

      if (scoreEarned > 0) {
        await this.trackEvent(
          userId,
          MissionObjectiveType.EARN_SCORE,
          Math.floor(scoreEarned),
        );
      }
    } catch (e: any) {
      this.logger.warn(`trackDuelResult falhou: ${e?.message || e}`);
    }
  }

  async trackArenaTop(userId: number, position: number): Promise<void> {
    try {
      await this.trackEvent(userId, MissionObjectiveType.ARENA_TOP_N, 1, {
        arenaPosition: position,
      });
    } catch (e: any) {
      this.logger.warn(`trackArenaTop falhou: ${e?.message || e}`);
    }
  }

  async trackLogin(userId: number): Promise<void> {
    try {
      const objectives = await this.objectiveRepo
        .createQueryBuilder('o')
        .innerJoinAndSelect('o.mission', 'm')
        .innerJoinAndSelect('m.category', 'c')
        .where('o.type = :type', { type: MissionObjectiveType.LOGIN_DAYS })
        .andWhere('m.isActive = true')
        .andWhere('c.isActive = true')
        .getMany();

      const today = this.dayKey();
      for (const obj of objectives) {
        const cat = obj.mission?.category;
        if (!cat || !this.categoryInWindow(cat)) continue;
        const periodKey = await this.resolvePeriodKey(cat.resetType);
        const progress = await this.getOrCreateProgress(userId, obj.missionId, periodKey);
        if (progress.claimed) continue;

        const days = Array.isArray(progress.loginDays) ? [...progress.loginDays] : [];
        if (days.includes(today)) continue;
        days.push(today);
        progress.loginDays = days;
        progress.progress = {
          ...(progress.progress || {}),
          [obj.id]: Math.min(obj.targetAmount, days.length),
        };
        const allObjs = await this.objectiveRepo.find({
          where: { missionId: obj.missionId },
        });
        const allDone = allObjs.every(
          (o) => Number(progress.progress?.[o.id] || 0) >= o.targetAmount,
        );
        if (allDone && !progress.completed) {
          progress.completed = true;
          progress.completedAt = new Date();
        }
        await this.progressRepo.save(progress);
      }
    } catch (e: any) {
      this.logger.warn(`trackLogin falhou: ${e?.message || e}`);
    }
  }
}
