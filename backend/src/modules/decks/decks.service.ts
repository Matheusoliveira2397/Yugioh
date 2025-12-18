import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Deck } from './entities/deck.entity';
import { DeckCard } from './entities/deck-card.entity';
import { CreateDeckDto } from './dto/create-deck.dto';
import { Card } from '../cards/entities/card.entity';

@Injectable()
export class DecksService {
  constructor(
    @InjectRepository(Deck)
    private decksRepository: Repository<Deck>,
    @InjectRepository(DeckCard)
    private deckCardsRepository: Repository<DeckCard>,
    @InjectRepository(Card)
    private cardsRepository: Repository<Card>,
  ) {}

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

    await this.decksRepository.delete(id);
  }

  // ==================== SALVAR DECK ATUAL (DECK PRINCIPAL) ====================
  async saveCurrentDeck(userId: number, saveDeckDto: { cardIds: string[]; name?: string }): Promise<Deck> {
    console.log('💾 [saveCurrentDeck] ==========================================');
    console.log('💾 [saveCurrentDeck] Salvando deck atual para usuário:', userId);
    console.log('💾 [saveCurrentDeck] Cartas no deck:', saveDeckDto.cardIds.length);
    console.log('💾 [saveCurrentDeck] TODOS os cardIds recebidos:', saveDeckDto.cardIds);
    console.log('💾 [saveCurrentDeck] Primeiros 10 cardIds:', saveDeckDto.cardIds.slice(0, 10));
    console.log('💾 [saveCurrentDeck] Tipos dos cardIds:', saveDeckDto.cardIds.slice(0, 5).map(id => ({
      value: id,
      type: typeof id,
      length: id?.length,
      isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')
    })));
    
    // Validar tamanho do deck (0-60 cartas, permitir deck vazio)
    if (saveDeckDto.cardIds.length > 60) {
      throw new BadRequestException('Deck não pode ter mais de 60 cartas');
    }

    // Validar se há cardIds vazios ou inválidos
    const invalidCardIds = saveDeckDto.cardIds.filter(id => !id || id.trim() === '');
    if (invalidCardIds.length > 0) {
      console.error('❌ [saveCurrentDeck] CardIds inválidos encontrados:', invalidCardIds);
      throw new BadRequestException(`Encontrados ${invalidCardIds.length} cardIds inválidos`);
    }

    // Buscar ou criar deck principal (nome padrão: "Meu Deck")
    const deckName = saveDeckDto.name || 'Meu Deck';
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
      console.log('✅ [saveCurrentDeck] Novo deck criado:', deck.id);
    } else {
      console.log('🔄 [saveCurrentDeck] Atualizando deck existente:', deck.id);
    }

    // Remover todas as cartas antigas do deck
    const deleteResult = await this.deckCardsRepository.delete({ deckId: deck.id });
    console.log('🗑️ [saveCurrentDeck] Cartas antigas removidas:', deleteResult.affected || 0);

    // Adicionar novas cartas ao deck
    if (saveDeckDto.cardIds.length > 0) {
      console.log('📝 [saveCurrentDeck] Criando DeckCards para', saveDeckDto.cardIds.length, 'cartas...');
      
      // Converter cardIds para IDs (UUID) se necessário
      // O cardId pode ser id (UUID) ou idCarta, precisamos converter para id (UUID)
      const cardIdToUuidMap = new Map<string, string>();
      const uniqueCardIds = [...new Set(saveDeckDto.cardIds.filter(id => id && id.trim() !== ''))];
      
      console.log('🔍 [saveCurrentDeck] Convertendo', uniqueCardIds.length, 'cardIds únicos para UUIDs...');
      
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
        console.log('🔍 [saveCurrentDeck] Buscando', potentialUuids.length, 'cartas por UUID...');
        console.log('🔍 [saveCurrentDeck] UUIDs a buscar:', potentialUuids.slice(0, 5));
        const cardsById = await this.cardsRepository.find({
          where: { id: In(potentialUuids) },
          select: ['id', 'name', 'idCarta']
        });
        console.log('✅ [saveCurrentDeck] Encontradas', cardsById.length, 'cartas por UUID');
        if (cardsById.length > 0) {
          console.log('✅ [saveCurrentDeck] Primeiras cartas encontradas:', cardsById.slice(0, 3).map(c => ({
            id: c.id,
            idCarta: c.idCarta,
            name: c.name,
          })));
        }
        for (const card of cardsById) {
          cardIdToUuidMap.set(card.id, card.id);
        }
        // Verificar quais UUIDs não foram encontrados
        const foundUuids = new Set(cardsById.map(c => c.id));
        const missingUuids = potentialUuids.filter(uuid => !foundUuids.has(uuid));
        if (missingUuids.length > 0) {
          console.warn('⚠️ [saveCurrentDeck] UUIDs não encontrados:', missingUuids.slice(0, 5));
          console.warn('⚠️ [saveCurrentDeck] Isso pode causar erro de foreign key constraint!');
        }
      }
      
      // Buscar cartas por idCarta em batch
      if (idCartas.length > 0) {
        console.log('🔍 [saveCurrentDeck] Buscando', idCartas.length, 'cartas por idCarta...');
        const cardsByIdCarta = await this.cardsRepository.find({
          where: { idCarta: In(idCartas) },
          select: ['id', 'idCarta']
        });
        console.log('✅ [saveCurrentDeck] Encontradas', cardsByIdCarta.length, 'cartas por idCarta');
        for (const card of cardsByIdCarta) {
          cardIdToUuidMap.set(card.idCarta, card.id);
          console.log(`✅ [saveCurrentDeck] Mapeado idCarta "${card.idCarta}" -> UUID "${card.id}"`);
        }
        // Verificar quais idCartas não foram encontrados
        const foundIdCartas = new Set(cardsByIdCarta.map(c => c.idCarta));
        const missingIdCartas = idCartas.filter(idCarta => !foundIdCartas.has(idCarta));
        if (missingIdCartas.length > 0) {
          console.warn('⚠️ [saveCurrentDeck] idCartas não encontrados:', missingIdCartas.slice(0, 5));
        }
      }
      
      // Verificar se algum cardId não foi encontrado
      const missingCardIds: string[] = [];
      for (const cardIdInput of uniqueCardIds) {
        const trimmedCardId = cardIdInput.trim();
        if (!cardIdToUuidMap.has(trimmedCardId)) {
          console.error(`❌ [saveCurrentDeck] Carta não encontrada para cardId: "${trimmedCardId}"`);
          missingCardIds.push(trimmedCardId);
        }
      }
      
      if (missingCardIds.length > 0) {
        console.error(`❌ [saveCurrentDeck] ${missingCardIds.length} cartas não foram encontradas:`, missingCardIds);
        throw new BadRequestException(
          `Não foi possível encontrar ${missingCardIds.length} carta(s) no banco de dados. ` +
          `CardIds não encontrados: ${missingCardIds.slice(0, 5).join(', ')}${missingCardIds.length > 5 ? '...' : ''}`
        );
      }
      
      console.log('✅ [saveCurrentDeck] Conversão concluída. Mapeamento:', cardIdToUuidMap.size, 'de', uniqueCardIds.length, 'cartas');
      
      // Criar DeckCards para TODAS as cartas (incluindo duplicatas, pois o usuário pode ter múltiplas cópias)
      const deckCardsData = saveDeckDto.cardIds
        .filter(cardId => cardId && cardId.trim() !== '') // Filtrar apenas vazios
        .map((cardId, index) => {
          const trimmedCardId = cardId.trim();
          const uuid = cardIdToUuidMap.get(trimmedCardId);
          
          if (!uuid) {
            // Isso não deveria acontecer se a validação acima funcionou, mas vamos garantir
            throw new BadRequestException(
              `Erro interno: Não foi possível converter cardId "${trimmedCardId}" para UUID. ` +
              `Por favor, tente novamente ou entre em contato com o suporte.`
            );
          }
          
          if (index < 3) {
            console.log(`📝 [saveCurrentDeck] DeckCard ${index} preparado:`, {
              deckId: deck.id,
              cardId: uuid,
              originalCardId: trimmedCardId,
            });
          }
          return {
            deckId: deck.id,
            cardId: uuid, // Usar o UUID convertido
          };
        });
      
      console.log('📝 [saveCurrentDeck] Total de DeckCards preparados:', deckCardsData.length);

      console.log('💾 [saveCurrentDeck] Preparando para salvar', deckCardsData.length, 'DeckCards em lote...');
      console.log('💾 [saveCurrentDeck] Primeiros 3 DeckCards:', deckCardsData.slice(0, 3));
      console.log('💾 [saveCurrentDeck] Deck ID:', deck.id, '(tipo:', typeof deck.id, ')');

      try {
        console.log('🚀 [saveCurrentDeck] Iniciando inserção de', deckCardsData.length, 'cartas...');
        
        // Criar entidades DeckCard usando o método create (como no método create do deck)
        const deckCards = deckCardsData.map(item => 
          this.deckCardsRepository.create({
            deckId: item.deckId,
            cardId: item.cardId,
          })
        );
        
        console.log('📝 [saveCurrentDeck] DeckCards criados:', deckCards.length);
        console.log('📝 [saveCurrentDeck] Primeiros 3 DeckCards:', deckCards.slice(0, 3).map(dc => ({
          deckId: dc.deckId,
          cardId: dc.cardId,
        })));
        
        // Usar save() que é o método mais simples e confiável (como no método create)
        console.log('💾 [saveCurrentDeck] Salvando DeckCards usando repository.save()...');
        const savedDeckCards = await this.deckCardsRepository.save(deckCards);
        
        console.log('✅ [saveCurrentDeck] DeckCards salvos com sucesso!');
        console.log('✅ [saveCurrentDeck] Total de cartas salvas:', savedDeckCards.length);
        console.log('✅ [saveCurrentDeck] Primeiros 3 DeckCards salvos:', savedDeckCards.slice(0, 3).map(dc => ({
          id: dc.id,
          deckId: dc.deckId,
          cardId: dc.cardId,
        })));

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
        console.log('🔍 [saveCurrentDeck] Amostra de cartas salvas:', sampleSavedCards.map(dc => ({
          id: dc.id,
          deckId: dc.deckId,
          cardId: dc.cardId,
          hasCard: !!dc.card,
          cardName: dc.card?.name || 'N/A',
        })));

        if (verifyCount !== deckCardsData.length) {
          console.error('❌ [saveCurrentDeck] ERRO: Número de cartas salvas não corresponde!');
          console.error('❌ [saveCurrentDeck] Esperado:', deckCardsData.length, 'Encontrado:', verifyCount);
          throw new BadRequestException(
            `Erro ao salvar deck: Esperado ${deckCardsData.length} cartas, mas apenas ${verifyCount} foram salvas.`
          );
        } else {
          console.log('✅ [saveCurrentDeck] Todas as', verifyCount, 'cartas foram salvas corretamente!');
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

    console.log('🔍 [saveCurrentDeck] Buscando deck atualizado...');
    
    // Aguardar um pouco para garantir que a transação foi commitada
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // SEMPRE buscar diretamente do banco para garantir que temos todas as cartas
    const allDeckCards = await this.deckCardsRepository.find({
      where: { deckId: deck.id },
      relations: ['card'],
    });
    console.log('🔍 [saveCurrentDeck] Verificação direta do banco:', allDeckCards.length, 'DeckCards encontrados');
    
    if (allDeckCards.length > 0) {
      console.log('🔍 [saveCurrentDeck] Primeiras 3 cartas encontradas:', allDeckCards.slice(0, 3).map(dc => ({
        deckCardId: dc.id,
        cardId: dc.cardId,
        hasCard: !!dc.card,
        cardName: dc.card?.name || 'N/A',
        cardIdCarta: dc.card?.idCarta || 'N/A',
      })));
    }
    
    // Buscar o deck base
    let updatedDeck = await this.decksRepository.findOne({
      where: { id: deck.id },
    });
    
    if (!updatedDeck) {
      throw new NotFoundException('Deck não encontrado após salvar');
    }
    
    // SEMPRE atribuir as cartas encontradas diretamente do banco
    updatedDeck.cards = allDeckCards;
    
    console.log('✅ [saveCurrentDeck] Deck atualizado com', updatedDeck.cards.length, 'cartas');
    
    // Log detalhado das cartas finais
    if (updatedDeck.cards.length > 0) {
      console.log('✅ [saveCurrentDeck] Cartas finais no deck:');
      updatedDeck.cards.forEach((dc, index) => {
        if (index < 5) {
          console.log(`  ${index + 1}. DeckCard ID: ${dc.id}, CardId: ${dc.cardId}, Card: ${dc.card?.name || 'N/A'}`);
        }
      });
      if (updatedDeck.cards.length > 5) {
        console.log(`  ... e mais ${updatedDeck.cards.length - 5} cartas`);
      }
    } else {
      console.warn('⚠️ [saveCurrentDeck] ATENÇÃO: Deck retornado SEM CARTAS!');
    }
    
    // Verificação final antes de retornar
    const finalCheck = await this.deckCardsRepository.count({
      where: { deckId: deck.id },
    });
    console.log('🔍 [saveCurrentDeck] Verificação final no banco:', finalCheck, 'cartas');
    console.log('🔍 [saveCurrentDeck] Cartas no objeto deck:', updatedDeck.cards.length);
    
    if (finalCheck !== updatedDeck.cards.length) {
      console.error('❌ [saveCurrentDeck] ERRO: Discrepância entre banco e objeto!');
      console.error('❌ [saveCurrentDeck] Banco:', finalCheck, 'Objeto:', updatedDeck.cards.length);
      // Recarregar as cartas novamente
      updatedDeck.cards = await this.deckCardsRepository.find({
        where: { deckId: deck.id },
        relations: ['card'],
      });
      console.log('✅ [saveCurrentDeck] Cartas recarregadas:', updatedDeck.cards.length);
    }
    
    // Garantir que cards seja um array válido
    if (!Array.isArray(updatedDeck.cards)) {
      console.error('❌ [saveCurrentDeck] ERRO: cards não é um array!', typeof updatedDeck.cards);
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
    
    console.log('💾 [saveCurrentDeck] ==========================================');
    console.log('💾 [saveCurrentDeck] Retornando deck serializado com', deckToReturn.cards.length, 'cartas');
    console.log('💾 [saveCurrentDeck] Estrutura do retorno:', {
      id: deckToReturn.id,
      name: deckToReturn.name,
      cardsCount: deckToReturn.cards.length,
      firstCard: deckToReturn.cards[0] || null,
    });
    
    return deckToReturn as Deck;
  }

  async getCurrentDeck(userId: number, deckName: string = 'Meu Deck'): Promise<Deck | null> {
    try {
      console.log('🔍 [getCurrentDeck] Buscando deck para usuário:', userId, 'nome:', deckName);
      
      // Método 1: Tentar com QueryBuilder
      let deck = await this.decksRepository
        .createQueryBuilder('deck')
        .leftJoinAndSelect('deck.cards', 'deckCard')
        .leftJoinAndSelect('deckCard.card', 'card')
        .where('deck.userId = :userId', { userId })
        .andWhere('deck.name = :deckName', { deckName })
        .getOne();
      
      console.log('🔍 [getCurrentDeck] QueryBuilder retornou deck:', {
        hasDeck: !!deck,
        deckId: deck?.id,
        cardsCount: deck?.cards?.length || 0,
      });
      
      if (deck) {
        // Se não trouxe cartas, buscar diretamente
        if (!deck.cards || deck.cards.length === 0) {
          console.warn('⚠️ [getCurrentDeck] QueryBuilder não trouxe cartas, buscando diretamente...');
          const directCards = await this.deckCardsRepository.find({
            where: { deckId: deck.id },
            relations: ['card'],
          });
          console.log('🔍 [getCurrentDeck] Cartas encontradas diretamente:', directCards.length);
          deck.cards = directCards;
        } else {
          console.log('✅ [getCurrentDeck] Cartas carregadas via QueryBuilder:', deck.cards.length);
        }
        
        // Log das primeiras cartas
        if (deck.cards && deck.cards.length > 0) {
          console.log('🔍 [getCurrentDeck] Primeiras 3 cartas:', deck.cards.slice(0, 3).map(dc => ({
            deckCardId: dc.id,
            cardId: dc.cardId,
            hasCard: !!dc.card,
            cardName: dc.card?.name || 'N/A',
          })));
        }
      } else {
        console.log('⚠️ [getCurrentDeck] Deck não encontrado');
      }

      return deck;
    } catch (error: any) {
      console.error('❌ [getCurrentDeck] Erro ao buscar deck:', error);
      console.error('❌ [getCurrentDeck] Mensagem:', error.message);
      return null;
    }
  }
}
