import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/** Trap activation — sakuretsu-armor (effects/traps) */
export async function checkAndActivateSakuretsuArmor(host: any, 
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    attacker: any
  ): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (host.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateSakuretsuArmor] Jinzo está no campo - Sakuretsu Armor não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    // isPlayer1 = jogador que está atacando (atacante)
    // O oponente (defensor) está tentando ativar a trap, então passamos !isPlayer1
    if (host.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateSakuretsuArmor] MirageDragon está no campo do atacante - Sakuretsu Armor não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Sakuretsu Armor setada (face-down)
    let sakuretsuArmorZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapId = trap.idCarta || trap.id || trap.cardId;
        const trapName = (trap.name || trap.cardName || '').toLowerCase();
        const trapPosition = trap.position || 'set';
        
        const isSakuretsuArmor = host.isExactCard(trap, 'SakuretsuArmor') ||
                                 trapId === 'SakuretsuArmor' ||
                                 trapId === 'sakuretsuarmor' ||
                                 trapName === 'sakuretsu armor' ||
                                 trapName === 'sakuretsuarmor';
        
        // Sakuretsu Armor deve estar setada (face-down)
        if (isSakuretsuArmor && trapPosition === 'set') {
          sakuretsuArmorZoneIndex = i;
          logger.info(`🛡️ [checkAndActivateSakuretsuArmor] Sakuretsu Armor encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (sakuretsuArmorZoneIndex === -1) {
      return false; // Não há Sakuretsu Armor setada
    }

    logger.info(`💥 [checkAndActivateSakuretsuArmor] Sakuretsu Armor ativada! Destruindo ${attacker.name || attacker.cardName} (ATK: ${attacker.atk || 0})`);

    // Verificar se o monstro atacante tinha equipamento antes de destruir
    await host.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);

    // Destruir o monstro atacante — vai para o cemitério do DONO ORIGINAL (ex.: se era monstro do oponente sob nosso controle)
    const ownerFieldSakuretsu = host.getOwnerFieldForMonster(duel, attacker, isPlayer1);
    if (!ownerFieldSakuretsu.graveyard) ownerFieldSakuretsu.graveyard = [];
    ownerFieldSakuretsu.graveyard.push(attacker);
    attackerField.monsters[attackerZoneIndex] = null;
    
    // Marcar que um monstro foi destruído no campo do atacante neste turno (para Last Will)
    if (!attackerField.monsterDestroyedThisTurn) {
      attackerField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [checkAndActivateSakuretsuArmor] Monstro destruído no campo do atacante - Last Will pode ser ativada`);
    }

    // Recalcular UnitedWeStand para ambos os jogadores (monstro foi removido)
    await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    // Mover Sakuretsu Armor para o cemitério do oponente
    const sakuretsuArmor = opponentField.spellTrap[sakuretsuArmorZoneIndex];
    if (sakuretsuArmor) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(sakuretsuArmor);
      opponentField.spellTrap[sakuretsuArmorZoneIndex] = null;
      logger.info(`✅ [checkAndActivateSakuretsuArmor] Sakuretsu Armor movida para o cemitério do oponente após ativação`);
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

    return true; // Monstro atacante foi destruído
  }
