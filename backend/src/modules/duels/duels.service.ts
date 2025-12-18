import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Duel, DuelStatus, DuelResult, TurnPhase, DuelOrigin } from './entities/duel.entity';
import { DuelLog } from './entities/duel-log.entity';
import { User } from '../users/entities/user.entity';
import { DecksService } from '../decks/decks.service';

@Injectable()
export class DuelsService {
  private activeDuels: Map<string, Duel> = new Map()
  private creatingDuels: Map<string, Promise<Duel | null>> = new Map();

  constructor(
    @InjectRepository(Duel)
    private duelsRepository: Repository<Duel>,
    @InjectRepository(DuelLog)
    private duelLogsRepository: Repository<DuelLog>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private decksService: DecksService,
  ) {}

  async getActiveDuelForUser(duelId: string | number, userId: number): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return null;
    
    if (duel.player1Id === userId || duel.player2Id === userId) {
        return duel;
      }

        return null;
      }

  findDuelByIdLight(duelId: string | number): Duel | null {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    return this.activeDuels.get(duelIdStr) || null;
  }

  async findDuelByIdFromDatabase(duelId: string | number): Promise<Duel | null> {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    console.log(`🔍 [findDuelByIdFromDatabase] ==========================================`);
    console.log(`🔍 [findDuelByIdFromDatabase] Buscando duelo: ${duelIdStr} (tipo: ${typeof duelIdStr})`);
    console.log(`🔍 [findDuelByIdFromDatabase] Tamanho: ${duelIdStr.length} caracteres`);
    
    // Verificar em memória primeiro
    const inMemory = this.findDuelByIdLight(duelIdStr);
    if (inMemory) {
      console.log(`✅ [findDuelByIdFromDatabase] Duelo encontrado em memória!`);
      return inMemory;
    }
    
    console.log(`🔍 [findDuelByIdFromDatabase] Duelo não encontrado em memória, buscando no banco...`);
    
    // Se não encontrou em memória, buscar no banco
    try {
      console.log(`🔍 [findDuelByIdFromDatabase] Executando query no banco...`);
      const duel = await this.duelsRepository.findOne({
        where: { id: duelIdStr },
        relations: ['player1', 'player2']
      });
      
      if (duel) {
        console.log(`✅ [findDuelByIdFromDatabase] Duelo encontrado no banco! ID: ${duel.id}`);
        console.log(`✅ [findDuelByIdFromDatabase] Player1Id: ${duel.player1Id}, Player2Id: ${duel.player2Id}`);
        
        // Log detalhado dos campos
        console.log(`📦 [findDuelByIdFromDatabase] player1Field do banco:`, {
          exists: !!duel.player1Field,
          isObject: typeof duel.player1Field === 'object',
          keys: duel.player1Field ? Object.keys(duel.player1Field) : null,
          deckLength: duel.player1Field?.deck?.length || 0,
          handLength: duel.player1Field?.hand?.length || 0,
          monstersLength: duel.player1Field?.monsters?.length || 0,
        });
        console.log(`📦 [findDuelByIdFromDatabase] player2Field do banco:`, {
          exists: !!duel.player2Field,
          isObject: typeof duel.player2Field === 'object',
          keys: duel.player2Field ? Object.keys(duel.player2Field) : null,
          deckLength: duel.player2Field?.deck?.length || 0,
          handLength: duel.player2Field?.hand?.length || 0,
          monstersLength: duel.player2Field?.monsters?.length || 0,
        });
        
        // Adicionar ao cache em memória
        (duel as any).player1Field = duel.player1Field || this.createEmptyField();
        (duel as any).player2Field = duel.player2Field || this.createEmptyField();
        
        // Se não há turn_started_at mas o duelo está em progresso, inicializar
        if (!(duel as any).turnStartedAt && duel.status === DuelStatus.IN_PROGRESS) {
          (duel as any).turnStartedAt = new Date();
          // Salvar no banco também
          setImmediate(async () => {
            await this.updateDuelInDatabase(duelIdStr, { turnStartedAt: new Date() } as any);
          });
        }
        
        this.activeDuels.set(duelIdStr, duel);
        this.activeDuelsCountCache = this.activeDuels.size;
        this.lastCountUpdate = Date.now();
        
        console.log(`✅ [findDuelByIdFromDatabase] Duelo adicionado ao cache em memória`);
        console.log(`📦 [findDuelByIdFromDatabase] Após adicionar ao cache - player1Field:`, {
          deckLength: (duel as any).player1Field?.deck?.length || 0,
          handLength: (duel as any).player1Field?.hand?.length || 0,
        });
        console.log(`📦 [findDuelByIdFromDatabase] Após adicionar ao cache - player2Field:`, {
          deckLength: (duel as any).player2Field?.deck?.length || 0,
          handLength: (duel as any).player2Field?.hand?.length || 0,
        });
      } else {
        console.error(`❌ [findDuelByIdFromDatabase] Duelo ${duelIdStr} NÃO encontrado no banco!`);
      }
      
      console.log(`🔍 [findDuelByIdFromDatabase] ==========================================`);
      return duel;
    } catch (error: any) {
      console.error(`❌ [findDuelByIdFromDatabase] ==========================================`);
      console.error(`❌ [findDuelByIdFromDatabase] ERRO ao buscar duelo ${duelIdStr}:`, error);
      console.error(`❌ [findDuelByIdFromDatabase] Tipo:`, error?.constructor?.name);
      console.error(`❌ [findDuelByIdFromDatabase] Mensagem:`, error?.message);
      console.error(`❌ [findDuelByIdFromDatabase] Código:`, error?.code);
      console.error(`❌ [findDuelByIdFromDatabase] Stack:`, error?.stack);
      console.error(`❌ [findDuelByIdFromDatabase] ==========================================`);
      return null;
    }
  }

  private deepCleanField(field: any): any {
    if (!field) {
      console.warn(`⚠️ [deepCleanField] Campo vazio recebido`);
      return {
        deck: [],
        hand: [],
        monsters: [],
        spellTrap: [],
        graveyard: [],
      };
    }
    
    try {
    const clean = { ...field };
    
    if (clean.deck && Array.isArray(clean.deck)) {
        console.log(`🧹 [deepCleanField] Limpando deck com ${clean.deck.length} cartas...`);
        clean.deck = clean.deck.map((card: any, index: number) => {
          const compacted = this.compactCard(card);
          if (!compacted && index < 3) {
            console.warn(`⚠️ [deepCleanField] Carta ${index} do deck retornou null após compactCard:`, card);
          }
          return compacted;
        }).filter((c: any) => c !== null);
        console.log(`🧹 [deepCleanField] Deck limpo: ${clean.deck.length} cartas restantes`);
      } else {
        clean.deck = clean.deck || [];
    }
    
    if (clean.hand && Array.isArray(clean.hand)) {
        console.log(`🧹 [deepCleanField] Limpando hand com ${clean.hand.length} cartas...`);
        clean.hand = clean.hand.map((card: any, index: number) => {
          const compacted = this.compactCard(card);
          if (!compacted && index < 3) {
            console.warn(`⚠️ [deepCleanField] Carta ${index} da mão retornou null após compactCard:`, card);
          }
          return compacted;
        }).filter((c: any) => c !== null);
        console.log(`🧹 [deepCleanField] Hand limpa: ${clean.hand.length} cartas restantes`);
      } else {
        clean.hand = clean.hand || [];
    }
    
    if (clean.monsters && Array.isArray(clean.monsters)) {
      clean.monsters = clean.monsters.map((monster: any) => {
        if (!monster) return null;
        return this.compactCard(monster);
      });
      } else {
        clean.monsters = clean.monsters || [];
    }
    
    if (clean.spellTrap && Array.isArray(clean.spellTrap)) {
      clean.spellTrap = clean.spellTrap.map((card: any) => {
        if (!card) return null;
        return this.compactCard(card);
      });
      } else {
        clean.spellTrap = clean.spellTrap || [];
    }
    
    if (clean.graveyard && Array.isArray(clean.graveyard)) {
        clean.graveyard = clean.graveyard.map((card: any) => this.compactCard(card)).filter((c: any) => c !== null);
      } else {
        clean.graveyard = clean.graveyard || [];
    }
    
    return clean;
    } catch (error) {
      console.error(`❌ [deepCleanField] Erro ao limpar campo:`, error);
      return {
        deck: [],
        hand: [],
        monsters: [],
        spellTrap: [],
        graveyard: [],
      };
    }
  }

  async updateDuelInDatabase(duelId: string | number, updates: Partial<Duel>): Promise<void> {
    try {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      
      // Atualizar em memória
      const duel = this.activeDuels.get(duelIdStr);
      if (duel) {
        Object.assign(duel, updates);
      }
      
      const cleanUpdates: any = { ...updates };
      
      if (cleanUpdates.player1Field) {
        cleanUpdates.player1Field = this.deepCleanField(cleanUpdates.player1Field);
      }
      if (cleanUpdates.player2Field) {
        cleanUpdates.player2Field = this.deepCleanField(cleanUpdates.player2Field);
      }
      cleanUpdates.updatedAt = new Date();
      
      await this.duelsRepository.update(duelIdStr, cleanUpdates);
    } catch (error) {
      console.error(`❌ [updateDuelInDatabase] Erro ao atualizar duelo ${duelId}:`, error);
    }
    try {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      const cleanUpdates: any = { ...updates };
      
      // Limpar campos se estiverem presentes
      if (cleanUpdates.player1Field) {
        cleanUpdates.player1Field = this.deepCleanField(cleanUpdates.player1Field);
      }
      if (cleanUpdates.player2Field) {
        cleanUpdates.player2Field = this.deepCleanField(cleanUpdates.player2Field);
      }
      
      // Remover relações se estiverem presentes
      delete cleanUpdates.player1;
      delete cleanUpdates.player2;
      
      // Código de salvamento removido - apenas atualizar em memória
    } catch (error) {
      console.error(`❌ [updateDuelInDatabase] Erro ao atualizar duelo ${duelId}:`, error);
    }
  }

  // Removido: removeBase64FromField - não é mais necessário

  async drawCard(duelId: string | number, userId: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;

    const isPlayer1 = duel.player1Id === userId;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.deck || playerField.deck.length === 0) {
      return;
    }

    const drawnCard = playerField.deck.shift();
    if (drawnCard) {
      playerField.hand = playerField.hand || [];
      playerField.hand.push(drawnCard);
      
      // Atualizar no banco de dados
      setImmediate(async () => {
        await this.updateDuelInDatabase(duelId, {
          player1Field: isPlayer1 ? (duel as any).player1Field : undefined,
          player2Field: !isPlayer1 ? (duel as any).player2Field : undefined,
        } as any);
      });
    }
  }

  async placeCardOnField(duelId: string | number, userId: number, cardId: string, zoneIndex: number, position: 'attack' | 'defense' | 'face-up' | 'set', cardType?: string): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;

    const isPlayer1 = duel.player1Id === userId;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.hand) return;

    const cardIndex = playerField.hand.findIndex((c: any) => c.idCarta === cardId || c.id === cardId || c.cardId === cardId);
    if (cardIndex === -1) return;

    const card = playerField.hand.splice(cardIndex, 1)[0];
    
    if (cardType === 'Monster' || (card.type === 'Monster' || card.cardType === 'Monster')) {
    if (!playerField.monsters) playerField.monsters = [];
    playerField.monsters[zoneIndex] = { ...card, position };
    } else {
      if (!playerField.spellTrap) playerField.spellTrap = [];
      playerField.spellTrap[zoneIndex] = { ...card, position };
    }
    
    setImmediate(async () => {
      await this.updateDuelInDatabase(duelId, {
        player1Field: isPlayer1 ? (duel as any).player1Field : undefined,
        player2Field: !isPlayer1 ? (duel as any).player2Field : undefined,
      } as any);
    });
  }

  async updateLifePoints(duelId: string | number, player: 1 | 2, newLifePoints: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;

    if (player === 1) {
      duel.player1LifePoints = newLifePoints;
        } else {
      duel.player2LifePoints = newLifePoints;
    }
    
    // Código de salvamento removido - apenas atualizar em memória
  }

  async nextPhase(duelId: string | number): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return null;

    const phases = [TurnPhase.DRAW, TurnPhase.STANDBY, TurnPhase.MAIN1, TurnPhase.BATTLE, TurnPhase.MAIN2, TurnPhase.END];
    const currentIndex = phases.indexOf(duel.currentPhase);
    const turnChanged = currentIndex >= phases.length - 1;
    
    if (currentIndex < phases.length - 1) {
      duel.currentPhase = phases[currentIndex + 1];
    } else {
      duel.currentTurn = duel.currentTurn === 1 ? 2 : 1;
      duel.currentPhase = TurnPhase.DRAW;
      (duel as any).turnTime = 90;
      // Quando o turno muda, salvar o timestamp atual
      (duel as any).turnStartedAt = new Date();
    }
    setImmediate(async () => {
      const updates: any = {
        currentPhase: duel.currentPhase,
        currentTurn: duel.currentTurn,
      };
      if (turnChanged) {
        updates.turnTime = 90;
        updates.turnStartedAt = new Date();
      }
      await this.updateDuelInDatabase(duelId, updates);
    });

      return duel;
  }

  /**
   * Calcula o tempo restante do turno baseado no timestamp de quando o turno começou
   * @param duel - O duelo para calcular o tempo
   * @returns Tempo restante em segundos (0 se expirado)
   */
  calculateTurnTimeRemaining(duel: Duel): number {
    const turnTimeLimit = (duel as any).turnTime || 90;
    const turnStartedAt = (duel as any).turnStartedAt;
    
    // Se não há timestamp, assumir que o turno começou agora
    if (!turnStartedAt) {
      return turnTimeLimit;
    }
    
    const now = new Date();
    const startedAt = turnStartedAt instanceof Date ? turnStartedAt : new Date(turnStartedAt);
    const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
    const remaining = Math.max(0, turnTimeLimit - elapsedSeconds);
    
    return remaining;
  }

  async updateDuelTime(duelId: string | number, timeInSeconds: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;

    (duel as any).duelTime = timeInSeconds;
    
    setImmediate(async () => {
      await this.updateDuelInDatabase(duelId, {
        duelTime: timeInSeconds,
      } as any);
    });
  }

  async finishDuel(duelId: string | number, result: DuelResult, winnerId: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;
    
    duel.status = DuelStatus.FINISHED;
    duel.result = result;
    duel.winnerId = winnerId;
    duel.finishedAt = new Date();
    
    await this.updateDuelInDatabase(duelId, {
      status: DuelStatus.FINISHED,
      result: result,
      winnerId: winnerId,
      finishedAt: new Date(),
    } as any);
    
    setTimeout(() => {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      this.activeDuels.delete(duelIdStr);
      // Invalidar cache
      this.activeDuelsCountCache = this.activeDuels.size;
      this.lastCountUpdate = Date.now();
    }, 60000);
  }

  async getDuelLogs(duelId: string | number): Promise<DuelLog[]> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      const logs = await this.duelLogsRepository.find({
        where: { duelId: duelIdStr },
        order: { createdAt: 'ASC' },
        take: 100,
      });
      return logs;
    } catch (error) {
      console.error(`❌ [getDuelLogs] Erro ao buscar logs do duelo ${duelIdStr}:`, error);
      return [];
    }
  }

  async getUserDuels(userId: number, limit: number = 50): Promise<Duel[]> {
    try {
      const duels = await this.duelsRepository.find({
        where: [
          { player1Id: userId },
          { player2Id: userId }
        ],
        order: { createdAt: 'DESC' },
        take: limit,
      });
      return duels;
    } catch (error) {
      return [];
    }
  }

  async getActiveDuels(userId: number): Promise<Duel[]> {
    // Processar de forma assíncrona para não bloquear
    const active: Duel[] = [];
    let processed = 0;
    
    for (const duel of this.activeDuels.values()) {
      if ((duel.player1Id === userId || duel.player2Id === userId) && duel.status === DuelStatus.IN_PROGRESS) {
        active.push(duel);
      }
      
      // Yield a cada 10 duelos para não bloquear
      processed++;
      if (processed % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    return active;
  }

  async getFinishedDuels(userId: number): Promise<Duel[]> {
    try {
      const duels = await this.duelsRepository.find({
        where: [
          { player1Id: userId, status: DuelStatus.FINISHED },
          { player2Id: userId, status: DuelStatus.FINISHED }
        ],
        order: { finishedAt: 'DESC' },
        take: 50,
      });
      return duels;
    } catch (error) {
      return [];
    }
  }

  async deleteInactiveDuel(duelId: string | number, userId: number): Promise<{ success: boolean; message: string }> {
    try {
      // Garantir que duelId seja string (UUID)
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      const duel = await this.duelsRepository.findOne({
        where: { id: duelIdStr },
      });

      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }

      if (duel.player1Id !== userId && duel.player2Id !== userId) {
        return { success: false, message: 'Você não tem permissão para deletar este duelo' };
      }

      if (duel.status === DuelStatus.IN_PROGRESS) {
        return { success: false, message: 'Não é possível deletar um duelo em andamento' };
      }

      await this.duelsRepository.delete(duelIdStr);
      return { success: true, message: 'Duelo deletado com sucesso' };
    } catch (error) {
      return { success: false, message: 'Erro ao deletar duelo' };
    }
  }

  async deleteMultipleInactiveDuels(userId: number, duelIds: (string | number)[]): Promise<{ success: boolean; message: string; deleted: number }> {
    try {
      let deleted = 0;
      for (const duelId of duelIds) {
        const result = await this.deleteInactiveDuel(duelId, userId);
        if (result.success) {
          deleted++;
        }
      }
      return { success: true, message: `${deleted} duelo(s) deletado(s)`, deleted };
    } catch (error) {
      return { success: false, message: 'Erro ao deletar duelos', deleted: 0 };
    }
  }

  private activeDuelsCountCache: number = 0;
  private lastCountUpdate: number = 0;
  private readonly COUNT_CACHE_MS = 1000; // Cache por 1 segundo

  getActiveDuelsCount(): number {
    // CRÍTICO: Cache o resultado para evitar leituras excessivas do Map
    // Isso reduz carga quando há muitas verificações simultâneas
    const now = Date.now();
    if (now - this.lastCountUpdate > this.COUNT_CACHE_MS) {
      this.activeDuelsCountCache = this.activeDuels.size;
      this.lastCountUpdate = now;
    }
    return this.activeDuelsCountCache;
  }

  async createDuel(player1Id: number, player2Id: number, origin: DuelOrigin = DuelOrigin.OTHER): Promise<Duel | null> {
    console.log(`🎮 [createDuel] ==========================================`);
    console.log(`🎮 [createDuel] Chamado para P1=${player1Id}, P2=${player2Id}, Origin=${origin}`);
    const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
    console.log(`🎮 [createDuel] DuelKey: ${duelKey}`);
    
    const existingCreation = this.creatingDuels.get(duelKey);
    if (existingCreation) {
      console.log(`🎮 [createDuel] Já existe criação em andamento para este par, aguardando...`);
      return await existingCreation;
    }
    
    console.log(`🎮 [createDuel] Criando nova promise de criação...`);
    const creationPromise = (async (): Promise<Duel | null> => {
      try {
        console.log(`🎮 [createDuel] Promise iniciada, chamando createDuelInternal...`);
      const duel = await Promise.race([
          this.createDuelInternal(player1Id, player2Id, origin),
        new Promise<null>((_, reject) => 
            setTimeout(() => {
              console.error(`⏱️ [createDuel] TIMEOUT ao criar duelo após 30 segundos!`);
              reject(new Error('Timeout ao criar duelo'));
            }, 30000)
          )
        ]).catch((error) => {
          console.error(`❌ [createDuel] Erro:`, error);
          return null;
        });
        
        if (duel && duel.id) {
          console.log(`✅ [createDuel] ==========================================`);
          console.log(`✅ [createDuel] Duelo criado com sucesso!`);
          console.log(`✅ [createDuel] ID: ${duel.id} (tipo: ${typeof duel.id})`);
          console.log(`✅ [createDuel] Player1Id: ${duel.player1Id}, Player2Id: ${duel.player2Id}`);
          console.log(`✅ [createDuel] Status: ${duel.status}, Origin: ${duel.origin}`);
          console.log(`✅ [createDuel] ==========================================`);
          } else {
          console.error(`❌ [createDuel] ==========================================`);
          console.error(`❌ [createDuel] Duelo retornou null ou sem ID`);
          console.error(`❌ [createDuel] Duel:`, duel);
          console.error(`❌ [createDuel] ==========================================`);
      }
      
      return duel;
    } catch (error) {
        console.error(`❌ [createDuel] Erro ao criar duelo:`, error);
        return null;
    }
    })();
    
    this.creatingDuels.set(duelKey, creationPromise);
    const result = await creationPromise;
    this.creatingDuels.delete(duelKey);
    return result;
  }
  
  async verifyDuelInDatabase(duelId: string | number): Promise<boolean> {
    try {
      // Garantir que duelId seja string (UUID)
      const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
      
      // Validar formato UUID básico (8-4-4-4-12 caracteres hexadecimais)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(duelIdStr)) {
        console.error(`❌ [verifyDuelInDatabase] ID inválido (não é UUID): ${duelIdStr}`);
        return false;
      }
      
      const duel = await this.duelsRepository.findOne({ 
        where: { id: duelIdStr },
        select: ['id']
      });
      
      return !!duel;
    } catch (error: any) {
      console.error(`❌ [verifyDuelInDatabase] Erro ao verificar duelo ${duelId}:`, error);
      console.error(`❌ [verifyDuelInDatabase] Tipo do erro:`, error?.constructor?.name);
      console.error(`❌ [verifyDuelInDatabase] Mensagem:`, error?.message);
      console.error(`❌ [verifyDuelInDatabase] Código:`, error?.code);
      return false;
    }
  }

  private async createDuelInternal(player1Id: number, player2Id: number, origin: DuelOrigin = DuelOrigin.OTHER): Promise<Duel | null> {
    console.log(`🚀 [createDuelInternal] ==========================================`);
    console.log(`🚀 [createDuelInternal] INICIANDO criação de duelo`);
    console.log(`🚀 [createDuelInternal] Player1Id: ${player1Id}, Player2Id: ${player2Id}, Origin: ${origin}`);
    try {
      const activeDuels = this.getActiveDuelsCount();
      const queryTimeout = activeDuels > 0 ? 2000 : 5000;
      console.log(`🚀 [createDuelInternal] ActiveDuels: ${activeDuels}, QueryTimeout: ${queryTimeout}ms`);
      
      await new Promise(resolve => setImmediate(resolve));
      console.log(`🚀 [createDuelInternal] Buscando players no banco...`);
      
      const [player1, player2] = await Promise.race([
        Promise.all([
            this.usersRepository.findOne({
            where: { id: player1Id },
            select: ['id', 'username', 'nickname', 'clanTag', 'level', 'avatar']
            }),
            this.usersRepository.findOne({
            where: { id: player2Id },
            select: ['id', 'username', 'nickname', 'clanTag', 'level', 'avatar']
          })
        ]),
        new Promise<[null, null]>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), queryTimeout)
        )
      ]).catch(() => [null, null]);

      if (!player1 || !player2) {
        console.error(`❌ [createDuelInternal] Player não encontrado. P1: ${player1 ? 'OK' : 'NULL'}, P2: ${player2 ? 'OK' : 'NULL'}`);
      return null;
      }
      
      console.log(`✅ [createDuelInternal] Players encontrados: P1=${player1.id} (${player1.username}), P2=${player2.id} (${player2.username})`);
      console.log(`🚀 [createDuelInternal] Preparando decks...`);
      
      const player1Deck = await this.preparePlayerDeck(player1Id);
      console.log(`✅ [createDuelInternal] Deck P1 preparado: ${player1Deck.deck.length} cartas no deck, ${player1Deck.hand.length} na mão`);
      if (player1Deck.deck.length === 0 && player1Deck.hand.length === 0) {
        console.warn(`⚠️ [createDuelInternal] ATENÇÃO: Deck P1 está vazio! Isso pode causar problemas.`);
      }
      await new Promise(resolve => setImmediate(resolve));
      const player2Deck = await this.preparePlayerDeck(player2Id);
      console.log(`✅ [createDuelInternal] Deck P2 preparado: ${player2Deck.deck.length} cartas no deck, ${player2Deck.hand.length} na mão`);
      if (player2Deck.deck.length === 0 && player2Deck.hand.length === 0) {
        console.warn(`⚠️ [createDuelInternal] ATENÇÃO: Deck P2 está vazio! Isso pode causar problemas.`);
      }

      const player1Field = {
        ...this.createEmptyField(),
        deck: player1Deck.deck,
        hand: player1Deck.hand,
      };

      const player2Field = {
        ...this.createEmptyField(),
        deck: player2Deck.deck,
        hand: player2Deck.hand,
      };

      const duelData = new Duel();
      delete (duelData as any).id;
      
      duelData.player1Id = player1.id;
      duelData.player2Id = player2.id;
      duelData.player1Nickname = player1.nickname || player1.username || null;
      duelData.player2Nickname = player2.nickname || player2.username || null;
      duelData.status = DuelStatus.IN_PROGRESS;
      duelData.player1LifePoints = 8000;
      duelData.player2LifePoints = 8000;
      duelData.currentTurn = Math.random() > 0.5 ? 1 : 2;
      duelData.currentPhase = TurnPhase.DRAW;
      duelData.result = null as any;
      duelData.winnerId = null;
      duelData.finishedAt = null as any;
      duelData.duelTime = 0;
      duelData.turnTime = 90;
      (duelData as any).turnStartedAt = new Date(); // Inicializar timestamp do turno
      duelData.origin = origin;
      console.log(`🧹 [createDuelInternal] ANTES de limpar - P1Field: ${player1Field?.deck?.length || 0} cartas no deck, ${player1Field?.hand?.length || 0} na mão`);
      console.log(`🧹 [createDuelInternal] ANTES de limpar - P2Field: ${player2Field?.deck?.length || 0} cartas no deck, ${player2Field?.hand?.length || 0} na mão`);
      
      // As cartas já vêm compactadas do preparePlayerDeck, então não precisamos compactar novamente
      // Apenas garantir que os campos existam
      duelData.player1Field = {
        deck: player1Field.deck || [],
        hand: player1Field.hand || [],
        monsters: player1Field.monsters || [],
        spellTrap: player1Field.spellTrap || [],
        graveyard: player1Field.graveyard || [],
      };
      
      duelData.player2Field = {
        deck: player2Field.deck || [],
        hand: player2Field.hand || [],
        monsters: player2Field.monsters || [],
        spellTrap: player2Field.spellTrap || [],
        graveyard: player2Field.graveyard || [],
      };
      
      console.log(`✅ [createDuelInternal] DEPOIS de preparar - P1Field: ${duelData.player1Field?.deck?.length || 0} cartas no deck, ${duelData.player1Field?.hand?.length || 0} na mão`);
      console.log(`✅ [createDuelInternal] DEPOIS de preparar - P2Field: ${duelData.player2Field?.deck?.length || 0} cartas no deck, ${duelData.player2Field?.hand?.length || 0} na mão`);
      
      // Log de exemplo de carta para debug
      if (duelData.player1Field.deck.length > 0) {
        console.log(`📦 [createDuelInternal] Exemplo de carta do deck P1:`, {
          id: duelData.player1Field.deck[0].id,
          idCarta: duelData.player1Field.deck[0].idCarta,
          name: duelData.player1Field.deck[0].name,
        });
      }
      if (duelData.player1Field.hand.length > 0) {
        console.log(`📦 [createDuelInternal] Exemplo de carta da mão P1:`, {
          id: duelData.player1Field.hand[0].id,
          idCarta: duelData.player1Field.hand[0].idCarta,
          name: duelData.player1Field.hand[0].name,
        });
      }

      console.log(`💾 [createDuelInternal] ==========================================`);
      console.log(`💾 [createDuelInternal] Tentando salvar duelo no banco...`);
      console.log(`💾 [createDuelInternal] Dados antes do save:`, JSON.stringify({
        player1Id: duelData.player1Id,
        player2Id: duelData.player2Id,
        player1Nickname: duelData.player1Nickname,
        player2Nickname: duelData.player2Nickname,
        status: duelData.status,
        origin: duelData.origin,
        player1LifePoints: duelData.player1LifePoints,
        player2LifePoints: duelData.player2LifePoints,
        currentTurn: duelData.currentTurn,
        currentPhase: duelData.currentPhase,
        duelTime: duelData.duelTime,
        turnTime: duelData.turnTime,
        hasId: !!(duelData as any).id,
        hasPlayer1Field: !!duelData.player1Field,
        hasPlayer2Field: !!duelData.player2Field,
        player1FieldKeys: duelData.player1Field ? Object.keys(duelData.player1Field) : null,
        player2FieldKeys: duelData.player2Field ? Object.keys(duelData.player2Field) : null,
      }, null, 2));
      
      let savedDuel: Duel;
      try {
        console.log(`💾 [createDuelInternal] Chamando duelsRepository.save()...`);
        console.log(`💾 [createDuelInternal] Tipo de duelData:`, typeof duelData);
        console.log(`💾 [createDuelInternal] duelData é instância de Duel:`, duelData instanceof Duel);
        console.log(`💾 [createDuelInternal] duelData.id antes do save:`, (duelData as any).id);
        console.log(`💾 [createDuelInternal] ANTES DO SAVE - player1Field.deck.length: ${duelData.player1Field?.deck?.length || 0}`);
        console.log(`💾 [createDuelInternal] ANTES DO SAVE - player1Field.hand.length: ${duelData.player1Field?.hand?.length || 0}`);
        console.log(`💾 [createDuelInternal] ANTES DO SAVE - player2Field.deck.length: ${duelData.player2Field?.deck?.length || 0}`);
        console.log(`💾 [createDuelInternal] ANTES DO SAVE - player2Field.hand.length: ${duelData.player2Field?.hand?.length || 0}`);
        
        // Serializar os campos para garantir que são JSON válido
        const player1FieldJson = JSON.parse(JSON.stringify(duelData.player1Field));
        const player2FieldJson = JSON.parse(JSON.stringify(duelData.player2Field));
        
        console.log(`💾 [createDuelInternal] APÓS SERIALIZAÇÃO - player1Field.deck.length: ${player1FieldJson?.deck?.length || 0}`);
        console.log(`💾 [createDuelInternal] APÓS SERIALIZAÇÃO - player2Field.deck.length: ${player2FieldJson?.deck?.length || 0}`);
        
        duelData.player1Field = player1FieldJson;
        duelData.player2Field = player2FieldJson;
        
        savedDuel = await this.duelsRepository.save(duelData);
        console.log(`✅ [createDuelInternal] Duelo salvo! ID: ${savedDuel.id} (tipo: ${typeof savedDuel.id})`);
        console.log(`✅ [createDuelInternal] Duelo completo:`, {
          id: savedDuel.id,
          player1Id: savedDuel.player1Id,
          player2Id: savedDuel.player2Id,
          status: savedDuel.status,
          origin: savedDuel.origin,
        });
        
        console.log(`💾 [createDuelInternal] Verificando se duelo foi salvo no banco...`);
        const verify = await this.duelsRepository.findOne({
          where: { id: savedDuel.id },
        });
        
        if (verify) {
          console.log(`✅ [createDuelInternal] Duelo verificado no banco!`);
          console.log(`📦 [createDuelInternal] player1Field no banco:`, {
            exists: !!verify.player1Field,
            deckLength: verify.player1Field?.deck?.length || 0,
            handLength: verify.player1Field?.hand?.length || 0,
          });
          console.log(`📦 [createDuelInternal] player2Field no banco:`, {
            exists: !!verify.player2Field,
            deckLength: verify.player2Field?.deck?.length || 0,
            handLength: verify.player2Field?.hand?.length || 0,
          });
        } else {
          console.error(`❌ [createDuelInternal] Duelo NÃO encontrado no banco após save!`);
        }
        
        if (!verify) {
          console.error(`❌ [createDuelInternal] Duelo ${savedDuel.id} NÃO encontrado no banco após save!`);
        } else {
          console.log(`✅ [createDuelInternal] Duelo ${savedDuel.id} confirmado no banco!`);
          console.log(`✅ [createDuelInternal] Duelo verificado:`, {
            id: verify.id,
            player1Id: verify.player1Id,
            player2Id: verify.player2Id,
            status: verify.status,
          });
        }
      } catch (saveError: any) {
        console.error(`❌ [createDuelInternal] ==========================================`);
        console.error(`❌ [createDuelInternal] ERRO ao salvar duelo!`);
        console.error(`❌ [createDuelInternal] Código:`, saveError?.code);
        console.error(`❌ [createDuelInternal] Mensagem:`, saveError?.message);
        console.error(`❌ [createDuelInternal] Detalhes:`, saveError?.detail);
        console.error(`❌ [createDuelInternal] Query:`, saveError?.query);
        console.error(`❌ [createDuelInternal] Stack:`, saveError?.stack);
        console.error(`❌ [createDuelInternal] ==========================================`);
        throw saveError;
      }
      
      (savedDuel as any).player1 = player1;
      (savedDuel as any).player2 = player2;
      const cachedDuel = { ...savedDuel } as any;
      cachedDuel.player1Field = player1Field;
      cachedDuel.player2Field = player2Field;
      
      const savedDuelIdStr = typeof savedDuel.id === 'string' ? savedDuel.id : String(savedDuel.id);
      console.log(`💾 [createDuelInternal] Adicionando duelo ao cache em memória. ID: ${savedDuelIdStr}`);
          this.activeDuels.set(savedDuelIdStr, cachedDuel);
        this.activeDuelsCountCache = this.activeDuels.size;
        this.lastCountUpdate = Date.now();
      console.log(`✅ [createDuelInternal] Duelo adicionado ao cache. Total de duelos ativos: ${this.activeDuels.size}`);
      
        const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
        this.creatingDuels.delete(duelKey);
      console.log(`✅ [createDuelInternal] Duelo criado e adicionado ao cache em memória`);
      console.log(`✅ [createDuelInternal] ==========================================`);
        
      return cachedDuel;
      } catch (error) {
      console.error(`❌ [createDuelInternal] Erro ao criar duelo interno (catch externo):`, error);
      console.error(`❌ [createDuelInternal] Tipo:`, error?.constructor?.name);
      console.error(`❌ [createDuelInternal] Mensagem:`, error instanceof Error ? error.message : String(error));
      console.error(`❌ [createDuelInternal] Stack:`, error instanceof Error ? error.stack : 'N/A');
      
      // Remover do Map de criação em andamento em caso de erro
      const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
      this.creatingDuels.delete(duelKey);
      
      return null;
    }
  }

  private async preparePlayerDeck(userId: number): Promise<{deck: any[], hand: any[]}> {
    try {
      // Timeout aumentado para dar mais tempo para buscar o deck
      const activeDuels = this.getActiveDuelsCount();
      const timeout = activeDuels > 0 ? 5000 : 10000; // Timeout aumentado
      
      console.log(`🔍 [preparePlayerDeck] Buscando deck para usuário ${userId} (timeout: ${timeout}ms)...`);
      
      const deck = await Promise.race([
        this.decksService.getCurrentDeck(userId, 'Meu Deck'),
        new Promise<null>((_, reject) => 
          setTimeout(() => {
            console.warn(`⏱️ [preparePlayerDeck] Timeout ao buscar deck para usuário ${userId} após ${timeout}ms`);
            reject(new Error('Timeout'));
          }, timeout)
        )
      ]).catch((error) => {
        console.error(`❌ [preparePlayerDeck] Erro ao buscar deck para usuário ${userId}:`, error);
        return null;
      });
      
      if (!deck) {
        console.warn(`⚠️ [preparePlayerDeck] Deck não encontrado ou timeout para usuário ${userId}. Retornando deck vazio.`);
        return { deck: [], hand: [] };
      }
      
      console.log(`🔍 [preparePlayerDeck] Estrutura do deck recebido:`, {
        hasCards: !!deck.cards,
        cardsIsArray: Array.isArray(deck.cards),
        cardsLength: deck.cards?.length || 0,
        deckKeys: Object.keys(deck || {}),
      });
      
      if (!deck.cards || !Array.isArray(deck.cards) || deck.cards.length === 0) {
        console.warn(`⚠️ [preparePlayerDeck] Deck sem cartas para usuário ${userId}. Retornando deck vazio.`);
        return { deck: [], hand: [] };
      }
      
      console.log(`🔍 [preparePlayerDeck] Preparando ${deck.cards.length} cartas do deck...`);
      
      // Verificar estrutura das cartas
      if (deck.cards.length > 0) {
        console.log(`🔍 [preparePlayerDeck] Primeira carta exemplo:`, {
          id: deck.cards[0].id,
          cardId: deck.cards[0].cardId,
          hasCard: !!deck.cards[0].card,
          card: deck.cards[0].card ? {
            id: deck.cards[0].card.id,
            name: deck.cards[0].card.name,
            type: deck.cards[0].card.type,
          } : null,
        });
      }
      
      // Extrair as cartas corretamente (deck.cards é um array de DeckCard, precisamos do card dentro)
      const extractedCards = deck.cards.map((deckCard: any) => {
        // Se tem card.card, usar ele, senão usar deckCard diretamente
        if (deckCard.card) {
          const card = deckCard.card;
          return {
            ...card,
            id: card.id,
            idCarta: card.idCarta || card.id, // CRÍTICO: idCarta é necessário para CardImage
            cardId: deckCard.cardId || card.id,
            // Preservar todos os campos importantes
            name: card.name,
            type: card.type,
            cardType: card.cardType || card.type,
            atk: card.atk,
            def: card.def,
            level: card.level,
            attribute: card.attribute,
            race: card.race,
            rarity: card.rarity,
            // NÃO incluir cardImage (muito grande, será gerado no frontend)
          };
        } else {
          // Se não tem card.card, usar deckCard diretamente mas garantir idCarta
          return {
            ...deckCard,
            idCarta: deckCard.idCarta || deckCard.id || deckCard.cardId,
          };
        }
      }).filter((card: any) => card !== null && card !== undefined);
      
      console.log(`🔍 [preparePlayerDeck] Cartas extraídas: ${extractedCards.length} cartas`);
      if (extractedCards.length > 0) {
        console.log(`🔍 [preparePlayerDeck] Primeira carta extraída:`, {
          id: extractedCards[0].id,
          idCarta: extractedCards[0].idCarta,
          cardId: extractedCards[0].cardId,
          name: extractedCards[0].name,
          type: extractedCards[0].type,
        });
      }
      
      // Embaralhar o deck
      const shuffledDeck = this.shuffleDeck(extractedCards);
      console.log(`🔍 [preparePlayerDeck] Deck embaralhado: ${shuffledDeck.length} cartas`);
      
      // Distribuir 5 cartas para a mão
      const hand = shuffledDeck.splice(0, 5);
      
      console.log(`✅ [preparePlayerDeck] Deck preparado para usuário ${userId}: ${shuffledDeck.length} cartas no deck, ${hand.length} na mão`);
      console.log(`✅ [preparePlayerDeck] Primeira carta da mão:`, hand[0] ? {
        id: hand[0].id,
        idCarta: hand[0].idCarta,
        cardId: hand[0].cardId,
        name: hand[0].name,
        type: hand[0].type,
      } : null);
      
      return { deck: shuffledDeck, hand };
    } catch (error) {
      console.error(`❌ [preparePlayerDeck] Erro ao preparar deck do usuário ${userId}:`, error);
      return { deck: [], hand: [] };
    }
  }

  private shuffleDeck(deck: any[]): any[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private createEmptyField(): any {
        return {
      monsters: [],
      spellTrap: [],
      graveyard: [],
    };
  }

  private compactCard(card: any): any {
    if (!card) {
      console.warn(`⚠️ [compactCard] Carta é null/undefined`);
      return null;
    }
    
    // Se a carta tem uma propriedade 'card' (relação do TypeORM), usar ela
    const actualCard = card.card || card;
    
    const compacted: any = {
      id: actualCard.id || card.id || card.cardId || null,
      idCarta: actualCard.idCarta || card.idCarta || actualCard.id || card.id || null, // CRÍTICO: idCarta necessário para CardImage
      cardId: actualCard.id || card.id || card.cardId || null,
      name: actualCard.name || card.name || 'Unknown',
      type: actualCard.type || card.type || 'MONSTER',
      cardType: actualCard.cardType || card.cardType || actualCard.type || card.type || 'MONSTER',
      atk: actualCard.atk || card.atk || 0,
      def: actualCard.def || card.def || 0,
      level: actualCard.level || card.level || 0,
      attribute: actualCard.attribute || card.attribute || null,
      race: actualCard.race || card.race || null,
      rarity: actualCard.rarity || card.rarity || null,
      // NÃO incluir cardImage (muito grande, será gerado no frontend usando idCarta)
    };
    
    // Remover campos nulos ou indefinidos (exceto idCarta que pode ser 0)
    for (const key in compacted) {
      if (compacted.hasOwnProperty(key) && (compacted[key] === null || compacted[key] === undefined)) {
        delete compacted[key];
      }
    }
    
    // CRÍTICO: Garantir que idCarta existe (necessário para CardImage)
    if (!compacted.idCarta && compacted.id) {
      compacted.idCarta = compacted.id;
    }
    if (!compacted.idCarta && compacted.cardId) {
      compacted.idCarta = compacted.cardId;
    }
    
    return compacted;
  }
}
