import type { DuelsService } from '../../../../duels.service';
import { CardEffectContext, SimpleCardEffectFunction } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';

export function createDekoichiFlipEffect(host: DuelsService): SimpleCardEffectFunction {
  return async (context: CardEffectContext) => {
    const { duel, isPlayer1, card, zoneIndex } = context;
    const duelId = String(context.duelId);
    await (async (): Promise<void> => {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do Dekoichi the Battlechanted Locomotive - controlador compra 1 carta`);

    const controllerUserId = isPlayer1 ? (duel as any).player1Id : (duel as any).player2Id;
    await host.drawCard(duelId, controllerUserId);
    const updated = await host.findDuelByIdFromDatabase(duelId, true);
    if (updated) {
      Object.assign(duel, updated);
    }

    })();
    return { success: true };
  };
}
