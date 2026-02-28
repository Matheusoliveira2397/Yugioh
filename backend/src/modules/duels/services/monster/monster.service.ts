import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { DuelUtilsService } from '../duel-utils.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por lógica de monstros
 * Separa a lógica de monstros do DuelsService principal
 * 
 * Responsabilidades:
 * - Validar invocações
 * - Gerenciar posições de monstros
 * - Processar efeitos de monstros
 * - Calcular ATK/DEF totais (com bônus)
 * - Gerenciar tributos
 */
@Injectable()
export class MonsterService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Calcula o ATK total de um monstro (base + equipamentos + spell counters + field spells)
   */
  calculateTotalAtk(
    monster: any,
    duel: Duel,
    isPlayer1: boolean,
    currentPhase: string
  ): number {
    const baseAtk = monster.atk || 0;
    const equipmentBonus = monster.equipmentBonusAtk || 0;
    const spellCounterBonus = monster.spellCounterBonusAtk || 0;
    const bannerOfCourageBonus = (this.duelsService as any).getBannerOfCourageBonus(duel, isPlayer1, currentPhase);
    
    return baseAtk + equipmentBonus + spellCounterBonus + bannerOfCourageBonus;
  }

  /**
   * Calcula o DEF total de um monstro (base + equipamentos + spell counters)
   */
  calculateTotalDef(monster: any): number {
    const baseDef = monster.def || 0;
    const equipmentBonus = monster.equipmentBonusDef || 0;
    const spellCounterBonus = monster.spellCounterBonusDef || 0;
    
    return baseDef + equipmentBonus + spellCounterBonus;
  }

  /**
   * Verifica se um monstro pode ser invocado normalmente
   */
  canNormalSummon(
    monster: any,
    field: any,
    tributeRequired: number
  ): { canSummon: boolean; message?: string } {
    // Verificar se há espaço no campo
    const emptyZones = field.monsters.filter((m: any) => !m || m === null).length;
    if (emptyZones === 0) {
      return { canSummon: false, message: 'Não há espaço no campo para invocar este monstro' };
    }

    // Verificar se há monstros suficientes para tributo
    const monstersOnField = field.monsters.filter((m: any) => m && m !== null).length;
    if (tributeRequired > 0 && monstersOnField < tributeRequired) {
      return { canSummon: false, message: `Você precisa de ${tributeRequired} tributo(s) para invocar este monstro` };
    }

    return { canSummon: true };
  }

  /**
   * Verifica se um monstro pode mudar de posição
   */
  canChangePosition(
    monster: any,
    currentPhase: string
  ): { canChange: boolean; message?: string } {
    if (!monster) {
      return { canChange: false, message: 'Monstro não encontrado' };
    }

    // Verificar se já mudou de posição neste turno
    if (monster.positionChangedThisTurn === true) {
      return { canChange: false, message: 'Este monstro já mudou de posição neste turno' };
    }

    // Verificar se está na fase correta
    if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2') {
      return { canChange: false, message: 'Você só pode mudar a posição de monstros nas fases principais' };
    }

    return { canChange: true };
  }
}

