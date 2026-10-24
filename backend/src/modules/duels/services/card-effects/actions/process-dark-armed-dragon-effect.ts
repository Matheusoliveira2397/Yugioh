import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processDarkArmedDragonEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, darkGraveyardIndex: number, targetPlayer: 'player' | 'opponent', targetType: 'monster' | 'spellTrap', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar duelo do banco
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;

    // Verificar se é o turno do jogador
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser usado em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se o Dark Armed Dragon existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Dark Armed Dragon inválida' };
    }

    const darkArmedDragon = playerField.monsters[monsterZoneIndex];
    if (!darkArmedDragon || darkArmedDragon === null) {
      return { success: false, message: 'Dark Armed Dragon não encontrado no campo' };
    }

    // Verificar se é realmente Dark Armed Dragon
    const cardId = darkArmedDragon.idCarta || darkArmedDragon.id || darkArmedDragon.cardId;
    const cardName = (darkArmedDragon.name || darkArmedDragon.cardName || '').toLowerCase();
    const isDarkArmedDragon = cardId === 'DarkArmedDragon' ||
                              cardId === 'darkarmeddragon' ||
                              cardId === 'Dark-ArmedDragon' ||
                              cardId === 'DarkArmed-Dragon' ||
                              cardName === 'dark armed dragon' ||
                              cardName === 'dark-armed dragon' ||
                              cardName === 'darkarmeddragon' ||
                              host['isExactCard'](darkArmedDragon, 'DarkArmedDragon');

    if (!isDarkArmedDragon) {
      return { success: false, message: 'Carta no campo não é Dark Armed Dragon' };
    }

    // Verificar se o índice do cemitério é válido (pode usar quantas vezes quiser enquanto houver monstros Dark)
    const graveyard = playerField.graveyard || [];
    if (darkGraveyardIndex < 0 || darkGraveyardIndex >= graveyard.length) {
      return { success: false, message: 'Índice do cemitério inválido' };
    }

    const darkMonsterToBanish = graveyard[darkGraveyardIndex];
    if (!darkMonsterToBanish) {
      return { success: false, message: 'Monstro não encontrado no cemitério' };
    }

    // Verificar se é um monstro Dark
    const cardType = (darkMonsterToBanish.type || darkMonsterToBanish.cardType || '').toString().toUpperCase().trim();
    const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
    if (!isMonster) {
      return { success: false, message: 'A carta selecionada não é um monstro' };
    }

    const attributeRaw = darkMonsterToBanish.attribute || darkMonsterToBanish.cardAttribute || '';
    const attribute = String(attributeRaw).toUpperCase().trim();
    const isDark = attribute === 'DARK' ||
                  attribute === 'TREVAS' ||
                  (typeof attribute === 'string' && attribute.includes('DARK'));

    if (!isDark) {
      return { success: false, message: 'A carta selecionada não é do atributo Dark' };
    }

    // Banir o monstro Dark
    if (!playerField.banished) {
      playerField.banished = [];
    }
    const banishedMonster = graveyard.splice(darkGraveyardIndex, 1)[0];
    playerField.banished.push(banishedMonster);
    logger.info(`✅ [processDarkArmedDragonEffect] Monstro Dark banido: ${banishedMonster.name || banishedMonster.cardName} (efeito pode ser usado novamente se houver mais monstros Dark no cemitério)`);

    // Obter campo do alvo
    const targetField = targetPlayer === 'player' ? playerField : opponentField;

    // Verificar e destruir a carta alvo
    if (targetType === 'monster') {
      if (!targetField.monsters || !Array.isArray(targetField.monsters)) {
        return { success: false, message: 'Campo de monstros não encontrado' };
      }
      if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
        return { success: false, message: 'Zona de monstro inválida' };
      }
      const targetMonster = targetField.monsters[targetZoneIndex];
      if (!targetMonster || targetMonster === null) {
        return { success: false, message: 'Não há monstro na zona especificada' };
      }

      // Verificar se o monstro tem equipamento antes de destruir
      await host['handleEquipmentDestruction'](duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);

      // Mover para o cemitério do DONO ORIGINAL
      const controllerIsP1DAD = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;
      const ownerFieldDAD = host['getOwnerFieldForMonster'](duel, targetMonster, controllerIsP1DAD);
      if (!ownerFieldDAD.graveyard) ownerFieldDAD.graveyard = [];
      ownerFieldDAD.graveyard.push(targetMonster);
      targetField.monsters[targetZoneIndex] = null;
      logger.info(`✅ [processDarkArmedDragonEffect] Monstro destruído: ${targetMonster.name || targetMonster.cardName}`);
    } else if (targetType === 'spellTrap') {
      if (!targetField.spellTrap || !Array.isArray(targetField.spellTrap)) {
        return { success: false, message: 'Campo de spell/trap não encontrado' };
      }
      if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
        return { success: false, message: 'Zona de spell/trap inválida' };
      }
      const targetSpellTrap = targetField.spellTrap[targetZoneIndex];
      if (!targetSpellTrap || targetSpellTrap === null) {
        return { success: false, message: 'Não há spell/trap na zona especificada' };
      }
      const targetIsPlayer1 = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;
      await host['onSpellTrapRemovedFromField'](duelIdStr, duel, targetIsPlayer1, targetZoneIndex);
      if (targetField.spellTrap[targetZoneIndex] !== null && targetField.spellTrap[targetZoneIndex] !== undefined) {
        if (!targetField.graveyard) targetField.graveyard = [];
        targetField.graveyard.push(targetField.spellTrap[targetZoneIndex]);
        targetField.spellTrap[targetZoneIndex] = null;
      }
      logger.info(`✅ [processDarkArmedDragonEffect] Spell/Trap destruído: ${targetSpellTrap.name || targetSpellTrap.cardName}`);
    } else {
      return { success: false, message: 'Tipo de alvo inválido' };
    }

    // Não marcar como usado - pode usar quantas vezes quiser enquanto houver monstros Dark no cemitério

    // Atualizar no banco
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true };
  }
