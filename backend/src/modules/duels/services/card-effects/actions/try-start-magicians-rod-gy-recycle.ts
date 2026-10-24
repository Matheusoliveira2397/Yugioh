import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansRod from '../effects/Monsters/magicians-rod';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartMagiciansRodGyRecycle(host: DuelsService, duelId: string | number, duel: Duel, rodOwnerIsPlayer1: boolean): Promise<boolean> {
    if ((duel as any).pendingChoice) return false;

    // Deve ser turno do oponente do dono do Rod
    const currentIsPlayer1 = duel.currentTurn === 1;
    if (currentIsPlayer1 === rodOwnerIsPlayer1) {
      return false; // é o turno do dono — efeito só no turno do oponente
    }

    const playerField = rodOwnerIsPlayer1
      ? (duel as any).player1Field
      : (duel as any).player2Field;
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    if (!MagiciansRod.canUseRodGyThisTurn(playerField, turnCounter)) {
      logger.info(`🪄 [Magician's Rod] efeito do GY já usado neste turno`);
      return false;
    }

    const rodInGy = MagiciansRod.findMagiciansRodInGraveyard(playerField?.graveyard);
    if (!rodInGy) return false;

    const spellcasters = MagiciansRod.listSpellcastersOnField(playerField?.monsters);
    if (spellcasters.length === 0) {
      logger.info(`🪄 [Magician's Rod] GY ok mas nenhum Mago no campo para tributar`);
      return false;
    }

    const userId = rodOwnerIsPlayer1 ? duel.player1Id : duel.player2Id;
    const choice = {
      type: 'MAGICIAN_S_ROD_GY' as const,
      userId: Number(userId),
      turnWhenStarted: turnCounter,
      phaseWhenStarted: duel.currentPhase,
      data: {
        graveyardIndex: rodInGy.index,
        tributeOptions: spellcasters.map((s) => ({
          zoneIndex: s.zoneIndex,
          name: s.monster?.name || s.monster?.cardName,
          idCarta: s.monster?.idCarta || s.monster?.id,
          cardImage: s.monster?.cardImage || s.monster?.imageUrl,
          position: s.monster?.position,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    logger.info(
      `🪄 [Magician's Rod] reciclagem do GY disponível (${spellcasters.length} Mago(s))`,
    );
    return true;
  }
