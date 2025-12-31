import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel } from '../entities/duel.entity';
import { DuelsService } from '../duels.service';
import { DuelUtilsService } from './duel-utils.service';
import { logger } from '../../../common/utils/logger.util';

/**
 * Serviço responsável por processar escolhas de cartas que requerem input do jogador
 * Separa handlers de escolhas do DuelsService principal
 */
@Injectable()
export class CardEffectHandlersService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Embaralha um deck de cartas
   */
  private shuffleDeck(deck: any[]): any[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Adicionar instanceId único para cada carta após embaralhar
    shuffled.forEach(card => this.ensureCardInstanceId(card));
    return shuffled;
  }

  /**
   * Garante que uma carta tem instanceId único
   */
  private ensureCardInstanceId(card: any): any {
    if (card && !card.instanceId) {
      card.instanceId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return card;
  }

  /**
   * Processa a escolha de carta do The Forceful Sentry
   */
  async processForcefulSentryChoice(
    duelId: string | number,
    userId: number,
    instanceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    // Se instanceId é null ou vazio, significa que não há cartas na mão do oponente
    if (!instanceId || instanceId.trim() === '') {
      logger.info(`ℹ️ [CardEffectHandlersService] Oponente não tem cartas na mão - apenas movendo The Forceful Sentry para o cemitério`);
    } else {
      if (!opponentField || !opponentField.hand || !Array.isArray(opponentField.hand)) {
        return { success: false, message: 'Mão do oponente não encontrada' };
      }
      
      // Buscar carta por instanceId (prioritário) para distinguir múltiplas cópias da mesma carta
      const cardIndex = opponentField.hand.findIndex((card: any) => {
        if (!card) return false;
        // Priorizar instanceId para garantir que cartas com mesmo nome sejam tratadas como diferentes
        if (card.instanceId && card.instanceId === instanceId) {
          return true;
        }
        return false;
      });
      
      if (cardIndex === -1) {
        return { success: false, message: 'Carta não encontrada na mão do oponente' };
      }
      
      // Remover a carta escolhida da mão
      const chosenCard = opponentField.hand.splice(cardIndex, 1)[0];
      
      // Adicionar ao deck do oponente
      if (!opponentField.deck) {
        opponentField.deck = [];
      }
      opponentField.deck.push(chosenCard);
      
      // Embaralhar o deck após adicionar a carta
      opponentField.deck = this.shuffleDeck(opponentField.deck);
      
      logger.info(`✅ [CardEffectHandlersService] Carta "${chosenCard.name || chosenCard.cardName || 'Desconhecida'}" retornou ao deck do oponente e o deck foi embaralhado`);
    }
    
    // Encontrar e mover The Forceful Sentry para o cemitério
    if (playerField && playerField.spellTrap) {
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        if (playerField.spellTrap[i] !== null && playerField.spellTrap[i] !== undefined) {
          const card = playerField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          if (cardId === 'TheForcefulSentry') {
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(card);
            playerField.spellTrap[i] = null;
            
            logger.info(`✅ [CardEffectHandlersService] The Forceful Sentry movida para o cemitério`);
            break;
          }
        }
      }
    }
    
    // Atualizar no banco
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelIdStr, duel);
    }
    
    return { success: true };
  }

  /**
   * Processa a escolha de carta do Confiscation
   */
  async processConfiscationChoice(
    duelId: string | number,
    userId: number,
    instanceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    // Se instanceId é null ou vazio, significa que não há cartas na mão do oponente
    if (!instanceId || instanceId.trim() === '') {
      logger.info(`ℹ️ [CardEffectHandlersService] Oponente não tem cartas na mão - apenas movendo Confiscation para o cemitério`);
    } else {
      if (!opponentField || !opponentField.hand || !Array.isArray(opponentField.hand)) {
        return { success: false, message: 'Mão do oponente não encontrada' };
      }
      
      // Buscar carta por instanceId (prioritário) para distinguir múltiplas cópias da mesma carta
      const cardIndex = opponentField.hand.findIndex((card: any) => {
        if (!card) return false;
        // Priorizar instanceId para garantir que cartas com mesmo nome sejam tratadas como diferentes
        if (card.instanceId && card.instanceId === instanceId) {
          return true;
        }
        return false;
      });
      
      if (cardIndex === -1) {
        return { success: false, message: 'Carta não encontrada na mão do oponente' };
      }
      
      // Remover a carta escolhida da mão
      const chosenCard = opponentField.hand.splice(cardIndex, 1)[0];
      
      // Adicionar ao cemitério do oponente
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(chosenCard);
      
      logger.info(`✅ [CardEffectHandlersService] Carta "${chosenCard.name || chosenCard.cardName || 'Desconhecida'}" foi enviada ao cemitério do oponente`);
    }
    
    // Encontrar e mover Confiscation para o cemitério
    if (playerField && playerField.spellTrap) {
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        if (playerField.spellTrap[i] !== null && playerField.spellTrap[i] !== undefined) {
          const card = playerField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          // Usar nome da carta para identificar efeito (compartilhado entre skins)
          const cardIdLower = String(cardId || '').toLowerCase();
          const cardName = (card.name || card.cardName || '').toLowerCase();
          if (cardIdLower.includes('confiscation') || cardName.includes('confiscation')) {
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(card);
            playerField.spellTrap[i] = null;
            
            logger.info(`✅ [CardEffectHandlersService] Confiscation movida para o cemitério`);
            break;
          }
        }
      }
    }
    
    // Atualizar no banco
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelIdStr, duel);
    }
    
    return { success: true };
  }

  /**
   * Processa a escolha de cartas do GracefulCharity
   */
  async processGracefulCharityChoice(
    duelId: string | number,
    userId: number,
    instanceIdsToDiscard: string[],
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.hand || !Array.isArray(playerField.hand)) {
      return { success: false, message: 'Mão do jogador não encontrada' };
    }
    
    // Validar que tem exatamente 2 cartas para descartar
    if (instanceIdsToDiscard.length !== 2) {
      return { success: false, message: 'Você deve descartar exatamente 2 cartas' };
    }
    
    // Encontrar as cartas na mão por instanceId (prioritário) para distinguir múltiplas cópias da mesma carta
    const cardsToDiscard: any[] = [];
    for (const instanceIdToDiscard of instanceIdsToDiscard) {
      const card = playerField.hand.find((c: any) => {
        if (!c) return false;
        // Priorizar instanceId para garantir que cartas com mesmo nome sejam tratadas como diferentes
        return c.instanceId && c.instanceId === instanceIdToDiscard;
      });
      
      if (!card) {
        return { success: false, message: `Carta com instanceId ${instanceIdToDiscard} não encontrada na mão` };
      }
      
      cardsToDiscard.push(card);
    }
    
    // Remover as cartas da mão usando instanceId
    for (const cardToDiscard of cardsToDiscard) {
      const cardIndex = playerField.hand.findIndex((card: any) => {
        if (!card || !cardToDiscard) return false;
        // Usar instanceId para garantir que cartas com mesmo nome sejam tratadas como diferentes
        return card.instanceId && cardToDiscard.instanceId && card.instanceId === cardToDiscard.instanceId;
      });
      
      if (cardIndex !== -1) {
        playerField.hand.splice(cardIndex, 1);
      }
    }
    
    // Adicionar ao cemitério
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(...cardsToDiscard);
    
    logger.info(`✅ [CardEffectHandlersService] ${cardsToDiscard.length} cartas foram descartadas da mão do jogador`);
    
    // Atualizar no banco
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelIdStr, duel);
    }
    
    return { success: true };
  }

  /**
   * Processa a escolha do MonsterReborn - reviver um monstro do cemitério
   */
  async processMonsterRebornChoice(
    duelId: string | number,
    userId: number,
    chosenMonster: { graveyard: 'player' | 'opponent'; index: number },
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Determinar qual cemitério usar
    const graveyard = chosenMonster.graveyard === 'player' ? playerField?.graveyard : opponentField?.graveyard;
    
    if (!graveyard || !Array.isArray(graveyard)) {
      return { success: false, message: 'Cemitério não encontrado' };
    }
    
    if (chosenMonster.index < 0 || chosenMonster.index >= graveyard.length) {
      return { success: false, message: 'Índice de monstro inválido' };
    }
    
    // Encontrar o monstro no cemitério
    const monstersInGraveyard = graveyard.filter((c: any) => {
      const cardType = c.type || c.cardType;
      return cardType === 'Monster';
    });
    
    if (chosenMonster.index >= monstersInGraveyard.length) {
      return { success: false, message: 'Monstro não encontrado no cemitério' };
    }
    
    const monsterToRevive = monstersInGraveyard[chosenMonster.index];
    
    // Encontrar o índice real no cemitério
    let realIndex = -1;
    let monsterCount = 0;
    for (let i = 0; i < graveyard.length; i++) {
      const card = graveyard[i];
      const cardType = card.type || card.cardType;
      if (cardType === 'Monster') {
        if (monsterCount === chosenMonster.index) {
          realIndex = i;
          break;
        }
        monsterCount++;
      }
    }
    
    if (realIndex === -1) {
      return { success: false, message: 'Monstro não encontrado no cemitério' };
    }
    
    // Verificar se há espaço no campo do jogador
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no campo para reviver o monstro' };
    }
    
    // Remover o monstro do cemitério
    graveyard.splice(realIndex, 1);
    
    // Obter contador global de turnos
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    
    // Reviver o monstro no campo do jogador em posição de ataque
    playerField.monsters[emptyZoneIndex] = {
      ...monsterToRevive,
      position: 'attack',
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    
    logger.info(`✅ [CardEffectHandlersService] Monstro ${monsterToRevive.name || monsterToRevive.cardName} revivido no campo do jogador ${isPlayer1 ? 1 : 2}`);
    
    // Limpar pendingChoice
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelIdStr, duel);
    }
    
    return { success: true };
  }

  /**
   * Processa a escolha do Last Will - invoca por invocação especial um monstro do deck e embaralha
   */
  async processLastWillChoice(
    duelId: string | number,
    userId: number,
    deckIndex: number,
    zoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.deck || !Array.isArray(playerField.deck)) {
      return { success: false, message: 'Deck do jogador não encontrado' };
    }
    
    // Verificar se o índice é válido
    if (deckIndex < 0 || deckIndex >= playerField.deck.length) {
      return { success: false, message: 'Índice do deck inválido' };
    }
    
    // Garantir que monsters seja um array válido
    if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    while (playerField.monsters.length < 5) {
      playerField.monsters.push(null);
    }
    playerField.monsters = playerField.monsters.slice(0, 5);
    
    // Encontrar o primeiro slot vazio automaticamente
    let targetZoneIndex = zoneIndex;
    if (zoneIndex < 0 || zoneIndex >= 5 || playerField.monsters[zoneIndex] !== null) {
      // Se a zona fornecida é inválida ou ocupada, encontrar o primeiro slot vazio
      targetZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
      if (targetZoneIndex === -1) {
        return { success: false, message: 'Não há slots disponíveis para invocar o monstro' };
      }
      logger.info(`✅ [CardEffectHandlersService] Last Will: Zona ${zoneIndex} inválida ou ocupada, usando primeiro slot vazio: ${targetZoneIndex}`);
    }
    
    const selectedCard = playerField.deck[deckIndex];
    if (!selectedCard) {
      return { success: false, message: 'Carta não encontrada no deck' };
    }
    
    // Verificar se é um monstro com ATK <= 1500
    const cardType = (selectedCard.type || selectedCard.cardType || '').toString().toUpperCase().trim();
    const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
    if (!isMonster) {
      return { success: false, message: 'A carta selecionada não é um monstro' };
    }
    
    const atk = Number(selectedCard.atk || selectedCard.cardAtk || 0);
    if (isNaN(atk) || atk > 1500) {
      return { success: false, message: 'A carta selecionada não tem ATK <= 1500' };
    }
    
    // Remover a carta do deck
    const cardToSummon = playerField.deck.splice(deckIndex, 1)[0];
    
    // Obter contador global de turnos
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    
    // Invocar por invocação especial em modo de ataque no primeiro slot disponível
    playerField.monsters[targetZoneIndex] = {
      ...cardToSummon,
      position: 'attack',
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    
    logger.info(`✅ [CardEffectHandlersService] Last Will: Monstro "${cardToSummon.name || cardToSummon.cardName}" invocado por invocação especial do deck do jogador ${isPlayer1 ? 1 : 2} na zona ${targetZoneIndex}`);
    
    // Embaralhar o deck após remover a carta
    playerField.deck = this.shuffleDeck(playerField.deck);
    logger.info(`✅ [CardEffectHandlersService] Last Will: Deck embaralhado após remover a carta`);
    
    // Atualizar no banco
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelIdStr, duel);
    }
    
    return { success: true };
  }

  /**
   * Processa a escolha do Autonomous Action Unit
   */
  async processAutonomousActionUnitChoice(
    duelId: string | number,
    userId: number,
    chosenMonsterIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processAutonomousActionUnitChoice(duelId, userId, chosenMonsterIndex);
  }

  /**
   * Processa a escolha do Cyber-Stein
   */
  async processCyberSteinEffectChoice(
    duelId: string | number,
    userId: number,
    monsterZoneIndex: number,
    extraDeckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processCyberSteinEffectChoice(duelId, userId, monsterZoneIndex, extraDeckIndex);
  }

  /**
   * Processa a escolha do ChangeOfHeart
   */
  async processChangeOfHeartChoice(
    duelId: string | number,
    userId: number,
    chosenMonsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processChangeOfHeartChoice(duelId, userId, chosenMonsterZoneIndex);
  }

  /**
   * Processa a escolha do SoulTaker
   */
  async processSoulTakerChoice(
    duelId: string | number,
    userId: number,
    chosenMonsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processSoulTakerChoice(duelId, userId, chosenMonsterZoneIndex);
  }

  /**
   * Processa a escolha do BrainControl
   */
  async processBrainControlChoice(
    duelId: string | number,
    userId: number,
    chosenMonsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processBrainControlChoice(duelId, userId, chosenMonsterZoneIndex);
  }

  /**
   * Processa a escolha do UnitedWeStand
   */
  async processUnitedWeStandChoice(
    duelId: string | number,
    userId: number,
    chosenMonsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processUnitedWeStandChoice(duelId, userId, chosenMonsterZoneIndex);
  }

  /**
   * Processa a escolha do MagePower
   */
  async processMagePowerChoice(
    duelId: string | number,
    userId: number,
    chosenMonsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processMagePowerChoice(duelId, userId, chosenMonsterZoneIndex);
  }

  /**
   * Processa a escolha do MysticalSpaceTyphoon
   */
  async processMysticalSpaceTyphoonChoice(
    duelId: string | number,
    userId: number,
    targetPlayer: 'player' | 'opponent',
    targetZoneIndex: number,
    spellTrapZoneIndex?: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processMysticalSpaceTyphoonChoice(duelId, userId, targetPlayer, targetZoneIndex, spellTrapZoneIndex);
  }

  /**
   * Processa a escolha do SnowmanEater
   */
  async processSnowmanEaterChoice(
    duelId: string | number,
    userId: number,
    targetPlayer: 'player' | 'opponent',
    targetZoneIndex: number,
    monsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.duelsService.processSnowmanEaterChoice(duelId, userId, targetPlayer, targetZoneIndex, monsterZoneIndex);
  }

  /**
   * Processa a escolha do Reinforcement Of The Army - adicionar monstro Warrior de Level 4 ou menos do deck à mão
   */
  async processReinforcementOfTheArmyChoice(
    duelId: string | number,
    userId: number,
    deckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.deck || !Array.isArray(playerField.deck)) {
      return { success: false, message: 'Deck do jogador não encontrado' };
    }
    
    // Verificar se o índice é válido
    if (deckIndex < 0 || deckIndex >= playerField.deck.length) {
      return { success: false, message: 'Índice do deck inválido' };
    }
    
    const selectedCard = playerField.deck[deckIndex];
    if (!selectedCard) {
      return { success: false, message: 'Carta não encontrada no deck' };
    }
    
    // Verificar se é um monstro Warrior de Level 4 ou menos
    const cardType = (selectedCard.type || selectedCard.cardType || '').toString().toUpperCase().trim();
    const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
    if (!isMonster) {
      return { success: false, message: 'A carta selecionada não é um monstro' };
    }
    
    const race = (selectedCard.race || selectedCard.cardRace || '').toString().toUpperCase().trim();
    const isWarrior = race === 'WARRIOR' || race === 'GUERREIRO' || race.includes('WARRIOR');
    if (!isWarrior) {
      return { success: false, message: 'A carta selecionada não é do tipo Warrior' };
    }
    
    const level = Number(selectedCard.level || selectedCard.cardLevel || 0);
    if (isNaN(level) || level < 1 || level > 4) {
      return { success: false, message: 'A carta selecionada não é de Level 4 ou menos' };
    }
    
    // Remover a carta do deck
    const cardToAdd = playerField.deck.splice(deckIndex, 1)[0];
    
    // Adicionar à mão
    if (!playerField.hand) {
      playerField.hand = [];
    }
    playerField.hand.push(cardToAdd);
    
    logger.info(`✅ [CardEffectHandlersService] Reinforcement Of The Army: Monstro "${cardToAdd.name || cardToAdd.cardName}" adicionado à mão do jogador ${isPlayer1 ? 1 : 2}`);
    
    // Embaralhar o deck após remover a carta
    const shuffledDeck = this.shuffleDeck(playerField.deck);
    playerField.deck = shuffledDeck;
    logger.info(`✅ [CardEffectHandlersService] Reinforcement Of The Army: Deck embaralhado após remover a carta`);
    
    // Atualizar no banco
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelIdStr, duel);
    }
    
    return { success: true };
  }
}

