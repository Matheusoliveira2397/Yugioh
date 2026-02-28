import { Injectable, OnModuleInit } from '@nestjs/common';
import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { EffectIntegrityService } from '../validation/effect-integrity.service';
import { EffectBackupService } from '../backup/effect-backup.service';
import { logger } from '../../../../../common/utils/logger.util';

/**
 * Serviço de Monitoramento de Efeitos
 * 
 * Monitora a saúde do sistema de efeitos e alerta sobre problemas
 */
@Injectable()
export class EffectMonitorService implements OnModuleInit {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: Date | null = null;
  private healthCheckInterval = 5 * 60 * 1000; // 5 minutos

  constructor(
    private readonly registry: CardEffectRegistryService,
    private readonly integrityService: EffectIntegrityService,
    private readonly backupService: EffectBackupService,
  ) {}

  async onModuleInit() {
    logger.info(`🔍 [EffectMonitor] Iniciando monitoramento de efeitos...`);
    
    // Criar backup inicial
    try {
      await this.backupService.createBackup('initial');
    } catch (error) {
      logger.warn(`⚠️ [EffectMonitor] Erro ao criar backup inicial:`, error);
    }

    // Executar validação inicial
    await this.runHealthCheck();

    // Iniciar monitoramento periódico
    this.startMonitoring();
  }

  /**
   * Inicia monitoramento periódico
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.runHealthCheck();
    }, this.healthCheckInterval);

    logger.info(`✅ [EffectMonitor] Monitoramento periódico iniciado (intervalo: ${this.healthCheckInterval}ms)`);
  }

  /**
   * Executa verificação de saúde
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    this.lastHealthCheck = new Date();

    try {
      logger.debug(`🔍 [EffectMonitor] Executando verificação de saúde...`);

      // Validar integridade
      const integrityReport = await this.integrityService.validateAllEffects();

      // Verificar se há problemas
      const hasErrors = integrityReport.invalidEffects > 0;
      const hasWarnings = integrityReport.effectsWithWarnings > 0;

      const result: HealthCheckResult = {
        timestamp: this.lastHealthCheck,
        isHealthy: integrityReport.isHealthy,
        totalEffects: integrityReport.totalEffects,
        validEffects: integrityReport.validEffects,
        invalidEffects: integrityReport.invalidEffects,
        effectsWithWarnings: integrityReport.effectsWithWarnings,
        duration: Date.now() - startTime,
        hasErrors,
        hasWarnings,
      };

      // Alertar se houver problemas
      if (hasErrors) {
        logger.error(`❌ [EffectMonitor] PROBLEMAS DETECTADOS: ${integrityReport.invalidEffects} efeitos inválidos!`);
        await this.handleErrors(integrityReport);
      } else if (hasWarnings) {
        logger.warn(`⚠️ [EffectMonitor] AVISOS: ${integrityReport.effectsWithWarnings} efeitos com avisos`);
      } else {
        logger.info(`✅ [EffectMonitor] Sistema saudável: ${integrityReport.validEffects} efeitos válidos`);
      }

      return result;
    } catch (error) {
      logger.error(`❌ [EffectMonitor] Erro na verificação de saúde:`, error);
      
      return {
        timestamp: this.lastHealthCheck,
        isHealthy: false,
        totalEffects: 0,
        validEffects: 0,
        invalidEffects: 0,
        effectsWithWarnings: 0,
        duration: Date.now() - startTime,
        hasErrors: true,
        hasWarnings: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Trata erros detectados
   */
  private async handleErrors(integrityReport: any): Promise<void> {
    // Criar backup de emergência
    try {
      await this.backupService.createBackup('error-detected');
      logger.info(`💾 [EffectMonitor] Backup de emergência criado`);
    } catch (error) {
      logger.error(`❌ [EffectMonitor] Erro ao criar backup de emergência:`, error);
    }

    // Logar detalhes dos erros
    const invalidEffects = integrityReport.results.filter((r: any) => !r.isValid);
    for (const effect of invalidEffects) {
      logger.error(`❌ [EffectMonitor] Efeito inválido: ${effect.cardIdentifier}`);
      for (const error of effect.errors) {
        logger.error(`   - ${error}`);
      }
    }
  }

  /**
   * Obtém status atual do monitoramento
   */
  getStatus(): MonitorStatus {
    return {
      isMonitoring: this.monitoringInterval !== null,
      lastHealthCheck: this.lastHealthCheck,
      healthCheckInterval: this.healthCheckInterval,
      isHealthy: this.integrityService.isSystemHealthy(),
    };
  }

  /**
   * Para o monitoramento
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info(`🛑 [EffectMonitor] Monitoramento parado`);
    }
  }
}

export interface HealthCheckResult {
  timestamp: Date | null;
  isHealthy: boolean;
  totalEffects: number;
  validEffects: number;
  invalidEffects: number;
  effectsWithWarnings: number;
  duration: number;
  hasErrors: boolean;
  hasWarnings: boolean;
  error?: string;
}

export interface MonitorStatus {
  isMonitoring: boolean;
  lastHealthCheck: Date | null;
  healthCheckInterval: number;
  isHealthy: boolean;
}

