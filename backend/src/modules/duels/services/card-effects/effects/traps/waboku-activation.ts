import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — waboku-activation (effects/traps) */
export async function checkAndActivateWaboku(host: any, duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateWaboku] Jinzo está no campo - Waboku não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    // isPlayer1 = jogador que está atacando (atacante)
    // O oponente (defensor) está tentando ativar a trap, então passamos !isPlayer1
    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateWaboku] MirageDragon está no campo do atacante - Waboku não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Waboku setada (face-down)
    let wabokuZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapPosition = trap.position || 'set';
        const isWaboku = host.isExactCard(trap, 'Waboku');
        
        // Waboku deve estar setada (face-down)
        if (isWaboku && trapPosition === 'set') {
          wabokuZoneIndex = i;
          logger.info(`🛡️ [checkAndActivateWaboku] Waboku encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (wabokuZoneIndex === -1) {
      return false; // Não há Waboku setada
    }

    logger.info(`🛡️ [checkAndActivateWaboku] Waboku ativada automaticamente! Prevenindo dano de batalha e destruição de monstros neste turno`);

    // Marcar que Waboku está ativo neste turno
    opponentField.wabokuActiveThisTurn = true;
    opponentField.wabokuActivatedTurn = duel.turnCounter || 1;

    // Mover Waboku para o cemitério do oponente após ativação
    const waboku = opponentField.spellTrap[wabokuZoneIndex];
    if (waboku) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(waboku);
      opponentField.spellTrap[wabokuZoneIndex] = null;
      logger.info(`✅ [checkAndActivateWaboku] Waboku movida para o cemitério do oponente após ativação`);
      // Mage Power: recalculando ATK do oponente (uma spell/trap foi removida do campo dele)
      await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    }

    // Atualizar no banco
    await host.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [checkAndActivateWaboku] Waboku ativada e atualizada no banco IMEDIATAMENTE`);
    return true; // Waboku foi ativada
  }
