import type { DuelsService } from '../../../../duels.service';
import { CardEffectContext, SimpleCardEffectFunction } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';

export function createSnowmanEaterFlipEffect(host: DuelsService): SimpleCardEffectFunction {
  return async (context: CardEffectContext) => {
    const { duel, isPlayer1, card, zoneIndex } = context;
    const duelId = String(context.duelId);
    await (async (): Promise<void> => {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do SnowmanEater`);

    // Verificar se há monstros face-up no campo
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;

    let hasFaceUpMonsters = false;

    // Verificar monstros do Player 1
    if (player1Field && player1Field.monsters && Array.isArray(player1Field.monsters)) {
      for (const monster of player1Field.monsters) {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          hasFaceUpMonsters = true;
          break;
        }
      }
    }

    // Verificar monstros do Player 2
    if (!hasFaceUpMonsters && player2Field && player2Field.monsters && Array.isArray(player2Field.monsters)) {
      for (const monster of player2Field.monsters) {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          hasFaceUpMonsters = true;
          break;
        }
      }
    }

    if (!hasFaceUpMonsters) {
      logger.info(`ℹ️ [CardEffectsService] SnowmanEater: Não há monstros face-up no campo para destruir`);
      return;
    }

    // IMPORTANTE: Snowman Eater não cria pendingChoice - o frontend gerencia o estado temporário
    logger.info(`ℹ️ [CardEffectsService] SnowmanEater: Frontend gerenciará o estado temporário - não criando pendingChoice`);

    // Atualizar no banco
    await host.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);

    // Atualizar cache através do método público
    const activeDuels = (host as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }

    })();
    return { success: true };
  };
}
