import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('maleta_templates')
export class MaletaTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image: string | null;

  @Column({ type: 'int', default: 1 })
  bonusDecks: number;

  @Column({ type: 'int', default: 100 })
  bonusMaletaCapacity: number;

  @Column({ type: 'int', default: 0, nullable: true })
  priceCredits: number | null;

  @Column({ type: 'int', default: 0, nullable: true })
  priceCash: number | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  isForSale: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

