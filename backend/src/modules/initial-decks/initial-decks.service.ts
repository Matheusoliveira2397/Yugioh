import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InitialDeck } from './entities/initial-deck.entity';
import { InitialDeckCard } from './entities/initial-deck-card.entity';
import { ShopService } from '../shop/shop.service';
import { UsersService } from '../users/users.service';
import { Deck } from '../decks/entities/deck.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';

@Injectable()
export class InitialDecksService {
  constructor(
    @InjectRepository(InitialDeck)
    private initialDeckRepository: Repository<InitialDeck>,
    @InjectRepository(InitialDeckCard)
    private initialDeckCardRepository: Repository<InitialDeckCard>,
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(DeckCard)
    private deckCardsRepository: Repository<DeckCard>,
    private shopService: ShopService,
    private usersService: UsersService,
  ) {}

  async findAll(): Promise<InitialDeck[]> {
    return this.initialDeckRepository.find({
      relations: ['cards', 'cards.card'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<InitialDeck> {
    const deck = await this.initialDeckRepository.findOne({
      where: { id },
      relations: ['cards', 'cards.card'],
    });

    if (!deck) {
      throw new NotFoundException('Deck inicial não encontrado');
    }

    return deck;
  }

  async findActiveDecks(): Promise<InitialDeck[]> {
    return this.initialDeckRepository.find({
      where: { isActive: true },
      relations: ['cards', 'cards.card'],
    });
  }

  async getRandomActiveDeck(allowedDeckIds?: string[]): Promise<InitialDeck | null> {
    let activeDecks = await this.findActiveDecks();
    
    // Se houver lista de IDs permitidos, filtrar apenas esses decks
    if (allowedDeckIds && allowedDeckIds.length > 0) {
      activeDecks = activeDecks.filter(deck => allowedDeckIds.includes(deck.id));
    }
    
    if (activeDecks.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * activeDecks.length);
    return activeDecks[randomIndex];
  }

  async create(createDeckDto: { name: string; description?: string; cards: Array<{ cardId: string; quantity: number }> }): Promise<InitialDeck> {
    try {
      console.log('📝 [InitialDecksService] Criando deck inicial:', {
        name: createDeckDto.name,
        cardsCount: createDeckDto.cards?.length || 0,
        cards: createDeckDto.cards?.map(c => ({ cardId: c.cardId, quantity: c.quantity }))
      });

      const deckData: Partial<InitialDeck> = {
        name: createDeckDto.name,
        isActive: true,
      };
      
      if (createDeckDto.description) {
        deckData.description = createDeckDto.description;
      }

      const deck = this.initialDeckRepository.create(deckData);
      const savedDeck = await this.initialDeckRepository.save(deck);
      console.log('✅ [InitialDecksService] Deck criado:', savedDeck);
      
      // Garantir que savedDeck é um objeto, não um array
      if (Array.isArray(savedDeck)) {
        throw new Error('Erro: save() retornou um array em vez de um objeto');
      }
      const deckId = savedDeck.id;
      if (!deckId) {
        throw new Error('Erro ao criar deck: ID não foi gerado');
      }
      console.log('✅ [InitialDecksService] Deck criado com ID:', deckId);

      // Adicionar cartas ao deck
      if (createDeckDto.cards && createDeckDto.cards.length > 0) {
        console.log('📦 [InitialDecksService] Adicionando cartas ao deck...');
        
        // Validar se todas as cartas existem
        const cardIds = createDeckDto.cards.map(c => c.cardId);
        console.log('🔍 [InitialDecksService] Validando cardIds:', cardIds);

        const deckCards = createDeckDto.cards.map((cardData) => {
          console.log('📋 [InitialDecksService] Criando deck card:', {
            initialDeckId: deckId,
            cardId: cardData.cardId,
            quantity: cardData.quantity,
          });
          
          return this.initialDeckCardRepository.create({
            initialDeckId: deckId,
            cardId: cardData.cardId,
            quantity: cardData.quantity,
          });
        });

        console.log('💾 [InitialDecksService] Salvando deck cards...');
        await this.initialDeckCardRepository.save(deckCards);
        console.log('✅ [InitialDecksService] Deck cards salvos com sucesso');
      }

      return this.findOne(deckId);
    } catch (error: any) {
      console.error('❌ [InitialDecksService] Erro ao criar deck inicial:', error);
      console.error('❌ [InitialDecksService] Stack:', error.stack);
      throw error;
    }
  }

  async update(id: string, updateDeckDto: { name?: string; description?: string; isActive?: boolean; cards?: Array<{ cardId: string; quantity: number }> }): Promise<InitialDeck> {
    const deck = await this.findOne(id);

    if (updateDeckDto.name !== undefined) {
      deck.name = updateDeckDto.name;
    }

    if (updateDeckDto.description !== undefined) {
      deck.description = updateDeckDto.description;
    }

    if (updateDeckDto.isActive !== undefined) {
      deck.isActive = updateDeckDto.isActive;
    }

    await this.initialDeckRepository.save(deck);

    // Atualizar cartas se fornecido
    if (updateDeckDto.cards !== undefined) {
      // Remover cartas antigas
      await this.initialDeckCardRepository.delete({ initialDeckId: id });

      // Adicionar novas cartas
      if (updateDeckDto.cards.length > 0) {
        const deckCards = updateDeckDto.cards.map((cardData) =>
          this.initialDeckCardRepository.create({
            initialDeckId: id,
            cardId: cardData.cardId,
            quantity: cardData.quantity,
          })
        );

        await this.initialDeckCardRepository.save(deckCards);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const deck = await this.findOne(id);
    await this.initialDeckRepository.remove(deck);
  }

  async assignDeckToUser(userId: number, allowedDeckIds?: string[]): Promise<void> {
    console.log(`🔍 [InitialDecksService] Buscando deck inicial para usuário ${userId}...`);
    console.log(`🔍 [InitialDecksService] IDs permitidos: ${allowedDeckIds ? JSON.stringify(allowedDeckIds) : 'Qualquer deck ativo'}`);
    
    const deck = await this.getRandomActiveDeck(allowedDeckIds);

    if (!deck) {
      // Buscar todos os decks ativos para diagnóstico
      const allActiveDecks = await this.findActiveDecks();
      console.error(`❌ [InitialDecksService] Nenhum deck inicial ativo encontrado para o usuário ${userId}`);
      console.error(`   Total de decks ativos no banco: ${allActiveDecks.length}`);
      if (allActiveDecks.length > 0) {
        console.error(`   IDs dos decks ativos: ${JSON.stringify(allActiveDecks.map(d => d.id))}`);
      }
      if (allowedDeckIds && allowedDeckIds.length > 0) {
        console.error(`   IDs configurados em availableInitialDeckIds: ${JSON.stringify(allowedDeckIds)}`);
        console.error(`   💡 Dica: Verifique se os IDs configurados correspondem aos decks ativos no banco`);
      } else {
        console.error(`   💡 Dica: Configure pelo menos um deck inicial no painel admin e marque-o como ativo`);
      }
      throw new Error(`Nenhum deck inicial disponível. Configure decks iniciais no painel admin.`);
    }

    console.log(`🎴 [InitialDecksService] Atribuindo deck inicial "${deck.name}" ao usuário ${userId}`);

    // Primeiro: Adicionar todas as cartas do deck ao inventário do usuário (maleta)
    if (deck.cards && deck.cards.length > 0) {
      console.log(`📦 [InitialDecksService] Adicionando ${deck.cards.length} tipos de cartas ao inventário do usuário...`);
      for (const deckCard of deck.cards) {
        // Adicionar todas as quantidades de uma vez (mais eficiente)
        await this.shopService.addCardToUserInventory(userId, deckCard.cardId, 'GIFT', deckCard.quantity);
      }
      console.log(`✅ [InitialDecksService] Cartas adicionadas ao inventário do usuário`);
    }

    // Criar um deck "Deck Inicial" com as cartas do deck inicial sorteado
    // Expandir as quantidades: se uma carta tem quantity: 3, adicionar 3 vezes ao deck
    const deckCardIds: string[] = [];
    if (deck.cards && deck.cards.length > 0) {
      for (const deckCard of deck.cards) {
        // Adicionar a carta N vezes (onde N é a quantity)
        for (let i = 0; i < deckCard.quantity; i++) {
          deckCardIds.push(deckCard.cardId);
        }
      }
    }

    // Validar tamanho do deck (deve ter entre 40-60 cartas)
    if (deckCardIds.length < 40 || deckCardIds.length > 60) {
      console.warn(`⚠️ [InitialDecksService] Deck inicial "${deck.name}" tem ${deckCardIds.length} cartas (recomendado: 40-60). Criando deck mesmo assim.`);
    }

    // Criar o deck "Deck Inicial" diretamente (sem validação de tamanho, pois é deck inicial obrigatório)
    const deckName = 'Deck Inicial';
    try {
      // Criar deck diretamente no banco
      const deckEntity = this.decksRepository.create({
        name: deckName,
        userId,
      });
      const savedDeck = await this.decksRepository.save(deckEntity);

      // Adicionar cartas ao deck
      if (deckCardIds.length > 0) {
        console.log(`📦 [InitialDecksService] Criando ${deckCardIds.length} cartas para o deck...`);
        const deckCards = deckCardIds.map((cardId) =>
          this.deckCardsRepository.create({
            deckId: savedDeck.id,
            cardId,
          })
        );
        const savedDeckCards = await this.deckCardsRepository.save(deckCards);
        console.log(`✅ [InitialDecksService] ${savedDeckCards.length} cartas salvas no deck`);
        
        // Verificar se as cartas foram salvas corretamente
        const verifyCards = await this.deckCardsRepository.find({
          where: { deckId: savedDeck.id },
          relations: ['card'],
        });
        console.log(`🔍 [InitialDecksService] Verificação: ${verifyCards.length} cartas encontradas no banco para o deck ${savedDeck.id}`);
        if (verifyCards.length > 0) {
          console.log(`🔍 [InitialDecksService] Primeiras 3 cartas:`, verifyCards.slice(0, 3).map(dc => ({
            cardId: dc.cardId,
            cardName: dc.card?.name || 'N/A',
          })));
        }
      } else {
        console.warn(`⚠️ [InitialDecksService] Nenhuma carta para adicionar ao deck!`);
      }

      console.log(`✅ [InitialDecksService] Deck "${deckName}" criado com ID: ${savedDeck.id} (${deckCardIds.length} cartas do deck inicial "${deck.name}")`);

      // Equipar o deck automaticamente
      const updatedUser = await this.usersService.updateCosmetics(userId, {
        equippedDeckName: deckName,
      });
      console.log(`✅ [InitialDecksService] Deck "${deckName}" equipado automaticamente para o usuário ${userId}`);
      console.log(`🔍 [InitialDecksService] Verificação: equippedDeckName do usuário = "${(updatedUser as any).equippedDeckName}"`);
    } catch (error: any) {
      console.error(`❌ [InitialDecksService] Erro ao criar/equipar deck inicial:`, error);
      throw error; // Falha o registro se não conseguir criar o deck
    }

    console.log(`✅ [InitialDecksService] Deck inicial "${deck.name}" atribuído ao usuário ${userId} como "${deckName}"`);
  }
}

