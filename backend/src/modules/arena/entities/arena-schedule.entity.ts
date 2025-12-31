import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Configuração de horários recorrentes para arenas
 * Permite configurar múltiplos horários por dia
 */
@Entity('arena_schedules')
export class ArenaSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string; // Nome da configuração (ex: "Arena Manhã")

  @Column({ type: 'varchar', length: 5 }) // Formato HH:mm
  startTime: string; // Horário de início (ex: "10:00")

  @Column({ type: 'int' })
  durationMinutes: number; // Duração em minutos

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Se o horário está ativo

  @Column({ type: 'int', default: 0 })
  order: number; // Ordem de exibição

  @Column({ type: 'jsonb', default: {} })
  config: {
    levelRanges?: Array<{ min: number; max: number; name: string }>;
    scoreMultiplier?: number;
    bonusGems?: number;
    description?: string;
    rewards?: {
      // Premiações por faixa de nível (top 5 de cada faixa)
      levelRangeRewards?: Array<{
        levelRange: string; // Nome da faixa (ex: "Nível 1", "Nível 2-3")
        top1?: { cash?: number; score?: number; additionalScore?: number };
        top2?: { cash?: number; score?: number; additionalScore?: number };
        top3?: { cash?: number; score?: number; additionalScore?: number };
        top4?: { cash?: number; score?: number; additionalScore?: number };
        top5?: { cash?: number; score?: number; additionalScore?: number };
      }>;
    };
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

