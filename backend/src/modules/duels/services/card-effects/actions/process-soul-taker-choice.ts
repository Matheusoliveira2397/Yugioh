import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processSoulTakerChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
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
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // IMPORTANTE: Soul Taker NÃO vai para o campo nem é revelada
    // Se estava na mão: vai direto para o cemitério
    // Se estava no campo (set): vai direto para o cemitério (sem revelar)
    // Verificar se há pendingChoice com informações da carta
    const pendingChoice = (duel as any).pendingChoice;
    let soulTaker: any = null;
    let cardWasOnField = false;
    let cardData: any = null;

    logger.info(`🔍 [processSoulTakerChoice] Iniciando - pendingChoice: ${!!pendingChoice}`);

    if (pendingChoice && pendingChoice.data) {
      cardWasOnField = pendingChoice.data.cardWasOnField;
      cardData = pendingChoice.data.cardData;
      const cardIdFromPending = pendingChoice.data.cardId;

      logger.info(`🔍 [processSoulTakerChoice] pendingChoice encontrado - cardWasOnField: ${cardWasOnField}`);

      if (cardData && cardIdFromPending) {
        if (!cardWasOnField) {
          // A carta estava na mão - remover da mão e preparar para ir direto ao cemitério
          // IMPORTANTE: NÃO colocar no campo - vai direto para o cemitério após destruir o alvo
          const handIndex = playerField.hand.findIndex((c: any) => {
            if (pendingChoice.data.cardInstanceId && c.instanceId) {
              return c.instanceId === pendingChoice.data.cardInstanceId;
            }
            const cId = c.idCarta || c.id || c.cardId;
            return cId === cardIdFromPending;
          });

          if (handIndex !== -1) {
            soulTaker = playerField.hand[handIndex];
            playerField.hand.splice(handIndex, 1);
            logger.info(`✅ [processSoulTakerChoice] Soul Taker removida da mão - irá direto para o cemitério (SEM passar pelo campo)`);
          } else {
            logger.error(`❌ [processSoulTakerChoice] Soul Taker não encontrada na mão`);
            return { success: false, message: 'Soul Taker não encontrada na mão' };
          }
        } else {
          // A carta estava no campo em "set" - remover do campo e preparar para ir direto ao cemitério (sem revelar)
          const targetZoneIndex = pendingChoice.data.zoneIndex;
          if (targetZoneIndex !== undefined && targetZoneIndex !== null &&
              playerField.spellTrap && playerField.spellTrap[targetZoneIndex]) {
            soulTaker = playerField.spellTrap[targetZoneIndex];
            if (host['isExactCard'](soulTaker, 'SoulTaker')) {
              playerField.spellTrap[targetZoneIndex] = null;
              logger.info(`✅ [processSoulTakerChoice] Soul Taker removida do campo (set) - irá direto para o cemitério sem revelar`);
            } else {
              logger.error(`❌ [processSoulTakerChoice] Carta na zona ${targetZoneIndex} não é Soul Taker`);
              return { success: false, message: 'Carta não é Soul Taker' };
            }
          } else {
            logger.error(`❌ [processSoulTakerChoice] Soul Taker não encontrada no campo`);
            return { success: false, message: 'Soul Taker não encontrada no campo' };
          }
        }
      }
    } else {
      // Fallback: Se não há pendingChoice, tentar encontrar Soul Taker no campo
      if (playerField && playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
        for (let i = 0; i < playerField.spellTrap.length; i++) {
          const card = playerField.spellTrap[i];
          if (card && host['isExactCard'](card, 'SoulTaker')) {
            soulTaker = playerField.spellTrap[i];
            playerField.spellTrap[i] = null;
            cardWasOnField = true;
            logger.info(`✅ [processSoulTakerChoice] Soul Taker encontrada no campo (fallback) - removendo para ir ao cemitério`);
            break;
          }
        }
      }
    }

    // Verificar se Soul Taker foi encontrada
    if (!soulTaker || !host['isExactCard'](soulTaker, 'SoulTaker')) {
      logger.error(`❌ [processSoulTakerChoice] Soul Taker não encontrada`);
      return { success: false, message: 'Soul Taker não encontrada' };
    }

    logger.info(`✅ [processSoulTakerChoice] Soul Taker preparada para ir ao cemitério (cardWasOnField: ${cardWasOnField})`);

    // Verificar se há um monstro na zona escolhida do oponente
    if (!opponentField || !opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      return { success: false, message: 'Campo do oponente não encontrado' };
    }

    const chosenMonster = opponentField.monsters[chosenMonsterZoneIndex];
    if (!chosenMonster || chosenMonster === null || chosenMonster === undefined) {
      return { success: false, message: 'Nenhum monstro na zona escolhida' };
    }

    // Verificar se o monstro está face-up (attack ou defense)
    const position = chosenMonster.position || 'attack';
    if (position === 'set') {
      return { success: false, message: 'Você só pode escolher monstros face-up (ataque ou defesa)' };
    }

    // Destruir o monstro — vai para o cemitério do DONO ORIGINAL (oponente controla; se era nosso monstro sob controle dele, vai para nosso cemitério)
    const ownerFieldSoul = host['getOwnerFieldForMonster'](duel, chosenMonster, !isPlayer1);
    if (!ownerFieldSoul.graveyard) ownerFieldSoul.graveyard = [];
    ownerFieldSoul.graveyard.push(chosenMonster);
    opponentField.monsters[chosenMonsterZoneIndex] = null;

    // Marcar que um monstro foi destruído no campo do oponente neste turno (para Last Will)
    if (!opponentField.monsterDestroyedThisTurn) {
      opponentField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [processSoulTakerChoice] Monstro destruído no campo do oponente - Last Will pode ser ativada`);
    }

    logger.info(`✅ [processSoulTakerChoice] Monstro ${chosenMonster.name || chosenMonster.cardName} destruído e enviado para o cemitério do dono original`);

    // Adicionar 1000 LP ao oponente
    if (isPlayer1) {
      duel.player2LifePoints = Math.max(0, duel.player2LifePoints + 1000);
      logger.info(`✅ [processSoulTakerChoice] Player 2 ganhou 1000 LP. LP atual: ${duel.player2LifePoints}`);
    } else {
      duel.player1LifePoints = Math.max(0, duel.player1LifePoints + 1000);
      logger.info(`✅ [processSoulTakerChoice] Player 1 ganhou 1000 LP. LP atual: ${duel.player1LifePoints}`);
    }

    // IMPORTANTE: Mover Soul Taker para o cemitério (já foi removida do campo/mão anteriormente)
    logger.info(`🔍 [processSoulTakerChoice] Movendo Soul Taker para o cemitério`);
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(soulTaker);
    logger.info(`✅ [processSoulTakerChoice] Soul Taker movida para o cemitério (cardWasOnField: ${cardWasOnField})`);

    logger.info(`✅ [processSoulTakerChoice] Monstro destruído e Soul Taker movida para o cemitério com sucesso!`);

    // Limpar pendingChoice
    await host['clearPendingChoice'](duelId);

    // Garantir que os campos estão atualizados no objeto duel
    if (isPlayer1) {
      (duel as any).player1Field = playerField;
      (duel as any).player2Field = opponentField;
    } else {
      (duel as any).player1Field = opponentField;
      (duel as any).player2Field = playerField;
    }

    // Salvar no banco
    logger.info(`💾 [processSoulTakerChoice] Salvando duelo no banco de dados...`);
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    } as any);

    logger.info(`✅ [processSoulTakerChoice] Duelo salvo no banco de dados`);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    logger.info(`✅ [processSoulTakerChoice] Efeito processado com sucesso!`);
    return { success: true };
  }
