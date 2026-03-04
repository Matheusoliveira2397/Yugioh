import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('challenge_arenas')
export class ChallengeArena {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  participants: number;

  @Column({ type: 'float', default: 1.5 })
  scoreMultiplier: number;

  @Column({ type: 'int', default: 50 })
  bonusGems: number;

  @Column({ type: 'jsonb', default: {} })
  config: {
    minRating?: number;
    maxRating?: number;
    allowedDeckTypes?: string[];
    levelRanges?: Array<{ min: number; max: number; name: string }>;
    rewards?: {
      top1?: { credits?: number; gems?: number; cash?: number };
      top3?: { credits?: number; gems?: number; cash?: number };
      top10?: { credits?: number; gems?: number; cash?: number };
      // Premiações por faixa de nível (top 5 de cada faixa): cash, crédito e/ou carta
      levelRangeRewards?: Array<{
        levelRange: string;
        top1?: { cash?: number; credits?: number; cardId?: string; score?: number; additionalScore?: number };
        top2?: { cash?: number; credits?: number; cardId?: string; score?: number; additionalScore?: number };
        top3?: { cash?: number; credits?: number; cardId?: string; score?: number; additionalScore?: number };
        top4?: { cash?: number; credits?: number; cardId?: string; score?: number; additionalScore?: number };
        top5?: { cash?: number; credits?: number; cardId?: string; score?: number; additionalScore?: number };
      }>;
    };
    // Configuração de horários recorrentes
    isRecurring?: boolean; // Se a arena é recorrente diariamente
    dailyStartTime?: string; // Horário de início diário (HH:mm)
    durationMinutes?: number; // Duração em minutos
    // Controle de distribuição de prêmios
    rewardsDistributed?: boolean; // Se os prêmios já foram distribuídos
    // Controle de notificação de abertura (evitar reenvio)
    notifiedOpen?: boolean;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
