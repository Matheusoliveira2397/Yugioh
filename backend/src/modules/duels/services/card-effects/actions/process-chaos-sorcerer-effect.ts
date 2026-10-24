import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processChaosSorcererEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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


    // Verificar se o ChaosSorcerer existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do ChaosSorcerer inválida' };
    }

    const chaosSorcerer = playerField.monsters[monsterZoneIndex];
    if (!chaosSorcerer || chaosSorcerer === null) {
      return { success: false, message: 'ChaosSorcerer não encontrado no campo' };
    }

    // Verificar se é realmente ChaosSorcerer
    const cardId = chaosSorcerer.idCarta || chaosSorcerer.id || chaosSorcerer.cardId;
    const cardName = (chaosSorcerer.name || chaosSorcerer.cardName || '').toLowerCase();
    const isChaosSorcerer = cardId === 'ChaosSorcerer' ||
                           cardId === 'chaossorcerer' ||
                           cardName === 'chaos sorcerer' ||
                           (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer'));

    if (!isChaosSorcerer) {
      return { success: false, message: 'Carta no campo não é ChaosSorcerer' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (chaosSorcerer.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do ChaosSorcerer já foi usado neste turno' };
    }

    // Obter campo do alvo
    const targetField = targetPlayer === 'player'
      ? playerField
      : opponentField;

    if (!targetField || !targetField.monsters || !Array.isArray(targetField.monsters)) {
      return { success: false, message: 'Campo do alvo não encontrado' };
    }

    // Verificar se o índice é válido
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    const targetMonster = targetField.monsters[targetZoneIndex];
    if (!targetMonster || targetMonster === null) {
      return { success: false, message: 'Não há monstro na zona especificada' };
    }

    // Verificar se o monstro está face-up (attack ou defense)
    if (targetMonster.position !== 'attack' && targetMonster.position !== 'defense') {
      return { success: false, message: 'O monstro alvo deve estar face-up (ataque ou defesa)' };
    }

    // Inicializar banished se não existir - IMPORTANTE: sempre no campo de quem ativou o efeito (playerField)
    if (!playerField.banished) {
      playerField.banished = [];
    }

    logger.info(`✨ [processChaosSorcererEffect] Banindo monstro: ${targetMonster.name || targetMonster.cardName || 'Desconhecido'}`);
    logger.info(`🔍 [processChaosSorcererEffect] Detalhes:`, {
      isPlayer1,
      targetPlayer,
      targetMonsterName: targetMonster.name || targetMonster.cardName,
      playerFieldBanishedBefore: playerField.banished.length,
      opponentFieldBanishedBefore: opponentField.banished?.length || 0,
    });

    // Verificar se o monstro tinha equipamento antes de banir
    await host['handleEquipmentDestruction'](duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);

    // Banir o monstro (remover do campo e adicionar ao banished do JOGADOR que ativou o efeito, não do oponente)
    targetField.monsters[targetZoneIndex] = null;

    // IMPORTANTE: A carta banida vai para a zona de banidos de QUEM ATIVOU O EFEITO (playerField), não de quem tinha o monstro
    // Monstro banido vai para a zona de banidos do DONO ORIGINAL
    const ownerFieldCS = host['getOwnerFieldForMonster'](duel, targetMonster, targetPlayer === 'player' ? isPlayer1 : !isPlayer1);
    if (!ownerFieldCS.banished) ownerFieldCS.banished = [];
    ownerFieldCS.banished.push(targetMonster);

    logger.info(`✅ [processChaosSorcererEffect] Monstro banido e adicionado ao banished do jogador que ativou o efeito:`, {
      playerFieldBanishedAfter: playerField.banished.length,
      opponentFieldBanishedAfter: opponentField.banished?.length || 0,
      banishedMonsterName: targetMonster.name || targetMonster.cardName,
    });

    // Marcar que o efeito foi usado neste turno e que não pode atacar
    chaosSorcerer.effectUsedThisTurn = true;
    chaosSorcerer.cannotAttackThisTurn = true; // Não pode atacar neste turno

    logger.info(`✅ [processChaosSorcererEffect] Efeito usado - effectUsedThisTurn: ${chaosSorcerer.effectUsedThisTurn}, cannotAttackThisTurn: ${chaosSorcerer.cannotAttackThisTurn}`);
    logger.info(`✅ [processChaosSorcererEffect] Monstro banido com sucesso! ChaosSorcerer não pode atacar neste turno`);

    // Limpar pendingChoice e atualizar no banco
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);

    // Verificar se o effectUsedThisTurn foi preservado após salvar e se a carta está no banished correto
    const verifyDuel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (verifyDuel) {
      const verifyPlayerField = isPlayer1 ? (verifyDuel as any).player1Field : (verifyDuel as any).player2Field;
      const verifyOpponentField = isPlayer1 ? (verifyDuel as any).player2Field : (verifyDuel as any).player1Field;
      const verifyChaosSorcerer = verifyPlayerField?.monsters?.[monsterZoneIndex];
      if (verifyChaosSorcerer) {
        logger.info(`🔍 [processChaosSorcererEffect] Verificação após salvar - effectUsedThisTurn: ${verifyChaosSorcerer.effectUsedThisTurn}, cannotAttackThisTurn: ${verifyChaosSorcerer.cannotAttackThisTurn}`);
      }

      // Verificar se a carta banida está no banished correto (do jogador que ativou o efeito, não do oponente)
      const playerBanishedCount = verifyPlayerField?.banished?.length || 0;
      const opponentBanishedCount = verifyOpponentField?.banished?.length || 0;
      const targetMonsterName = targetMonster.name || targetMonster.cardName;
      const isInPlayerBanished = verifyPlayerField?.banished?.some((card: any) =>
        (card.name || card.cardName) === targetMonsterName
      ) || false;
      const isInOpponentBanished = verifyOpponentField?.banished?.some((card: any) =>
        (card.name || card.cardName) === targetMonsterName
      ) || false;

      if (isInOpponentBanished && !isInPlayerBanished) {
        logger.error(`❌ [processChaosSorcererEffect] ERRO CRÍTICO: Carta banida "${targetMonsterName}" está no banished do OPONENTE em vez do jogador! Corrigindo...`);
        // Corrigir: mover a carta do banished do oponente para o banished do jogador
        const cardIndex = verifyOpponentField.banished.findIndex((card: any) =>
          (card.name || card.cardName) === targetMonsterName
        );
        if (cardIndex !== -1) {
          const cardToMove = verifyOpponentField.banished.splice(cardIndex, 1)[0];
          if (!verifyPlayerField.banished) {
            verifyPlayerField.banished = [];
          }
          verifyPlayerField.banished.push(cardToMove);

          // Salvar a correção
          await host['updateDuelInDatabase'](duelIdStr, {
            player1Field: (verifyDuel as any).player1Field,
            player2Field: (verifyDuel as any).player2Field,
          } as any);

          logger.info(`✅ [processChaosSorcererEffect] Carta movida do banished do oponente para o banished do jogador`);
        }
      } else if (isInPlayerBanished) {
        logger.info(`✅ [processChaosSorcererEffect] Verificação OK: Carta banida "${targetMonsterName}" está corretamente no banished do jogador`);
      }
    }

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true };
  }
