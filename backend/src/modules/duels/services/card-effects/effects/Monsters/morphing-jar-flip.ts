import type { DuelsService } from '../../../../duels.service';
import { CardEffectContext, SimpleCardEffectFunction } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';

export function createMorphingJarFlipEffect(host: DuelsService): SimpleCardEffectFunction {
  return async (context: CardEffectContext) => {
    const { duel, isPlayer1, card, zoneIndex } = context;
    const duelId = String(context.duelId);
    await (async (): Promise<void> => {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do Morphing Jar`);

    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;

    // PASSO 1: Descarta todas as cartas da mão de ambos os jogadores para o cemitério
    const player1HandDiscarded = player1Field.hand && Array.isArray(player1Field.hand) ? player1Field.hand.length : 0;
    const player2HandDiscarded = player2Field.hand && Array.isArray(player2Field.hand) ? player2Field.hand.length : 0;

    // Mover cartas da mão para o cemitério
    if (player1Field.hand && Array.isArray(player1Field.hand)) {
      if (!player1Field.graveyard) player1Field.graveyard = [];
      player1Field.graveyard.push(...player1Field.hand);
      player1Field.hand = [];
    }

    if (player2Field.hand && Array.isArray(player2Field.hand)) {
      if (!player2Field.graveyard) player2Field.graveyard = [];
      player2Field.graveyard.push(...player2Field.hand);
      player2Field.hand = [];
    }

    logger.info(`✅ [CardEffectsService] Morphing Jar: ${player1HandDiscarded} cartas do Player 1 e ${player2HandDiscarded} cartas do Player 2 foram descartadas para o cemitério`);

    // Atualizar no banco antes de comprar cartas
    await host.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);

    // Atualizar cache através do método público
    const activeDuels = (host as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }

    // PASSO 2: Cada jogador compra 5 cartas do deck
    for (let i = 0; i < 5; i++) {
      // Buscar duelo atualizado do cache/banco antes de cada compra
      const activeDuels = (host as any).activeDuels;
      let currentDuel = activeDuels ? activeDuels.get(duelId) : null;
      if (!currentDuel) {
        currentDuel = await host.findDuelByIdFromDatabase(duelId);
        if (currentDuel && activeDuels) {
          activeDuels.set(duelId, currentDuel);
        }
      }

      if (currentDuel) {
        const p1Field = (currentDuel as any).player1Field;
        const p2Field = (currentDuel as any).player2Field;

        // Comprar carta do Player 1
        if (p1Field && p1Field.deck && p1Field.deck.length > 0) {
          const card1 = p1Field.deck.shift();
          if (card1) {
            if (!p1Field.hand) p1Field.hand = [];
            p1Field.hand.push(card1);
          }
        }

        // Comprar carta do Player 2
        if (p2Field && p2Field.deck && p2Field.deck.length > 0) {
          const card2 = p2Field.deck.shift();
          if (card2) {
            if (!p2Field.hand) p2Field.hand = [];
            p2Field.hand.push(card2);
          }
        }

        // Atualizar no banco após cada compra
        await host.updateDuelInDatabase(duelId, {
          player1Field: p1Field,
          player2Field: p2Field,
        } as any);

        // Atualizar cache
        host['activeDuels'].set(duelId, currentDuel);
      }
    }

    logger.info(`✅ [CardEffectsService] Morphing Jar: Cada jogador comprou 5 cartas`);

    // Buscar duelo final atualizado
    const finalDuel = await host.findDuelByIdFromDatabase(duelId);
    if (finalDuel) {
      Object.assign(duel, finalDuel);
      host['activeDuels'].set(duelId, duel);
    }

    })();
    return { success: true };
  };
}
