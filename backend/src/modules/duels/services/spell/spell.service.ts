import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { DuelUtilsService } from '../duel-utils.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por lógica de spells
 * Separa a lógica de spells do DuelsService principal
 * 
 * Responsabilidades:
 * - Processar efeitos de spells
 * - Gerenciar spells contínuas
 * - Gerenciar spells de campo
 * - Gerenciar spells equip
 * - Calcular bônus de spells (Banner of Courage, etc)
 */
@Injectable()
export class SpellService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Calcula o bônus do Banner of Courage
   */
  getBannerOfCourageBonus(
    duel: Duel,
    isPlayer1: boolean,
    currentPhase: string
  ): number {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).getBannerOfCourageBonus(duel, isPlayer1, currentPhase);
  }

  /**
   * Verifica se uma spell está ativa no campo
   */
  isSpellActive(
    field: any,
    spellId: string
  ): boolean {
    if (!field || !field.spellTrap || !Array.isArray(field.spellTrap)) {
      return false;
    }

    return field.spellTrap.some((st: any) => {
      if (!st || st === null) return false;
      return this.duelUtils.isExactCard(st, spellId);
    });
  }

  /**
   * Remove uma spell do campo
   */
  removeSpellFromField(
    field: any,
    spellId: string
  ): boolean {
    if (!field || !field.spellTrap || !Array.isArray(field.spellTrap)) {
      return false;
    }

    const index = field.spellTrap.findIndex((st: any) => {
      if (!st || st === null) return false;
      return this.duelUtils.isExactCard(st, spellId);
    });

    if (index !== -1) {
      field.spellTrap[index] = null;
      return true;
    }

    return false;
  }
}

