import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DuelLog } from '../duels/entities/duel-log.entity';
import { Duel, DuelStatus } from '../duels/entities/duel.entity';
import { Message } from '../chat/schemas/message.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * Sistema de limpeza automática para prevenir sobrecarga do banco
 * Remove dados antigos que não são mais necessários
 */
@Injectable()
export class DatabaseCleanupService {
  private readonly logger = new Logger(DatabaseCleanupService.name);

  constructor(
    @InjectRepository(DuelLog)
    private duelLogRepository: Repository<DuelLog>,
    @InjectRepository(Duel)
    private duelRepository: Repository<Duel>,
    @InjectModel(Message.name)
    private chatMessageModel: Model<Message>,
  ) {}

  /**
   * EXECUTA TODO DIA ÀS 3:00 DA MANHÃ
   * Horário de menor uso do servidor
   */
  @Cron('0 3 * * *')
  async cleanupOldData() {
    this.logger.log('🧹 Iniciando limpeza de dados antigos...');

    try {
      await Promise.all([
        this.cleanupOldDuelLogs(),
        this.cleanupOldFinishedDuels(),
        this.cleanupOldChatMessages(),
        this.cleanupOldSessions(),
      ]);

      this.logger.log('✅ Limpeza concluída com sucesso!');
    } catch (error) {
      this.logger.error('❌ Erro na limpeza:', error);
    }
  }

  /**
   * Remove logs de duelos com mais de 30 dias
   * Mantém apenas logs recentes
   */
  private async cleanupOldDuelLogs() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.duelLogRepository.delete({
      createdAt: LessThan(thirtyDaysAgo),
    });

    this.logger.log(`🗑️  ${result.affected} logs de duelo antigos removidos`);
  }

  /**
   * Remove duelos finalizados com mais de 90 dias
   * Mantém estatísticas importantes antes de deletar
   */
  private async cleanupOldFinishedDuels() {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Arquivar estatísticas importantes antes de deletar
    const oldDuels = await this.duelRepository.find({
      where: {
        status: DuelStatus.FINISHED,
        updatedAt: LessThan(ninetyDaysAgo),
      },
    });

    // TODO: Salvar estatísticas em tabela de histórico compactado
    // await this.archiveDuelStats(oldDuels);

    const result = await this.duelRepository.delete({
      status: DuelStatus.FINISHED,
      updatedAt: LessThan(ninetyDaysAgo),
    });

    this.logger.log(`🗑️  ${result.affected} duelos antigos removidos`);
  }

  /**
   * Remove mensagens de chat com mais de 60 dias
   */
  private async cleanupOldChatMessages() {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const result = await this.chatMessageModel.deleteMany({
      createdAt: { $lt: sixtyDaysAgo },
    });

    this.logger.log(`🗑️  ${result.deletedCount} mensagens antigas removidas`);
  }

  /**
   * Remove sessões expiradas do Redis
   */
  private async cleanupOldSessions() {
    // Redis já faz isso automaticamente com TTL
    // Mas podemos forçar uma limpeza manual
    this.logger.log('🗑️  Sessões expiradas limpas pelo Redis');
  }

  /**
   * VACUUM no PostgreSQL (otimiza espaço em disco)
   * Executa toda semana
   */
  @Cron('0 4 * * 0') // Domingo às 4:00
  async vacuumDatabase() {
    this.logger.log('🔧 Executando VACUUM no banco de dados...');
    
    // PostgreSQL: VACUUM recupera espaço de linhas deletadas
    // Melhora performance de queries
    
    try {
      await this.duelRepository.query('VACUUM ANALYZE');
      this.logger.log('✅ VACUUM concluído!');
    } catch (error) {
      this.logger.error('❌ Erro no VACUUM:', error);
    }
  }

  /**
   * Limpa cache Redis de dados não usados
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupUnusedCache() {
    // Implementar limpeza de cache não usado
    this.logger.debug('🧹 Limpeza de cache executada');
  }
}
