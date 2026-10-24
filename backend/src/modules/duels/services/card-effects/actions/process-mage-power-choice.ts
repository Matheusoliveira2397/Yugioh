import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processMagePowerChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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

    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Buscar MagePower no campo (pode estar em face-up ou set)
    const spellTrapZoneIndex = playerField.spellTrap?.findIndex((card: any) => {
      if (!card) return false;
      return host['isExactCard'](card, 'MagePower');
    });

    if (spellTrapZoneIndex === undefined || spellTrapZoneIndex === null || spellTrapZoneIndex === -1) {
      return { success: false, message: 'MagePower não encontrada no campo' };
    }

    // Revelar a spell antes de processar (se estiver em 'set')
    await host['revealSpellAfterModal'](duelIdStr, duel, isPlayer1, spellTrapZoneIndex);
    duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado após revelar spell' };
    }
    playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Verificar se MagePower ainda está no campo
    if (!playerField || !playerField.spellTrap || !playerField.spellTrap[spellTrapZoneIndex]) {
      return { success: false, message: 'MagePower não encontrada no campo' };
    }

    const magePowerCard = playerField.spellTrap[spellTrapZoneIndex];
    if (!host['isExactCard'](magePowerCard, 'MagePower')) {
      return { success: false, message: 'Carta no campo não é MagePower' };
    }

    // Verificar se o monstro escolhido existe e está face-up
    if (!playerField.monsters || !playerField.monsters[chosenMonsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const chosenMonster = playerField.monsters[chosenMonsterZoneIndex];
    if (chosenMonster.position === 'set') {
      return { success: false, message: 'Monstro deve estar face-up para equipar MagePower' };
    }
    if (host['isObeliskTheTormentor'](chosenMonster)) {
      return { success: false, message: 'Obelisk the Tormentor não pode ser alvo de efeitos de carta' };
    }

    // Contar cartas na zona de spell/trap do jogador (incluindo a própria MagePower)
    // Incluir TODAS as cartas, independentemente de estarem face-up ou face-down (set)
    // Garantir que spellTrap seja um array válido
    if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    while (playerField.spellTrap.length < 5) {
      playerField.spellTrap.push(null);
    }
    playerField.spellTrap = playerField.spellTrap.slice(0, 5);

    // Contar TODAS as cartas na zona spell/trap (face-up e face-down/set)
    // IMPORTANTE: Contar todas as cartas, independentemente da posição
    const spellTrapCards = playerField.spellTrap.filter((card: any) => {
      const isValid = card !== null && card !== undefined;
      if (isValid) {
        logger.info(`🔍 [processMagePowerChoice] Carta encontrada: ${card.name || card.cardName || 'Desconhecida'}, posição: ${card.position || 'face-up'}`);
      }
      return isValid;
    });
    const bonusAtk = spellTrapCards.length * 500;

    // Verificar se há cartas na zona
    if (spellTrapCards.length === 0) {
      logger.info(`⚠️ [processMagePowerChoice] Nenhuma carta encontrada na zona spell/trap!`);
      logger.info(`🔍 [processMagePowerChoice] Estado do array spellTrap:`, playerField.spellTrap);
    }

    logger.info(`✨ [processMagePowerChoice] Equipando MagePower ao monstro ${chosenMonster.name || chosenMonster.cardName}`);
    logger.info(`📊 [processMagePowerChoice] Cartas na zona spell/trap (face-up e face-down): ${spellTrapCards.length}, ATK bonus: +${bonusAtk}`);
    logger.info(`🔍 [processMagePowerChoice] Detalhes das cartas:`, spellTrapCards.map((c: any, i: number) => ({
      index: i,
      name: c?.name || c?.cardName || 'null',
      position: c?.position || 'face-up',
      cardId: c?.idCarta || c?.id || c?.cardId || 'null'
    })));

    // IMPORTANTE: Permitir múltiplos equipamentos - os efeitos se somam
    // Não remover equipamentos anteriores, apenas adicionar o novo

    // Equipar ao monstro
    const magePowerCardId = magePowerCard.idCarta || magePowerCard.id || magePowerCard.cardId;
    chosenMonster.equippedBy = isPlayer1 ? 1 : 2;

    // Inicializar array de equips apenas se não existir (manter equipamentos anteriores)
    if (!chosenMonster.equippedCards || !Array.isArray(chosenMonster.equippedCards)) {
      chosenMonster.equippedCards = [];
    }

    // Criar referência única para este equipamento: cardId:spellTrapZoneIndex
    // Usar instanceId se disponível para distinguir múltiplas cópias da mesma carta
    const cardInstanceId = magePowerCard.instanceId;
    const uniqueEquipRef = cardInstanceId
      ? `${magePowerCardId}:${spellTrapZoneIndex}:${cardInstanceId}`
      : `${magePowerCardId}:${spellTrapZoneIndex}`;

    // Verificar se este equipamento já está no array (evitar duplicatas)
    if (!chosenMonster.equippedCards.includes(uniqueEquipRef)) {
      // Adicionar novo equip ao array (múltiplos equipamentos permitidos)
      chosenMonster.equippedCards.push(uniqueEquipRef);
      logger.info(`✅ [processMagePowerChoice] Equipamento ${magePowerCard.name || magePowerCard.cardName} adicionado ao monstro. Total de equips: ${chosenMonster.equippedCards.length}`);
    } else {
      logger.info(`⚠️ [processMagePowerChoice] Equipamento ${magePowerCard.name || magePowerCard.cardName} já está equipado neste monstro`);
    }

    // Manter equippedCardId para compatibilidade (último equip adicionado)
    chosenMonster.equippedCardId = magePowerCardId;
    chosenMonster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;

    // Recalcular bônus total do equipamento (Mage Power dá +500 ATK e +500 DEF por Spell/Trap)
    const oldBonus = chosenMonster.equipmentBonusAtk || 0;
    chosenMonster.equipmentBonusAtk = host['calculateTotalEquipmentBonus'](chosenMonster, playerField);
    chosenMonster.equipmentBonusDef = host['calculateTotalEquipmentBonusDef'](chosenMonster, playerField);
    logger.info(`🔄 [processMagePowerChoice] Bônus recalculado: ${oldBonus} -> ${chosenMonster.equipmentBonusAtk} ATK, DEF bonus: +${chosenMonster.equipmentBonusDef || 0}`);
    logger.info(`📊 [processMagePowerChoice] Equipamentos no monstro: ${chosenMonster.equippedCards?.length || 0} (${chosenMonster.equippedCards?.join(', ') || 'nenhum'})`);

    // IMPORTANTE: Garantir que o array de equipamentos está correto antes de salvar
    logger.info(`💾 [processMagePowerChoice] ANTES de salvar - Equipamentos no monstro: ${chosenMonster.equippedCards?.length || 0}, array: ${JSON.stringify(chosenMonster.equippedCards || [])}`);
    logger.info(`💾 [processMagePowerChoice] ANTES de salvar - Bônus ATK: ${chosenMonster.equipmentBonusAtk || 0}`);

    // IMPORTANTE: Salvar PRIMEIRO antes de recalcular para garantir que o array de equipamentos está no banco
    // Adicionar referência ao monstro equipado na carta MagePower
    magePowerCard.equippedToMonsterZoneIndex = chosenMonsterZoneIndex;

    // Salvar no banco ANTES de recalcular para garantir que o array de equipamentos está salvo
    logger.info(`💾 [processMagePowerChoice] Salvando no banco ANTES de recalcular - Equipamentos: ${chosenMonster.equippedCards?.length || 0}`);
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Buscar do banco para garantir que temos os dados salvos
    let savedDuel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (savedDuel) {
      const savedPlayerField = isPlayer1 ? (savedDuel as any).player1Field : (savedDuel as any).player2Field;
      const savedMonster = savedPlayerField?.monsters?.[chosenMonsterZoneIndex];
      if (savedMonster) {
        logger.info(`💾 [processMagePowerChoice] APÓS salvar (dados do banco) - Equipamentos no monstro: ${savedMonster.equippedCards?.length || 0}, array: ${JSON.stringify(savedMonster.equippedCards || [])}`);
        logger.info(`💾 [processMagePowerChoice] APÓS salvar (dados do banco) - Bônus ATK: ${savedMonster.equipmentBonusAtk || 0}`);

        // Garantir que o array de equipamentos está correto (pode ter sido perdido na serialização)
        if (savedMonster.equippedCards && Array.isArray(savedMonster.equippedCards) && savedMonster.equippedCards.length === chosenMonster.equippedCards.length) {
          // Array está correto, usar os dados salvos
          chosenMonster.equippedCards = savedMonster.equippedCards;
        } else {
          // Array pode ter sido perdido, restaurar do objeto em memória
          logger.warn(`⚠️ [processMagePowerChoice] Array de equipamentos pode ter sido perdido na serialização! Restaurando...`);
          savedMonster.equippedCards = chosenMonster.equippedCards;
          // Salvar novamente
          await host['updateDuelInDatabase'](duelId, {
            player1Field: (savedDuel as any).player1Field,
            player2Field: (savedDuel as any).player2Field,
          } as any);
        }
      }
      duel = savedDuel;
    }

    // IMPORTANTE: Recalcular ATK após salvar para garantir que está correto
    // O ATK já foi calculado e atribuído acima, mas vamos recalcular para garantir
    // que está correto com base no estado atual do campo (pode ter mudado)
    // IMPORTANTE: Usar o duelo salvo para garantir que temos os dados corretos
    if (duel) {
      await host['recalculateMagePowerAtk'](duelId, duel, isPlayer1);

      // Buscar novamente após recálculo
      const finalDuel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
      if (finalDuel) {
        const finalPlayerField = isPlayer1 ? (finalDuel as any).player1Field : (finalDuel as any).player2Field;
        const finalMonster = finalPlayerField?.monsters?.[chosenMonsterZoneIndex];
        if (finalMonster) {
          logger.info(`💾 [processMagePowerChoice] APÓS recálculo final - Equipamentos no monstro: ${finalMonster.equippedCards?.length || 0}, array: ${JSON.stringify(finalMonster.equippedCards || [])}`);
          logger.info(`💾 [processMagePowerChoice] APÓS recálculo final - Bônus ATK: ${finalMonster.equipmentBonusAtk || 0}`);
        }
        duel = finalDuel;
      }

      // Atualizar cache
      host['activeDuels'].set(duelIdStr, duel);
    }

    logger.info(`✅ [processMagePowerChoice] MagePower equipada com sucesso! ATK bonus: +${bonusAtk}`);
    logger.info(`🔍 [processMagePowerChoice] Monstro equipado - ATK base: ${chosenMonster.atk || 0}, ATK bonus: ${chosenMonster.equipmentBonusAtk}, ATK total: ${(chosenMonster.atk || 0) + (chosenMonster.equipmentBonusAtk || 0)}`);

    return { success: true };
  }
