import type { DuelsService } from '../../../duels.service';
import { DuelResult, TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as Pts from '../effects/spells/player-target-spell.helpers';
import * as BigShieldGardna from '../effects/Monsters/big-shield-gardna';
import * as SkilledDm from '../effects/Monsters/skilled-dark-magician';

/** Registered choice; public API remains on DuelsService. */
export async function processPlayerTargetSpellChoice(host: DuelsService, duelId: string | number, userId: number, actionData: any): Promise<{
    success: boolean;
    message?: string;
    needsSecondStep?: boolean;
    secondEmit?: any;
  }> {
    const duelIdStr = String(duelId);
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'PLAYER_TARGET_SPELL' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Nenhuma escolha pendente válida' };
    }

    const d = pending.data;
    const spellKind = d.spellKind as string;
    const step = typeof d.step === 'number' ? d.step : 1;
    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    const matchesActivating = (c: any) => {
      if (d.cardInstanceId && c?.instanceId) return c.instanceId === d.cardInstanceId;
      const cid = c?.idCarta || c?.id || c?.cardId;
      return !!(cid && d.cardId && String(cid) === String(d.cardId));
    };

    const sync = async (extra: any = {}) => {
      await (host as any).syncDuelState(duelIdStr, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
        ...extra,
      });
      await (host as any).recalculateMagePowerAtk(duelIdStr, duel, true);
      await (host as any).recalculateMagePowerAtk(duelIdStr, duel, false);
    };

    const finishSpellToGy = async (extra: any = {}) => {
      const popped = host['popActivatingPlayerTargetSpell'](duel, isPlayer1, d);
      if (popped.error) return { success: false, message: popped.error };
      if (!popped.card) return { success: false, message: 'Carta ativada não encontrada' };
      host['pushActivatorGraveyard'](duel, isPlayer1, popped.card);
      // Skilled Dark Magician: Magia resolveu
      SkilledDm.addSpellCountersOnSpellResolve(playerField);
      await sync(extra);
      await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
      await host['clearPendingChoice'](duelIdStr, false);
      host['activeDuels'].set(duelIdStr, duel);
      return { success: true };
    };

    if (spellKind === 'TRIBUTE_TO_THE_DOOMED' && step === 1) {
      const iid = actionData.instanceIdToDiscard;
      if (!iid) return { success: false, message: 'Escolha uma carta para descartar' };
      const hi = (playerField.hand || []).findIndex((c: any) => c?.instanceId === iid);
      if (hi < 0) return { success: false, message: 'Carta inválida na mão' };
      if (!d.cardWasOnField && matchesActivating(playerField.hand[hi])) {
        return { success: false, message: 'Escolha outra carta (não a magia ativada)' };
      }
      const [disc] = playerField.hand.splice(hi, 1);
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(disc);

      const oppMons: any[] = [];
      (opponentField.monsters || []).forEach((m: any, z: number) => {
        if (m) oppMons.push({ ...m, zoneIndex: z });
      });

      const data2 = {
        ...d,
        step: 2,
        selectableHand: undefined,
        graveyardChoices: undefined,
        spellTrapChoices: undefined,
        defenseMonsters: undefined,
        emptyMonsterZones: undefined,
        opponentMonsters: oppMons,
        title: 'Tribute to the Doomed — passo 2: escolha o monstro do oponente para destruir',
      };
      await host['setPendingChoice'](duelIdStr, {
        type: 'PLAYER_TARGET_SPELL',
        userId: Number(userId),
        turnWhenStarted: pending.turnWhenStarted,
        phaseWhenStarted: pending.phaseWhenStarted,
        data: data2,
      });
      await sync();
      host['activeDuels'].set(duelIdStr, duel);
      return {
        success: true,
        needsSecondStep: true,
        secondEmit: {
          duelId: duelIdStr,
          spellKind,
          step: 2,
          title: data2.title,
          opponentMonsters: oppMons,
        },
      };
    }

    if (spellKind === 'ANCIENT_RULES' && step === 1) {
      const iid = actionData.instanceIdToDiscard;
      if (!iid) return { success: false, message: 'Escolha um monstro na mão' };
      const hi = (playerField.hand || []).findIndex((c: any) => c?.instanceId === iid);
      if (hi < 0) return { success: false, message: 'Carta inválida na mão' };
      const pick = playerField.hand[hi];
      if (!Pts.isNormalMonsterCard(pick) || Number(pick.level ?? 0) < 5) {
        return { success: false, message: 'Monstro inválido' };
      }
      const [staged] = playerField.hand.splice(hi, 1);
      const zones = Pts.listEmptyMonsterZones(playerField.monsters);
      const data2 = {
        ...d,
        step: 2,
        stagedMonster: staged,
        selectableHand: undefined,
        graveyardChoices: undefined,
        spellTrapChoices: undefined,
        defenseMonsters: undefined,
        opponentMonsters: undefined,
        emptyMonsterZones: zones,
        title: 'Ancient Rules — passo 2: escolha a zona para Invocação-Especial',
      };
      await host['setPendingChoice'](duelIdStr, {
        type: 'PLAYER_TARGET_SPELL',
        userId: Number(userId),
        turnWhenStarted: pending.turnWhenStarted,
        phaseWhenStarted: pending.phaseWhenStarted,
        data: data2,
      });
      await sync();
      host['activeDuels'].set(duelIdStr, duel);
      return {
        success: true,
        needsSecondStep: true,
        secondEmit: {
          duelId: duelIdStr,
          spellKind,
          step: 2,
          title: data2.title,
          emptyMonsterZones: zones,
        },
      };
    }

    if (spellKind === 'SILVERS_CRY' && step === 1) {
      const gi = actionData.graveyardIndex;
      if (gi === undefined || gi === null || gi < 0) return { success: false, message: 'Escolha uma carta no Cemitério' };
      const gy = playerField.graveyard || [];
      if (gi >= gy.length) return { success: false, message: 'Índice do Cemitério inválido' };
      const c = gy[gi];
      const race = String(c?.race || '').toLowerCase();
      if (!Pts.isNormalMonsterCard(c) || !race.includes('dragon')) {
        return { success: false, message: 'Monstro inválido' };
      }
      const [staged] = playerField.graveyard.splice(gi, 1);
      const zones = Pts.listEmptyMonsterZones(playerField.monsters);
      const data2 = {
        ...d,
        step: 2,
        stagedMonster: staged,
        graveyardChoices: undefined,
        selectableHand: undefined,
        spellTrapChoices: undefined,
        defenseMonsters: undefined,
        opponentMonsters: undefined,
        emptyMonsterZones: zones,
        title: "Silver's Cry — passo 2: escolha a zona para Invocação-Especial",
      };
      await host['setPendingChoice'](duelIdStr, {
        type: 'PLAYER_TARGET_SPELL',
        userId: Number(userId),
        turnWhenStarted: pending.turnWhenStarted,
        phaseWhenStarted: pending.phaseWhenStarted,
        data: data2,
      });
      await sync();
      host['activeDuels'].set(duelIdStr, duel);
      return {
        success: true,
        needsSecondStep: true,
        secondEmit: {
          duelId: duelIdStr,
          spellKind,
          step: 2,
          title: data2.title,
          emptyMonsterZones: zones,
        },
      };
    }

    try {
      if (spellKind === 'LIGHTNING_VORTEX') {
        const iid = actionData.instanceIdToDiscard;
        if (!iid) return { success: false, message: 'Escolha uma carta para descartar' };
        const hi = (playerField.hand || []).findIndex((c: any) => c?.instanceId === iid);
        if (hi < 0) return { success: false, message: 'Carta inválida na mão' };
        if (!d.cardWasOnField && matchesActivating(playerField.hand[hi])) {
          return { success: false, message: 'Escolha outra carta como custo' };
        }
        const [cost] = playerField.hand.splice(hi, 1);
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(cost);
        for (let i = 0; i < (opponentField.monsters || []).length; i++) {
          const m = opponentField.monsters[i];
          if (!Pts.isFaceUpMonster(m)) continue;
          await host['handleEquipmentDestruction'](duelIdStr, duel, !isPlayer1, m);
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(m);
          opponentField.monsters[i] = null;
          if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
        }
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'TRADE_IN') {
        const iid = actionData.instanceIdToDiscard;
        if (!iid) return { success: false, message: 'Escolha um monstro para descartar' };
        const hi = (playerField.hand || []).findIndex((c: any) => c?.instanceId === iid);
        if (hi < 0) return { success: false, message: 'Carta inválida na mão' };
        const c = playerField.hand[hi];
        const isM = String(c?.type || c?.cardType) === 'Monster' || String(c?.type || c?.cardType) === 'MONSTER';
        if (!isM || Number(c?.level ?? 0) < 8) return { success: false, message: 'Monstro de Nível 8+ necessário' };
        const [disc] = playerField.hand.splice(hi, 1);
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(disc);
        const uid = isPlayer1 ? duel.player1Id : duel.player2Id;
        await host['drawCard'](duelIdStr, uid as number);
        await host['drawCard'](duelIdStr, uid as number);
        return await finishSpellToGy();
      }

      if (spellKind === 'DARK_ERUPTION') {
        const gi = actionData.graveyardIndex;
        if (gi === undefined || gi < 0) return { success: false, message: 'Escolha uma carta no Cemitério' };
        const gy = playerField.graveyard || [];
        if (gi >= gy.length) return { success: false, message: 'Índice inválido' };
        const c = gy[gi];
        const attr = String(c?.attribute || '').toUpperCase();
        const atk = Number(c?.atk ?? 0);
        const isM = String(c?.type || c?.cardType || '').toLowerCase().includes('monster');
        if (!isM || (attr !== 'DARK' && attr !== 'TREVAS') || atk > 1500) {
          return { success: false, message: 'Alvo inválido' };
        }
        const [pickedGy] = playerField.graveyard.splice(gi, 1);
        if (!playerField.hand) playerField.hand = [];
        playerField.hand.push(pickedGy);
        return await finishSpellToGy();
      }

      if (spellKind === 'STAMPING_DESTRUCTION') {
        const z = actionData.spellTrapZoneIndex;
        const isOpp = actionData.spellTrapTargetIsOpponent === true;
        if (z === undefined || z === null || z < 0 || z >= 5) {
          return { success: false, message: 'Zona de Magia/Armadilha inválida' };
        }
        const ok = await host['ptsDestroySpellTrapZone'](duelIdStr, duel, isOpp ? !isPlayer1 : isPlayer1, z);
        if (!ok) return { success: false, message: 'Não há carta nessa zona' };
        const damage = 500;
        if (isOpp) {
          if (isPlayer1) duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
          else duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
        } else {
          if (isPlayer1) duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
          else duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
        }
        const lpSync = {
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        };
        const done = await finishSpellToGy(lpSync);
        if (!done.success) return done;
        if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
          const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
          await host['finishDuel'](
            duelIdStr,
            duel.player1LifePoints <= 0 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN,
            winnerId as number,
          );
        }
        return { success: true };
      }

      if (spellKind === 'TRIBUTE_TO_THE_DOOMED' && step === 2) {
        const z = actionData.monsterZoneIndex;
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona de monstro inválida' };
        const m = opponentField.monsters[z];
        if (!m) return { success: false, message: 'Nenhum monstro nessa zona' };

        // Big Shield Gardna: if face-down and being targeted alone by single-target spell
        if (m.position === 'set' && BigShieldGardna.isBigShieldGardna(m)) {
          // Check if this is the only target (step 2 of TRIBUTE implies single target)
          logger.info(`🛡️ [Big Shield Gardna] Face-down Gardna targeted by single-target spell - flipping and negating`);

          // Flip to face-up defense position
          m.position = 'defense';

          // Negate the spell: send spell to GY without destroying Gardna
          const popped = host['popActivatingPlayerTargetSpell'](duel, isPlayer1, d);
          if (!popped.error && popped.card) {
            host['pushActivatorGraveyard'](duel, isPlayer1, popped.card);
          }

          await sync();
          await host['clearPendingChoice'](duelIdStr, false);
          host['activeDuels'].set(duelIdStr, duel);

          return { success: true, message: 'Big Shield Gardna negou a ativação da Magia!' };
        }

        await host['handleEquipmentDestruction'](duelIdStr, duel, !isPlayer1, m);
        opponentField.monsters[z] = null;
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(m);
        if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'ANCIENT_RULES' && step === 2) {
        const z = actionData.emptyMonsterZoneIndex;
        const staged = d.stagedMonster;
        if (!staged) return { success: false, message: 'Estado inválido' };
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona inválida' };
        if (playerField.monsters[z] != null) return { success: false, message: 'Zona ocupada' };
        await host['ptsPlaceSpecialSummoned'](duelIdStr, duel, isPlayer1, playerField, staged, z, 'attack');
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'SILVERS_CRY' && step === 2) {
        const z = actionData.emptyMonsterZoneIndex;
        const staged = d.stagedMonster;
        if (!staged) return { success: false, message: 'Estado inválido' };
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona inválida' };
        if (playerField.monsters[z] != null) return { success: false, message: 'Zona ocupada' };
        await host['ptsPlaceSpecialSummoned'](duelIdStr, duel, isPlayer1, playerField, staged, z, 'attack');
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'SHIELD_CRUSH') {
        const z = actionData.monsterZoneIndex;
        const isOpp = actionData.monsterTargetIsOpponent === true;
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona inválida' };
        const field = isOpp ? opponentField : playerField;
        const m = field.monsters[z];
        if (!Pts.isDefensePositionMonster(m)) return { success: false, message: 'Monstro inválido' };
        const ownerP1 = isOpp ? !isPlayer1 : isPlayer1;
        await host['handleEquipmentDestruction'](duelIdStr, duel, ownerP1, m);
        field.monsters[z] = null;
        if (!field.graveyard) field.graveyard = [];
        field.graveyard.push(m);
        if (!field.monsterDestroyedThisTurn) field.monsterDestroyedThisTurn = true;
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'FISSURE_CHOOSE') {
        const z = actionData.monsterZoneIndex;
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona inválida' };
        const tied = Pts.findFissureTiedZoneIndices(opponentField);
        if (!tied.includes(z)) return { success: false, message: 'Alvo inválido para Fissure' };
        const m = opponentField.monsters[z];
        if (!m) return { success: false, message: 'Zona vazia' };
        await host['handleEquipmentDestruction'](duelIdStr, duel, !isPlayer1, m);
        opponentField.monsters[z] = null;
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(m);
        if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'RING_OF_DESTRUCTION') {
        const z = actionData.monsterZoneIndex;
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona de monstro inválida' };
        const m = opponentField.monsters[z];
        if (!m || !Pts.isFaceUpMonster(m)) return { success: false, message: 'Escolha um monstro com a face para cima do oponente' };
        const damage = host['getTotalMonsterAtk'](m, duel, !isPlayer1, duel.currentPhase || TurnPhase.MAIN1);
        await host['handleEquipmentDestruction'](duelIdStr, duel, !isPlayer1, m);
        opponentField.monsters[z] = null;
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(m);
        if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
        duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
        const lpSync = {
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        };
        const done = await finishSpellToGy(lpSync);
        if (!done.success) return done;
        if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
          const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
          await host['finishDuel'](
            duelIdStr,
            duel.player1LifePoints <= 0 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN,
            winnerId as number,
          );
        }
        return { success: true };
      }

      if (spellKind === 'THOUSAND_KNIVES') {
        if (!Pts.fieldControlsDarkMagician(playerField)) {
          return { success: false, message: 'Você precisa controlar "Dark Magician".' };
        }
        const z = actionData.monsterZoneIndex;
        if (z === undefined || z < 0 || z >= 5) return { success: false, message: 'Zona de monstro inválida' };
        const m = opponentField.monsters[z];
        if (!m) return { success: false, message: 'Nenhum monstro nessa zona' };
        // Eternal Soul: DM do oponente imune a efeitos do oponente... aqui o ativador é o dono de Knives, então o monstro do oponente
        if (host['isMonsterUnaffectedByOpponentEffects'](duel, !isPlayer1, m)) {
          return { success: false, message: 'Esse monstro é imune a efeitos do oponente (Eternal Soul)' };
        }
        await host['handleEquipmentDestruction'](duelIdStr, duel, !isPlayer1, m);
        host['sendMonsterLeavingField'](duel, m, !isPlayer1);
        opponentField.monsters[z] = null;
        if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
        await (host as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
        return await finishSpellToGy();
      }

      if (spellKind === 'DE_SPELL') {
        const z = actionData.spellTrapZoneIndex;
        const isOpp = actionData.spellTrapTargetIsOpponent === true;
        if (z === undefined || z === null || z < 0 || z >= 5) {
          return { success: false, message: 'Zona inválida' };
        }
        const targetField = isOpp ? opponentField : playerField;
        const st = targetField.spellTrap?.[z];
        if (!st) return { success: false, message: 'Carta não encontrada' };

        const pos = st.position || 'face-up';
        const cardType = String(st.type || st.cardType || '').toLowerCase();
        const isSpell = cardType.includes('spell') || cardType.includes('magia');

        // If set, reveal it
        if (pos === 'set' || pos === 'face-down') {
          logger.info(`🔍 [DE_SPELL] Revelando carta setada: ${st.name || st.cardName}`);
        }

        // Only destroy if it's a Spell
        if (isSpell) {
          if (!targetField.graveyard) targetField.graveyard = [];
          targetField.graveyard.push(st);
          targetField.spellTrap[z] = null;
          logger.info(`💥 [DE_SPELL] Magia destruída: ${st.name || st.cardName}`);
          await host['recalculateMagePowerAtk'](duelIdStr, duel, !isPlayer1);
        } else {
          logger.info(`⚠️ [DE_SPELL] Carta revelada mas não é Magia, não foi destruída: ${st.name || st.cardName}`);
        }

        return await finishSpellToGy();
      }

      return { success: false, message: 'Passo ou efeito não suportado' };
    } catch (e) {
      logger.error('[processPlayerTargetSpellChoice]', e);
      return { success: false, message: e instanceof Error ? e.message : 'Erro ao resolver efeito' };
    }
  }
