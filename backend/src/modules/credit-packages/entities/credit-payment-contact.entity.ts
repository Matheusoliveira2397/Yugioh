import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

/** Uma linha com dados de contato para pagamento manual (PIX / WhatsApp). */
@Entity('credit_payment_contact')
export class CreditPaymentContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pixKey: string | null;

  /** Telefone WhatsApp (com DDD; pode incluir +55 ou só dígitos). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  whatsapp: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
