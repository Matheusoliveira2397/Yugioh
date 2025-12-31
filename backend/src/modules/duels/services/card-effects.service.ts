import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Duel, TurnPhase } from '../entities/duel.entity';
import { DuelsService } from '../duels.service';
import { DuelUtilsService } from './duel-utils.service';
import { logger } from '../../../common/utils/logger.util';

/**
 * Serviço responsável por processar efeitos de cartas
 * Separa a lógica de efeitos do DuelsService principal
 */
@Injectable()
export class CardEffectsService {
  constructor(
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Processa o efeito de uma carta quando ela é ativada
   */
  async processCardEffect(
    duelId: string,
    duel: Duel,
    isPlayer1: boolean,
    card: any,
    zoneIndex: number,
    selectedMonsterZoneIndex?: number,
  ): Promise<boolean> {
    // Por enquanto, delegar para o DuelsService
    // TODO: Migrar gradualmente os efeitos de cartas para cá
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
    } catch (error) {
      logger.error(`❌ [CardEffectsService] Erro ao processar efeito de flip:`, error);
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
    
    // Coletar todas as cartas de ambos os jogadores
    const allPlayer1Cards: any[] = [];
    const allPlayer2Cards: any[] = [];
    
    // PRIMEIRO: Incluir o deck atual (se existir)
    if (player1Field.deck && Array.isArray(player1Field.deck)) {
      allPlayer1Cards.push(...player1Field.deck);
    }
    
    if (player2Field.deck && Array.isArray(player2Field.deck)) {
      allPlayer2Cards.push(...player2Field.deck);
    }
    
    // Cartas do campo (monstros)
    if (player1Field.monsters) {
      for (let i = 0; i < player1Field.monsters.length; i++) {
        if (player1Field.monsters[i] !== null && player1Field.monsters[i] !== undefined) {
          allPlayer1Cards.push(player1Field.monsters[i]);
          player1Field.monsters[i] = null;
        }
      }
    }
    
    if (player2Field.monsters) {
      for (let i = 0; i < player2Field.monsters.length; i++) {
        if (player2Field.monsters[i] !== null && player2Field.monsters[i] !== undefined) {
          allPlayer2Cards.push(player2Field.monsters[i]);
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
    
    // Cartas do cemitério
    if (player1Field.graveyard && Array.isArray(player1Field.graveyard)) {
      allPlayer1Cards.push(...player1Field.graveyard);
      player1Field.graveyard = [];
    }
    
    if (player2Field.graveyard && Array.isArray(player2Field.graveyard)) {
      allPlayer2Cards.push(...player2Field.graveyard);
      player2Field.graveyard = [];
    }
    
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

