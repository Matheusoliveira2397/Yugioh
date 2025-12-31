import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('levels')
export class Level {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'int', unique: true })
  level: number; // Nível (1, 2, 3, ...)

  @Column({ type: 'int' })
  requiredScore: number; // Score total necessário para alcançar este nível

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

