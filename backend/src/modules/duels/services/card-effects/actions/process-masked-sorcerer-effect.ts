import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processMaskedSorcererEffect(host: DuelsService, duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, attacker: any, target?: any): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      const attackerIsMaskedSorcerer = host['isExactCard'](attacker, 'MaskedSorcerer');
      const targetIsMaskedSorcerer = target ? host['isExactCard'](target, 'MaskedSorcerer') : false;

      if (!attackerIsMaskedSorcerer && !targetIsMaskedSorcerer) {
        return;
      }

      // Quem compra é sempre o dono do Masked Sorcerer
      let controllerPlayerId: number;
      if (targetIsMaskedSorcerer) {
        // Masked Sorcerer é o defensor: dono é o defensor (!isAttackerPlayer1)
        controllerPlayerId = isAttackerPlayer1 ? duel.player2Id : duel.player1Id;
        logger.info(`✨ [processMaskedSorcererEffect] MaskedSorcerer foi atacado em defesa e oponente levou dano - dono compra 1 carta`);
      } else {
        // Masked Sorcerer é o atacante: dono é o atacante
        controllerPlayerId = isAttackerPlayer1 ? duel.player1Id : duel.player2Id;
        logger.info(`✨ [processMaskedSorcererEffect] MaskedSorcerer causou dano - dono compra 1 carta`);
      }

      await host['drawCard'](duelId, controllerPlayerId);

      logger.info(`✅ [processMaskedSorcererEffect] MaskedSorcerer: Jogador comprou 1 carta`);
      host['activeDuels'].set(duelIdStr, duel);
    } catch (error) {
      logger.error(`❌ [processMaskedSorcererEffect] Erro ao processar efeito do MaskedSorcerer:`, error);
    }
  }
