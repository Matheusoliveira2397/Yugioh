import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Aviso exibido em modal após login. Apenas um registro com isActive=true por vez.
 * Novo publish gera novo id — todos os usuários veem de novo até dispensar.
 */
@Entity('login_broadcasts')
@Index(['isActive', 'createdAt'])
export class LoginBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  title: string;

  @Column({ type: 'text' })
  bodyHtml: string;

  @Column({ default: false })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
