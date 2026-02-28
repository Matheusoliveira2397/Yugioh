import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel, TurnPhase } from '../entities/duel.entity';
import { DuelsService } from '../duels.service';
import { DuelUtilsService } from './duel-utils.service';
import { logger } from '../../../common/utils/logger.util';
import { CardEffectRegistryService } from './card-effects/registry/card-effect-registry.service';
import { CardEffectContext } from './card-effects/interfaces/card-effect.interface';
import { DuelActionType } from '../entities/duel-log.entity';

/**
 * Serviço responsável por processar efeitos de cartas
 * Separa a lógica de efeitos do DuelsService principal
 * 
 * NOVO: Usa sistema de registro de efeitos para isolamento e manutenibilidade
 */
@Injectable()
export class CardEffectsService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
    private cardEffectRegistry: CardEffectRegistryService,
  ) {}

  /**
   * Processa o efeito de uma carta quando ela é ativada
   * 
   * NOVO: Tenta usar o sistema de registro primeiro, depois fallback para código antigo
   */
  async processCardEffect(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
    selectedMonsterZoneIndex?: number,
  ): Promise<boolean> {
    // NOVO: Tentar usar sistema de registro de efeitos
    const effect = this.cardEffectRegistry.findEffect(card);
    if (effect) {
      logger.info(`✨ [CardEffectsService] Usando novo sistema de efeitos para: ${card?.name || card?.cardName || 'Desconhecida'}`);
      
      const context: CardEffectContext = {
        duelId,
        duel,
        isPlayer1,
        card,
        zoneIndex,
        selectedMonsterZoneIndex,
        userId: isPlayer1 ? duel.player1Id : duel.player2Id,
      };

      // Verificar se pode ativar
      if (effect.canActivate && !effect.canActivate(context)) {
        logger.warn(`⚠️ [CardEffectsService] Efeito não pode ser ativado: ${card?.name || card?.cardName}`);
        return false;
      }

      // Processar efeito
      try {
        const result = await effect.process(context);
        logger.info(`✅ [CardEffectsService] Efeito processado: ${result.message || 'Sucesso'}`);
        return result.createdPendingChoice || false;
      } catch (error) {
        logger.error(`❌ [CardEffectsService] Erro ao processar efeito:`, error);
        // Fallback para código antigo em caso de erro
        logger.warn(`⚠️ [CardEffectsService] Fallback para código antigo devido a erro`);
      }
    }

    // Fallback: Usar código antigo (durante migração gradual)
    logger.info(`ℹ️ [CardEffectsService] Usando código antigo (fallback) para: ${card?.name || card?.cardName || 'Desconhecida'}`);
    return this.duelsService.processCardEffect(
      duelId,
      duel,
      isPlayer1,
      card,
      zoneIndex,
      selectedMonsterZoneIndex,
    );
  }

  /**
   * Processa efeitos de flip quando um monstro é virado
   */
  async processFlipEffect(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
  ): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    try {
      // SnowmanEater - Escolher 1 monstro face-up no campo e destruí-lo
      if (this.duelUtils.isExactCard(card, 'SnowmanEater')) {
        await this.processSnowmanEaterFlip(duelIdStr, duel, isPlayer1, card, zoneIndex);
        return;
      }
      
      // Fiber Jar - Todas as cartas voltam para os decks e cada jogador compra 5 cartas
      if (this.duelUtils.isExactCard(card, 'FiberJar')) {
        await this.processFiberJarFlip(duelIdStr, duel, isPlayer1, card, zoneIndex);
        return;
      }
      
      // Morphing Jar - Todos os duelistas descartam todas as cartas da mão e depois compram 5 cartas
      if (this.duelUtils.isExactCard(card, 'MorphingJar')) {
        await this.processMorphingJarFlip(duelIdStr, duel, isPlayer1, card, zoneIndex);
        return;
      }
      
      // Dekoichi the Battlechanted Locomotive - Quando flipa (deixa de ser Face Down), o controlador compra 1 carta
      // Inclui: virar por mudança de posição (set->attack/defense), por ataque, por Swords of Revealing Light, ou por FLIP_MONSTER
      const cardNameOrId = (card?.name || card?.cardName || card?.idCarta || card?.id || card?.cardId || '').toString().toLowerCase();
      const isDekoichi = this.duelUtils.isExactCard(card, 'DekoichiTheBattlechantedLocomotive') || cardNameOrId.includes('dekoichi');
      if (isDekoichi) {
        await this.processDekoichiFlip(duelIdStr, duel, isPlayer1, card, zoneIndex);
        return;
      }
    } catch (error) {
      logger.error(`❌ [CardEffectsService] Erro ao processar efeito de flip:`, error);
    }
  }

  /**
   * Processa o efeito de flip do Dekoichi the Battlechanted Locomotive
   * Igual ao Morphing Jar: manipula deck/mão diretamente, salva no banco e atualiza cache.
   * Sempre que a carta deixa de ser Face Down (flipa para face-up), o controlador compra 1 carta.
   */
  private async processDekoichiFlip(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
  ): Promise<void> {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do Dekoichi the Battlechanted Locomotive - controlador compra 1 carta`);
    
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    const controllerField = isPlayer1 ? player1Field : player2Field;
    const controllerUserId = isPlayer1 ? (duel as any).player1Id : (duel as any).player2Id;
    
    if (!controllerField || !controllerField.deck || controllerField.deck.length === 0) {
      logger.info(`ℹ️ [CardEffectsService] Dekoichi: controlador não tem cartas no deck para comprar`);
      return;
    }
    
    const drawnCard = controllerField.deck.shift();
    if (!drawnCard) return;
    
    (this.duelsService as any).ensureCardInstanceId(drawnCard);
    controllerField.hand = controllerField.hand || [];
    controllerField.hand.push(drawnCard);
    
    const cardName = drawnCard.name || drawnCard.cardName || 'Carta';
    await this.duelsService.saveDuelLog(duelId, controllerUserId, DuelActionType.DRAW_CARD, `Comprou ${cardName} (Dekoichi)`);
    logger.info(`✅ [CardEffectsService] Dekoichi: controlador comprou 1 carta: ${cardName}`);
    
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);
    
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }
  }

  /**
   * Processa o efeito de flip do Snowman Eater
   */
  private async processSnowmanEaterFlip(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
  ): Promise<void> {
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
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);
    
    // Atualizar cache através do método público
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }
  }

  /**
   * Processa o efeito de flip do Fiber Jar
   */
  private async processFiberJarFlip(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
  ): Promise<void> {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do Fiber Jar`);
    
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    
    // Função auxiliar para verificar se uma carta é de Fusion
    const isFusionMonster = (card: any): boolean => {
      if (!card) return false;
      
      // Verificar tipo da carta
      const cardType = (card.type || card.cardType || '').toString().toLowerCase().trim();
      const isMonster = cardType === 'monster' || cardType === 'monstro' || cardType.includes('monster');
      
      if (!isMonster) return false;
      
      // Verificar se é Fusion usando múltiplos campos e comparações case-insensitive
      const monsterType = (card.monsterType || card.monster_type || '').toString().toLowerCase().trim();
      const cardName = (card.name || card.cardName || '').toLowerCase();
      const cardId = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
      
      // Verificar por monsterType (campo principal) - verificar exatamente "fusion" ou contém "fusion"
      if (monsterType === 'fusion' || monsterType.includes('fusion')) {
        logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por monsterType: ${card.name || card.cardName || cardId} (monsterType: ${card.monsterType || card.monster_type})`);
        return true;
      }
      
      // Verificar se monsterType está em maiúsculas (Fusion)
      const monsterTypeUpper = (card.monsterType || card.monster_type || '').toString();
      if (monsterTypeUpper === 'Fusion' || monsterTypeUpper === 'FUSION') {
        logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por monsterType (maiúsculas): ${card.name || card.cardName || cardId}`);
        return true;
      }
      
      // Verificar por cardId se contém "fusion"
      if (cardId.includes('fusion')) {
        logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por cardId: ${card.name || card.cardName || cardId}`);
        return true;
      }
      
      // Verificar se a carta veio do Extra Deck (se tiver flag specialSummoned ou se estiver marcada como do Extra Deck)
      // Monstros do Extra Deck que são invocados por invocação especial geralmente são Fusion, Synchro, XYZ, etc.
      // Mas só considerar Fusion se não for Synchro, XYZ, Link, etc.
      if (card.specialSummoned === true || card.summonedFromExtraDeck === true) {
        // Se não é Synchro, XYZ, Link, Pendulum, então provavelmente é Fusion
        const isSynchro = monsterType === 'synchro' || monsterType.includes('synchro') || monsterTypeUpper === 'Synchro';
        const isXyz = monsterType === 'xyz' || monsterType.includes('xyz') || monsterTypeUpper === 'Xyz' || monsterTypeUpper === 'XYZ';
        const isLink = monsterType === 'link' || monsterType.includes('link') || monsterTypeUpper === 'Link';
        const isPendulum = monsterType === 'pendulum' || monsterType.includes('pendulum') || monsterTypeUpper === 'Pendulum';
        
        if (!isSynchro && !isXyz && !isLink && !isPendulum) {
          logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por specialSummoned (não é Synchro/XYZ/Link/Pendulum): ${card.name || card.cardName || cardId}`);
          return true;
        }
      }
      
      // Verificar se está no Extra Deck atual (cartas que estão no Extra Deck devem voltar para o Extra Deck)
      // Mas isso só funciona se a carta ainda estiver no Extra Deck, não se estiver no campo/cemitério
      const isInExtraDeck1 = player1Field.extraDeck?.some((c: any) => {
        if (!c) return false;
        const cId = c.idCarta || c.id || c.cardId;
        const cardIdToCheck = card.idCarta || card.id || card.cardId;
        return String(cId) === String(cardIdToCheck) || c.instanceId === card.instanceId;
      });
      const isInExtraDeck2 = player2Field.extraDeck?.some((c: any) => {
        if (!c) return false;
        const cId = c.idCarta || c.id || c.cardId;
        const cardIdToCheck = card.idCarta || card.id || card.cardId;
        return String(cId) === String(cardIdToCheck) || c.instanceId === card.instanceId;
      });
      
      if (isInExtraDeck1 || isInExtraDeck2) {
        // Se está no Extra Deck, verificar se não é Synchro, XYZ, Link, Pendulum
        const isSynchro = monsterType === 'synchro' || monsterType.includes('synchro') || monsterTypeUpper === 'Synchro';
        const isXyz = monsterType === 'xyz' || monsterType.includes('xyz') || monsterTypeUpper === 'Xyz' || monsterTypeUpper === 'XYZ';
        const isLink = monsterType === 'link' || monsterType.includes('link') || monsterTypeUpper === 'Link';
        const isPendulum = monsterType === 'pendulum' || monsterType.includes('pendulum') || monsterTypeUpper === 'Pendulum';
        
        if (!isSynchro && !isXyz && !isLink && !isPendulum) {
          logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por estar no Extra Deck (não é Synchro/XYZ/Link/Pendulum): ${card.name || card.cardName || cardId}`);
          return true;
        }
      }
      
      // Log para debug se não foi identificado como Fusion
      if (cardName && !cardName.includes('token') && !cardName.includes('ficha')) {
        logger.info(`🔍 [Fiber Jar] Carta não identificada como Fusion: ${card.name || card.cardName} (type: ${card.type || card.cardType}, monsterType: ${card.monsterType || card.monster_type}, cardId: ${cardId}, specialSummoned: ${card.specialSummoned})`);
      }
      
      return false;
    };
    
    // Coletar todas as cartas de ambos os jogadores
    const allPlayer1Cards: any[] = [];
    const allPlayer2Cards: any[] = [];
    
    // Separar cartas de Fusion para voltarem ao Extra Deck
    const player1FusionCards: any[] = [];
    const player2FusionCards: any[] = [];
    
    // PRIMEIRO: Incluir o deck atual (se existir) - separar Fusion das outras
    if (player1Field.deck && Array.isArray(player1Field.deck)) {
      for (const card of player1Field.deck) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no deck do Player 1: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player1FusionCards.push(card);
          } else {
            allPlayer1Cards.push(card);
          }
        }
      }
    }
    
    if (player2Field.deck && Array.isArray(player2Field.deck)) {
      for (const card of player2Field.deck) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no deck do Player 2: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player2FusionCards.push(card);
          } else {
            allPlayer2Cards.push(card);
          }
        }
      }
    }
    
    // Cartas do campo (monstros) - separar Fusion das outras
    if (player1Field.monsters) {
      for (let i = 0; i < player1Field.monsters.length; i++) {
        if (player1Field.monsters[i] !== null && player1Field.monsters[i] !== undefined) {
          const card = player1Field.monsters[i];
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no campo do Player 1: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player1FusionCards.push(card);
          } else {
            allPlayer1Cards.push(card);
          }
          player1Field.monsters[i] = null;
        }
      }
    }
    
    if (player2Field.monsters) {
      for (let i = 0; i < player2Field.monsters.length; i++) {
        if (player2Field.monsters[i] !== null && player2Field.monsters[i] !== undefined) {
          const card = player2Field.monsters[i];
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no campo do Player 2: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player2FusionCards.push(card);
          } else {
            allPlayer2Cards.push(card);
          }
          player2Field.monsters[i] = null;
        }
      }
    }
    
    // Cartas spell/trap
    if (player1Field.spellTrap) {
      for (let i = 0; i < player1Field.spellTrap.length; i++) {
        if (player1Field.spellTrap[i] !== null && player1Field.spellTrap[i] !== undefined) {
          allPlayer1Cards.push(player1Field.spellTrap[i]);
          player1Field.spellTrap[i] = null;
        }
      }
    }
    
    if (player2Field.spellTrap) {
      for (let i = 0; i < player2Field.spellTrap.length; i++) {
        if (player2Field.spellTrap[i] !== null && player2Field.spellTrap[i] !== undefined) {
          allPlayer2Cards.push(player2Field.spellTrap[i]);
          player2Field.spellTrap[i] = null;
        }
      }
    }
    
    // Cartas da mão
    if (player1Field.hand && Array.isArray(player1Field.hand)) {
      allPlayer1Cards.push(...player1Field.hand);
      player1Field.hand = [];
    }
    
    if (player2Field.hand && Array.isArray(player2Field.hand)) {
      allPlayer2Cards.push(...player2Field.hand);
      player2Field.hand = [];
    }
    
    // Cartas do cemitério - separar Fusion das outras
    if (player1Field.graveyard && Array.isArray(player1Field.graveyard)) {
      for (const card of player1Field.graveyard) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no cemitério do Player 1: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player1FusionCards.push(card);
          } else {
            allPlayer1Cards.push(card);
          }
        }
      }
      player1Field.graveyard = [];
    }
    
    if (player2Field.graveyard && Array.isArray(player2Field.graveyard)) {
      for (const card of player2Field.graveyard) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no cemitério do Player 2: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player2FusionCards.push(card);
          } else {
            allPlayer2Cards.push(card);
          }
        }
      }
      player2Field.graveyard = [];
    }
    
    // Cartas do Extra Deck atual - manter no Extra Deck (não incluir no deck principal)
    // Mas incluir as cartas de Fusion que estavam no campo/cemitério
    if (!player1Field.extraDeck) {
      player1Field.extraDeck = [];
    }
    if (!player2Field.extraDeck) {
      player2Field.extraDeck = [];
    }
    
    // Adicionar cartas de Fusion do campo/cemitério ao Extra Deck
    player1Field.extraDeck.push(...player1FusionCards);
    player2Field.extraDeck.push(...player2FusionCards);
    
    logger.info(`📦 [CardEffectsService] Fiber Jar: ${player1FusionCards.length} cartas de Fusion do Player 1 voltaram para o Extra Deck`);
    logger.info(`📦 [CardEffectsService] Fiber Jar: ${player2FusionCards.length} cartas de Fusion do Player 2 voltaram para o Extra Deck`);
    
    // Embaralhar as cartas
    const shuffleArray = (array: any[]) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
    
    // Embaralhar e definir como novo deck
    const shuffledPlayer1Deck = shuffleArray(allPlayer1Cards);
    const shuffledPlayer2Deck = shuffleArray(allPlayer2Cards);
    
    player1Field.deck = shuffledPlayer1Deck;
    player2Field.deck = shuffledPlayer2Deck;
    
    // IMPORTANTE: Embaralhar também o Extra Deck após adicionar as cartas Fusion
    if (player1Field.extraDeck && player1Field.extraDeck.length > 0) {
      player1Field.extraDeck = shuffleArray(player1Field.extraDeck);
      logger.info(`🔀 [CardEffectsService] Fiber Jar: Extra Deck do Player 1 embaralhado (${player1Field.extraDeck.length} cartas)`);
    }
    if (player2Field.extraDeck && player2Field.extraDeck.length > 0) {
      player2Field.extraDeck = shuffleArray(player2Field.extraDeck);
      logger.info(`🔀 [CardEffectsService] Fiber Jar: Extra Deck do Player 2 embaralhado (${player2Field.extraDeck.length} cartas)`);
    }
    
    logger.info(`✅ [CardEffectsService] Fiber Jar: ${allPlayer1Cards.length} cartas do Player 1 e ${allPlayer2Cards.length} cartas do Player 2 voltaram para os decks`);
    
    // ATUALIZAR NO BANCO ANTES DE COMPRAR CARTAS
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);
    
    // Atualizar cache através do método público
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }
    
    // AGORA cada jogador compra 5 cartas (usando o deck atualizado)
    for (let i = 0; i < 5; i++) {
      // Buscar duelo atualizado do cache/banco antes de cada compra
      const activeDuels = (this.duelsService as any).activeDuels;
      let currentDuel = activeDuels ? activeDuels.get(duelId) : null;
      if (!currentDuel) {
        currentDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (currentDuel && activeDuels) {
          activeDuels.set(duelId, currentDuel);
        }
      }
      
      if (currentDuel) {
        const p1Field = (currentDuel as any).player1Field;
        const p2Field = (currentDuel as any).player2Field;
        
        // Comprar carta do Player 1
        if (p1Field && p1Field.deck && p1Field.deck.length > 0) {
          const card1 = p1Field.deck.shift();
          if (card1) {
            if (!p1Field.hand) p1Field.hand = [];
            p1Field.hand.push(card1);
          }
        }
        
        // Comprar carta do Player 2
        if (p2Field && p2Field.deck && p2Field.deck.length > 0) {
          const card2 = p2Field.deck.shift();
          if (card2) {
            if (!p2Field.hand) p2Field.hand = [];
            p2Field.hand.push(card2);
          }
        }
        
        // Atualizar no banco após cada compra
        await this.duelsService.updateDuelInDatabase(duelId, {
          player1Field: p1Field,
          player2Field: p2Field,
        } as any);
        
        // Atualizar cache
        this.duelsService['activeDuels'].set(duelId, currentDuel);
      }
    }
    
    logger.info(`✅ [CardEffectsService] Fiber Jar: Cada jogador comprou 5 cartas`);
    
    // Buscar duelo final atualizado
    const finalDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
    if (finalDuel) {
      Object.assign(duel, finalDuel);
      this.duelsService['activeDuels'].set(duelId, duel);
    }
  }

  /**
   * Processa o efeito de flip do Morphing Jar
   */
  private async processMorphingJarFlip(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
  ): Promise<void> {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do Morphing Jar`);
    
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    
    // PASSO 1: Descarta todas as cartas da mão de ambos os jogadores para o cemitério
    const player1HandDiscarded = player1Field.hand && Array.isArray(player1Field.hand) ? player1Field.hand.length : 0;
    const player2HandDiscarded = player2Field.hand && Array.isArray(player2Field.hand) ? player2Field.hand.length : 0;
    
    // Mover cartas da mão para o cemitério
    if (player1Field.hand && Array.isArray(player1Field.hand)) {
      if (!player1Field.graveyard) player1Field.graveyard = [];
      player1Field.graveyard.push(...player1Field.hand);
      player1Field.hand = [];
    }
    
    if (player2Field.hand && Array.isArray(player2Field.hand)) {
      if (!player2Field.graveyard) player2Field.graveyard = [];
      player2Field.graveyard.push(...player2Field.hand);
      player2Field.hand = [];
    }
    
    logger.info(`✅ [CardEffectsService] Morphing Jar: ${player1HandDiscarded} cartas do Player 1 e ${player2HandDiscarded} cartas do Player 2 foram descartadas para o cemitério`);
    
    // Atualizar no banco antes de comprar cartas
    await this.duelsService.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);
    
    // Atualizar cache através do método público
    const activeDuels = (this.duelsService as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }
    
    // PASSO 2: Cada jogador compra 5 cartas do deck
    for (let i = 0; i < 5; i++) {
      // Buscar duelo atualizado do cache/banco antes de cada compra
      const activeDuels = (this.duelsService as any).activeDuels;
      let currentDuel = activeDuels ? activeDuels.get(duelId) : null;
      if (!currentDuel) {
        currentDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
        if (currentDuel && activeDuels) {
          activeDuels.set(duelId, currentDuel);
        }
      }
      
      if (currentDuel) {
        const p1Field = (currentDuel as any).player1Field;
        const p2Field = (currentDuel as any).player2Field;
        
        // Comprar carta do Player 1
        if (p1Field && p1Field.deck && p1Field.deck.length > 0) {
          const card1 = p1Field.deck.shift();
          if (card1) {
            if (!p1Field.hand) p1Field.hand = [];
            p1Field.hand.push(card1);
          }
        }
        
        // Comprar carta do Player 2
        if (p2Field && p2Field.deck && p2Field.deck.length > 0) {
          const card2 = p2Field.deck.shift();
          if (card2) {
            if (!p2Field.hand) p2Field.hand = [];
            p2Field.hand.push(card2);
          }
        }
        
        // Atualizar no banco após cada compra
        await this.duelsService.updateDuelInDatabase(duelId, {
          player1Field: p1Field,
          player2Field: p2Field,
        } as any);
        
        // Atualizar cache
        this.duelsService['activeDuels'].set(duelId, currentDuel);
      }
    }
    
    logger.info(`✅ [CardEffectsService] Morphing Jar: Cada jogador comprou 5 cartas`);
    
    // Buscar duelo final atualizado
    const finalDuel = await this.duelsService.findDuelByIdFromDatabase(duelId);
    if (finalDuel) {
      Object.assign(duel, finalDuel);
      this.duelsService['activeDuels'].set(duelId, duel);
    }
  }
}

