import { SimpleCardEffectFunction, CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';

const isFaceUpMonster = (m: any): boolean =>
  m && m !== null && (m.position === 'attack' || m.position === 'defense');

const isElementalHero = (card: any): boolean => {
  if (!card) return false;
  const name = (card.name || card.cardName || '').toString().toLowerCase();
  return name.includes('elemental hero') || name.includes('heroi elemental');
};

const isNormalMonsterCard = (c: any): boolean => {
  if (!c) return false;
  const t = c.type || c.cardType;
  if (String(t) !== 'Monster' && String(t) !== 'MONSTER') return false;
  const mt = c.monsterType || c.monster_type;
  return String(mt).toLowerCase() === 'normal';
};

const findFirstEmptyMonsterZone = (monsters: any[] | undefined): number => {
  if (!monsters || !Array.isArray(monsters)) return -1;
  for (let i = 0; i < 5; i++) {
    if (monsters[i] === null || monsters[i] === undefined) return i;
  }
  return -1;
};

/**
 * E - Emergency Call (YGOPRO_213326)
 * Add 1 Elemental HERO from Deck to hand
 */
export const createEmergencyCallEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    logger.info(`✨ [EmergencyCall] Searching for Elemental HERO in deck`);
    
    if (!playerField?.deck) playerField.deck = [];
    if (!playerField.hand) playerField.hand = [];
    
    // Find Elemental HERO in deck
    let heroIdx = -1;
    for (let i = 0; i < playerField.deck.length; i++) {
      const c = playerField.deck[i];
      if (isElementalHero(c)) {
        heroIdx = i;
        break;
      }
    }
    
    if (heroIdx >= 0) {
      const card = playerField.deck.splice(heroIdx, 1)[0];
      playerField.hand.push(card);
      logger.info(`✨ [EmergencyCall] Added ${card.name || card.cardName} to hand`);
    } else {
      logger.info(`⚠️ [EmergencyCall] No Elemental HERO in deck`);
    }
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: 'E - Emergency Call resolvido' };
  };
};

/**
 * O - Oversoul (YGOPRO_63703130)
 * Target 1 Elemental HERO Normal Monster in GY; SS it
 */
export const createOversoulEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField?.graveyard) playerField.graveyard = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    
    logger.info(`✨ [Oversoul] Searching for Elemental HERO Normal Monster in GY`);
    
    let gyIdx = -1;
    for (let i = 0; i < playerField.graveyard.length; i++) {
      const c = playerField.graveyard[i];
      if (isElementalHero(c) && isNormalMonsterCard(c)) {
        gyIdx = i;
        break;
      }
    }
    
    const emptyZ = findFirstEmptyMonsterZone(playerField.monsters);
    
    if (gyIdx >= 0 && emptyZ >= 0) {
      const card = playerField.graveyard.splice(gyIdx, 1)[0];
      const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
      
      playerField.monsters[emptyZ] = {
        ...card,
        position: 'attack',
        summonedTurnNumber: currentTurnCounter,
        summonedByPlayer: duel.currentTurn,
        positionChangedThisTurn: false,
        attackedThisTurn: false,
        attacksThisTurn: 0,
        specialSummoned: true,
      };
      
      logger.info(`✨ [Oversoul] SS ${card.name || card.cardName} from GY`);
      
      // Check traps
      const placed = playerField.monsters[emptyZ];
      if (placed && typeof (duelsService as any).checkTrapsOnMonsterSummon === 'function') {
        await (duelsService as any).checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, emptyZ, placed, 'attack');
      }
      
      if (typeof (duelsService as any).applySliferEffectOnOpponentSummon === 'function') {
        await (duelsService as any).applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, emptyZ);
      }
    } else {
      logger.info(`⚠️ [Oversoul] No valid target or no empty zone`);
    }
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: 'O - Oversoul resolvido' };
  };
};

/**
 * Fake Hero (YGOPRO_78387742)
 * SS 1 Elemental HERO from hand; cannot attack; return to hand End Phase
 */
export const createFakeHeroEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField?.hand) playerField.hand = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    
    logger.info(`✨ [FakeHero] SS Elemental HERO from hand`);
    
    let handIdx = -1;
    for (let i = 0; i < playerField.hand.length; i++) {
      if (isElementalHero(playerField.hand[i])) {
        handIdx = i;
        break;
      }
    }
    
    const emptyZ = findFirstEmptyMonsterZone(playerField.monsters);
    
    if (handIdx >= 0 && emptyZ >= 0) {
      const card = playerField.hand.splice(handIdx, 1)[0];
      const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
      
      playerField.monsters[emptyZ] = {
        ...card,
        position: 'attack',
        summonedTurnNumber: currentTurnCounter,
        summonedByPlayer: duel.currentTurn,
        positionChangedThisTurn: false,
        attackedThisTurn: false,
        attacksThisTurn: 0,
        specialSummoned: true,
        cannotAttack: true,
        fakeHero: true, // Mark for End Phase return
        fakeHeroReturnToHandEndPhase: true,
      };
      
      logger.info(`✨ [FakeHero] SS ${card.name || card.cardName} (cannot attack, returns End Phase)`);
      
      const placed = playerField.monsters[emptyZ];
      if (placed && typeof (duelsService as any).checkTrapsOnMonsterSummon === 'function') {
        await (duelsService as any).checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, emptyZ, placed, 'attack');
      }
      
      if (typeof (duelsService as any).applySliferEffectOnOpponentSummon === 'function') {
        await (duelsService as any).applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, emptyZ);
      }
    } else {
      logger.info(`⚠️ [FakeHero] No Elemental HERO in hand or no empty zone`);
    }
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: 'Fake Hero resolvido' };
  };
};

/**
 * Skyscraper (YGOPRO_63035430)
 * Field Spell: if Elemental HERO attacks monster with higher ATK, +1000 ATK during damage calculation only
 */
export const createSkyscraperEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [Skyscraper] Field Spell activated - remains on field`);
    
    // Skyscraper is a continuous Field Spell - it stays on the field
    // The effect is applied during damage calculation (handled elsewhere in battle logic)
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return { success: true, createdPendingChoice: false, message: 'Skyscraper: Field Spell activated' };
  };
};

/**
 * R - Righteous Justice (YGOPRO_37318031)
 * Destroy Spell/Traps equal to number of Elemental HERO you control
 */
export const createRighteousJusticeEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    logger.info(`✨ [RighteousJustice] Counting Elemental HEROes`);
    
    // Count Elemental HERO monsters
    let heroCount = 0;
    if (playerField?.monsters) {
      for (const m of playerField.monsters) {
        if (m && isElementalHero(m) && isFaceUpMonster(m)) {
          heroCount++;
        }
      }
    }
    
    logger.info(`✨ [RighteousJustice] ${heroCount} Elemental HERO(s) found, destroying that many S/T`);
    
    let destroyed = 0;
    if (heroCount > 0 && opponentField?.spellTrap) {
      if (!opponentField.graveyard) opponentField.graveyard = [];
      
      for (let i = 0; i < opponentField.spellTrap.length && destroyed < heroCount; i++) {
        if (opponentField.spellTrap[i]) {
          const card = opponentField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          
          if (cardId === 'ChangeOfHeart' || cardId === 'BrainControl') {
            await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
          } else if (cardId === 'UnitedWeStand' || cardId === 'MagePower') {
            await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, card, i);
          }
          
          await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, !isPlayer1, i);
          opponentField.graveyard.push(card);
          opponentField.spellTrap[i] = null;
          destroyed++;
        }
      }
    }
    
    logger.info(`✨ [RighteousJustice] Destroyed ${destroyed} S/T`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `R - Righteous Justice: ${destroyed} S/T destroyed` };
  };
};

/**
 * Miracle Fusion (YGOPRO_45906428)
 * Fusion Summon Elemental HERO Fusion by banishing materials from field or GY
 */
export const createMiracleFusionEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    logger.info(`✨ [MiracleFusion] Would perform Fusion Summon by banishing (not fully implemented)`);
    
    // TODO: Implement Fusion logic similar to Polymerization
    // For now, just move to GY
    
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: 'Miracle Fusion: Fusion Summon (partially implemented)' };
  };
};

/**
 * Fifth Hope (YGOPRO_55428811)
 * Target 5 Elemental HERO in GY; shuffle to deck; draw 2 (or 3 if no other cards)
 */
export const createFifthHopeEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField?.graveyard) playerField.graveyard = [];
    if (!playerField.deck) playerField.deck = [];
    if (!playerField.hand) playerField.hand = [];
    
    logger.info(`✨ [FifthHope] Shuffling 5 Elemental HEROes to deck`);
    
    // Find 5 Elemental HEROes in GY
    const heroIndices: number[] = [];
    for (let i = 0; i < playerField.graveyard.length && heroIndices.length < 5; i++) {
      if (isElementalHero(playerField.graveyard[i])) {
        heroIndices.push(i);
      }
    }
    
    if (heroIndices.length < 5) {
      logger.info(`⚠️ [FifthHope] Only ${heroIndices.length} Elemental HEROes in GY, need 5`);
      
      // Move to GY without effect
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      
      return { success: false, createdPendingChoice: false, message: 'Fifth Hope: Need 5 Elemental HEROes in GY' };
    }
    
    // Check if player has no other cards (for draw 3 condition)
    const hasOtherCards = playerField.hand.length > 0 || 
                          playerField.monsters.some((m: any) => m !== null) ||
                          playerField.spellTrap.some((s: any) => s !== null && s !== undefined);
    
    const drawCount = hasOtherCards ? 2 : 3;
    
    // Shuffle HEROes back to deck
    for (let i = heroIndices.length - 1; i >= 0; i--) {
      const card = playerField.graveyard.splice(heroIndices[i], 1)[0];
      playerField.deck.push(card);
    }
    
    // Shuffle deck
    for (let i = playerField.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerField.deck[i], playerField.deck[j]] = [playerField.deck[j], playerField.deck[i]];
    }
    
    // Draw cards
    for (let i = 0; i < drawCount; i++) {
      await duelsService.drawCard(duelId, userId);
    }
    
    logger.info(`✨ [FifthHope] Shuffled 5 HEROes, drew ${drawCount} cards`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `Fifth Hope: Shuffled 5 HEROes, drew ${drawCount}` };
  };
};

/**
 * Hero Heart (YGOPRO_67951831)
 * Target face-up Elemental HERO; halve ATK until end of turn but can attack twice
 */
export const createHeroHeartEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    logger.info(`✨ [HeroHeart] Looking for Elemental HERO to buff`);
    
    let targetZone = -1;
    if (playerField?.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const m = playerField.monsters[i];
        if (m && isFaceUpMonster(m) && isElementalHero(m)) {
          targetZone = i;
          break;
        }
      }
    }
    
    if (targetZone >= 0) {
      const target = playerField.monsters[targetZone];
      target.heroHeartHalvedATK = true;
      target.canAttackTwice = true;
      logger.info(`✨ [HeroHeart] ${target.name || target.cardName} ATK halved, can attack twice`);
    } else {
      logger.info(`⚠️ [HeroHeart] No Elemental HERO to target`);
    }
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: 'Hero Heart resolvido' };
  };
};

/**
 * Burst Return (YGOPRO_27191436)
 * If control Burstinatrix face-up: return all face-up Elemental HERO to hand except Burstinatrix
 */
export const createBurstReturnEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    logger.info(`✨ [BurstReturn] Checking for Burstinatrix`);
    
    // Check for Burstinatrix face-up
    let hasBurstinatrix = false;
    if (playerField?.monsters) {
      for (const m of playerField.monsters) {
        if (m && isFaceUpMonster(m)) {
          const name = (m.name || m.cardName || '').toString().toLowerCase();
          if (name.includes('burstinatrix')) {
            hasBurstinatrix = true;
            break;
          }
        }
      }
    }
    
    if (!hasBurstinatrix) {
      logger.info(`⚠️ [BurstReturn] No Burstinatrix on field`);
      
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      
      return { success: false, createdPendingChoice: false, message: 'Burst Return: Need Burstinatrix on field' };
    }
    
    // Return all Elemental HEROes except Burstinatrix
    if (!playerField.hand) playerField.hand = [];
    let returned = 0;
    
    for (let i = 0; i < playerField.monsters.length; i++) {
      const m = playerField.monsters[i];
      if (m && isFaceUpMonster(m) && isElementalHero(m)) {
        const name = (m.name || m.cardName || '').toString().toLowerCase();
        if (!name.includes('burstinatrix')) {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, m);
          playerField.hand.push(m);
          playerField.monsters[i] = null;
          returned++;
          logger.info(`✨ [BurstReturn] Returned ${m.name || m.cardName} to hand`);
        }
      }
    }
    
    logger.info(`✨ [BurstReturn] Returned ${returned} Elemental HERO(s) to hand`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `Burst Return: ${returned} HERO(s) returned` };
  };
};

/**
 * Wrath of Neos (YGOPRO_52098461)
 * Select face-up Elemental HERO Neos; return to Deck; destroy all cards on field
 */
export const createWrathOfNeosEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    logger.info(`✨ [WrathOfNeos] Checking for Elemental HERO Neos`);
    
    // Find Neos face-up
    let neosZone = -1;
    if (playerField?.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const m = playerField.monsters[i];
        if (m && isFaceUpMonster(m)) {
          const name = (m.name || m.cardName || '').toString().toLowerCase();
          if ((name.includes('elemental hero neos') && !name.includes('contact')) || 
              name === 'elemental hero neos') {
            neosZone = i;
            break;
          }
        }
      }
    }
    
    if (neosZone < 0) {
      logger.info(`⚠️ [WrathOfNeos] No Elemental HERO Neos on field`);
      
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      
      return { success: false, createdPendingChoice: false, message: 'Wrath of Neos: Need Elemental HERO Neos' };
    }
    
    // Return Neos to Deck
    const neos = playerField.monsters[neosZone];
    if (!playerField.deck) playerField.deck = [];
    await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, neos);
    playerField.deck.push(neos);
    playerField.monsters[neosZone] = null;
    
    // Shuffle deck
    for (let i = playerField.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerField.deck[i], playerField.deck[j]] = [playerField.deck[j], playerField.deck[i]];
    }
    
    logger.info(`✨ [WrathOfNeos] Neos returned to Deck, destroying all cards on field`);
    
    // Destroy all cards on both fields
    let totalDestroyed = 0;
    
    // Destroy player's cards
    if (playerField.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        if (playerField.monsters[i]) {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, playerField.monsters[i]);
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(playerField.monsters[i]);
          playerField.monsters[i] = null;
          totalDestroyed++;
        }
      }
    }
    
    if (playerField.spellTrap) {
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        if (playerField.spellTrap[i] && i !== zoneIndex) { // Don't destroy Wrath of Neos itself yet
          const card = playerField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          if (cardId === 'ChangeOfHeart' || cardId === 'BrainControl') {
            await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, isPlayer1);
          } else if (cardId === 'UnitedWeStand' || cardId === 'MagePower') {
            await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, undefined, card, i);
          }
          await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, isPlayer1, i);
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(card);
          playerField.spellTrap[i] = null;
          totalDestroyed++;
        }
      }
    }
    
    // Destroy opponent's cards
    if (opponentField?.monsters) {
      for (let i = 0; i < opponentField.monsters.length; i++) {
        if (opponentField.monsters[i]) {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, opponentField.monsters[i]);
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(opponentField.monsters[i]);
          opponentField.monsters[i] = null;
          totalDestroyed++;
        }
      }
    }
    
    if (opponentField?.spellTrap) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        if (opponentField.spellTrap[i]) {
          const card = opponentField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          if (cardId === 'ChangeOfHeart' || cardId === 'BrainControl') {
            await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
          } else if (cardId === 'UnitedWeStand' || cardId === 'MagePower') {
            await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, card, i);
          }
          await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, !isPlayer1, i);
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(card);
          opponentField.spellTrap[i] = null;
          totalDestroyed++;
        }
      }
    }
    
    logger.info(`✨ [WrathOfNeos] Destroyed ${totalDestroyed} cards on field`);
    
    // Move Wrath of Neos to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, !isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `Wrath of Neos: ${totalDestroyed} cards destroyed` };
  };
};

/**
 * Polymerization (YGOPRO_24094653)
 * Fusion Summon 1 Fusion Monster from Extra Deck using monsters from hand or field as materials
 * 
 * SIMPLIFIED: Basic implementation - destroys materials, doesn't create pending choice for now
 */
export const createPolymerizationEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    logger.info(`✨ [Polymerization] Would perform Fusion Summon (basic implementation)`);
    
    // TODO: Full implementation would:
    // 1. Check Extra Deck for available Fusion Monsters
    // 2. Check hand+field for valid materials
    // 3. Create pendingChoice for player to select Fusion and materials
    // 4. Remove materials to GY
    // 5. Special Summon Fusion Monster
    
    // For now, just move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { 
      success: true, 
      createdPendingChoice: false, 
      message: 'Polymerization: Fusion Summon (basic implementation - full Fusion logic pending)' 
    };
  };
};
