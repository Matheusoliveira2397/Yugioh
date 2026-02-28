import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('new_account_settings')
export class NewAccountSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', default: 50 })
  initialCredits: number;

  @Column({ type: 'int', default: 50000 })
  initialCash: number;

  @Column({ type: 'jsonb', default: '[]' })
  availableInitialDeckIds: string[]; // IDs dos decks iniciais que podem ser sorteados

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

