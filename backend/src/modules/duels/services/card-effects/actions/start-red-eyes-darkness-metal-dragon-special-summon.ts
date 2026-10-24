import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startRedEyesDarknessMetalDragonSpecialSummon(host: DuelsService, duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string; data?: any }> {
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

    // Pode ser invocada em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar esta carta nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.hand) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Buscar a carta na mão
    logger.info(`🔍 [startRedEyesDarknessMetalDragonSpecialSummon] Procurando carta na mão - cardId recebido: ${cardId}`);
    logger.info(`🔍 [startRedEyesDarknessMetalDragonSpecialSummon] Cartas na mão:`, playerField.hand.map((c: any, idx: number) => ({
      index: idx,
      name: c.name || c.cardName,
      idCarta: c.idCarta,
      id: c.id,
      cardId: c.cardId,
      instanceId: c.instanceId
    })));

    const cardIndex = playerField.hand.findIndex((c: any, idx: number) => {
      // Tentar todas as possibilidades de ID
      const cIdCarta = c.idCarta;
      const cId = c.id;
      const cCardId = c.cardId;
      const cInstanceId = c.instanceId;

      // Comparar com o cardId recebido
      const matches = cIdCarta === cardId ||
                     String(cIdCarta) === String(cardId) ||
                     cId === cardId ||
                     String(cId) === String(cardId) ||
                     cCardId === cardId ||
                     String(cCardId) === String(cardId) ||
                     cInstanceId === cardId ||
                     String(cInstanceId) === String(cardId);

      if (matches) {
        logger.info(`✅ [startRedEyesDarknessMetalDragonSpecialSummon] Carta encontrada na mão no índice ${idx}:`, {
          name: c.name || c.cardName,
          idCarta: cIdCarta,
          id: cId,
          cardId: cCardId,
          instanceId: cInstanceId
        });
      }

      return matches;
    });

    if (cardIndex === -1) {
      logger.error(`❌ [startRedEyesDarknessMetalDragonSpecialSummon] Carta não encontrada na mão! cardId procurado: ${cardId}`);
      logger.error(`❌ [startRedEyesDarknessMetalDragonSpecialSummon] IDs disponíveis na mão:`, playerField.hand.map((c: any) => ({
        idCarta: c.idCarta,
        id: c.id,
        cardId: c.cardId,
        instanceId: c.instanceId
      })));
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é Red-Eyes Darkness Metal Dragon
    if (!host['isRedEyesDarknessMetalDragon'](card)) {
      return { success: false, message: 'Esta carta não pode ser invocada por invocação especial desta forma' };
    }

    // Verificar se a própria carta é do Tipo Dragão
    const cardRace = (card.race || card.cardRace || '').toString().toUpperCase().trim();
    const isDragonType = cardRace === 'DRAGON' || cardRace === 'DRAGÃO' || cardRace.includes('DRAGON');

    if (!isDragonType) {
      logger.warn(`⚠️ [startRedEyesDarknessMetalDragonSpecialSummon] Carta não é do tipo Dragon. Race: ${cardRace}`);
      return { success: false, message: 'Red-Eyes Darkness Metal Dragon deve ser do Tipo Dragão para ser invocado por invocação especial' };
    }

    // Verificar se há monstros do Tipo Dragão face-up no campo do jogador
    if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo de monstros não encontrado' };
    }

    const dragonMonsters = playerField.monsters
      .map((monster: any, index: number) => ({ monster, index }))
      .filter(({ monster }: { monster: any }) => {
        if (!monster || monster === null) return false;
        // Verificar se está face-up
        if (monster.position !== 'attack' && monster.position !== 'defense') return false;
        // Verificar se é do Tipo Dragão
        const race = (monster.race || monster.cardRace || '').toString().toUpperCase().trim();
        const isDragon = race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
        logger.info(`🔍 [startRedEyesDarknessMetalDragonSpecialSummon] Verificando monstro ${monster.name || monster.cardName}: race=${race}, isDragon=${isDragon}, position=${monster.position}`);
        return isDragon;
      });

    logger.info(`🔍 [startRedEyesDarknessMetalDragonSpecialSummon] Total de dragões encontrados: ${dragonMonsters.length}`);

    if (dragonMonsters.length === 0) {
      logger.warn(`⚠️ [startRedEyesDarknessMetalDragonSpecialSummon] Nenhum dragão face-up encontrado no campo`);
      return { success: false, message: 'Você precisa ter pelo menos 1 monstro do Tipo Dragão face-up no campo para invocar esta carta' };
    }

    logger.info(`✅ [startRedEyesDarknessMetalDragonSpecialSummon] Validação concluída - ${dragonMonsters.length} dragões disponíveis`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        cardId: cardId,
        dragonMonsters: dragonMonsters.map(({ monster, index }: { monster: any; index: number }) => ({
          ...monster,
          zoneIndex: index,
        })),
      }
    };
  }
