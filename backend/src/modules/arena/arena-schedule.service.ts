import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
   * Criar arenas para hoje baseado nos horários configurados
   */
  @Cron(CronExpression.EVERY_HOUR) // Verificar a cada hora
  async createTodayArenas() {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Buscar todos os horários ativos
      const schedules = await this.scheduleRepository.find({
        where: { isActive: true },
        order: { order: 'ASC' },
      });

      if (schedules.length === 0) {
        this.logger.debug('📅 Nenhum horário de arena configurado');
        return;
      }

      for (const schedule of schedules) {
        // Parsear horário (HH:mm)
        const [hours, minutes] = schedule.startTime.split(':').map(Number);
        const startTime = new Date(today);
        startTime.setHours(hours, minutes, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + schedule.durationMinutes);

        // Verificar se já existe uma arena para este horário hoje
        const existingArena = await this.arenaRepository.findOne({
          where: {
            startTime: startTime,
            isActive: true,
          },
        });

        if (!existingArena && now < endTime) {
          // Criar arena apenas se ainda não passou o horário de término
          const arena = await this.arenaService.createArenaAdmin({
            name: schedule.name,
            description: schedule.config?.description || `Arena ${schedule.startTime}`,
            startTime: startTime,
            endTime: endTime,
            scoreMultiplier: schedule.config?.scoreMultiplier || 1.5,
            bonusGems: schedule.config?.bonusGems || 50,
            config: {
              levelRanges: schedule.config?.levelRanges || [],
              rewards: {
                levelRangeRewards: schedule.config?.rewards?.levelRangeRewards || [],
              },
            },
          });

          this.logger.log(`✅ Arena criada: ${schedule.name} às ${schedule.startTime} (${schedule.durationMinutes}min)`);
        }
      }
    } catch (error) {
      this.logger.error('❌ Erro ao criar arenas do dia:', error);
    }
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

