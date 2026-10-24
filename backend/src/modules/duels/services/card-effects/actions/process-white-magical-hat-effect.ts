import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processWhiteMagicalHatEffect(host: DuelsService, duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, attacker: any, target?: any): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      // Verificar se o atacante é WhiteMagicalHat (quando WhiteMagicalHat causa dano)
      const attackerIsWhiteMagicalHat = host['isExactCard'](attacker, 'WhiteMagicalHat');

      // Verificar se o defensor é WhiteMagicalHat (quando WhiteMagicalHat é atacada e oponente leva dano)
      const targetIsWhiteMagicalHat = target ? host['isExactCard'](target, 'WhiteMagicalHat') : false;

      if (!attackerIsWhiteMagicalHat && !targetIsWhiteMagicalHat) {
        return;
      }

      // Determinar qual carta é WhiteMagicalHat e quem recebeu o dano
      let isWhiteMagicalHatAttacker = attackerIsWhiteMagicalHat;
      let isWhiteMagicalHatDefender = targetIsWhiteMagicalHat;

      // Se WhiteMagicalHat é o defensor, o oponente (atacante) recebeu dano
      // Se WhiteMagicalHat é o atacante, o oponente (defensor) recebeu dano
      let opponentField;
      let isOpponentPlayer1;

      if (isWhiteMagicalHatDefender) {
        // WhiteMagicalHat foi atacada e o atacante levou dano
        // O oponente é quem atacou (isAttackerPlayer1)
        isOpponentPlayer1 = isAttackerPlayer1;
        opponentField = isAttackerPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        logger.info(`✨ [processWhiteMagicalHatEffect] WhiteMagicalHat foi atacada e oponente levou dano - processando efeito`);
      } else {
        // WhiteMagicalHat causou dano ao oponente
        // O oponente é quem recebeu o dano (não é isAttackerPlayer1)
        isOpponentPlayer1 = !isAttackerPlayer1;
        opponentField = isAttackerPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        logger.info(`✨ [processWhiteMagicalHatEffect] WhiteMagicalHat causou dano - processando efeito`);
      }

      // Verificar se o oponente tem cartas na mão
      if (!opponentField || !opponentField.hand || !Array.isArray(opponentField.hand) || opponentField.hand.length === 0) {
        logger.info(`⚠️ [processWhiteMagicalHatEffect] Oponente não tem cartas na mão para descartar`);
        return;
      }

      // Selecionar aleatoriamente 1 card da mão do oponente
      const randomIndex = Math.floor(Math.random() * opponentField.hand.length);
      const discardedCard = opponentField.hand.splice(randomIndex, 1)[0];

      logger.info(`💥 [processWhiteMagicalHatEffect] WhiteMagicalHat: Carta aleatória descartada da mão do oponente: ${discardedCard.name || discardedCard.cardName || 'Desconhecida'}`);

      // Adicionar ao cemitério do oponente
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(discardedCard);

      // Atualizar o campo do oponente no duelo
      if (isOpponentPlayer1) {
        (duel as any).player1Field = opponentField;
      } else {
        (duel as any).player2Field = opponentField;
      }

      // Salvar no banco de dados
      await host['updateDuelInDatabase'](duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);

      logger.info(`✅ [processWhiteMagicalHatEffect] WhiteMagicalHat: Oponente descartou 1 carta aleatória da mão`);

      // Atualizar cache
      host['activeDuels'].set(duelIdStr, duel);
    } catch (error) {
      logger.error(`❌ [processWhiteMagicalHatEffect] Erro ao processar efeito do WhiteMagicalHat:`, error);
    }
  }
