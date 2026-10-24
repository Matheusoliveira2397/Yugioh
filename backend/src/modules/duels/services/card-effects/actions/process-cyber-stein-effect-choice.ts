import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processCyberSteinEffectChoice(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number, extraDeckIndex: number): Promise<{ success: boolean; message?: string }> {
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

    // Verificar se o Cyber-Stein existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Cyber-Stein inválida' };
    }

    const cyberStein = playerField.monsters[monsterZoneIndex];
    if (!cyberStein || cyberStein === null) {
      return { success: false, message: 'Cyber-Stein não encontrado no campo' };
    }

    // Verificar se é realmente Cyber-Stein
    const cardId = cyberStein.idCarta || cyberStein.id || cyberStein.cardId;
    const cardName = (cyberStein.name || cyberStein.cardName || '').toLowerCase();
    const isCyberStein = cardId === 'CyberStein' ||
                        cardId === 'cyberstein' ||
                        cardId === 'Cyber-Stein' ||
                        cardName === 'cyber-stein' ||
                        cardName === 'cyber stein' ||
                        (typeof cardId === 'string' && cardId.toLowerCase().includes('cyberstein'));

    if (!isCyberStein) {
      return { success: false, message: 'Carta no campo não é Cyber-Stein' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (cyberStein.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do Cyber-Stein já foi usado neste turno' };
    }

    // Verificar se o jogador tem pelo menos 5000 LP (permitir quando LP >= 5000)
    const playerLifePoints = Number(isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints);
    if (playerLifePoints < 5000) {
      return { success: false, message: 'Você não tem LP suficientes (5000)' };
    }

    // Verificar se há espaço no campo para invocar
    if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no seu campo para invocar um monstro' };
    }

    // Verificar se o índice do Extra Deck é válido
    const extraDeck = playerField.extraDeck || [];
    if (extraDeckIndex < 0 || extraDeckIndex >= extraDeck.length) {
      return { success: false, message: 'Índice do Extra Deck inválido' };
    }

    const cardToSummon = extraDeck[extraDeckIndex];
    if (!cardToSummon) {
      return { success: false, message: 'Carta não encontrada no Extra Deck' };
    }

    // Verificar se é um monstro
    const cardType = (cardToSummon.type || cardToSummon.cardType || '').toString().toUpperCase().trim();
    const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
    if (!isMonster) {
      return { success: false, message: 'A carta selecionada não é um monstro' };
    }

    // Pagar 5000 LP
    if (isPlayer1) {
      duel.player1LifePoints = Math.max(0, duel.player1LifePoints - 5000);
      logger.info(`✅ [processCyberSteinEffectChoice] Player 1 pagou 5000 LP. LP restante: ${duel.player1LifePoints}`);
    } else {
      duel.player2LifePoints = Math.max(0, duel.player2LifePoints - 5000);
      logger.info(`✅ [processCyberSteinEffectChoice] Player 2 pagou 5000 LP. LP restante: ${duel.player2LifePoints}`);
    }

    // Verificar se o jogador perdeu por LP
    if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
      logger.info(`💀 [processCyberSteinEffectChoice] Jogador perdeu por LP após pagar custo`);
      // O duelo será finalizado em outro lugar
    }

    // Remover carta do Extra Deck
    const removedCard = extraDeck.splice(extraDeckIndex, 1)[0];
    logger.info(`✅ [processCyberSteinEffectChoice] Carta removida do Extra Deck: ${removedCard.name || removedCard.cardName}`);

    // Obter turnCounter
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;

    // Invocar o monstro em modo de ataque
    playerField.monsters[emptyZoneIndex] = {
      ...removedCard,
      position: 'attack',
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
      effectUsedThisTurn: false,
    };

    // Marcar efeito do Cyber-Stein como usado
    cyberStein.effectUsedThisTurn = true;

    logger.info(`✅ [processCyberSteinEffectChoice] Monstro ${removedCard.name || removedCard.cardName} invocado por invocação especial em modo de ataque`);

    await host['applySliferEffectOnOpponentSummon'](duelIdStr, duel, isPlayer1, emptyZoneIndex);

    // Atualizar no banco
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true };
  }
