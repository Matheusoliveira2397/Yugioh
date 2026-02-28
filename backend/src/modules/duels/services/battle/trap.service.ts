import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../../entities/duel.entity';
import { DuelsService } from '../../duels.service';
import { DuelUtilsService } from '../duel-utils.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por toda a lógica de traps
 * Separa a lógica de traps do DuelsService principal
 * 
 * Responsabilidades:
 * - Verificar e ativar traps automaticamente
 * - Mirror Force
 * - Dimensional Prison
 * - Sakuretsu Armor
 * - Waboku
 * - Defense Draw
 * - Trap Hole
 */
@Injectable()
export class TrapService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Verifica e ativa Mirror Force se as condições forem atendidas
   */
  async checkAndActivateMirrorForce(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean
  ): Promise<boolean> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).checkAndActivateMirrorForce(duelId, duel, isPlayer1);
  }

  /**
   * Verifica e ativa Dimensional Prison se as condições forem atendidas
   */
  async checkAndActivateDimensionalPrison(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number
  ): Promise<boolean> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).checkAndActivateDimensionalPrison(duelId, duel, isPlayer1, attackerZoneIndex);
  }

  /**
   * Verifica e ativa Sakuretsu Armor se as condições forem atendidas
   */
  async checkAndActivateSakuretsuArmor(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    attacker: any
  ): Promise<boolean> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).checkAndActivateSakuretsuArmor(duelId, duel, isPlayer1, attackerZoneIndex, attacker);
  }

  /**
   * Verifica e ativa Waboku se as condições forem atendidas
   */
  async checkAndActivateWaboku(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean
  ): Promise<boolean> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).checkAndActivateWaboku(duelId, duel, isPlayer1);
  }

  /**
   * Verifica e ativa Defense Draw se as condições forem atendidas
   */
  async checkAndActivateDefenseDraw(
    duelId: string | number,
    duel: Duel,
    isAttackerPlayer1: boolean,
    damageAmount: number
  ): Promise<boolean> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).checkAndActivateDefenseDraw(duelId, duel, isAttackerPlayer1, damageAmount);
  }

  /**
   * Verifica e ativa Trap Hole se as condições forem atendidas
   */
  async checkAndActivateTrapHole(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    monsterZoneIndex: number,
    monster: any
  ): Promise<boolean> {
    // Por enquanto, delegar para DuelsService
    // TODO: Migrar implementação completa para cá
    return (this.duelsService as any).checkAndActivateTrapHole(duelId, duel, isPlayer1, monsterZoneIndex, monster);
  }
}

