import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('arena_level_ranges')
export class ArenaLevelRange {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int' })
  min: number; // Nível mínimo da faixa

  @Column({ type: 'int' })
  max: number; // Nível máximo da faixa

  @Column({ type: 'varchar', length: 100 })
  name: string; // Nome da faixa (ex: "Nível 1-5")

  @Column({ type: 'int', default: 0 })
  order: number; // Ordem de exibição

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

