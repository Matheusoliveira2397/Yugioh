import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — defense-draw (effects/traps) */
export async function checkAndActivateDefenseDraw(host: any, duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, damageAmount: number): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Defense Draw só pode ser ativada pelo defensor (oponente do atacante)
    const defenderField = isAttackerPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const defenderId = isAttackerPlayer1 ? duel.player2Id : duel.player1Id;
    
    if (!defenderField || !defenderField.spellTrap || !Array.isArray(defenderField.spellTrap)) {
      return false;
    }

    // Verificar se Defense Draw está setada (face-down)
    let defenseDrawZoneIndex = -1;
    for (let i = 0; i < defenderField.spellTrap.length; i++) {
      const trap = defenderField.spellTrap[i];
      if (trap && trap !== null) {
        const trapPosition = trap.position || 'set';
        const isDefenseDraw = host.isExactCard(trap, 'DefenseDraw');
        
        // Defense Draw deve estar setada (face-down)
        if (isDefenseDraw && trapPosition === 'set') {
          defenseDrawZoneIndex = i;
          logger.info(`🛡️ [checkAndActivateDefenseDraw] Defense Draw encontrada na zona ${i} do defensor`);
          break;
        }
      }
    }

    if (defenseDrawZoneIndex === -1) {
      return false; // Não há Defense Draw setada
    }

    // Defense Draw só pode ser ativada se houver dano de batalha
    if (damageAmount <= 0) {
      logger.info(`ℹ️ [checkAndActivateDefenseDraw] Não há dano de batalha para prevenir`);
      return false;
    }

    logger.info(`🛡️ [checkAndActivateDefenseDraw] Defense Draw ativada! Prevenindo ${damageAmount} de dano de batalha e fazendo o defensor comprar 1 carta`);

    // Fazer o defensor comprar 1 carta
    await host.drawCard(duelIdStr, defenderId);
    
    logger.info(`✅ [checkAndActivateDefenseDraw] Defensor comprou 1 carta`);

    // Mover Defense Draw para o cemitério do defensor
    const defenseDraw = defenderField.spellTrap[defenseDrawZoneIndex];
    if (defenseDraw) {
      if (!defenderField.graveyard) {
        defenderField.graveyard = [];
      }
      defenderField.graveyard.push(defenseDraw);
      defenderField.spellTrap[defenseDrawZoneIndex] = null;
      logger.info(`✅ [checkAndActivateDefenseDraw] Defense Draw movida para o cemitério do defensor após ativação`);
      // Mage Power: recalculando ATK do defensor (uma spell/trap foi removida do campo dele)
      await host.recalculateMagePowerAtk(duelId, duel, !isAttackerPlayer1);
    }

    // Atualizar no banco
    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host.activeDuels.set(duelIdStr, duel);

    return true; // Defense Draw foi ativada
  }
