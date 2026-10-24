import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startCyberSteinEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
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
      logger.info(`❌ [startCyberSteinEffect] Jogador não tem LP suficientes (${playerLifePoints} < 5000)`);
      return { success: false, message: 'Você precisa de pelo menos 5000 LP para usar este efeito' };
    }

    // Verificar se há espaço no campo para invocar
    if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no seu campo para invocar um monstro' };
    }

    // Coletar monstros do Extra Deck
    const extraDeck = playerField.extraDeck || [];
    const extraDeckMonsters = extraDeck.filter((card: any) => {
      if (!card) return false;
      const cardType = (card.type || card.cardType || '').toString().toUpperCase().trim();
      return cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
    });

    if (extraDeckMonsters.length === 0) {
      return { success: false, message: 'Não há monstros no seu Extra Deck para invocar' };
    }

    logger.info(`✅ [startCyberSteinEffect] Validação concluída - ${extraDeckMonsters.length} monstros do Extra Deck disponíveis`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        monsterZoneIndex: monsterZoneIndex, // Zona onde está Cyber-Stein
        extraDeckMonsters: extraDeckMonsters.map((monster: any, index: number) => ({
          ...monster,
          extraDeckIndex: extraDeck.findIndex((c: any) => {
            if (!c) return false;
            const cId = c?.idCarta || c?.id || c?.cardId;
            const mId = monster?.idCarta || monster?.id || monster?.cardId;
            return cId === mId || String(cId) === String(mId);
          }),
        })),
      }
    };
  }
