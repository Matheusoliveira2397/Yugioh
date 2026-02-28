import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Card } from './entities/card.entity';
import { ShopService } from '../shop/shop.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { AddEffectDto } from './dto/add-effect.dto';
import { YugiohApiService } from './services/yugioh-api.service';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class CardsService implements OnModuleInit {
  // Cache simples em memória para cartas da loja
  private shopCardsCache: { data: Card[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60000; // 1 minuto
  private renameImagesExecuted = false;

  constructor(
    @InjectRepository(Card)
    private cardsRepository: Repository<Card>,
    @Inject(forwardRef(() => ShopService))
    private shopService: ShopService,
    private yugiohApiService: YugiohApiService,
    private uploadService: UploadService,
  ) {}

  async onModuleInit() {
    // Executar renomeação de imagens automaticamente na inicialização
    // Apenas uma vez, com delay para garantir que o módulo está totalmente carregado
    setTimeout(async () => {
      if (!this.renameImagesExecuted) {
        this.renameImagesExecuted = true;
        console.log('🔄 [CardsService] Iniciando renomeação automática de imagens...');
        try {
          await this.renameAllCardImagesInternal(this.uploadService);
        } catch (error: any) {
          console.error('❌ [CardsService] Erro ao renomear imagens automaticamente:', error.message);
          console.error('❌ [CardsService] Stack:', error.stack);
        }
      }
    }, 10000); // Aguardar 10 segundos após inicialização
  }

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
      // cardImage deve ser incluído mesmo se for string vazia (para permitir limpar a imagem)
      if (key === 'cardImage') {
        if (cardData[key] !== undefined) {
          // CRÍTICO: Se for cardImage e for base64, NÃO incluir
          if (typeof cardData[key] === 'string' && cardData[key].startsWith('data:image')) {
            console.warn(`⚠️ Base64 detectado em cardImage. Removendo. Use upload de arquivo.`);
            continue; // Não incluir base64
          }
          // Incluir cardImage mesmo se for string vazia (permite limpar a imagem)
          cleaned[key] = cardData[key];
          console.log(`📸 [cleanCardData] cardImage incluído: ${typeof cardData[key] === 'string' ? cardData[key].substring(0, 50) + '...' : cardData[key]}`);
        }
      } else if (cardData[key] !== undefined && cardData[key] !== null) {
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

    // Se é uma nova skin de uma carta existente (mesmo nome), herdar dados compartilhados
    // Campos compartilhados entre skins: name, description, type, stats, maxCopiesInDeck, isBanned
    // Campos únicos por skin: idCarta, cardImage, priceCredits, priceCash, isForSale, rarity
    if (cleanedData.name) {
      const existingSkins = await this.findSkinsByName(cleanedData.name);
      if (existingSkins.length > 0) {
        const originalSkin = existingSkins[0];
        
        // Herdar maxCopiesInDeck (limite de deck é compartilhado)
        const originalMaxCopies = originalSkin.maxCopiesInDeck ?? 3;
        if (!cleanedData.maxCopiesInDeck || cleanedData.maxCopiesInDeck === 3) {
          cleanedData.maxCopiesInDeck = originalMaxCopies;
          console.log(`🔄 Nova skin de "${cleanedData.name}" herdando maxCopiesInDeck: ${originalMaxCopies}`);
        }
        
        // Herdar description (efeito) - todas as skins compartilham o mesmo efeito
        cleanedData.description = originalSkin.description || cleanedData.description || '';
        console.log(`🔄 Nova skin de "${cleanedData.name}" herdando description (efeito) da carta original`);
        
        // Herdar campos que definem o efeito da carta (compartilhados entre skins)
        if (!cleanedData.type) cleanedData.type = originalSkin.type;
        if (!cleanedData.monsterType && originalSkin.monsterType) cleanedData.monsterType = originalSkin.monsterType;
        if (!cleanedData.attribute && originalSkin.attribute) cleanedData.attribute = originalSkin.attribute;
        if (!cleanedData.race && originalSkin.race) cleanedData.race = originalSkin.race;
        if (!cleanedData.spellType && originalSkin.spellType) cleanedData.spellType = originalSkin.spellType;
        if (!cleanedData.trapType && originalSkin.trapType) cleanedData.trapType = originalSkin.trapType;
        if (!cleanedData.archetype && originalSkin.archetype) cleanedData.archetype = originalSkin.archetype;
        if (cleanedData.level === undefined && originalSkin.level !== undefined) cleanedData.level = originalSkin.level;
        if (cleanedData.rank === undefined && originalSkin.rank !== undefined) cleanedData.rank = originalSkin.rank;
        if (cleanedData.atk === undefined && originalSkin.atk !== undefined) cleanedData.atk = originalSkin.atk;
        if (cleanedData.def === undefined && originalSkin.def !== undefined) cleanedData.def = originalSkin.def;
        if (cleanedData.isBanned === undefined && originalSkin.isBanned !== undefined) cleanedData.isBanned = originalSkin.isBanned;
        
        console.log(`🔄 Nova skin de "${cleanedData.name}" herdando todos os dados compartilhados (efeito, tipo, stats, etc.)`);
      }
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
      console.log('📝 [CardsService] ========== INICIANDO ATUALIZAÇÃO ==========');
      console.log('📝 [CardsService] ID recebido:', id);
      console.log('📝 [CardsService] Tipo do ID:', typeof id);
      
      // Buscar a carta ANTES de atualizar (para garantir que existe e obter dados originais)
      let card: Card;
      try {
        card = await this.findOne(id);
        if (!card) {
          throw new NotFoundException(`Carta com ID ${id} não encontrada`);
        }
        console.log('✅ [CardsService] Carta encontrada:', {
          id: card.id,
          idCarta: card.idCarta,
          name: card.name,
          description: card.description ? `${card.description.substring(0, 50)}...` : 'vazio'
        });

        // Se campos compartilhados estão sendo atualizados, atualizar todas as skins da mesma carta
        // Campos compartilhados: maxCopiesInDeck, description, type, stats, isBanned
        const fieldsToSync: any = {};
        let needsSync = false;
        
        if (cardData.maxCopiesInDeck !== undefined && cardData.maxCopiesInDeck !== card.maxCopiesInDeck) {
          fieldsToSync.maxCopiesInDeck = cardData.maxCopiesInDeck;
          needsSync = true;
        }
        
        if (cardData.isBanned !== undefined && cardData.isBanned !== card.isBanned) {
          fieldsToSync.isBanned = cardData.isBanned;
          needsSync = true;
        }
        
        if (cardData.type !== undefined && cardData.type !== card.type) {
          fieldsToSync.type = cardData.type;
          needsSync = true;
        }
        
        if (cardData.monsterType !== undefined && cardData.monsterType !== card.monsterType) {
          fieldsToSync.monsterType = cardData.monsterType;
          needsSync = true;
        }
        
        if (cardData.attribute !== undefined && cardData.attribute !== card.attribute) {
          fieldsToSync.attribute = cardData.attribute;
          needsSync = true;
        }
        
        if (cardData.race !== undefined && cardData.race !== card.race) {
          fieldsToSync.race = cardData.race;
          needsSync = true;
        }
        
        if (cardData.spellType !== undefined && cardData.spellType !== card.spellType) {
          fieldsToSync.spellType = cardData.spellType;
          needsSync = true;
        }
        
        if (cardData.trapType !== undefined && cardData.trapType !== card.trapType) {
          fieldsToSync.trapType = cardData.trapType;
          needsSync = true;
        }
        
        if (cardData.archetype !== undefined && cardData.archetype !== card.archetype) {
          fieldsToSync.archetype = cardData.archetype;
          needsSync = true;
        }
        
        if (cardData.level !== undefined && cardData.level !== card.level) {
          fieldsToSync.level = cardData.level;
          needsSync = true;
        }
        
        if (cardData.rank !== undefined && cardData.rank !== card.rank) {
          fieldsToSync.rank = cardData.rank;
          needsSync = true;
        }
        
        if (cardData.atk !== undefined && cardData.atk !== card.atk) {
          fieldsToSync.atk = cardData.atk;
          needsSync = true;
        }
        
        if (cardData.def !== undefined && cardData.def !== card.def) {
          fieldsToSync.def = cardData.def;
          needsSync = true;
        }
        
        if (needsSync) {
          console.log(`🔄 Atualizando campos compartilhados para todas as skins de "${card.name}":`, Object.keys(fieldsToSync));
          const allSkins = await this.findSkinsByName(card.name);
          for (const skin of allSkins) {
            if (skin.id !== card.id) {
              await this.cardsRepository.update(skin.id, fieldsToSync);
              console.log(`✅ Skin ${skin.idCarta} atualizada com campos compartilhados`);
            }
          }
        }
        
        // CRÍTICO: Garantir que estamos atualizando APENAS esta carta específica
        // Verificar se o ID passado corresponde ao UUID da carta encontrada
        if (card.id !== id && card.idCarta !== id) {
          console.error('❌ [CardsService] ERRO CRÍTICO: ID não corresponde à carta encontrada!');
          console.error(`   ID recebido: ${id}`);
          console.error(`   ID da carta encontrada: ${card.id}`);
          console.error(`   idCarta da carta encontrada: ${card.idCarta}`);
          throw new BadRequestException('ID não corresponde à carta encontrada. Isso pode causar atualização de múltiplas cartas!');
        }
      } catch (error) {
        console.error('❌ [CardsService] Erro ao buscar carta:', error);
        throw error;
      }
      
      const wasForSale = card.isForSale;
      
      console.log('📝 [CardsService] Atualizando carta:', id);
      console.log('🆔 [CardsService] idCarta atual da carta:', card.idCarta);
      
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
          // cardImage deve ser preservado mesmo se for string vazia (permite limpar a imagem)
          if (key === 'cardImage') {
            if (value !== undefined) {
              cleanData[key] = value;
              console.log(`📸 [CardsService] cardImage preservado no cleanData: ${typeof value === 'string' ? (value.length > 0 ? value.substring(0, 50) + '...' : '(vazio)') : value}`);
            }
          } else if (value !== undefined && value !== null) {
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
          
          const newIdCarta = cleanData.idCarta.trim();
          
          // CRÍTICO: Se o idCarta mudou, criar uma nova skin em vez de atualizar
          if (newIdCarta !== card.idCarta) {
            console.log('🔄 [CardsService] idCarta mudou! Criando nova skin em vez de atualizar.');
            console.log(`   idCarta antigo: ${card.idCarta}`);
            console.log(`   idCarta novo: ${newIdCarta}`);
            
            // Verificar se o novo idCarta já existe
            const existingCardWithNewId = await this.cardsRepository.findOne({
              where: { idCarta: newIdCarta }
            });
            
            if (existingCardWithNewId) {
              throw new BadRequestException(`Carta com idCarta "${newIdCarta}" já existe. Use outro idCarta para criar uma nova skin.`);
            }
            
            // Criar nova skin com os dados atualizados
            const newSkinData = {
              ...cleanData,
              name: cleanData.name || card.name, // Garantir que o nome seja o mesmo
              idCarta: newIdCarta,
            };
            
            console.log('✨ [CardsService] Criando nova skin com idCarta:', newSkinData.idCarta);
            return await this.create(newSkinData);
          }
          
          // Se o idCarta não mudou, continuar com a atualização normal
          cleanData.idCarta = newIdCarta;
        } catch (error) {
          console.error('❌ [CardsService] Erro ao validar idCarta:', error);
          throw error;
        }
      }
      
      // CRÍTICO: Se o name está sendo atualizado, verificar se não vai afetar outras cartas
      // O name é compartilhado entre skins, então atualizar o name de uma skin afeta todas as skins
      if ('name' in cleanData && cleanData.name !== card.name) {
        console.log(`⚠️ [CardsService] ATENÇÃO: Nome da carta está sendo alterado!`);
        console.log(`   Nome antigo: "${card.name}"`);
        console.log(`   Nome novo: "${cleanData.name}"`);
        console.log(`   ⚠️ Isso afetará TODAS as skins desta carta (cartas com o mesmo nome)`);
        
        // Verificar quantas cartas têm o mesmo nome (outras skins)
        const otherSkins = await this.findSkinsByName(card.name);
        if (otherSkins.length > 1) {
          console.log(`   ⚠️ Existem ${otherSkins.length} skins desta carta. Todas serão afetadas.`);
        }
      }
      
      // CRÍTICO: Se a description está sendo atualizada, atualizar todas as skins da mesma carta
      // A description (efeito) é compartilhada entre todas as skins da mesma carta
      if ('description' in cleanData && cleanData.description !== undefined) {
        console.log(`📝 [CardsService] Atualizando description (efeito) para todas as skins de "${card.name}"`);
        console.log(`   Descrição antiga: ${card.description ? `${card.description.substring(0, 50)}...` : 'vazio'}`);
        console.log(`   Descrição nova: ${cleanData.description ? `${String(cleanData.description).substring(0, 50)}...` : 'vazio'}`);
        
        // Atualizar description em todas as skins da mesma carta (efeito é compartilhado)
        const allSkins = await this.findSkinsByName(card.name);
        for (const skin of allSkins) {
          if (skin.id !== card.id) {
            await this.cardsRepository.update(skin.id, { description: cleanData.description });
            console.log(`✅ Skin ${skin.idCarta} atualizada com nova description (efeito)`);
          }
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
        
        // CRÍTICO: Garantir que estamos atualizando APENAS a carta com o UUID correto
        // Usar o UUID da carta encontrada (não confiar no ID passado)
        const cardUUID = card.id;
        console.log('🔄 [CardsService] Executando update no banco...');
        console.log('🔒 [CardsService] UUID da carta a ser atualizada:', cardUUID);
        console.log('🔒 [CardsService] Garantindo que apenas esta carta será atualizada');
        
        // Verificar quantas cartas serão afetadas ANTES de atualizar
        const cardsBeforeUpdate = await this.cardsRepository.find({
          where: { id: cardUUID }
        });
        if (cardsBeforeUpdate.length !== 1) {
          console.error(`❌ [CardsService] ERRO CRÍTICO: Encontradas ${cardsBeforeUpdate.length} cartas com UUID ${cardUUID}! Deveria ser apenas 1.`);
          throw new BadRequestException(`Erro: Múltiplas cartas encontradas com o mesmo UUID. Isso não deveria acontecer!`);
        }
        
        // Atualizar usando update do repositório com UUID garantido
        const updateResult = await this.cardsRepository.update(cardUUID, updateData);
        console.log('📊 [CardsService] Resultado do update:', updateResult);
        
        // Verificar quantas cartas foram afetadas
        if (updateResult.affected !== 1) {
          console.error(`❌ [CardsService] ERRO CRÍTICO: Update afetou ${updateResult.affected} cartas! Deveria ser apenas 1.`);
          console.error(`   UUID usado: ${cardUUID}`);
          console.error(`   Dados atualizados:`, JSON.stringify(updateData, null, 2));
          throw new BadRequestException(`Erro: Update afetou ${updateResult.affected} cartas ao invés de 1. Isso pode ter corrompido outras cartas!`);
        }
        
        console.log('✅ [CardsService] Update afetou exatamente 1 carta (correto)');
        
        // Buscar a carta atualizada usando o UUID garantido
        console.log('🔍 [CardsService] Buscando carta atualizada...');
        updatedCard = await this.findOne(cardUUID);
        
        if (!updatedCard) {
          throw new NotFoundException('Carta não encontrada após atualização');
        }
        
        // Verificar se a carta atualizada é realmente a mesma que atualizamos
        if (updatedCard.id !== cardUUID) {
          console.error(`❌ [CardsService] ERRO CRÍTICO: Carta retornada não corresponde ao UUID atualizado!`);
          console.error(`   UUID esperado: ${cardUUID}`);
          console.error(`   UUID retornado: ${updatedCard.id}`);
          throw new BadRequestException('Erro: Carta retornada não corresponde à carta atualizada!');
        }
        
        console.log('✅ [CardsService] Carta atualizada no banco com sucesso');
        console.log('🆔 [CardsService] idCarta salvo no banco:', updatedCard.idCarta);
        console.log('🆔 [CardsService] Nome salvo no banco:', updatedCard.name);
        console.log('🆔 [CardsService] Descrição salva no banco:', updatedCard.description ? `${updatedCard.description.substring(0, 50)}...` : 'vazio');
        console.log('📝 [CardsService] ========== ATUALIZAÇÃO CONCLUÍDA ==========');
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
            'maxCopiesInDeck',
            'isBanned',
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
    console.log('🔄 Cache da loja invalidado');
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

  /**
   * Atualiza todas as cartas do banco com informações da API YGOPRODeck
   * - Atualiza maxCopiesInDeck baseado na banlist
   * - Traduz descrições para português
   */
  async updateAllCardsFromApi(): Promise<{ updated: number; errors: number; details: any[] }> {
    console.log('🔄 [updateAllCardsFromApi] Iniciando atualização em massa de cartas da API...');
    
    const results = {
      updated: 0,
      errors: 0,
      details: [] as any[],
    };

    try {
      // Verificar se YugiohApiService está disponível
      if (!this.yugiohApiService) {
        throw new Error('YugiohApiService não está disponível');
      }
      console.log('✅ [updateAllCardsFromApi] YugiohApiService verificado');
      // Buscar todas as cartas ativas (apenas uma skin de cada nome para evitar duplicatas)
      const allCards = await this.cardsRepository.find({
        where: { isActive: true },
        order: { name: 'ASC', createdAt: 'ASC' },
      });

      // Agrupar por nome (pegar apenas a primeira skin de cada carta)
      const uniqueCards = new Map<string, Card>();
      for (const card of allCards) {
        if (!uniqueCards.has(card.name)) {
          uniqueCards.set(card.name, card);
        }
      }

      const cardsToUpdate = Array.from(uniqueCards.values());
      console.log(`📊 Total de cartas únicas para atualizar: ${cardsToUpdate.length}`);

      // Processar em lotes para não sobrecarregar a API
      const BATCH_SIZE = 10;
      const DELAY_BETWEEN_BATCHES = 2000; // 2 segundos entre lotes

      for (let i = 0; i < cardsToUpdate.length; i += BATCH_SIZE) {
        const batch = cardsToUpdate.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processando lote ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} cartas)...`);

        const batchPromises = batch.map(async (card) => {
          try {
            // Buscar informações atualizadas da API
            const apiData = await this.yugiohApiService.getCardWithBanlist(card.name);
            
            if (!apiData) {
              results.errors++;
              results.details.push({
                cardName: card.name,
                status: 'error',
                message: 'Carta não encontrada na API',
              });
              return;
            }

            // Preparar atualizações
            const updates: any = {};
            let hasUpdates = false;

            // Atualizar maxCopiesInDeck
            if (apiData.maxCopies !== card.maxCopiesInDeck) {
              updates.maxCopiesInDeck = apiData.maxCopies;
              hasUpdates = true;
              console.log(`  ✅ ${card.name}: maxCopiesInDeck ${card.maxCopiesInDeck} → ${apiData.maxCopies}`);
            }

            // Atualizar isBanned
            if (apiData.isBanned !== card.isBanned) {
              updates.isBanned = apiData.isBanned;
              hasUpdates = true;
              console.log(`  ✅ ${card.name}: isBanned ${card.isBanned} → ${apiData.isBanned}`);
            }

            // Atualizar descrição se estiver em inglês ou vazia
            const currentDescription = card.description || '';
            const needsTranslation = !currentDescription || 
              (!this.yugiohApiService.isPortuguese(currentDescription) && apiData.description !== currentDescription);
            
            if (needsTranslation && apiData.description) {
              updates.description = apiData.description;
              hasUpdates = true;
              console.log(`  ✅ ${card.name}: Descrição traduzida/atualizada`);
            }

            if (hasUpdates) {
              // Atualizar todas as skins da mesma carta
              const allSkins = await this.findSkinsByName(card.name);
              
              for (const skin of allSkins) {
                await this.cardsRepository.update(skin.id, updates);
              }

              results.updated++;
              results.details.push({
                cardName: card.name,
                status: 'updated',
                updates: Object.keys(updates),
              });
            } else {
              results.details.push({
                cardName: card.name,
                status: 'no_changes',
                message: 'Carta já está atualizada',
              });
            }
          } catch (error: any) {
            results.errors++;
            results.details.push({
              cardName: card.name,
              status: 'error',
              message: error.message || 'Erro desconhecido',
            });
            console.error(`  ❌ Erro ao atualizar ${card.name}:`, error.message);
          }
        });

        await Promise.all(batchPromises);

        // Aguardar entre lotes para não sobrecarregar a API
        if (i + BATCH_SIZE < cardsToUpdate.length) {
          console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES / 1000}s antes do próximo lote...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      // Invalidar cache
      this.invalidateShopCache();

      console.log(`\n✅ Atualização concluída!`);
      console.log(`   - Cartas atualizadas: ${results.updated}`);
      console.log(`   - Erros: ${results.errors}`);
      console.log(`   - Sem alterações: ${cardsToUpdate.length - results.updated - results.errors}`);

      return results;
    } catch (error: any) {
      console.error('❌ [updateAllCardsFromApi] Erro ao atualizar cartas:', error);
      console.error('❌ [updateAllCardsFromApi] Stack:', error.stack);
      console.error('❌ [updateAllCardsFromApi] Tipo:', error.constructor.name);
      
      // Retornar resultados parciais se houver algum progresso
      if (results.updated > 0 || results.errors > 0) {
        console.warn('⚠️ [updateAllCardsFromApi] Retornando resultados parciais');
        return results;
      }
      
      // Se não houve progresso, lançar erro
      throw new BadRequestException(`Erro ao atualizar cartas: ${error.message || 'Erro desconhecido'}`);
    }
  }

  /**
   * Renomeia todas as imagens de cartas para usar idCarta como nome
   * Executado automaticamente na inicialização do módulo
   */
  async renameAllCardImages(): Promise<{ success: boolean; total: number; renamed: number; skipped: number; errors: number; message: string }> {
    return this.renameAllCardImagesInternal(this.uploadService);
  }

  private async renameAllCardImagesInternal(uploadService: any): Promise<{ success: boolean; total: number; renamed: number; skipped: number; errors: number; message: string }> {
    try {
      // Buscar TODAS as cartas (incluindo inativas) com cardImage
      const allCards = await this.getAllAdmin();
      const cardsWithImage = allCards.filter(card => card.cardImage && card.cardImage.trim() !== '');
      
      console.log(`🔄 [renameAllCardImages] Iniciando renomeação de ${cardsWithImage.length} imagens...`);
      
      let renamed = 0;
      let skipped = 0;
      let errors = 0;
      const errorDetails: string[] = [];
      const path = require('path');
      
      for (const card of cardsWithImage) {
        try {
          if (!card.idCarta) {
            const msg = `⚠️ Carta "${card.name}" não tem idCarta, pulando...`;
            console.warn(msg);
            errorDetails.push(msg);
            skipped++;
            continue;
          }
          
          // Extrair nome do arquivo atual do cardImage
          const currentImagePath = card.cardImage;
          if (!currentImagePath || typeof currentImagePath !== 'string') {
            const msg = `⚠️ Carta "${card.name}" tem cardImage inválido: ${currentImagePath}`;
            console.warn(msg);
            errorDetails.push(msg);
            skipped++;
            continue;
          }
          
          // Extrair nome do arquivo (pode ser /images/cards/nome.jpg ou apenas nome.jpg)
          let currentFileName: string;
          if (currentImagePath.includes('/')) {
            currentFileName = currentImagePath.split('/').pop() || currentImagePath;
          } else {
            currentFileName = currentImagePath;
          }
          
          // Verificar se já está com o nome correto (idCarta)
          const fileExtension = path.extname(currentFileName);
          const expectedFileName = `${card.idCarta}${fileExtension}`;
          
          if (currentFileName === expectedFileName) {
            console.log(`✅ Carta "${card.name}" já tem nome correto: ${currentFileName}`);
            skipped++;
            continue;
          }
          
          console.log(`🔄 Renomeando carta "${card.name}": ${currentFileName} -> ${expectedFileName}`);
          
          // Renomear arquivo FÍSICO na pasta
          const newPath = await uploadService.renameCardImage(currentImagePath, card.idCarta);
          
          if (newPath) {
            // Atualizar cardImage no banco
            await this.update(card.id, { cardImage: newPath });
            console.log(`✅ Carta "${card.name}" renomeada com sucesso: ${currentFileName} -> ${path.basename(newPath)}`);
            renamed++;
          } else {
            const msg = `⚠️ Falha ao renomear arquivo físico da carta "${card.name}" (${currentFileName})`;
            console.warn(msg);
            errorDetails.push(msg);
            errors++;
          }
        } catch (error: any) {
          const msg = `❌ Erro ao processar carta "${card.name}": ${error.message}`;
          console.error(msg);
          console.error('Stack:', error.stack);
          errorDetails.push(msg);
          errors++;
        }
      }
      
      console.log(`\n📊 [renameAllCardImages] Resumo da renomeação:`);
      console.log(`   ✅ Renomeadas: ${renamed}`);
      console.log(`   ⏭️  Puladas: ${skipped}`);
      console.log(`   ❌ Erros: ${errors}`);
      
      if (errorDetails.length > 0 && errorDetails.length <= 20) {
        console.log(`\n⚠️ Detalhes dos erros:`);
        errorDetails.forEach((detail, index) => {
          console.log(`   ${index + 1}. ${detail}`);
        });
      } else if (errorDetails.length > 20) {
        console.log(`\n⚠️ ${errorDetails.length} erros encontrados (mostrando apenas os primeiros 20)`);
        errorDetails.slice(0, 20).forEach((detail, index) => {
          console.log(`   ${index + 1}. ${detail}`);
        });
      }
      
      return {
        success: errors === 0,
        total: cardsWithImage.length,
        renamed,
        skipped,
        errors,
        message: `Renomeação concluída: ${renamed} renomeadas, ${skipped} puladas, ${errors} erros`
      };
    } catch (error: any) {
      console.error('❌ [renameAllCardImages] Erro ao renomear imagens:', error);
      throw new BadRequestException(`Erro ao renomear imagens: ${error.message}`);
    }
  }

}
