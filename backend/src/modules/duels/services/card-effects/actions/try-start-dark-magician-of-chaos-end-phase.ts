import type { DuelsService } from '../../../duels.service';
import { Duel, TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartDarkMagicianOfChaosEndPhase(host: DuelsService, duelId: string | number, duel: Duel): Promise<boolean> {
    if ((duel as any).pendingChoice) {
      logger.info(`🌑 [DMoC] skip: já existe pendingChoice ${(duel as any).pendingChoice?.type}`);
      return false;
    }
    const isPlayer1 = duel.currentTurn === 1;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    const monsters = Array.isArray(playerField?.monsters) ? playerField.monsters : [];
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      if (!m) continue;
      logger.info(`🌑 [DMoC] scan zona ${i}: name=${m.name || m.cardName} id=${m.idCarta || m.id} pos=${m.position} summonedTurn=${m.summonedTurnNumber} turn=${turnCounter} isDmoc=${Dmoc.isDarkMagicianOfChaos(m)} faceUp=${Dmoc.isFaceUpMonster(m)} summonedThisTurn=${Dmoc.wasSummonedThisTurn(m, duel)} used=${m.dmocEndPhaseUsedThisTurn}`);
    }
    const candidate = Dmoc.findDmocEndPhaseCandidate(duel, isPlayer1);
    if (!candidate) {
      logger.info(`🌑 [DMoC] nenhum candidato (precisa: DMoC face-up invocado neste turno + magia no GY)`);
      return false;
    }

    const spells = Dmoc.listSpellsInGraveyard(playerField?.graveyard);
    if (spells.length === 0) {
      logger.info(`🌑 [DMoC] candidato na zona ${candidate.zoneIndex} mas GY sem magias`);
      return false;
    }

    const choice = {
      type: 'DARK_MAGICIAN_OF_CHAOS' as const,
      userId: Number(userId),
      turnWhenStarted: duel.turnCounter || 1,
      phaseWhenStarted: TurnPhase.END,
      data: {
        monsterZoneIndex: candidate.zoneIndex,
        spellOptions: spells.map((s) => ({
          index: s.index,
          name: s.card?.name || s.card?.cardName,
          idCarta: s.card?.idCarta || s.card?.id || s.card?.cardId,
          cardImage: s.card?.cardImage || s.card?.imageUrl,
        })),
      },
    };
    (duel as any).pendingChoice = choice;
    await host['setPendingChoice'](duelId, choice);
    logger.info(
      `🌑 [DMoC] End Phase: escolha disponível (${spells.length} magia(s) no GY) zona ${candidate.zoneIndex}`,
    );
    return true;
  }
