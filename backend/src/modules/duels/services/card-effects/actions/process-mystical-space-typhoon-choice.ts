import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processMysticalSpaceTyphoonChoice(host: DuelsService, duelId: string | number, userId: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number, spellTrapZoneIndex?: number): Promise<{ success: boolean; message?: string; duel?: Duel }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar sempre do banco para ter estado atualizado (ex.: monstro controlado por Change Of Heart/Brain Control com controlledBy/originalOwner/originalZoneIndex)
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    let playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Validar índice da zona
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // IMPORTANTE: Mystical Space Typhoon NÃO vai para o campo nem é revelada
    // Se estava na mão: vai direto para o cemitério
    // Se estava no campo (set): vai direto para o cemitério (sem revelar)
    // Verificar se há pendingChoice com informações da carta
    const pendingChoice = (duel as any).pendingChoice;
    let mysticalSpaceTyphoon: any = null;
    let cardWasOnField = false;
    let cardData: any = null;

    logger.info(`🔍 [processMysticalSpaceTyphoonChoice] Iniciando - spellTrapZoneIndex: ${spellTrapZoneIndex}, pendingChoice: ${!!pendingChoice}`);

    if (pendingChoice && pendingChoice.data) {
      cardWasOnField = pendingChoice.data.cardWasOnField;
      cardData = pendingChoice.data.cardData;
      const cardIdFromPending = pendingChoice.data.cardId;
      const cardInstanceIdFromPending = pendingChoice.data.cardInstanceId;

      logger.info(`🔍 [processMysticalSpaceTyphoonChoice] pendingChoice encontrado - cardWasOnField: ${cardWasOnField}, cardId: ${cardIdFromPending}, hasCardData: ${!!cardData}, cardInstanceId: ${cardInstanceIdFromPending}`);

      if (!cardWasOnField) {
        // A carta estava na mão - remover da mão e preparar para ir direto ao cemitério
        if (!playerField.hand || !Array.isArray(playerField.hand)) {
          logger.error(`❌ [processMysticalSpaceTyphoonChoice] Mão inválida`);
          return { success: false, message: 'Mystical Space Typhoon não encontrada na mão' };
        }
        let handIndex = -1;
        if (cardInstanceIdFromPending) {
          handIndex = playerField.hand.findIndex((c: any) => c && c.instanceId === cardInstanceIdFromPending);
          if (handIndex >= 0) logger.info(`✅ [processMysticalSpaceTyphoonChoice] MST encontrada na mão por instanceId`);
        }
        if (handIndex === -1 && cardIdFromPending) {
          handIndex = playerField.hand.findIndex((c: any) => c && host['isExactCard'](c, 'MysticalSpaceTyphoon'));
          if (handIndex >= 0) logger.info(`✅ [processMysticalSpaceTyphoonChoice] MST encontrada na mão por id/nome`);
        }
        if (handIndex === -1) {
          handIndex = playerField.hand.findIndex((c: any) => c && (String(c.idCarta || c.id || c.cardId || '').toLowerCase().includes('mysticalspacetyphoon') || (c.name || c.cardName || '').toLowerCase().includes('mystical space typhoon')));
          if (handIndex >= 0) logger.info(`✅ [processMysticalSpaceTyphoonChoice] MST encontrada na mão por fallback`);
        }
        if (handIndex !== -1) {
          mysticalSpaceTyphoon = playerField.hand[handIndex];
          playerField.hand.splice(handIndex, 1);
          logger.info(`✅ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon removida da mão - irá direto para o cemitério (SEM passar pelo campo)`);
        } else {
          logger.error(`❌ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon não encontrada na mão (hand.length=${playerField.hand.length})`);
          return { success: false, message: 'Mystical Space Typhoon não encontrada na mão' };
        }
      } else if (cardIdFromPending || cardData) {
        // cardWasOnField === true: carta estava no campo em "set"
          // A carta estava no campo em "set" - remover do campo e preparar para ir direto ao cemitério (sem revelar)
          const targetZoneIndex = pendingChoice.data.zoneIndex;
          if (targetZoneIndex !== undefined && targetZoneIndex !== null &&
              playerField.spellTrap && playerField.spellTrap[targetZoneIndex]) {
            mysticalSpaceTyphoon = playerField.spellTrap[targetZoneIndex];
            if (host['isExactCard'](mysticalSpaceTyphoon, 'MysticalSpaceTyphoon')) {
              playerField.spellTrap[targetZoneIndex] = null;
              logger.info(`✅ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon removida do campo (set) - irá direto para o cemitério sem revelar`);
            } else {
              logger.error(`❌ [processMysticalSpaceTyphoonChoice] Carta na zona ${targetZoneIndex} não é Mystical Space Typhoon`);
              return { success: false, message: 'Carta não é Mystical Space Typhoon' };
            }
          } else {
            logger.error(`❌ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon não encontrada no campo`);
            return { success: false, message: 'Mystical Space Typhoon não encontrada no campo' };
          }
      }
    } else {
      // Fallback: Se não há pendingChoice, tentar encontrar Mystical Space Typhoon no campo
      let foundZoneIndex = spellTrapZoneIndex;
      if (foundZoneIndex === undefined || foundZoneIndex === null) {
      // Procurar Mystical Space Typhoon no campo do jogador
      if (playerField && playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
        for (let i = 0; i < playerField.spellTrap.length; i++) {
          const card = playerField.spellTrap[i];
          if (card && host['isExactCard'](card, 'MysticalSpaceTyphoon')) {
              foundZoneIndex = i;
            break;
          }
          }
        }
      }

      if (foundZoneIndex !== undefined && foundZoneIndex !== null) {
        if (playerField && playerField.spellTrap && playerField.spellTrap[foundZoneIndex]) {
          mysticalSpaceTyphoon = playerField.spellTrap[foundZoneIndex];
          if (host['isExactCard'](mysticalSpaceTyphoon, 'MysticalSpaceTyphoon')) {
            playerField.spellTrap[foundZoneIndex] = null;
            cardWasOnField = true;
            logger.info(`✅ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon encontrada no campo (fallback) - removendo para ir ao cemitério`);
          }
        }
      }
    }

    // Verificar se Mystical Space Typhoon foi encontrada
    if (!mysticalSpaceTyphoon || !host['isExactCard'](mysticalSpaceTyphoon, 'MysticalSpaceTyphoon')) {
      logger.error(`❌ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon não encontrada`);
      return { success: false, message: 'Mystical Space Typhoon não encontrada' };
    }

    logger.info(`✅ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon preparada para ir ao cemitério (cardWasOnField: ${cardWasOnField})`);

    // Determinar qual campo tem o alvo
    const targetField = targetPlayer === 'player' ? playerField : opponentField;
    const targetIsPlayer1 = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;

    // Garantir que spellTrap seja um array válido
    if (!targetField.spellTrap || !Array.isArray(targetField.spellTrap)) {
      targetField.spellTrap = [null, null, null, null, null];
    }
    while (targetField.spellTrap.length < 5) {
      targetField.spellTrap.push(null);
    }
    targetField.spellTrap = targetField.spellTrap.slice(0, 5);

    // Verificar se há spell/trap na zona alvo
    if (!targetField.spellTrap || !targetField.spellTrap[targetZoneIndex]) {
      logger.error(`❌ [processMysticalSpaceTyphoonChoice] Não há spell/trap na zona selecionada ${targetZoneIndex}`);
      return { success: false, message: 'Não há spell/trap na zona selecionada' };
    }

    const targetCard = targetField.spellTrap[targetZoneIndex];
    const targetCardId = targetCard.idCarta || targetCard.id || targetCard.cardId;

    // Não pode destruir a própria Mystical Space Typhoon
    if (targetPlayer === 'player') {
      const isMST = host['isExactCard'](targetCard, 'MysticalSpaceTyphoon');
      if (isMST) {
        logger.warn(`⚠️ [processMysticalSpaceTyphoonChoice] Tentativa de destruir a própria Mystical Space Typhoon`);
        return { success: false, message: 'Você não pode escolher Mystical Space Typhoon como alvo' };
      }
    }

    logger.info(`✨ [processMysticalSpaceTyphoonChoice] Destruindo spell/trap: ${targetCard.name || targetCard.cardName || 'Desconhecida'}`);

    if (host['isExactCard'](targetCard, 'ChangeOfHeart')) {
      await host['returnChangeOfHeartMonsters'](duelIdStr, duel, targetIsPlayer1);
    } else if (host['isExactCard'](targetCard, 'BrainControl')) {
      await host['returnChangeOfHeartMonsters'](duelIdStr, duel, targetIsPlayer1);
    } else if (host['isExactCard'](targetCard, 'UnitedWeStand')) {
      await host['handleEquipmentDestruction'](duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else if (host['isExactCard'](targetCard, 'MagePower')) {
      await host['handleEquipmentDestruction'](duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else {
      await host['recalculateMagePowerAtk'](duelId, duel, targetIsPlayer1);
    }
    await host['onSpellTrapRemovedFromField'](duelIdStr, duel, targetIsPlayer1, targetZoneIndex);

    if (targetField.spellTrap[targetZoneIndex] !== null && targetField.spellTrap[targetZoneIndex] !== undefined) {
      logger.info(`🗑️ [processMysticalSpaceTyphoonChoice] Removendo carta alvo do campo e movendo para o cemitério`);
      if (!targetField.graveyard) targetField.graveyard = [];
      targetField.graveyard.push(targetField.spellTrap[targetZoneIndex]);
      targetField.spellTrap[targetZoneIndex] = null;
      logger.info(`✅ [processMysticalSpaceTyphoonChoice] Carta alvo "${targetCard.name || targetCard.cardName || 'Desconhecida'}" movida para o cemitério`);
    } else {
      logger.info(`✅ [processMysticalSpaceTyphoonChoice] Carta alvo já foi enviada ao cemitério por efeito (ex: Premature Burial / AAU)`);
    }

    // Segundo: Mover Mystical Space Typhoon para o cemitério (já foi removida do campo/mão anteriormente)
    logger.info(`🔍 [processMysticalSpaceTyphoonChoice] Movendo Mystical Space Typhoon para o cemitério`);
      if (!playerField.graveyard) playerField.graveyard = [];
    playerField.graveyard.push(mysticalSpaceTyphoon);
    logger.info(`✅ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon movida para o cemitério (cardWasOnField: ${cardWasOnField})`);
    // Mage Power: recalculando ATK do jogador que ativou MST (uma spell foi removida do campo dele)
    await host['recalculateMagePowerAtk'](duelId, duel, isPlayer1);

    logger.info(`✅ [processMysticalSpaceTyphoonChoice] Ambas as cartas foram movidas para o cemitério com sucesso!`);

    // Garantir que os campos estão atualizados no objeto duel
    if (isPlayer1) {
      (duel as any).player1Field = playerField;
      (duel as any).player2Field = opponentField;
    } else {
      (duel as any).player1Field = opponentField;
      (duel as any).player2Field = playerField;
    }

    // IMPORTANTE: Salvar campos no banco e atualizar o cache ANTES de clearPendingChoice.
    // Caso contrário, clearPendingChoice usa o cache (cópia antiga) e grava estado antigo no DB, sobrescrevendo a destruição.
    host['activeDuels'].set(duelIdStr, duel);
    logger.info(`💾 [processMysticalSpaceTyphoonChoice] Salvando campos no banco antes de limpar pendingChoice...`);
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Limpar pendingChoice (agora o cache e o DB já têm o estado correto)
    await host['clearPendingChoice'](duelId);

    logger.info(`✅ [processMysticalSpaceTyphoonChoice] Spell/Trap destruída com sucesso! Ambas as cartas foram para o cemitério.`);
    return { success: true, duel };
  }
