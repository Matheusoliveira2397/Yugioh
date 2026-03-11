import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Tipo/template de torneio: define padrões (nome base, banlist, taxa, premiação).
 * Ao criar um torneio a partir de um tipo, os valores são pré-preenchidos e
 * o nome pode ser sequencial (ex.: "Torneio Season 2" após "Torneio Season 1").
 */
@Entity('tournament_types')
export class TournamentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Nome base do torneio (ex.: "Torneio Season", "Torneio Semanal") */
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** Banlist padrão (IDs de cartas) */
  @Column({ type: 'json', nullable: true })
  defaultBanlist: string[];

  @Column({ type: 'int', default: 0 })
  defaultEntryFee: number;

  @Column({ type: 'varchar', length: 10, default: 'credit' })
  defaultEntryFeeType: 'credit' | 'cash';

  @Column({ type: 'int', default: 16 })
  defaultMaxParticipants: number;

  @Column({ type: 'int', default: 1 })
  defaultMinLevel: number;

  @Column({ type: 'int', nullable: true })
  defaultMaxLevel: number | null;

  /** Premiação padrão por lugar (1..4) */
  @Column({ type: 'jsonb', nullable: true })
  defaultPrizeDetails: Record<number, { credit?: number; cash?: number; cardIds?: string[]; trophyTitle?: string; trophyIcon?: string }> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
