import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Card } from './entities/card.entity';
import { ShopService } from '../shop/shop.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { AddEffectDto } from './dto/add-effect.dto';

@Injectable()
export class CardsService {
  // Cache simples em memória para cartas da loja
  private shopCardsCache: { data: Card[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60000; // 1 minuto

  constructor(
    @InjectRepository(Card)
    private cardsRepository: Repository<Card>,
    @Inject(forwardRef(() => ShopService))
    private shopService: ShopService,
  ) {}

  async findAll(search?: string, type?: string): Promise<Card[]> {
    const where: any = { isActive: true };
    
    if (search) {
      where.name = Like(`%${search}%`);
    }
    
    if (type) {
      where.type = type;
    }

    return this.cardsRepository.find({
      where,
      order: { name: 'ASC' },
      take: 500,
    });
  }

  async findOne(id: string): Promise<Card> {
    // Verificar se é UUID (formato UUID tem 36 caracteres com hífens)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let card: Card | null = null;
    
    if (isUUID) {
      // Se for UUID, buscar por id
      card = await this.cardsRepository.findOne({ where: { id } });
    } else {
      // Se não for UUID, buscar por idCarta
      card = await this.cardsRepository.findOne({ 
        where: { idCarta: id }
      });
    }
    
    // Se não encontrar, tentar a outra opção com query builder (faz cast correto)
    if (!card) {
      try {
        card = await this.cardsRepository
          .createQueryBuilder('card')
          .where('card.idCarta = :id', { id })
          .orWhere('card.id::text = :id', { id }) // Cast UUID para text
          .getOne();
      } catch (error) {
        // Se falhar, tentar buscar por idCarta
        card = await this.cardsRepository.findOne({ 
          where: { idCarta: id }
        });
      }
    }
    
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  async findByIdCarta(idCarta: string): Promise<Card> {
    const card = await this.cardsRepository.findOne({ 
      where: { idCarta }
    });
    
    if (!card) {
      throw new NotFoundException(`Card with idCarta "${idCarta}" not found`);
    }
    return card;
  }

  /**
   * Busca todas as skins de uma carta pelo nome (compartilham o mesmo efeito)
   */
  async findSkinsByName(name: string): Promise<Card[]> {
    return this.cardsRepository.find({
      where: { name },
      order: { 
        createdAt: 'ASC' 
      },
    });
  }

  // Lista de campos permitidos na entidade Card (usada em múltiplos lugares)
  private readonly ALLOWED_FIELDS = [
    'idCarta', 'name', 'description', 'cardImage', 'type', 'monsterType',
    'attribute', 'race', 'spellType', 'trapType', 'archetype', 'level',
    'rank', 'atk', 'def', 'rarity', 'isActive', 'isBanned', 'maxCopiesInDeck',
    'priceCredits', 'priceCash', 'isForSale'
  ];
  
  // Lista de campos que foram removidos e devem ser ignorados
  private readonly REMOVED_FIELDS = [
    'nameEn', 'linkRating', 'pendulumScale', 'effect', 'isLimited', 'konamiId',
    'pendulumEffect', 'priceCoins' // Campos removidos
  ];

  // Função para limpar dados removendo campos que não existem mais
  private cleanCardData(cardData: any): Partial<Card> {
    const cleaned: any = {};
    
    // Primeiro, remover explicitamente os campos removidos
    const foundRemovedFields = [];
    for (const key of this.REMOVED_FIELDS) {
      if (cardData.hasOwnProperty(key)) {
        console.log(`⚠️ Campo removido detectado e ignorado: ${key}`);
        foundRemovedFields.push(key);
      }
    }
    
    // Depois, adicionar apenas os campos permitidos
    for (const key of this.ALLOWED_FIELDS) {
      if (cardData[key] !== undefined && cardData[key] !== null) {
        // CRÍTICO: Se for cardImage e for base64, NÃO incluir
        if (key === 'cardImage' && typeof cardData[key] === 'string' && cardData[key].startsWith('data:image')) {
          console.warn(`⚠️ Base64 detectado em cardImage. Removendo. Use upload de arquivo.`);
          continue; // Não incluir base64
        }
        cleaned[key] = cardData[key];
      }
    }
    
    if (foundRemovedFields.length > 0) {
      console.log('🧹 Campos removidos do objeto:', foundRemovedFields);
    }
    
    return cleaned;
  }

  async create(cardData: Partial<Card>): Promise<Card> {
    console.log('📝 Criando carta com dados:', JSON.stringify(cardData, null, 2));
    console.log('🆔 idCarta recebido:', cardData.idCarta);
    
    // Limpar dados removendo campos que não existem mais
    const cleanedData = this.cleanCardData(cardData);
    console.log('🧹 Dados limpos:', JSON.stringify(cleanedData, null, 2));
    
    if (!cleanedData.name) {
      throw new BadRequestException('Nome da carta é obrigatório');
    }
    
    if (!cleanedData.idCarta || cleanedData.idCarta.trim() === '') {
      throw new BadRequestException('ID da carta (idCarta) é obrigatório');
    }

    // Verificar se idCarta já existe (deve ser único)
    const existingCard = await this.cardsRepository.findOne({
      where: { 
        idCarta: cleanedData.idCarta.trim()
      }
    });
    
    if (existingCard) {
      throw new BadRequestException(`Carta com idCarta "${cleanedData.idCarta}" já existe. Use outro idCarta.`);
    }

    // Criar a carta manualmente com apenas os campos permitidos
    // Isso garante que nenhum campo extra seja incluído
    const cardToSave: any = {};
    const cleanedDataAny = cleanedData as any; // Cast para permitir indexação por string
    for (const key of this.ALLOWED_FIELDS) {
      if (cleanedDataAny[key] !== undefined && cleanedDataAny[key] !== null) {
        if (key === 'idCarta' || key === 'name') {
          cardToSave[key] = cleanedDataAny[key].trim();
        } else {
          cardToSave[key] = cleanedDataAny[key];
        }
      }
    }
    
    // REMOVER EXPLICITAMENTE todos os campos proibidos do objeto final
    for (const field of this.REMOVED_FIELDS) {
      if (cardToSave.hasOwnProperty(field)) {
        delete cardToSave[field];
        console.log(`🗑️ Campo removido explicitamente: ${field}`);
      }
    }
    
    // Verificar se há campos proibidos no objeto ANTES de tentar salvar
    const allKeys = Object.keys(cardToSave);
    const prohibitedFields = allKeys.filter(key => this.REMOVED_FIELDS.includes(key));
    if (prohibitedFields.length > 0) {
      console.error('❌ Campos proibidos detectados no objeto final:', prohibitedFields);
      throw new BadRequestException(`Campos proibidos detectados: ${prohibitedFields.join(', ')}`);
    }
    
    // Verificar se há campos que não estão na lista permitida
    const unknownFields = allKeys.filter(key => !this.ALLOWED_FIELDS.includes(key) && key !== 'id');
    if (unknownFields.length > 0) {
      console.error('❌ Campos desconhecidos detectados:', unknownFields);
      // Remover campos desconhecidos
      for (const field of unknownFields) {
        delete cardToSave[field];
        console.log(`🗑️ Campo desconhecido removido: ${field}`);
      }
    }
    
    console.log('📋 Campos que serão salvos:', Object.keys(cardToSave));
    console.log('📋 Valores que serão salvos:', JSON.stringify(cardToSave, null, 2));
    
    // Usar insert diretamente para ter controle total sobre quais campos são salvos
    // Isso evita que o TypeORM tente salvar campos que não existem na entidade
    try {
      // Construir a query SQL manualmente para garantir que apenas campos válidos sejam inseridos
      const columns = Object.keys(cardToSave);
      const values = columns.map(col => cardToSave[col]);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      const columnNames = columns.map(col => `"${col}"`).join(', ');
      
      const query = `INSERT INTO cards (${columnNames}) VALUES (${placeholders})`;
      
      console.log('🔍 Query SQL:', query);
      console.log('🔍 Valores:', values);
      
      const result = await this.cardsRepository.manager.query(query, values);
      
      // Buscar a carta criada usando o idCarta (mais confiável)
      const savedCard = await this.cardsRepository.findOne({
        where: { idCarta: cardToSave.idCarta }
      });
      
      if (!savedCard) {
        throw new BadRequestException('Erro ao criar carta - carta não encontrada após inserção');
      }
      
      console.log('✅ Carta inserida com sucesso usando SQL direto');
      
      console.log('✅ Carta criada com sucesso!');
      console.log('🆔 UUID interno:', savedCard.id);
      console.log('🆔 idCarta (identificador principal):', savedCard.idCarta);
      
      // Se isForSale = true, adiciona automaticamente à loja
      if (savedCard.isForSale) {
        try {
          await this.shopService.addCardToShop(savedCard);
          console.log('🛒 Carta adicionada à loja automaticamente');
        } catch (error) {
          console.error('❌ Erro ao adicionar carta à loja:', error.message);
        }
      }
      
      // Invalidar cache da loja
      this.invalidateShopCache();
      
      return savedCard;
    } catch (error: any) {
      console.error('❌ Erro ao inserir carta no banco:', error);
      console.error('❌ Stack:', error.stack);
      if (error.message && error.message.includes('nameEn')) {
        throw new BadRequestException('Erro: Campo nameEn foi detectado. O frontend pode estar enviando campos removidos. Verifique os logs do servidor.');
      }
      throw error;
    }
  }

  async update(id: string, cardData: Partial<Card>): Promise<Card> {
    try {
      console.log('📝 [CardsService] Iniciando atualização da carta:', id);
      
      // Buscar a carta
      let card: Card;
      try {
        card = await this.findOne(id);
        if (!card) {
          throw new NotFoundException(`Carta com ID ${id} não encontrada`);
        }
        console.log('✅ [CardsService] Carta encontrada:', card.name);
      } catch (error) {
        console.error('❌ [CardsService] Erro ao buscar carta:', error);
        throw error;
      }
      
      const wasForSale = card.isForSale;
      
      console.log('📝 [CardsService] Atualizando carta:', id);
      console.log('🆔 [CardsService] idCarta recebido para atualização:', cardData.idCarta);
      
      // Log dos dados sem cardImage completo (pode ser muito grande)
      const logData = { ...cardData };
      if ((logData as any).cardImage && typeof (logData as any).cardImage === 'string') {
        const imgLength = (logData as any).cardImage.length;
        (logData as any).cardImage = `[Base64 Image - ${imgLength} chars]`;
      }
      console.log('📦 [CardsService] Dados recebidos:', JSON.stringify(logData, null, 2));
      
      // CRÍTICO: NUNCA salvar base64 no banco - apenas URLs
      // Se receber base64, rejeitar e pedir para usar upload de arquivo
      if (cardData.cardImage && typeof cardData.cardImage === 'string') {
        if (cardData.cardImage.startsWith('data:image')) {
          console.warn(`⚠️ [CardsService] Base64 detectado em cardImage ao criar carta. Rejeitando. Use upload de arquivo.`);
          // Remover base64 e não salvar
          delete cardData.cardImage;
          console.log('✅ [CardsService] Base64 removido. Use o endpoint /cards/upload-image para fazer upload.');
        }
      }

      // CRÍTICO: NUNCA salvar base64 no banco - apenas URLs
      // Se receber base64, rejeitar e pedir para usar upload de arquivo
      if (cardData.cardImage && typeof cardData.cardImage === 'string') {
        if (cardData.cardImage.startsWith('data:image')) {
          console.warn(`⚠️ [CardsService] Base64 detectado em cardImage ao atualizar carta. Rejeitando. Use upload de arquivo.`);
          // Remover base64 e não salvar
          delete cardData.cardImage;
          console.log('✅ [CardsService] Base64 removido. Use o endpoint /cards/upload-image para fazer upload.');
        }
      }

      // Limpar dados removendo campos que não existem mais
      let cleanedData: any;
      try {
        cleanedData = this.cleanCardData(cardData);
        console.log('🧹 [CardsService] Dados limpos:', JSON.stringify(cleanedData, null, 2));
      } catch (error) {
        console.error('❌ [CardsService] Erro ao limpar dados:', error);
        throw new BadRequestException(`Erro ao processar dados: ${error.message}`);
      }
      
      // Filtrar campos undefined e null para evitar problemas
      const cleanData: any = {};
      try {
        for (const [key, value] of Object.entries(cleanedData)) {
          if (value !== undefined && value !== null) {
            // Se for idCarta, validar que não está vazio
            if (key === 'idCarta') {
              if (typeof value === 'string' && value.trim() === '') {
                throw new BadRequestException('ID da carta (idCarta) não pode estar vazio');
              }
              cleanData[key] = value;
            } else {
              cleanData[key] = value;
            }
          }
        }
      } catch (error) {
        console.error('❌ [CardsService] Erro ao filtrar dados:', error);
        throw error;
      }
      
      // Se idCarta está sendo atualizado, garantir que não está vazio e é único
      if ('idCarta' in cleanData) {
        try {
          if (!cleanData.idCarta || cleanData.idCarta.trim() === '') {
            throw new BadRequestException('ID da carta (idCarta) é obrigatório e não pode estar vazio');
          }
          
          // Verificar se o novo idCarta já existe em outra carta
          const existingCard = await this.cardsRepository.findOne({
            where: { 
              idCarta: cleanData.idCarta.trim()
            }
          });
          
          if (existingCard && existingCard.id !== id) {
            throw new BadRequestException(`Carta com idCarta "${cleanData.idCarta}" já existe. Use outro idCarta.`);
          }
          
          cleanData.idCarta = cleanData.idCarta.trim();
        } catch (error) {
          console.error('❌ [CardsService] Erro ao validar idCarta:', error);
          throw error;
        }
      }
      
      // Log dos dados sem cardImage completo
      const logCleanData = { ...cleanData };
      if ((logCleanData as any).cardImage && typeof (logCleanData as any).cardImage === 'string') {
        const imgLength = (logCleanData as any).cardImage.length;
        (logCleanData as any).cardImage = `[Base64 Image - ${imgLength} chars]`;
      }
      console.log('🧹 [CardsService] Dados finais para atualização:', JSON.stringify(logCleanData, null, 2));
      
      // Validar campos obrigatórios se estiverem sendo atualizados
      try {
        if ('idCarta' in cleanData && (!cleanData.idCarta || (typeof cleanData.idCarta === 'string' && cleanData.idCarta.trim() === ''))) {
          throw new BadRequestException('ID da carta (idCarta) é obrigatório e não pode estar vazio');
        }
        if ('name' in cleanData && (!cleanData.name || (typeof cleanData.name === 'string' && cleanData.name.trim() === ''))) {
          throw new BadRequestException('Nome da carta é obrigatório e não pode estar vazio');
        }
        if ('type' in cleanData && !cleanData.type) {
          throw new BadRequestException('Tipo da carta é obrigatório');
        }
        if ('rarity' in cleanData && !cleanData.rarity) {
          throw new BadRequestException('Raridade da carta é obrigatória');
        }
      } catch (error) {
        console.error('❌ [CardsService] Erro ao validar campos obrigatórios:', error);
        throw error;
      }
      
      // Salvar no banco de dados
      let updatedCard: Card;
      try {
        // Preparar dados para salvar, garantindo tipos corretos
        const updateData: any = { ...cleanData };
        
        // Garantir que valores numéricos são números ou null
        if (updateData.level !== undefined && updateData.level !== null) {
          updateData.level = parseInt(String(updateData.level));
        }
        if (updateData.rank !== undefined && updateData.rank !== null) {
          updateData.rank = parseInt(String(updateData.rank));
        }
        if (updateData.atk !== undefined && updateData.atk !== null) {
          updateData.atk = parseInt(String(updateData.atk));
        }
        if (updateData.def !== undefined && updateData.def !== null) {
          updateData.def = parseInt(String(updateData.def));
        }
        if (updateData.maxCopiesInDeck !== undefined && updateData.maxCopiesInDeck !== null) {
          updateData.maxCopiesInDeck = parseInt(String(updateData.maxCopiesInDeck));
        }
        if (updateData.priceCredits !== undefined && updateData.priceCredits !== null) {
          updateData.priceCredits = parseInt(String(updateData.priceCredits));
        }
        
        // Garantir que priceCash é número ou null
        if (updateData.priceCash !== undefined && updateData.priceCash !== null) {
          updateData.priceCash = parseFloat(String(updateData.priceCash));
        }
        
        // CRÍTICO: NUNCA salvar base64 no banco - apenas URLs
        // Se receber base64, rejeitar e pedir para usar upload de arquivo
        if (updateData.cardImage && typeof updateData.cardImage === 'string') {
          if (updateData.cardImage.startsWith('data:image')) {
            console.warn(`⚠️ [CardsService] Base64 detectado em cardImage ao atualizar. Rejeitando. Use upload de arquivo.`);
            // Remover base64 e não salvar
            delete updateData.cardImage;
            console.log('✅ [CardsService] Base64 removido. Use o endpoint /cards/upload-image para fazer upload.');
          }
        }

        // Log dos dados sem cardImage completo
        const logUpdateData = { ...updateData };
        if ((logUpdateData as any).cardImage && typeof (logUpdateData as any).cardImage === 'string') {
          const imgLength = (logUpdateData as any).cardImage.length;
          (logUpdateData as any).cardImage = `[URL Image - ${imgLength} chars]`;
        }
        console.log('💾 [CardsService] Dados para atualização no banco:', JSON.stringify(logUpdateData, null, 2));
        
        // Atualizar usando update do repositório (mais seguro para atualizações parciais)
        console.log('🔄 [CardsService] Executando update no banco...');
        const updateResult = await this.cardsRepository.update(id, updateData);
        console.log('📊 [CardsService] Resultado do update:', updateResult);
        
        // Buscar a carta atualizada
        console.log('🔍 [CardsService] Buscando carta atualizada...');
        updatedCard = await this.findOne(id);
        
        if (!updatedCard) {
          throw new NotFoundException('Carta não encontrada após atualização');
        }
        
        console.log('✅ [CardsService] Carta atualizada no banco com sucesso');
        console.log('🆔 [CardsService] idCarta salvo no banco:', updatedCard.idCarta);
      } catch (error: any) {
        console.error('❌ [CardsService] Erro ao salvar no banco de dados:', error);
        console.error('❌ [CardsService] Tipo do erro:', error.constructor.name);
        console.error('❌ [CardsService] Código do erro:', error.code);
        console.error('❌ [CardsService] Mensagem:', error.message);
        console.error('❌ [CardsService] Stack trace:', error.stack);
        console.error('❌ [CardsService] Dados que tentaram ser salvos:', JSON.stringify(cleanData, null, 2));
        
        // Verificar se é erro de constraint única (idCarta duplicado)
        if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('UNIQUE constraint')) {
          const idCarta = cleanData.idCarta || card.idCarta;
          throw new BadRequestException(`Carta com idCarta "${idCarta}" já existe. Use outro idCarta.`);
        }
        
        // Verificar se é erro de constraint de foreign key
        if (error.code === '23503' || error.message?.includes('foreign key')) {
          throw new BadRequestException(`Erro de referência: ${error.message}`);
        }
        
        // Verificar se é erro de tipo de dado
        if (error.code === '22P02' || error.message?.includes('invalid input syntax')) {
          throw new BadRequestException(`Erro de tipo de dado: ${error.message}`);
        }
        
        throw new BadRequestException(`Erro ao salvar no banco de dados: ${error.message || 'Erro desconhecido'}`);
      }
    
      // Atualizar na loja (não deve quebrar se falhar)
      try {
        // Se mudou de não-venda para venda, adicionar à loja
        if (!wasForSale && updatedCard.isForSale) {
          try {
            await this.shopService.addCardToShop(updatedCard);
            console.log('🛒 [CardsService] Carta adicionada à loja');
          } catch (error) {
            console.error('⚠️ [CardsService] Erro ao adicionar carta à loja (não crítico):', error.message);
          }
        }
        
        // Se mudou de venda para não-venda, remover da loja
        if (wasForSale && !updatedCard.isForSale) {
          try {
            await this.shopService.removeCardFromShop(id);
            console.log('🗑️ [CardsService] Carta removida da loja');
          } catch (error) {
            console.error('⚠️ [CardsService] Erro ao remover carta da loja (não crítico):', error.message);
          }
        }
        
        // Se ainda está à venda, atualizar na loja
        if (wasForSale && updatedCard.isForSale) {
          try {
            await this.shopService.updateCardInShop(updatedCard);
            console.log('🔄 [CardsService] Carta atualizada na loja');
          } catch (error) {
            console.error('⚠️ [CardsService] Erro ao atualizar carta na loja (não crítico):', error.message);
          }
        }
           } catch (error) {
             console.error('⚠️ [CardsService] Erro ao atualizar loja (não crítico, continuando):', error.message);
           }

           // Invalidar cache da loja
           this.invalidateShopCache();

           return updatedCard;
    } catch (error) {
      console.error('❌ [CardsService] Erro completo ao atualizar carta:', error);
      console.error('❌ [CardsService] Tipo do erro:', error.constructor.name);
      console.error('❌ [CardsService] Mensagem:', error.message);
      console.error('❌ [CardsService] Stack:', error.stack);
      
      // Se já é uma exceção HTTP, apenas relançar
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      // Caso contrário, lançar como erro interno
      throw new BadRequestException(`Erro ao atualizar carta: ${error.message || 'Erro desconhecido'}`);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const card = await this.findOne(id);
      card.isActive = false;
      await this.cardsRepository.save(card);
      
      // Remover da loja também
      try {
        await this.shopService.removeCardFromShop(id);
        console.log('🗑️ Carta removida da loja');
      } catch (error) {
        console.error('❌ Erro ao remover carta da loja:', error.message);
      }
      
      // Invalidar cache da loja
      this.invalidateShopCache();
    } catch (error) {
      console.error('❌ Erro ao desativar carta:', error);
      throw error;
    }
  }

  async hardDelete(id: string): Promise<void> {
    try {
      console.log(`🔍 Verificando se carta ${id} pode ser deletada...`);
      
      // Verificar se a carta está sendo usada em user_cards usando query raw
      const userCardsResult = await this.cardsRepository.manager.query(
        `SELECT COUNT(*) as count FROM user_cards WHERE "cardId" = $1`,
        [id]
      );
      
      console.log('📊 Resultado user_cards:', JSON.stringify(userCardsResult, null, 2));
      const userCardsCount = userCardsResult && userCardsResult[0] ? parseInt(String(userCardsResult[0].count), 10) : 0;
      console.log(`📊 Contagem user_cards: ${userCardsCount}`);
      
      // Remover todas as referências de user_cards antes de deletar
      if (userCardsCount > 0) {
        console.log(`🗑️ Removendo carta de ${userCardsCount} usuário(s)...`);
        await this.cardsRepository.manager.query(
          `DELETE FROM user_cards WHERE "cardId" = $1`,
          [id]
        );
        console.log(`✅ Carta removida de ${userCardsCount} usuário(s)`);
      }
      
      // Verificar se está em deck_cards também
      const deckCardsResult = await this.cardsRepository.manager.query(
        `SELECT COUNT(*) as count FROM deck_cards WHERE "cardId" = $1`,
        [id]
      );
      
      console.log('📊 Resultado deck_cards:', JSON.stringify(deckCardsResult, null, 2));
      const deckCardsCount = deckCardsResult && deckCardsResult[0] ? parseInt(String(deckCardsResult[0].count), 10) : 0;
      console.log(`📊 Contagem deck_cards: ${deckCardsCount}`);
      
      // Remover todas as referências de deck_cards antes de deletar
      if (deckCardsCount > 0) {
        console.log(`🗑️ Removendo carta de ${deckCardsCount} deck(s)...`);
        await this.cardsRepository.manager.query(
          `DELETE FROM deck_cards WHERE "cardId" = $1`,
          [id]
        );
        console.log(`✅ Carta removida de ${deckCardsCount} deck(s)`);
      }
      
      // Remover da loja antes de deletar
      try {
        await this.shopService.removeCardFromShop(id);
        console.log('✅ Carta removida da loja');
      } catch (error) {
        console.error('❌ Erro ao remover carta da loja:', error.message);
      }
      
      // Tentar deletar - se falhar por foreign key, capturar e retornar mensagem clara
      console.log(`🗑️ Tentando deletar carta ${id}...`);
      try {
        await this.cardsRepository.delete(id);
        console.log('✅ Carta deletada permanentemente');
      } catch (dbError: any) {
        console.error('❌ Erro ao deletar:', dbError.message);
        if (dbError.message && dbError.message.includes('foreign key constraint')) {
          // Se ainda assim falhar, significa que há outras referências
          throw new Error('Não é possível deletar permanentemente esta carta pois ela está sendo usada em outros registros. Use a opção de desativar ao invés de deletar.');
        }
        throw dbError;
      }
    } catch (error: any) {
      console.error('❌ Erro ao deletar permanentemente carta:', error);
      // Se for um erro que já tem mensagem, apenas relançar
      if (error.message && !error.message.includes('QueryFailedError')) {
        throw error;
      }
      // Caso contrário, criar um erro com mensagem clara
      throw new Error(error.message || 'Erro ao deletar carta permanentemente');
    }
  }

  async getAllAdmin(): Promise<Card[]> {
    // Para admin ver todas, incluindo inativas
    return this.cardsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getCardsForSale(): Promise<Card[]> {
    // Verificar cache
    const now = Date.now();
    if (this.shopCardsCache && (now - this.shopCardsCache.timestamp) < this.CACHE_TTL) {
      return this.shopCardsCache.data;
    }

    try {
      // Retorna apenas cartas ativas e à venda - otimizado para carregar apenas campos necessários com timeout
      const cards = await Promise.race([
        this.cardsRepository.find({
          where: { 
            isActive: true, 
            isForSale: true 
          },
          select: [
            'id',
            'idCarta',
            'name',
            'description',
            'cardImage',
            'type',
            'monsterType',
            'attribute',
            'race',
            'spellType',
            'trapType',
            'level',
            'atk',
            'def',
            'rarity',
            'priceCredits',
            'priceCash',
            'isForSale',
          ],
          order: { 
            rarity: 'DESC',
            createdAt: 'DESC' 
          },
          take: 1000, // Limitar a 1000 cartas para evitar sobrecarga
        }),
        new Promise<Card[]>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout: getCardsForSale')), 15000)
        )
      ]);

      // Atualizar cache
      this.shopCardsCache = { data: cards, timestamp: now };
      return cards;
    } catch (error) {
      console.error(`[getCardsForSale] Erro ou timeout:`, error);
      // Retornar cache antigo se disponível, senão array vazio
      if (this.shopCardsCache) {
        console.warn(`[getCardsForSale] Retornando cache antigo devido a erro`);
        return this.shopCardsCache.data;
      }
      return [];
    }
  }

  // Invalidar cache quando uma carta for atualizada
  invalidateShopCache() {
    this.shopCardsCache = null;
  }

  // ==================== BUSCAR CARTA POR NOME ====================
  async findByName(name: string): Promise<Card | null> {
    return this.cardsRepository.findOne({
      where: { name: Like(`%${name}%`) },
    });
  }

  async findByNameExact(name: string): Promise<Card | null> {
    return this.cardsRepository.findOne({
      where: { name },
    });
  }

  // ==================== ADICIONAR EFEITO À CARTA ====================
  async addEffectToCard(addEffectDto: AddEffectDto): Promise<Card> {
    // Buscar carta pelo nome
    const card = await this.findByNameExact(addEffectDto.cardName);
    
    if (!card) {
      throw new NotFoundException(`Carta "${addEffectDto.cardName}" não encontrada`);
    }

    // REMOVIDO: Campo effect foi removido do banco de dados
    throw new BadRequestException('Sistema de efeitos foi removido. Use a descrição da carta para descrever os efeitos.');
  }

  // ==================== REMOVER EFEITO DA CARTA ====================
  async removeEffectFromCard(cardName: string): Promise<Card> {
    const card = await this.findByNameExact(cardName);
    
    if (!card) {
      throw new NotFoundException(`Carta "${cardName}" não encontrada`);
    }

    // REMOVIDO: Campo effect foi removido do banco de dados
    throw new BadRequestException('Sistema de efeitos foi removido.');
  }

  // ==================== LISTAR CARTAS COM EFEITOS ====================
  async findCardsWithEffects(): Promise<Card[]> {
    // REMOVIDO: Campo effect foi removido do banco de dados
    return [];
  }

  // ==================== LISTAR CARTAS SEM EFEITOS ====================
  async findCardsWithoutEffects(): Promise<Card[]> {
    // REMOVIDO: Campo effect foi removido do banco de dados
    return this.findAll();
  }

  // ==================== BUSCAR CARTAS NA LOJA ====================
  async findCardsForSale(): Promise<Card[]> {
    return this.cardsRepository.find({
      where: { 
        isActive: true,
        isForSale: true,
      },
      order: { rarity: 'DESC', name: 'ASC' },
    });
  }

  // ==================== ÚLTIMAS CARTAS CADASTRADAS (TODAS, NÃO APENAS À VENDA) ====================
  async getLatestCards(limit: number = 10): Promise<Card[]> {
    return this.cardsRepository.find({
      where: { 
        isActive: true,
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ==================== TEMPLATES DE EFEITOS PRONTOS ====================
  getEffectTemplates() {
    return {
      // DRAW CARDS
      drawCards: {
        type: 'ignition',
        timing: ['main-phase'],
        action: 'draw',
        target: 'self',
        params: { amount: 2 },
        cost: { type: 'discard', amount: 1 },
      },

      // DESTROY CARD
      destroyCard: {
        type: 'ignition',
        timing: ['main-phase'],
        action: 'destroy',
        target: 'opponent',
        params: { cardType: 'monster' },
        cost: { type: 'tribute', amount: 1 },
      },

      // SPECIAL SUMMON
      specialSummon: {
        type: 'trigger',
        timing: ['summon'],
        action: 'special-summon',
        target: 'self',
        params: { from: 'hand', level: 4 },
        condition: 'when this card is normal summoned',
      },

      // GAIN LP
      gainLP: {
        type: 'continuous',
        action: 'gain-lp',
        target: 'self',
        params: { amount: 500 },
        timing: ['standby-phase'],
      },

      // NEGATE EFFECT
      negateEffect: {
        type: 'quick',
        timing: ['any'],
        action: 'negate',
        target: 'opponent',
        params: { effectType: 'spell-trap' },
        cost: { type: 'discard', amount: 1 },
      },

      // ADD TO HAND
      addToHand: {
        type: 'trigger',
        timing: ['flip', 'summon'],
        action: 'search',
        target: 'self',
        params: { from: 'deck', cardType: 'monster', attribute: 'DARK' },
      },

      // DIRECT ATTACK
      directAttack: {
        type: 'continuous',
        action: 'direct-attack',
        target: 'self',
        condition: 'this card can attack directly',
      },

      // BANISH CARD
      banishCard: {
        type: 'ignition',
        timing: ['main-phase'],
        action: 'banish',
        target: 'opponent',
        params: { from: 'graveyard', amount: 1 },
        cost: { type: 'pay-lp', amount: 1000 },
      },

      // EQUIP BOOST
      equipBoost: {
        type: 'continuous',
        action: 'atk-boost',
        target: 'self',
        params: { amount: 500 },
        condition: 'while this card is equipped',
      },

      // BURN DAMAGE
      burnDamage: {
        type: 'trigger',
        timing: ['end-phase'],
        action: 'burn',
        target: 'opponent',
        params: { amount: 1000 },
      },
    };
  }
}
