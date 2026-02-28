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
   * Obter horário atual de Brasília
   */
  private getBrasiliaTime(): Date {
    // Obter horário atual em Brasília usando timezone
    const now = new Date();
    const brasiliaTimeString = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    return new Date(brasiliaTimeString);
  }

  /**
   * Criar data no horário de Brasília com hora e minuto específicos
   * O horário configurado é em Brasília (America/Sao_Paulo)
   */
  private createBrasiliaDate(year: number, month: number, day: number, hours: number, minutes: number): Date {
    // Criar uma data no timezone de Brasília
    // Usamos uma abordagem que garante que o horário seja interpretado como Brasília
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00-03:00`; // UTC-3 para Brasília
    
    // Criar a data
    const date = new Date(dateString);
    
    // Verificar se precisa ajustar para horário de verão (se aplicável)
    // Por enquanto, usamos UTC-3 fixo, mas isso pode ser melhorado no futuro
    
    return date;
  }

  /**
   * Criar arenas para hoje baseado nos horários configurados e arenas fixas
   */
  @Cron(CronExpression.EVERY_HOUR) // Verificar a cada hora
  async createTodayArenas() {
    try {
      const brasiliaNow = this.getBrasiliaTime();
      const today = new Date(brasiliaNow.getFullYear(), brasiliaNow.getMonth(), brasiliaNow.getDate());
      
      // 1. Criar arenas baseadas em horários recorrentes (arena_schedules)
      const schedules = await this.scheduleRepository.find({
        where: { isActive: true },
        order: { order: 'ASC' },
      });

      for (const schedule of schedules) {
        // Parsear horário (HH:mm) - horário de Brasília
        const [hours, minutes] = schedule.startTime.split(':').map(Number);
        
        // Criar data de início no horário de Brasília
        const startTime = this.createBrasiliaDate(
          brasiliaNow.getFullYear(),
          brasiliaNow.getMonth(),
          brasiliaNow.getDate(),
          hours,
          minutes
        );
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + schedule.durationMinutes);

        // Verificar se já existe uma arena para este horário hoje (comparar apenas data e hora, não minutos/segundos exatos)
        const startOfDay = new Date(startTime);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startTime);
        endOfDay.setHours(23, 59, 59, 999);

        const existingArena = await this.arenaRepository.findOne({
          where: {
            startTime: Between(startOfDay, endOfDay),
            isActive: true,
          },
        });

        // Criar arena se:
        // 1. Não existe arena para hoje
        // 2. O horário de início ainda não passou (ou passou há menos de 5 minutos - margem de segurança)
        const timeUntilStart = startTime.getTime() - brasiliaNow.getTime();
        const fiveMinutesInMs = 5 * 60 * 1000;
        
        if (!existingArena && (timeUntilStart > -fiveMinutesInMs) && brasiliaNow < endTime) {
          // Criar arena
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

          this.logger.log(`✅ Arena criada (horário recorrente): ${schedule.name} às ${schedule.startTime} (${schedule.durationMinutes}min) - Horário de Brasília`);
        }
      }

      // 2. Criar arenas baseadas em arenas fixas (isRecurring = true) criadas no painel "Nova Arena"
      // Buscar todas as arenas que têm isRecurring = true no config
      // IMPORTANTE: Apenas buscar arenas que são templates (isRecurring = true)
      // Essas arenas servem como modelo para criar novas arenas todos os dias
      const allArenas = await this.arenaRepository.find({
        where: {
          isActive: true,
        },
      });

      for (const arenaTemplate of allArenas) {
        const config = arenaTemplate.config || {};
        
        // Verificar se é uma arena recorrente (template)
        if (config.isRecurring && config.dailyStartTime && config.durationMinutes) {
          // Parsear horário diário (HH:mm) - horário de Brasília
          const [hours, minutes] = config.dailyStartTime.split(':').map(Number);
          
          // Criar data de início no horário de Brasília para HOJE
          const startTime = this.createBrasiliaDate(
            brasiliaNow.getFullYear(),
            brasiliaNow.getMonth(),
            brasiliaNow.getDate(),
            hours,
            minutes
          );
          
          const endTime = new Date(startTime);
          endTime.setMinutes(endTime.getMinutes() + config.durationMinutes);

          // Verificar se já existe uma arena INSTÂNCIA (não template) para este horário hoje
          // Uma arena instância é uma arena criada a partir do template, não o template em si
          const startOfDay = new Date(startTime);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(startTime);
          endOfDay.setHours(23, 59, 59, 999);

          // Buscar arena com mesmo nome que NÃO seja um template (não tenha isRecurring = true)
          const existingArenas = await this.arenaRepository.find({
            where: {
              name: arenaTemplate.name,
              startTime: Between(startOfDay, endOfDay),
              isActive: true,
            },
          });

          // Verificar se alguma das arenas encontradas NÃO é um template
          const existingInstance = existingArenas.find(a => {
            const aConfig = a.config || {};
            return !aConfig.isRecurring; // Não é template = é instância
          });

          // Criar arena instância se:
          // 1. Não existe instância com mesmo nome para hoje
          // 2. O horário de início ainda não passou (ou passou há menos de 5 minutos - margem de segurança)
          // 3. Ainda não passou o horário de término
          const timeUntilStart = startTime.getTime() - brasiliaNow.getTime();
          const fiveMinutesInMs = 5 * 60 * 1000;
          
          if (!existingInstance && (timeUntilStart > -fiveMinutesInMs) && brasiliaNow < endTime) {
            // Criar nova arena INSTÂNCIA baseada na configuração do template
            // Esta arena não será recorrente, é apenas uma instância do dia
            // Garantir que levelRangeRewards seja gerado se não existir mas top5Rewards existir
            let rewards: any = config.rewards || {};
            const top5Rewards = (rewards as any).top5Rewards;
            if (!rewards.levelRangeRewards && top5Rewards && config.levelRanges && config.levelRanges.length > 0) {
              rewards.levelRangeRewards = config.levelRanges.map((range: any) => ({
                levelRange: range.name || range,
                top1: top5Rewards.top1 || { cash: 0, score: 0, additionalScore: 0 },
                top2: top5Rewards.top2 || { cash: 0, score: 0, additionalScore: 0 },
                top3: top5Rewards.top3 || { cash: 0, score: 0, additionalScore: 0 },
                top4: top5Rewards.top4 || { cash: 0, score: 0, additionalScore: 0 },
                top5: top5Rewards.top5 || { cash: 0, score: 0, additionalScore: 0 },
              }));
            }
            
            const newArena = await this.arenaService.createArenaAdmin({
              name: arenaTemplate.name,
              description: arenaTemplate.description || `Arena ${config.dailyStartTime}`,
              startTime: startTime,
              endTime: endTime,
              scoreMultiplier: arenaTemplate.scoreMultiplier,
              bonusGems: arenaTemplate.bonusGems,
              config: {
                levelRanges: config.levelRanges || [],
                rewards: rewards,
                isRecurring: false, // A arena criada NÃO é recorrente, é apenas uma instância
              },
            });

            this.logger.log(`✅ Arena criada automaticamente (template: "${arenaTemplate.name}"): ${arenaTemplate.name} às ${config.dailyStartTime} (${config.durationMinutes}min) - Horário de Brasília`);
          }
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

