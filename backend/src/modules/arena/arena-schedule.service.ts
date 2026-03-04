import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ArenaSchedule } from './entities/arena-schedule.entity';
import { ChallengeArena } from './arena.entity';
import { ArenaService } from './arena.service';

@Injectable()
export class ArenaScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ArenaScheduleService.name);

  constructor(
    @InjectRepository(ArenaSchedule)
    private scheduleRepository: Repository<ArenaSchedule>,
    @InjectRepository(ChallengeArena)
    private arenaRepository: Repository<ChallengeArena>,
    private arenaService: ArenaService,
  ) {}

  async onModuleInit() {
    // Verificar e criar tabela arena_schedules se não existir
    await this.ensureTableExists();
    
    // Verificar e criar arenas para hoje baseado nos horários configurados
    await this.createTodayArenas();
  }

  /**
   * Garantir que a tabela arena_schedules existe
   */
  private async ensureTableExists(): Promise<void> {
    try {
      this.logger.log('🔧 [ArenaScheduleService] Verificando tabela arena_schedules...');
      
      const tableExists = await this.scheduleRepository.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'arena_schedules'
      `);
      
      if (tableExists.length === 0) {
        this.logger.log('🔧 [ArenaScheduleService] Tabela arena_schedules não existe. Criando automaticamente...');
        
        // Verificar se gen_random_uuid() está disponível
        let uuidFunction = 'gen_random_uuid()';
        try {
          await this.scheduleRepository.query(`SELECT gen_random_uuid();`);
        } catch (testError: any) {
          try {
            await this.scheduleRepository.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
            uuidFunction = 'uuid_generate_v4()';
            this.logger.log('ℹ️ [ArenaScheduleService] Usando uuid_generate_v4() para UUIDs');
          } catch (extError: any) {
            this.logger.warn('⚠️ [ArenaScheduleService] Nenhuma função UUID disponível, usando gen_random_uuid() como padrão');
          }
        }
        
        await this.scheduleRepository.query(`
          CREATE TABLE IF NOT EXISTS "arena_schedules" (
            "id" uuid PRIMARY KEY DEFAULT ${uuidFunction},
            "name" VARCHAR(255) NOT NULL,
            "startTime" VARCHAR(5) NOT NULL,
            "durationMinutes" INTEGER NOT NULL,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "order" INTEGER NOT NULL DEFAULT 0,
            "config" JSONB NOT NULL DEFAULT '{}',
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        this.logger.log('✅ [ArenaScheduleService] Tabela arena_schedules criada com sucesso');
      } else {
        this.logger.log('✅ [ArenaScheduleService] Tabela arena_schedules já existe');
      }
    } catch (error) {
      this.logger.error('❌ [ArenaScheduleService] Erro ao verificar/criar tabela arena_schedules:', error);
    }
  }

  /**
   * Retorna o dia atual no fuso de Brasília (ano, mês, dia) para criar startTime no dia certo.
   * Usar new Date() para comparações (tudo em UTC); não usar getBrasiliaTime para "now".
   */
  private getBrasiliaToday(now: Date): { year: number; month: number; day: number } {
    const str = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
    const [y, m, d] = str.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
  }

  /**
   * Cria um Date (em UTC) para o horário em Brasília no dia dado.
   * Ex.: 14:40 Brasília no dia 28/02/2026 → Date UTC correspondente.
   */
  private createBrasiliaDate(year: number, month: number, day: number, hours: number, minutes: number): Date {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-03:00`;
    return new Date(dateString);
  }

  /**
   * Criar arenas para hoje baseado nos HORÁRIOS configurados (arena_schedules).
   * Fluxo: admin cria um horário (ex.: 15:00) com premiações e divisões → no dia, a arena abre nesse horário,
   * roda, encerra e distribui prêmios; no outro dia repete no mesmo horário.
   * Janela de criação: 15 min antes do início até 10 min depois (para não perder a abertura).
   */
  @Cron('*/2 * * * *') // A cada 2 minutos
  async createTodayArenas() {
    try {
      const now = new Date();
      const today = this.getBrasiliaToday(now);
      const startOfDayUtc = new Date(Date.UTC(today.year, today.month, today.day, 0, 0, 0, 0));
      const endOfDayUtc = new Date(Date.UTC(today.year, today.month, today.day, 23, 59, 59, 999));

      const schedules = await this.scheduleRepository.find({
        where: { isActive: true },
        order: { order: 'ASC' },
      });

      for (const schedule of schedules) {
        const parts = String(schedule.startTime).trim().split(':');
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        if (isNaN(hours) || isNaN(minutes)) continue;

        const durationMinutes = schedule.durationMinutes || 120;
        const startTime = this.createBrasiliaDate(today.year, today.month, today.day, hours, minutes);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

        const timeUntilStart = startTime.getTime() - now.getTime();
        const fifteenMinutesInMs = 15 * 60 * 1000;
        const tenMinutesAfterInMs = 10 * 60 * 1000;
        const inWindow = timeUntilStart <= fifteenMinutesInMs && timeUntilStart > -tenMinutesAfterInMs;
        const beforeEnd = now.getTime() < endTime.getTime();
        if (!inWindow || !beforeEnd) continue;

        const existingForSchedule = await this.arenaRepository.find({
          where: {
            startTime: Between(startOfDayUtc, endOfDayUtc),
            isActive: true,
          },
        });
        const alreadyCreated = existingForSchedule.some(
          (a) => (a.config as any)?.scheduleId === schedule.id || (a.name === schedule.name && Math.abs(new Date(a.startTime).getTime() - startTime.getTime()) < 60000)
        );
        if (alreadyCreated) continue;

        const config = schedule.config || {};
        const levelRanges = config.levelRanges || [];
        let rewards: any = config.rewards || {};
        const levelRangeRewards = rewards.levelRangeRewards;
        const emptyR = () => ({ cash: 0, credits: 0, cardId: undefined, score: 0, additionalScore: 0 });
        if (!levelRangeRewards && levelRanges.length > 0) {
          const top5 = (rewards as any).top5Rewards || {};
          rewards = {
            ...rewards,
            levelRangeRewards: levelRanges.map((r: any) => ({
              levelRange: r.name || r,
              top1: { ...emptyR(), ...top5.top1 },
              top2: { ...emptyR(), ...top5.top2 },
              top3: { ...emptyR(), ...top5.top3 },
              top4: { ...emptyR(), ...top5.top4 },
              top5: { ...emptyR(), ...top5.top5 },
            })),
          };
        }

        await this.arenaService.createArenaAdmin({
          name: schedule.name,
          description: (config.description as string) || `Arena ${schedule.startTime}`,
          startTime,
          endTime,
          scoreMultiplier: (config.scoreMultiplier as number) ?? 1.5,
          bonusGems: (config.bonusGems as number) ?? 50,
          config: {
            levelRanges,
            rewards,
            scheduleId: schedule.id,
            isRecurring: false,
          },
        });

        this.logger.log(`✅ Arena criada a partir do horário "${schedule.name}": ${schedule.startTime} (${durationMinutes}min) - Horário de Brasília`);
      }
    } catch (error) {
      this.logger.error('❌ Erro ao criar arenas do dia:', error);
    }
  }

  /**
   * Próximo horário de início de arena a partir dos agendamentos (arena_schedules).
   * Usado quando não existe instância futura no banco: contagem regressiva na /arena e no banner.
   * Retorna também durationMinutes para calcular endTime (ex.: 17h com horário 15h → próxima 15h do dia seguinte).
   */
  async getNextScheduledStart(): Promise<{ name: string; startTime: Date; durationMinutes: number } | null> {
    const schedules = await this.scheduleRepository.find({
      where: { isActive: true },
      order: { order: 'ASC' },
    });
    if (schedules.length === 0) return null;

    const now = new Date();
    const today = this.getBrasiliaToday(now);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrow = this.getBrasiliaToday(tomorrowDate);
    let next: { name: string; startTime: Date; durationMinutes: number } | null = null;

    for (const s of schedules) {
      const parts = String(s.startTime).trim().split(':');
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      if (isNaN(hours) || isNaN(minutes)) continue;
      const durationMinutes = s.durationMinutes ?? 120;

      const startToday = this.createBrasiliaDate(today.year, today.month, today.day, hours, minutes);
      if (startToday.getTime() > now.getTime()) {
        if (!next || startToday.getTime() < next.startTime.getTime()) {
          next = { name: s.name, startTime: startToday, durationMinutes };
        }
      }
      const startTomorrow = this.createBrasiliaDate(tomorrow.year, tomorrow.month, tomorrow.day, hours, minutes);
      if (startTomorrow.getTime() > now.getTime()) {
        if (!next || startTomorrow.getTime() < next.startTime.getTime()) {
          next = { name: s.name, startTime: startTomorrow, durationMinutes };
        }
      }
    }
    return next;
  }

  /**
   * Buscar todos os horários configurados
   */
  async getAllSchedules(): Promise<ArenaSchedule[]> {
    return this.scheduleRepository.find({
      order: { order: 'ASC' },
    });
  }

  /**
   * Criar novo horário
   */
  async createSchedule(data: {
    name: string;
    startTime: string; // HH:mm
    durationMinutes: number;
    isActive?: boolean;
    order?: number;
    config?: {
      levelRanges?: Array<{ min: number; max: number; name: string }>;
      scoreMultiplier?: number;
      bonusGems?: number;
      description?: string;
    };
  }): Promise<ArenaSchedule> {
    const schedule = this.scheduleRepository.create({
      name: data.name,
      startTime: data.startTime,
      durationMinutes: data.durationMinutes,
      isActive: data.isActive ?? true,
      order: data.order ?? 0,
      config: data.config || {},
    });

    return await this.scheduleRepository.save(schedule);
  }

  /**
   * Atualizar horário
   */
  async updateSchedule(
    id: string,
    data: {
      name?: string;
      startTime?: string;
      durationMinutes?: number;
      isActive?: boolean;
      order?: number;
      config?: {
        levelRanges?: Array<{ min: number; max: number; name: string }>;
        scoreMultiplier?: number;
        bonusGems?: number;
        description?: string;
        rewards?: {
          levelRangeRewards?: Array<{
            levelRange: string;
            top1?: { cash?: number; score?: number; additionalScore?: number };
            top2?: { cash?: number; score?: number; additionalScore?: number };
            top3?: { cash?: number; score?: number; additionalScore?: number };
            top4?: { cash?: number; score?: number; additionalScore?: number };
            top5?: { cash?: number; score?: number; additionalScore?: number };
          }>;
        };
      };
    },
  ): Promise<ArenaSchedule> {
    const schedule = await this.scheduleRepository.findOne({ where: { id } });
    if (!schedule) {
      throw new Error('Horário não encontrado');
    }

    Object.assign(schedule, data);
    return await this.scheduleRepository.save(schedule);
  }

  /**
   * Deletar horário
   */
  async deleteSchedule(id: string): Promise<void> {
    await this.scheduleRepository.delete(id);
  }
}

