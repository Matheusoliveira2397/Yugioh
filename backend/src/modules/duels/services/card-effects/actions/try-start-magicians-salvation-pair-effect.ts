import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansSalvation from '../effects/spells/magicians-salvation';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartMagiciansSalvationPairEffect(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, summonedZoneIndex: number): Promise<boolean> {
    if ((duel as any).pendingChoice) return false;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!MagiciansSalvation.hasFaceUpMagiciansSalvation(playerField)) return false;

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    if (!MagiciansSalvation.canUseSalvationPairThisTurn(playerField, turnCounter)) {
      return false;
    }

    const summoned = playerField?.monsters?.[summonedZoneIndex];
    if (!summoned || !MagiciansSalvation.isDarkMagicianOrGirl(summoned)) return false;

    const pair = MagiciansSalvation.findPairInGraveyard(playerField?.graveyard, summoned);
    if (!pair) {
      logger.info(`✨ [Magician's Salvation] sem par no GY para ${summoned.name || summoned.cardName}`);
      return false;
    }

    const emptyZone = MagiciansSalvation.findEmptyMonsterZone(playerField?.monsters);
    if (emptyZone < 0) {
      logger.info(`✨ [Magician's Salvation] sem zona de monstro vazia`);
      return false;
    }

    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const choice = {
      type: 'MAGICIAN_S_SALVATION_PAIR' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        targetZoneIndex: summonedZoneIndex,
        targetName: summoned.name || summoned.cardName,
        graveyardIndex: pair.index,
        summonZoneIndex: emptyZone,
        pairName: pair.card?.name || pair.card?.cardName,
        pairCardImage: pair.card?.cardImage || pair.card?.imageUrl,
        pairIdCarta: pair.card?.idCarta || pair.card?.id,
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    logger.info(
      `✨ [Magician's Salvation] par disponível: alvo zona ${summonedZoneIndex} → SS ${pair.card?.name} do GY`,
    );
    return true;
  }
