import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('talisman_templates')
export class TalismanTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image: string | null;

  /** Bônus percentual de Score (total_score) na premiação da arena. Ex: 10 = +10% */
  @Column({ type: 'int', default: 0 })
  bonusScorePct: number;

  /** Bônus percentual de Cash na premiação da arena. Ex: 15 = +15% */
  @Column({ type: 'int', default: 0 })
  bonusCashPct: number;

  /** Bônus percentual de Arena Points (pontos por vitória/derrota na arena). Ex: 20 = +20% */
  @Column({ type: 'int', default: 0 })
  bonusArenaPointsPct: number;

  @Column({ type: 'int', default: 0, nullable: true })
  priceCredits: number | null;

  @Column({ type: 'int', default: 0, nullable: true })
  priceCash: number | null;

  /** Número de cargas que o duelista ganha ao comprar este talismã. Uma carga é gasta por duelo na arena. */
  @Column({ type: 'int', default: 10 })
  initialCharges: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  isForSale: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
