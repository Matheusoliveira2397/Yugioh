import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processUnitedWeStandChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Buscar UnitedWeStand no campo (deve estar em face-up)
    const spellTrapZoneIndex = playerField.spellTrap?.findIndex((card: any) => {
      if (!card) return false;
      return host['isExactCard'](card, 'UnitedWeStand');
    });

    if (spellTrapZoneIndex === undefined || spellTrapZoneIndex === null || spellTrapZoneIndex === -1) {
      return { success: false, message: 'UnitedWeStand não encontrada no campo' };
    }

    // Revelar a spell antes de processar (se estiver em 'set')
    await host['revealSpellAfterModal'](duelIdStr, duel, isPlayer1, spellTrapZoneIndex);

    // Buscar duelo atualizado após revelar
    duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado após revelar spell' };
    }
    const updatedPlayerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Verificar se UnitedWeStand ainda está no campo
    if (!updatedPlayerField || !updatedPlayerField.spellTrap || !updatedPlayerField.spellTrap[spellTrapZoneIndex]) {
      return { success: false, message: 'UnitedWeStand não encontrada no campo' };
    }

    const unitedWeStandCard = updatedPlayerField.spellTrap[spellTrapZoneIndex];
    if (!host['isExactCard'](unitedWeStandCard, 'UnitedWeStand')) {
      return { success: false, message: 'Carta no campo não é UnitedWeStand' };
    }

    // Verificar se o monstro escolhido existe e está face-up
    if (!playerField.monsters || !playerField.monsters[chosenMonsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const chosenMonster = playerField.monsters[chosenMonsterZoneIndex];
    if (chosenMonster.position === 'set') {
      return { success: false, message: 'Monstro deve estar face-up para equipar UnitedWeStand' };
    }
    if (host['isObeliskTheTormentor'](chosenMonster)) {
      return { success: false, message: 'Obelisk the Tormentor não pode ser alvo de efeitos de carta' };
    }

    // Contar monstros face-up no campo do jogador (incluindo o escolhido)
    const faceUpMonsters = playerField.monsters.filter((m: any) =>
      m !== null && m !== undefined && (m.position === 'attack' || m.position === 'defense')
    );
    const bonusAtk = faceUpMonsters.length * 800;

    logger.info(`✨ [processUnitedWeStandChoice] Equipando UnitedWeStand ao monstro ${chosenMonster.name || chosenMonster.cardName}`);
    logger.info(`📊 [processUnitedWeStandChoice] Monstros face-up: ${faceUpMonsters.length}, ATK bonus: +${bonusAtk}`);

    // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
    // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
    // IMPORTANTE: Permitir múltiplos equipamentos - os efeitos se somam
    // Não remover equipamentos anteriores, apenas adicionar o novo

    // Equipar ao monstro
    const unitedWeStandCardId = unitedWeStandCard.idCarta || unitedWeStandCard.id || unitedWeStandCard.cardId;
    chosenMonster.equippedBy = isPlayer1 ? 1 : 2;

    // Inicializar array de equips apenas se não existir (manter equipamentos anteriores)
    if (!chosenMonster.equippedCards || !Array.isArray(chosenMonster.equippedCards)) {
      chosenMonster.equippedCards = [];
    }

    // Criar referência única para este equipamento: cardId:spellTrapZoneIndex
    // Usar instanceId se disponível para distinguir múltiplas cópias da mesma carta
    const cardInstanceId = unitedWeStandCard.instanceId;
    const uniqueEquipRef = cardInstanceId
      ? `${unitedWeStandCardId}:${spellTrapZoneIndex}:${cardInstanceId}`
      : `${unitedWeStandCardId}:${spellTrapZoneIndex}`;

    // Verificar se este equipamento já está no array (evitar duplicatas)
    if (!chosenMonster.equippedCards.includes(uniqueEquipRef)) {
      // Adicionar novo equip ao array (múltiplos equipamentos permitidos)
      chosenMonster.equippedCards.push(uniqueEquipRef);
      logger.info(`✅ [processUnitedWeStandChoice] Equipamento ${unitedWeStandCard.name || unitedWeStandCard.cardName} adicionado ao monstro. Total de equips: ${chosenMonster.equippedCards.length}`);
    } else {
      logger.info(`⚠️ [processUnitedWeStandChoice] Equipamento ${unitedWeStandCard.name || unitedWeStandCard.cardName} já está equipado neste monstro`);
    }

    // Manter equippedCardId para compatibilidade (último equip adicionado)
    chosenMonster.equippedCardId = unitedWeStandCardId;
    chosenMonster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;

    // Recalcular bônus total do equipamento (United We Stand: +800 ATK e +800 DEF por monstro face-up)
    // IMPORTANTE: Recalcular após adicionar o novo equipamento para garantir que todos os equipamentos sejam considerados
    const oldBonus = chosenMonster.equipmentBonusAtk || 0;
    chosenMonster.equipmentBonusAtk = host['calculateTotalEquipmentBonus'](chosenMonster, playerField);
    chosenMonster.equipmentBonusDef = host['calculateTotalEquipmentBonusDef'](chosenMonster, playerField);
    logger.info(`🔄 [processUnitedWeStandChoice] Bônus recalculado: ${oldBonus} -> ${chosenMonster.equipmentBonusAtk} ATK, DEF: +${chosenMonster.equipmentBonusDef || 0}`);
    logger.info(`📊 [processUnitedWeStandChoice] Equipamentos no monstro: ${chosenMonster.equippedCards?.length || 0} (${chosenMonster.equippedCards?.join(', ') || 'nenhum'})`);

    // IMPORTANTE: Garantir que o array de equipamentos está correto antes de salvar
    logger.info(`💾 [processUnitedWeStandChoice] ANTES de salvar - Equipamentos no monstro: ${chosenMonster.equippedCards?.length || 0}, array: ${JSON.stringify(chosenMonster.equippedCards || [])}`);
    logger.info(`💾 [processUnitedWeStandChoice] ANTES de salvar - Bônus ATK: ${chosenMonster.equipmentBonusAtk || 0}`);

    // IMPORTANTE: Salvar PRIMEIRO antes de recalcular para garantir que o array de equipamentos está no banco
    // Adicionar referência ao monstro equipado na carta UnitedWeStand
    unitedWeStandCard.equippedToMonsterZoneIndex = chosenMonsterZoneIndex;

    // Salvar no banco ANTES de recalcular para garantir que o array de equipamentos está salvo
    logger.info(`💾 [processUnitedWeStandChoice] Salvando no banco ANTES de recalcular - Equipamentos: ${chosenMonster.equippedCards?.length || 0}`);
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
        logger.info(`💾 [processUnitedWeStandChoice] APÓS salvar (dados do banco) - Equipamentos no monstro: ${savedMonster.equippedCards?.length || 0}, array: ${JSON.stringify(savedMonster.equippedCards || [])}`);
        logger.info(`💾 [processUnitedWeStandChoice] APÓS salvar (dados do banco) - Bônus ATK: ${savedMonster.equipmentBonusAtk || 0}`);

        // Garantir que o array de equipamentos está correto (pode ter sido perdido na serialização)
        if (savedMonster.equippedCards && Array.isArray(savedMonster.equippedCards) && savedMonster.equippedCards.length === chosenMonster.equippedCards.length) {
          // Array está correto, usar os dados salvos
          chosenMonster.equippedCards = savedMonster.equippedCards;
        } else {
          // Array pode ter sido perdido, restaurar do objeto em memória
          logger.warn(`⚠️ [processUnitedWeStandChoice] Array de equipamentos pode ter sido perdido na serialização! Restaurando...`);
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

    // Recalcular UnitedWeStand para todos os monstros (pode afetar outros monstros também)
    // IMPORTANTE: Usar o duelo salvo para garantir que temos os dados corretos
    if (duel) {
      await host['recalculateUnitedWeStandAtk'](duelId, duel, isPlayer1);

      // Buscar novamente após recálculo
      const finalDuel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
      if (finalDuel) {
        const finalPlayerField = isPlayer1 ? (finalDuel as any).player1Field : (finalDuel as any).player2Field;
        const finalMonster = finalPlayerField?.monsters?.[chosenMonsterZoneIndex];
        if (finalMonster) {
          logger.info(`💾 [processUnitedWeStandChoice] APÓS recálculo final - Equipamentos no monstro: ${finalMonster.equippedCards?.length || 0}, array: ${JSON.stringify(finalMonster.equippedCards || [])}`);
          logger.info(`💾 [processUnitedWeStandChoice] APÓS recálculo final - Bônus ATK: ${finalMonster.equipmentBonusAtk || 0}`);
        }
        duel = finalDuel;
      }

      // Atualizar cache
      host['activeDuels'].set(duelIdStr, duel);
    }

    logger.info(`✅ [processUnitedWeStandChoice] UnitedWeStand equipada com sucesso! ATK bonus: +${bonusAtk}`);

    return { success: true };
  }
