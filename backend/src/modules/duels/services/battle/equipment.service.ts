import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por gerenciamento de equipamentos
 * Separa a lógica de equipamentos do DuelsService principal
 * 
 * Responsabilidades:
 * - Aplicar equipamentos a monstros
 * - Remover equipamentos quando monstro é destruído
 * - Recalcular bônus de equipamentos
 * - Gerenciar spells equip
 */
@Injectable()
export class EquipmentService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
  ) {}

  /**
   * Remove equipamentos de um monstro quando ele é destruído
   */
  async handleEquipmentDestruction(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    monster: any
  ): Promise<void> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, monster);
  }

  /**
   * Calcula o bônus total de ATK de equipamentos
   */
  calculateEquipmentAtkBonus(monster: any): number {
    return monster.equipmentBonusAtk || 0;
  }

  /**
   * Calcula o bônus total de DEF de equipamentos
   */
  calculateEquipmentDefBonus(monster: any): number {
    return monster.equipmentBonusDef || 0;
  }
}

