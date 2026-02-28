import { Injectable } from '@nestjs/common';
import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { ICardEffect, CardEffectContext } from '../interfaces/card-effect.interface';
import { logger } from '../../../../../common/utils/logger.util';

/**
 * Serviço de Validação de Integridade de Efeitos
 * 
 * Garante que todos os efeitos estão funcionando corretamente
 * e detecta problemas antes que causem perda de dados
 */
@Injectable()
export class EffectIntegrityService {
  private validationResults: Map<string, ValidationResult> = new Map();
  private lastValidationTime: Date | null = null;

  constructor(
    private readonly registry: CardEffectRegistryService,
  ) {
    // Validação será executada pelo EffectMonitorService
  }

  /**
   * Valida todos os efeitos registrados
   * Retorna relatório completo de integridade
   */
  async validateAllEffects(): Promise<IntegrityReport> {
    const startTime = Date.now();
    const registeredCards = this.registry.getRegisteredCards();
    const results: ValidationResult[] = [];

    logger.info(`🔍 [EffectIntegrity] Iniciando validação de ${registeredCards.length} efeitos...`);

    for (const cardIdentifier of registeredCards) {
      try {
        const result = await this.validateEffect(cardIdentifier);
        results.push(result);
        this.validationResults.set(cardIdentifier, result);
      } catch (error) {
        logger.error(`❌ [EffectIntegrity] Erro ao validar ${cardIdentifier}:`, error);
        results.push({
          cardIdentifier,
          isValid: false,
          errors: [`Erro na validação: ${error instanceof Error ? error.message : String(error)}`],
          warnings: [],
        });
      }
    }

    const duration = Date.now() - startTime;
    this.lastValidationTime = new Date();

    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid).length;
    const warningCount = results.filter(r => r.warnings.length > 0).length;

    const report: IntegrityReport = {
      timestamp: this.lastValidationTime,
      totalEffects: registeredCards.length,
      validEffects: validCount,
      invalidEffects: invalidCount,
      effectsWithWarnings: warningCount,
      results,
      duration,
      isHealthy: invalidCount === 0,
    };

    logger.info(`✅ [EffectIntegrity] Validação concluída: ${validCount}/${registeredCards.length} válidos, ${invalidCount} inválidos, ${warningCount} com avisos`);

    return report;
  }

  /**
   * Valida um efeito específico
   */
  private async validateEffect(cardIdentifier: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Criar carta mock para teste
    const mockCard = {
      name: cardIdentifier,
      idCarta: cardIdentifier,
      cardName: cardIdentifier,
    };

    // Buscar efeito
    const effect = this.registry.findEffect(mockCard);
    
    if (!effect) {
      return {
        cardIdentifier,
        isValid: false,
        errors: [`Efeito não encontrado para: ${cardIdentifier}`],
        warnings: [],
      };
    }

    // Validar estrutura básica
    if (!effect.cardNames || effect.cardNames.length === 0) {
      errors.push('Efeito não tem cardNames definido');
    }

    if (typeof effect.matches !== 'function') {
      errors.push('Efeito não implementa método matches');
    }

    if (typeof effect.process !== 'function') {
      errors.push('Efeito não implementa método process');
    }

    // Validar que matches funciona
    try {
      const matchesResult = effect.matches(mockCard);
      if (typeof matchesResult !== 'boolean') {
        warnings.push('Método matches não retorna boolean');
      }
    } catch (error) {
      errors.push(`Erro ao executar matches: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Validar canActivate se existir
    if (effect.canActivate) {
      try {
        // Criar contexto mock mínimo
        const mockContext: Partial<CardEffectContext> = {
          duelId: 'test',
          isPlayer1: true,
          card: mockCard,
          zoneIndex: 0,
        };
        
        const canActivateResult = effect.canActivate(mockContext as CardEffectContext);
        if (canActivateResult !== undefined && typeof canActivateResult !== 'boolean' && !(canActivateResult instanceof Promise)) {
          warnings.push('canActivate não retorna boolean ou Promise<boolean>');
        }
      } catch (error) {
        warnings.push(`Erro ao validar canActivate: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      cardIdentifier,
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Obtém relatório de integridade
   */
  getIntegrityReport(): IntegrityReport | null {
    if (!this.lastValidationTime) {
      return null;
    }

    const results = Array.from(this.validationResults.values());
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid).length;
    const warningCount = results.filter(r => r.warnings.length > 0).length;

    return {
      timestamp: this.lastValidationTime,
      totalEffects: results.length,
      validEffects: validCount,
      invalidEffects: invalidCount,
      effectsWithWarnings: warningCount,
      results,
      duration: 0,
      isHealthy: invalidCount === 0,
    };
  }

  /**
   * Verifica se o sistema está saudável
   */
  isSystemHealthy(): boolean {
    const report = this.getIntegrityReport();
    return report ? report.isHealthy : false;
  }
}

export interface ValidationResult {
  cardIdentifier: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface IntegrityReport {
  timestamp: Date;
  totalEffects: number;
  validEffects: number;
  invalidEffects: number;
  effectsWithWarnings: number;
  results: ValidationResult[];
  duration: number;
  isHealthy: boolean;
}

