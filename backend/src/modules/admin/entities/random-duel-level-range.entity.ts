import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('random_duel_level_ranges')
export class RandomDuelLevelRange {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  minLevel: number; // Nível mínimo da faixa

  @Column({ type: 'int' })
  maxLevel: number; // Nível máximo da faixa

  @Column({ type: 'varchar', length: 100 })
  name: string; // Nome da faixa (ex: "Nível 1-5")

  @Column({ type: 'int', default: 0 })
  order: number; // Ordem de exibição

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Se a faixa está ativa

  @Column({ type: 'int', default: 0 })
  cashOnWin: number; // Cash ganho por vitória no random duel

  @Column({ type: 'int', default: 0 })
  cashOnLoss: number; // Cash ganho por derrota no random duel

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

