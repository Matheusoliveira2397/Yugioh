import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Deck } from './entities/deck.entity';
import { DeckCard } from './entities/deck-card.entity';
import { CreateDeckDto } from './dto/create-deck.dto';
import { Card } from '../cards/entities/card.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { User } from '../users/entities/user.entity';
import { logger } from '../../common/utils/logger.util';

@Injectable()
export class DecksService implements OnModuleInit {
  constructor(
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(DeckCard)
    private deckCardsRepository: Repository<DeckCard>,
    @InjectRepository(Card)
    private cardsRepository: Repository<Card>,
    @InjectRepository(UserCard)
    private userCardsRepository: Repository<UserCard>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  /**
   * Executado automaticamente quando o módulo é inicializado
   * Verifica e adiciona a coluna isExtraDeck se necessário
   */
  async onModuleInit() {
    try {
      console.log('🔧 [DecksService] Verificando coluna isExtraDeck...');
      const isExtraDeckExists = await this.deckCardsRepository.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'deck_cards' AND column_name = 'isExtraDeck'
      `);
      
      if (isExtraDeckExists.length === 0) {
        console.log('🔧 [DecksService] Adicionando coluna isExtraDeck...');
        await this.deckCardsRepository.query(`
          ALTER TABLE "deck_cards" 
          ADD COLUMN "isExtraDeck" BOOLEAN NOT NULL DEFAULT false
        `);
        await this.deckCardsRepository.query(`
          CREATE INDEX IF NOT EXISTS "IDX_deck_cards_isExtraDeck" ON "deck_cards"("isExtraDeck")
        `);
        await this.deckCardsRepository.query(`
          COMMENT ON COLUMN "deck_cards"."isExtraDeck" IS 'Indica se a carta está no Extra Deck (true) ou no Deck Principal (false)'
        `);
        console.log('✅ [DecksService] Coluna isExtraDeck adicionada com sucesso');
      } else {
        console.log('✅ [DecksService] Coluna isExtraDeck já existe');
      }
    } catch (error: any) {
      console.error('❌ [DecksService] Erro ao verificar/adicionar coluna isExtraDeck:', error);
      // Não lançar erro para não impedir a inicialização do módulo
    }
  }

  async create(userId: number, createDeckDto: CreateDeckDto): Promise<Deck> {
    // Validar tamanho do deck (40-60 cartas no main deck)
    if (createDeckDto.cards.length < 40 || createDeckDto.cards.length > 60) {
      throw new BadRequestException('Deck must have between 40 and 60 cards');
    }

    const deck = this.decksRepository.create({
      name: createDeckDto.name,
      userId,
    });

    const savedDeck = await this.decksRepository.save(deck);

    // Adicionar cartas ao deck
    const deckCards = createDeckDto.cards.map((cardId) =>
      this.deckCardsRepository.create({
        deckId: savedDeck.id,
        cardId,
      }),
    );

    await this.deckCardsRepository.save(deckCards);

    return this.findOne(savedDeck.id);
  }

  async findAll(userId: number): Promise<Deck[]> {
    return this.decksRepository.find({
      where: { userId },
      relations: ['cards', 'cards.card'],
    });
  }

  async findOne(id: string): Promise<Deck> {
    console.log('🔍 [findOne] Buscando deck com id:', id);
    const deck = await this.decksRepository.findOne({
      where: { id },
      relations: ['cards', 'cards.card'],
    });
    console.log('🔍 [findOne] Deck encontrado:', {
      id: deck?.id,
      name: deck?.name,
      cardsCount: deck?.cards?.length || 0,
      hasCards: !!deck?.cards,
    });
    if (deck && deck.cards && deck.cards.length > 0) {
      console.log('🔍 [findOne] Primeiras 3 cartas:', deck.cards.slice(0, 3).map(dc => ({
        deckCardId: dc.id,
        cardId: dc.cardId,
        hasCard: !!dc.card,
        cardName: dc.card?.name || 'N/A',
      })));
    }

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  async delete(id: string, userId: number): Promise<void> {
    const deck = await this.findOne(id);
    
    if (deck.userId !== userId) {
      throw new BadRequestException('You can only delete your own decks');
    }

    // Não permitir deletar o deck equipado
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'equippedDeckName'],
    });

    if (user && user.equippedDeckName && user.equippedDeckName === deck.name) {
      throw new BadRequestException('Você não pode deletar o deck equipado. Equipe outro deck primeiro.');
    }

    await this.decksRepository.delete(id);
  }

  // ==================== SALVAR DECK ATUAL (DECK PRINCIPAL + EXTRA DECK) ====================
  async saveCurrentDeck(userId: number, saveDeckDto: { cardIds: string[]; extraDeckCardIds?: string[]; name?: string }): Promise<Deck> {
    const startTime = Date.now();
    logger.debug('💾 [saveCurrentDeck] Salvando deck atual para usuário:', userId, 'cartas:', saveDeckDto.cardIds.length);
    
    // Validar tamanho do deck principal (0-60 cartas, permitir deck vazio)
    if (saveDeckDto.cardIds.length > 60) {
      throw new BadRequestException('Deck principal não pode ter mais de 60 cartas');
    }

    // Validar tamanho do Extra Deck (0-15 cartas)
    const extraDeckCardIds = saveDeckDto.extraDeckCardIds || [];
    if (extraDeckCardIds.length > 15) {
      throw new BadRequestException('Extra Deck não pode ter mais de 15 cartas');
    }

    // Validar que apenas cartas Fusion podem ir para o Extra Deck
    if (extraDeckCardIds.length > 0) {
      const extraDeckCards = await this.cardsRepository.find({
        where: { id: In(extraDeckCardIds.filter(id => id && id.trim() !== '')) },
        select: ['id', 'name', 'monsterType', 'type', 'idCarta']
      });

      // Verificar se todas as cartas são Fusion
      const nonFusionCards = extraDeckCards.filter(card => {
        // Verificar se é monstro e se é Fusion
        return card.type !== 'Monster' || card.monsterType !== 'Fusion';
      });

      if (nonFusionCards.length > 0) {
        throw new BadRequestException(
          `Apenas monstros do tipo Fusion podem ser adicionados ao Extra Deck. ` +
          `Cartas inválidas encontradas: ${nonFusionCards.map(c => c.name).join(', ')}`
        );
      }
    }

    // Filtrar cardIds vazios ou inválidos (não lançar erro, apenas remover)
    const validCardIds = saveDeckDto.cardIds.filter(id => id && id.trim() !== '');
    if (validCardIds.length !== saveDeckDto.cardIds.length) {
      const invalidCount = saveDeckDto.cardIds.length - validCardIds.length;
      logger.warn(`⚠️ [saveCurrentDeck] ${invalidCount} cardIds inválidos foram removidos`);
      // Atualizar o array para usar apenas os válidos
      saveDeckDto.cardIds = validCardIds;
    }

    // Buscar ou criar deck principal (nome padrão: "Meu Deck")
    const deckName = saveDeckDto.name || 'Meu Deck';

    // Regras de quantidade: uma carta não pode estar em mais decks do que o usuário tem cópias
    // Validar deck principal e extra deck juntos (apenas se houver cartas)
    // Usar saveDeckDto.cardIds que já foi filtrado acima, ou validCardIds se ainda estiver no escopo
    const validExtraDeckCardIds = extraDeckCardIds.filter(id => id && id.trim() !== '');
    const allCardIds = [...saveDeckDto.cardIds, ...validExtraDeckCardIds];
    if (allCardIds.length > 0) {
      await this.validateUserCardQuantities(userId, allCardIds, deckName);
    }
    let deck = await this.decksRepository.findOne({
      where: { userId, name: deckName },
    });

    if (!deck) {
      // Criar novo deck
      deck = this.decksRepository.create({
        name: deckName,
        userId,
      });
      deck = await this.decksRepository.save(deck);
      logger.debug('✅ [saveCurrentDeck] Novo deck criado:', deck.id);
    } else {
      logger.debug('🔄 [saveCurrentDeck] Atualizando deck existente:', deck.id);
    }

    // Remover todas as cartas antigas do deck
    const deleteResult = await this.deckCardsRepository.delete({ deckId: deck.id });
    logger.debug('🗑️ [saveCurrentDeck] Cartas antigas removidas:', deleteResult.affected || 0);

    // Adicionar novas cartas ao deck (apenas se houver cartas válidas)
    const validMainDeckCardIds = saveDeckDto.cardIds.filter(id => id && id.trim() !== '');
    if (validMainDeckCardIds.length > 0) {
      logger.debug('📝 [saveCurrentDeck] Criando DeckCards para', validMainDeckCardIds.length, 'cartas...');
      
      // Converter cardIds para IDs (UUID) se necessário
      // O cardId pode ser id (UUID) ou idCarta, precisamos converter para id (UUID)
      const cardIdToUuidMap = new Map<string, string>();
      const uniqueCardIds = [...new Set(validMainDeckCardIds)];
      
      logger.debug('🔍 [saveCurrentDeck] Convertendo', uniqueCardIds.length, 'cardIds únicos para UUIDs...');
      
      // Separar UUIDs e idCartas para fazer queries em batch
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const potentialUuids: string[] = [];
      const idCartas: string[] = [];
      
      for (const cardIdInput of uniqueCardIds) {
        const trimmedCardId = cardIdInput.trim();
        if (uuidRegex.test(trimmedCardId)) {
          potentialUuids.push(trimmedCardId);
        } else {
          idCartas.push(trimmedCardId);
        }
      }
      
      // Buscar cartas por UUID em batch
      if (potentialUuids.length > 0) {
        logger.debug('🔍 [saveCurrentDeck] Buscando', potentialUuids.length, 'cartas por UUID...');
        const cardsById = await this.cardsRepository.find({
          where: { id: In(potentialUuids) },
          select: ['id', 'name', 'idCarta']
        });
        logger.debug('✅ [saveCurrentDeck] Encontradas', cardsById.length, 'cartas por UUID');
        for (const card of cardsById) {
          cardIdToUuidMap.set(card.id, card.id);
        }
        // Verificar quais UUIDs não foram encontrados
        const foundUuids = new Set(cardsById.map(c => c.id));
        const missingUuids = potentialUuids.filter(uuid => !foundUuids.has(uuid));
        if (missingUuids.length > 0) {
          logger.warn('⚠️ [saveCurrentDeck] UUIDs não encontrados:', missingUuids.slice(0, 5));
        }
      }
      
      // Buscar cartas por idCarta em batch
      if (idCartas.length > 0) {
        logger.debug('🔍 [saveCurrentDeck] Buscando', idCartas.length, 'cartas por idCarta...');
        const cardsByIdCarta = await this.cardsRepository.find({
          where: { idCarta: In(idCartas) },
          select: ['id', 'idCarta']
        });
        logger.debug('✅ [saveCurrentDeck] Encontradas', cardsByIdCarta.length, 'cartas por idCarta');
        for (const card of cardsByIdCarta) {
          cardIdToUuidMap.set(card.idCarta, card.id);
        }
        // Verificar quais idCartas não foram encontrados
        const foundIdCartas = new Set(cardsByIdCarta.map(c => c.idCarta));
        const missingIdCartas = idCartas.filter(idCarta => !foundIdCartas.has(idCarta));
        if (missingIdCartas.length > 0) {
          logger.warn('⚠️ [saveCurrentDeck] idCartas não encontrados:', missingIdCartas.slice(0, 5));
        }
      }
      
      // Verificar se algum cardId não foi encontrado
      const missingCardIds: string[] = [];
      for (const cardIdInput of uniqueCardIds) {
        const trimmedCardId = cardIdInput.trim();
        if (!cardIdToUuidMap.has(trimmedCardId)) {
          logger.error(`❌ [saveCurrentDeck] Carta não encontrada para cardId: "${trimmedCardId}"`);
          missingCardIds.push(trimmedCardId);
        }
      }
      
      if (missingCardIds.length > 0) {
        logger.error(`❌ [saveCurrentDeck] ${missingCardIds.length} cartas não foram encontradas:`, missingCardIds);
        throw new BadRequestException(
          `Não foi possível encontrar ${missingCardIds.length} carta(s) no banco de dados. ` +
          `CardIds não encontrados: ${missingCardIds.slice(0, 5).join(', ')}${missingCardIds.length > 5 ? '...' : ''}`
        );
      }
      
      logger.debug('✅ [saveCurrentDeck] Conversão concluída. Mapeamento:', cardIdToUuidMap.size, 'de', uniqueCardIds.length, 'cartas');
      
      // Criar DeckCards para TODAS as cartas do deck principal (incluindo duplicatas)
      const mainDeckCardsData = validMainDeckCardIds
        .map((cardId, index) => {
          const trimmedCardId = cardId.trim();
          const uuid = cardIdToUuidMap.get(trimmedCardId);
          
          if (!uuid) {
            throw new BadRequestException(
              `Erro interno: Não foi possível converter cardId "${trimmedCardId}" para UUID. ` +
              `Por favor, tente novamente ou entre em contato com o suporte.`
            );
          }
          
          return {
            deckId: deck.id,
            cardId: uuid,
            isExtraDeck: false,
          };
        });

      // Criar DeckCards para o Extra Deck
      let extraDeckCardsData: any[] = [];
      if (extraDeckCardIds.length > 0) {
        // Converter cardIds do Extra Deck para UUIDs
        const extraDeckUniqueCardIds = [...new Set(extraDeckCardIds.filter(id => id && id.trim() !== ''))];
        const extraDeckUuidMap = new Map<string, string>();
        
        // Buscar cartas do Extra Deck
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const extraDeckPotentialUuids: string[] = [];
        const extraDeckIdCartas: string[] = [];
        
        for (const cardIdInput of extraDeckUniqueCardIds) {
          const trimmedCardId = cardIdInput.trim();
          if (uuidRegex.test(trimmedCardId)) {
            extraDeckPotentialUuids.push(trimmedCardId);
          } else {
            extraDeckIdCartas.push(trimmedCardId);
          }
        }
        
        if (extraDeckPotentialUuids.length > 0) {
          const cardsById = await this.cardsRepository.find({
            where: { id: In(extraDeckPotentialUuids) },
            select: ['id', 'name', 'idCarta']
          });
          for (const card of cardsById) {
            extraDeckUuidMap.set(card.id, card.id);
          }
        }
        
        if (extraDeckIdCartas.length > 0) {
          const cardsByIdCarta = await this.cardsRepository.find({
            where: { idCarta: In(extraDeckIdCartas) },
            select: ['id', 'name', 'idCarta']
          });
          for (const card of cardsByIdCarta) {
            extraDeckUuidMap.set(card.idCarta, card.id);
          }
        }
        
        extraDeckCardsData = extraDeckCardIds
          .filter(cardId => cardId && cardId.trim() !== '')
          .map((cardId) => {
            const trimmedCardId = cardId.trim();
            const uuid = extraDeckUuidMap.get(trimmedCardId) || cardIdToUuidMap.get(trimmedCardId);
            
            if (!uuid) {
              throw new BadRequestException(
                `Erro interno: Não foi possível converter cardId do Extra Deck "${trimmedCardId}" para UUID.`
              );
            }
            
            return {
              deckId: deck.id,
              cardId: uuid,
              isExtraDeck: true,
            };
          });
      }

      const deckCardsData = [...mainDeckCardsData, ...extraDeckCardsData];
      
      logger.debug('📝 [saveCurrentDeck] Total de DeckCards preparados:', deckCardsData.length);

      try {
        logger.debug('🚀 [saveCurrentDeck] Iniciando inserção de', deckCardsData.length, 'cartas...');
        
        // Criar entidades DeckCard usando o método create (como no método create do deck)
        const deckCards = deckCardsData.map(item => 
          this.deckCardsRepository.create({
            deckId: item.deckId,
            cardId: item.cardId,
            isExtraDeck: item.isExtraDeck || false,
          })
        );
        
        console.log('📝 [saveCurrentDeck] DeckCards criados:', deckCards.length);
        console.log('📝 [saveCurrentDeck] Primeiros 3 DeckCards:', deckCards.slice(0, 3).map(dc => ({
          deckId: dc.deckId,
          cardId: dc.cardId,
          isExtraDeck: dc.isExtraDeck,
        })));
        
        // Log das cartas do Extra Deck
        const extraDeckCardsCreated = deckCards.filter(dc => dc.isExtraDeck === true);
        console.log(`📝 [saveCurrentDeck] Cartas do Extra Deck criadas: ${extraDeckCardsCreated.length}`);
        if (extraDeckCardsCreated.length > 0) {
          console.log('📝 [saveCurrentDeck] Primeiras 3 cartas do Extra Deck:', extraDeckCardsCreated.slice(0, 3).map(dc => ({
            deckId: dc.deckId,
            cardId: dc.cardId,
            isExtraDeck: dc.isExtraDeck,
          })));
        }
        
        // Usar save() que é o método mais simples e confiável (como no método create)
        console.log('💾 [saveCurrentDeck] Salvando DeckCards usando repository.save()...');
        const savedDeckCards = await this.deckCardsRepository.save(deckCards);
        
        console.log('✅ [saveCurrentDeck] DeckCards salvos com sucesso!');
        console.log('✅ [saveCurrentDeck] Total de cartas salvas:', savedDeckCards.length);
        console.log('✅ [saveCurrentDeck] Primeiros 3 DeckCards salvos:', savedDeckCards.slice(0, 3).map(dc => ({
          id: dc.id,
          deckId: dc.deckId,
          cardId: dc.cardId,
          isExtraDeck: dc.isExtraDeck,
        })));
        
        // Verificar quantas cartas do Extra Deck foram salvas
        const extraDeckCardsSaved = savedDeckCards.filter(dc => dc.isExtraDeck === true);
        console.log(`✅ [saveCurrentDeck] Cartas do Extra Deck salvas: ${extraDeckCardsSaved.length}`);
        if (extraDeckCardsSaved.length > 0) {
          console.log('✅ [saveCurrentDeck] Primeiras 3 cartas do Extra Deck salvas:', extraDeckCardsSaved.slice(0, 3).map(dc => ({
            id: dc.id,
            deckId: dc.deckId,
            cardId: dc.cardId,
            isExtraDeck: dc.isExtraDeck,
          })));
        }

        // Verificar imediatamente se foram salvas
        const verifyCount = await this.deckCardsRepository.count({
          where: { deckId: deck.id },
        });
        console.log('🔍 [saveCurrentDeck] Verificação imediata: Total de cartas no banco:', verifyCount);

        // Buscar algumas cartas salvas para verificar
        const sampleSavedCards = await this.deckCardsRepository.find({
          where: { deckId: deck.id },
          relations: ['card'],
          take: 5,
        });
        if (verifyCount !== deckCardsData.length) {
          logger.error('❌ [saveCurrentDeck] ERRO: Número de cartas salvas não corresponde!');
          logger.error('❌ [saveCurrentDeck] Esperado:', deckCardsData.length, 'Encontrado:', verifyCount);
          throw new BadRequestException(
            `Erro ao salvar deck: Esperado ${deckCardsData.length} cartas, mas apenas ${verifyCount} foram salvas.`
          );
        } else {
          logger.debug('✅ [saveCurrentDeck] Todas as', verifyCount, 'cartas foram salvas corretamente!');
        }
        
        // Aguardar um pouco para garantir que a transação foi commitada antes de buscar o deck
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (saveError: any) {
        console.error('❌ [saveCurrentDeck] ERRO ao salvar DeckCards:', saveError);
        console.error('❌ [saveCurrentDeck] Mensagem:', saveError.message);
        console.error('❌ [saveCurrentDeck] Código:', saveError.code);
        console.error('❌ [saveCurrentDeck] Detalhes:', saveError.detail);
        console.error('❌ [saveCurrentDeck] Query:', saveError.query);
        console.error('❌ [saveCurrentDeck] Parameters:', saveError.parameters);
        console.error('❌ [saveCurrentDeck] Stack:', saveError.stack);
        
        // Verificar se é erro de foreign key constraint
        if (saveError.code === '23503' || saveError.message?.includes('foreign key') || saveError.message?.includes('constraint')) {
          console.error('❌ [saveCurrentDeck] ERRO DE FOREIGN KEY! O cardId não existe na tabela cards!');
          console.error('❌ [saveCurrentDeck] Verificando quais cardIds são inválidos...');
          
          // Verificar cada cardId individualmente
          for (const deckCardData of deckCardsData) {
            const cardExists = await this.cardsRepository.findOne({
              where: { id: deckCardData.cardId },
              select: ['id']
            });
            if (!cardExists) {
              console.error(`❌ [saveCurrentDeck] CardId inválido: ${deckCardData.cardId} não existe na tabela cards!`);
            }
          }
          
          throw new BadRequestException(
            `Erro ao salvar deck: Uma ou mais cartas não foram encontradas no banco de dados. ` +
            `Verifique se todas as cartas existem antes de salvar o deck.`
          );
        }
        
        throw saveError;
      }
    } else {
      console.log('⚠️ [saveCurrentDeck] Nenhuma carta para adicionar (deck vazio)');
    }

    logger.debug('🔍 [saveCurrentDeck] Buscando deck atualizado...');
    
    // Aguardar um pouco para garantir que a transação foi commitada
    await new Promise(resolve => setTimeout(resolve, 200)); // Reduzido de 500ms para 200ms
    
    // SEMPRE buscar diretamente do banco para garantir que temos todas as cartas
    const allDeckCards = await this.deckCardsRepository.find({
      where: { deckId: deck.id },
      relations: ['card'],
      select: {
        id: true,
        deckId: true,
        cardId: true,
        isExtraDeck: true,
            card: {
              id: true,
              idCarta: true,
              name: true,
          type: true,
          monsterType: true,
          cardImage: true,
          description: true,
          atk: true,
          def: true,
          level: true,
          rarity: true,
        },
      },
    });
    logger.debug('🔍 [saveCurrentDeck] Verificação direta do banco:', allDeckCards.length, 'DeckCards encontrados');
    
    // Buscar o deck base
    let updatedDeck = await this.decksRepository.findOne({
      where: { id: deck.id },
    });
    
    if (!updatedDeck) {
      throw new NotFoundException('Deck não encontrado após salvar');
    }
    
    // SEMPRE atribuir as cartas encontradas diretamente do banco
    updatedDeck.cards = allDeckCards;
    
    const duration = Date.now() - startTime;
    logger.perf(`saveCurrentDeck (userId: ${userId}, cards: ${updatedDeck.cards.length})`, duration);
    
    logger.debug('✅ [saveCurrentDeck] Deck atualizado com', updatedDeck.cards.length, 'cartas');
    
    // Verificação final antes de retornar (apenas em dev)
    if (process.env.NODE_ENV === 'development') {
      const finalCheck = await this.deckCardsRepository.count({
        where: { deckId: deck.id },
      });
      if (finalCheck !== updatedDeck.cards.length) {
        logger.warn('⚠️ [saveCurrentDeck] Discrepância entre banco e objeto!');
        logger.error('❌ [saveCurrentDeck] Banco:', finalCheck, 'Objeto:', updatedDeck.cards.length);
        // Recarregar as cartas novamente
        updatedDeck.cards = await this.deckCardsRepository.find({
          where: { deckId: deck.id },
          relations: ['card'],
        });
        logger.debug('✅ [saveCurrentDeck] Cartas recarregadas:', updatedDeck.cards.length);
      }
    }
    
    // Garantir que cards seja um array válido
    if (!Array.isArray(updatedDeck.cards)) {
      logger.error('❌ [saveCurrentDeck] ERRO: cards não é um array!', typeof updatedDeck.cards);
      updatedDeck.cards = [];
    }
    
    // Serializar manualmente para garantir que tudo seja incluído
    const deckToReturn = {
      ...updatedDeck,
      cards: updatedDeck.cards.map(dc => ({
        id: dc.id,
        deckId: dc.deckId,
        cardId: dc.cardId,
        card: dc.card ? {
          id: dc.card.id,
          idCarta: dc.card.idCarta,
          name: dc.card.name,
          type: dc.card.type,
          atk: dc.card.atk,
          def: dc.card.def,
          level: dc.card.level,
          attribute: dc.card.attribute,
          rarity: dc.card.rarity,
          cardImage: dc.card.cardImage,
          description: dc.card.description,
        } : null,
      })),
    };
    
    logger.debug('💾 [saveCurrentDeck] Retornando deck serializado com', deckToReturn.cards.length, 'cartas');
    
    return deckToReturn as Deck;
  }

  /**
   * Garante que, somando TODAS as cópias da carta em todos os decks do usuário
   * (incluindo o deck atual sendo salvo), nunca passe da quantidade que ele possui na maleta.
   */
  private async validateUserCardQuantities(
    userId: number,
    newDeckCardIds: string[],
    deckName: string,
  ): Promise<void> {
    // 1) Buscar quantas cópias o usuário possui de cada carta
    const userCards = await this.userCardsRepository.find({
      where: { userId },
      select: ['cardId', 'quantity'],
    });

    // Mapa cardId -> quantidade possuída
    const ownedMap = new Map<string, number>();
    for (const uc of userCards) {
      ownedMap.set(uc.cardId, (ownedMap.get(uc.cardId) || 0) + uc.quantity);
    }

    // 2) Buscar todos os decks do usuário (exceto o deck atual, pois vamos recalcular ele)
    const otherDecks = await this.decksRepository.find({
      where: { userId },
      relations: ['cards'],
    });

    // Encontrar o deck atual (mesmo nome) e excluí-lo da contagem anterior
    const otherDecksFiltered = otherDecks.filter((d) => d.name !== deckName);

    // 3) Somar uso atual em outros decks: cardId -> qtd em todos os outros decks
    const usedInOtherDecks = new Map<string, number>();
    for (const deck of otherDecksFiltered) {
      for (const dc of deck.cards || []) {
        usedInOtherDecks.set(
          dc.cardId,
          (usedInOtherDecks.get(dc.cardId) || 0) + 1,
        );
      }
    }

    // 4) Somar uso no deck que está sendo salvo agora
    const usedInNewDeck = new Map<string, number>();
    for (const rawId of newDeckCardIds) {
      const trimmed = rawId.trim();
      if (!trimmed) continue;
      usedInNewDeck.set(trimmed, (usedInNewDeck.get(trimmed) || 0) + 1);
    }

    // 5) Converter idCarta para UUID quando necessário, para bater com userCards.cardId
    // (aqui usamos o mesmo mapeamento que já existe mais abaixo em saveCurrentDeck)
    const allIds = Array.from(
      new Set<string>([
        ...Array.from(usedInOtherDecks.keys()),
        ...Array.from(usedInNewDeck.keys()),
      ]),
    );
    if (allIds.length === 0) {
      return;
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const potentialUuids: string[] = [];
    const idCartas: string[] = [];

    for (const id of allIds) {
      if (uuidRegex.test(id)) {
        potentialUuids.push(id);
      } else {
        idCartas.push(id);
      }
    }

    const idMap = new Map<string, string>(); // input -> UUID

    if (potentialUuids.length > 0) {
      const cardsById = await this.cardsRepository.find({
        where: { id: In(potentialUuids) },
        select: ['id'],
      });
      for (const c of cardsById) {
        idMap.set(c.id, c.id);
      }
    }

    if (idCartas.length > 0) {
      const cardsByIdCarta = await this.cardsRepository.find({
        where: { idCarta: In(idCartas) },
        select: ['id', 'idCarta'],
      });
      for (const c of cardsByIdCarta) {
        if (c.idCarta) {
          idMap.set(c.idCarta, c.id);
        }
      }
    }

    // 6) Para cada carta usada no novo deck, verificar se uso total <= quantidade possuída
    const errors: string[] = [];

    for (const [inputId, countInNew] of usedInNewDeck.entries()) {
      // Pular se o ID estiver vazio
      if (!inputId || inputId.trim() === '') {
        continue;
      }
      
      const uuid = idMap.get(inputId) || inputId;
      const owned = ownedMap.get(uuid) || 0;
      const usedOther = usedInOtherDecks.get(uuid) || 0;
      const totalUsed = usedOther + countInNew;

      if (totalUsed > owned) {
        const missing = totalUsed - owned;
        errors.push(
          `Carta ${inputId} está sendo usada em ${totalUsed} cópias, ` +
          `mas você só possui ${owned}. Remova pelo menos ${missing} cópia(s) deste ou de outros decks.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(
        'Você está usando mais cópias de algumas cartas do que possui:\n' +
          errors.slice(0, 5).join('\n'),
      );
    }
  }

  async getCurrentDeck(userId: number, deckName: string = 'Meu Deck'): Promise<Deck | null> {
    const startTime = Date.now();
    try {
      // Limpar espaços no início e fim do nome do deck
      const cleanDeckName = deckName?.trim() || 'Meu Deck';
      logger.debug('🔍 [getCurrentDeck] Buscando deck para usuário:', userId, 'nome:', cleanDeckName);
      
      // Buscar deck usando findOne com relations e select explícito para garantir isExtraDeck
      let deck = await this.decksRepository.findOne({
        where: { userId, name: cleanDeckName },
        relations: ['cards', 'cards.card'],
        select: {
          id: true,
          name: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
          cards: {
            id: true,
            deckId: true,
            cardId: true,
            isExtraDeck: true, // CRÍTICO: garantir que isExtraDeck seja selecionado
            card: {
              id: true,
              idCarta: true,
              name: true,
              type: true,
              monsterType: true,
              attribute: true, // CRÍTICO: atributo necessário para efeitos de cartas
              race: true, // CRÍTICO: raça necessária para efeitos de cartas
              cardImage: true,
              description: true,
              atk: true,
              def: true,
              level: true,
              rarity: true,
            },
          },
        },
      });
      
      // Se não encontrou, tentar busca case-insensitive (apenas se necessário)
      if (!deck) {
        logger.debug('⚠️ [getCurrentDeck] Deck não encontrado, tentando busca alternativa...');
        const allDecks = await this.decksRepository.find({
          where: { userId },
          select: ['id', 'name'],
        });
        
        const caseInsensitiveDeck = allDecks.find(d => 
          d.name.toLowerCase().trim() === cleanDeckName.toLowerCase().trim()
        );
        
        if (caseInsensitiveDeck) {
          deck = await this.decksRepository.findOne({
            where: { id: caseInsensitiveDeck.id },
            relations: ['cards', 'cards.card'],
            select: {
              id: true,
              name: true,
              userId: true,
              createdAt: true,
              updatedAt: true,
              cards: {
                id: true,
                deckId: true,
                cardId: true,
                isExtraDeck: true, // CRÍTICO: garantir que isExtraDeck seja selecionado
                card: {
                  id: true,
                  idCarta: true,
                  name: true,
                  type: true,
                  monsterType: true,
                  cardImage: true,
                  description: true,
                  atk: true,
                  def: true,
                  level: true,
                  rarity: true,
                },
              },
            },
          });
        }
      }
      
      // Se não trouxe cartas, buscar diretamente (fallback)
      if (deck && (!deck.cards || deck.cards.length === 0)) {
        logger.debug('⚠️ [getCurrentDeck] QueryBuilder não trouxe cartas, buscando diretamente...');
        const directCards = await this.deckCardsRepository.find({
          where: { deckId: deck.id },
          relations: ['card'],
          select: {
            id: true,
            deckId: true,
            cardId: true,
            isExtraDeck: true,
            card: {
              id: true,
              idCarta: true,
              name: true,
              type: true,
              monsterType: true,
              attribute: true, // CRÍTICO: atributo necessário para efeitos de cartas
              race: true, // CRÍTICO: raça necessária para efeitos de cartas
              cardImage: true,
              description: true,
              atk: true,
              def: true,
              level: true,
              rarity: true,
            },
          },
        });
        deck.cards = directCards;
      }

      // Debug: Verificar se isExtraDeck está presente nas cartas
      if (deck && deck.cards && deck.cards.length > 0) {
        const sampleCard = deck.cards[0];
        logger.info(`🔍 [getCurrentDeck] Exemplo de carta retornada:`, {
          hasIsExtraDeck: 'isExtraDeck' in sampleCard,
          isExtraDeck: sampleCard.isExtraDeck,
          isExtraDeckType: typeof sampleCard.isExtraDeck,
          cardKeys: Object.keys(sampleCard),
          fullCard: JSON.stringify(sampleCard).substring(0, 300),
        });
        
        // Contar quantas cartas têm isExtraDeck = true
        const extraDeckCount = deck.cards.filter((c: any) => c.isExtraDeck === true).length;
        logger.info(`🔍 [getCurrentDeck] Cartas com isExtraDeck=true: ${extraDeckCount} de ${deck.cards.length}`);
        
        // Log detalhado de todas as cartas do Extra Deck
        const extraDeckCards = deck.cards.filter((c: any) => c.isExtraDeck === true);
        if (extraDeckCards.length > 0) {
          logger.info(`✅ [getCurrentDeck] Cartas do Extra Deck encontradas:`, extraDeckCards.map((c: any) => ({
            id: c.id,
            cardId: c.cardId,
            isExtraDeck: c.isExtraDeck,
            cardName: c.card?.name,
          })));
        } else {
          logger.warn(`⚠️ [getCurrentDeck] NENHUMA carta do Extra Deck encontrada! Verificando todas as cartas...`);
          deck.cards.forEach((c: any, index: number) => {
            logger.warn(`  Carta ${index}: isExtraDeck=${c.isExtraDeck} (tipo: ${typeof c.isExtraDeck}), cardId=${c.cardId}, name=${c.card?.name}`);
          });
        }
      }
      
      const duration = Date.now() - startTime;
      logger.perf(`getCurrentDeck (userId: ${userId})`, duration);
      
      return deck;
    } catch (error: any) {
      logger.error('❌ [getCurrentDeck] Erro ao buscar deck:', error);
      return null;
    }
  }
}
