import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startRedEyesDarknessMetalDragonEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
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

    // Verificar se o Red-Eyes Darkness Metal Dragon existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona inválida' };
    }

    const redEyesDragon = playerField.monsters[monsterZoneIndex];
    if (!redEyesDragon || redEyesDragon === null) {
      return { success: false, message: 'Red-Eyes Darkness Metal Dragon não encontrado no campo' };
    }

    // Verificar se é realmente Red-Eyes Darkness Metal Dragon
    if (!host['isRedEyesDarknessMetalDragon'](redEyesDragon)) {
      return { success: false, message: 'Carta no campo não é Red-Eyes Darkness Metal Dragon' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (redEyesDragon.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do Red-Eyes Darkness Metal Dragon já foi usado neste turno' };
    }

    // Buscar dragões na mão e no cemitério (exceto Red-Eyes Darkness Metal Dragon)
    const dragonsInHand = (playerField.hand || [])
      .map((card: any, index: number) => ({ card, index, source: 'hand' }))
      .filter(({ card }: { card: any }) => {
        if (!card) return false;
        const race = (card.race || card.cardRace || '').toString().toUpperCase().trim();
        const isDragon = race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
        const isRedEyes = host['isRedEyesDarknessMetalDragon'](card);

        // Log para debug
        if (isDragon) {
          logger.info(`🔍 [startRedEyesDarknessMetalDragonEffect] Dragão encontrado na mão: ${card.name || card.cardName}, isRedEyes: ${isRedEyes}, cardId: ${card.idCarta || card.id || card.cardId}`);
        }

        return isDragon && !isRedEyes;
      });

    const dragonsInGraveyard = (playerField.graveyard || [])
      .map((card: any, index: number) => ({ card, index, source: 'graveyard' }))
      .filter(({ card }: { card: any }) => {
        if (!card) return false;
        const cardType = (card.type || card.cardType || '').toString().toUpperCase().trim();
        const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
        if (!isMonster) return false;
        const race = (card.race || card.cardRace || '').toString().toUpperCase().trim();
        const isDragon = race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
        const isRedEyes = host['isRedEyesDarknessMetalDragon'](card);

        // Log para debug
        if (isDragon) {
          logger.info(`🔍 [startRedEyesDarknessMetalDragonEffect] Dragão encontrado no cemitério: ${card.name || card.cardName}, isRedEyes: ${isRedEyes}, cardId: ${card.idCarta || card.id || card.cardId}`);
        }

        return isDragon && !isRedEyes;
      });

    if (dragonsInHand.length === 0 && dragonsInGraveyard.length === 0) {
      return { success: false, message: 'Não há monstros do Tipo Dragão na sua mão ou cemitério (exceto Red-Eyes Darkness Metal Dragon)' };
    }

    logger.info(`✅ [startRedEyesDarknessMetalDragonEffect] Validação concluída - ${dragonsInHand.length} na mão, ${dragonsInGraveyard.length} no cemitério`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        monsterZoneIndex: monsterZoneIndex,
        dragonsInHand: dragonsInHand.map(({ card, index }: { card: any; index: number }) => ({ ...card, handIndex: index })),
        dragonsInGraveyard: dragonsInGraveyard.map(({ card, index }: { card: any; index: number }) => ({ ...card, graveyardIndex: index })),
      }
    };
  }
