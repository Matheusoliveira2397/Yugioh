import { Injectable, NotFoundException, BadRequestException, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ShopItem, ShopItemCurrency } from './entities/shop-item.entity';
import { Card, CardRarity } from '../cards/entities/card.entity';
import { UserCard } from './entities/user-card.entity';
import { TalismanTemplate } from './entities/talisman-template.entity';
import { UserTalisman } from './entities/user-talisman.entity';
import { MaletaTemplate } from './entities/maleta-template.entity';
import { UserMaleta } from './entities/user-maleta.entity';
import { User } from '../users/entities/user.entity';
import { DeckCard } from '../decks/entities/deck-card.entity';
import { PurchaseCardDto, PaymentMethod } from './dto/purchase-card.dto';
import { EconomyService } from '../economy/economy.service';
import { CurrencyType, TransactionType } from '../economy/entities/transaction.entity';
import { CosmeticsService } from '../cosmetics/cosmetics.service';
import { PromotionsService } from '../promotions/promotions.service';

// Mantém apenas UMA definição da classe ShopService
export class ShopService implements OnModuleInit {
  constructor(
    @InjectRepository(ShopItem)
    private shopItemRepository: Repository<ShopItem>,
    @InjectRepository(UserCard)
    private userCardRepository: Repository<UserCard>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Card)
    private cardRepository: Repository<Card>,
    @InjectRepository(DeckCard)
    private deckCardRepository: Repository<DeckCard>,
    @InjectRepository(TalismanTemplate)
    private talismanTemplateRepository: Repository<TalismanTemplate>,
    @InjectRepository(UserTalisman)
    private userTalismanRepository: Repository<UserTalisman>,
    @InjectRepository(MaletaTemplate)
    private maletaTemplateRepository: Repository<MaletaTemplate>,
    @InjectRepository(UserMaleta)
    private userMaletaRepository: Repository<UserMaleta>,
    @Inject(EconomyService)
    private economyService: EconomyService,
    private cosmeticsService: CosmeticsService,
    private promotionsService: PromotionsService,
  ) {}

  async onModuleInit() {
    try {
      const tableExists = await this.talismanTemplateRepository.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'talisman_templates'
      `);
      if (tableExists.length === 0) {
        console.log('🔧 [ShopService] Criando tabelas talisman_templates e user_talismans...');
        await this.talismanTemplateRepository.query(`
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        `).catch(() => {});
        await this.talismanTemplateRepository.query(`
          CREATE TABLE "talisman_templates" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" character varying(120) NOT NULL,
            "description" text,
            "image" character varying(500),
            "bonusScorePct" integer NOT NULL DEFAULT 0,
            "bonusCashPct" integer NOT NULL DEFAULT 0,
            "bonusArenaPointsPct" integer NOT NULL DEFAULT 0,
            "priceCredits" integer DEFAULT 0,
            "priceCash" integer DEFAULT 0,
            "initialCharges" integer NOT NULL DEFAULT 10,
            "isActive" boolean NOT NULL DEFAULT true,
            "isForSale" boolean NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_talisman_templates" PRIMARY KEY ("id")
          )
        `);
        await this.talismanTemplateRepository.query(`
          CREATE TABLE "user_talismans" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "userId" integer NOT NULL,
            "talismanTemplateId" uuid NOT NULL,
            "equipped" boolean NOT NULL DEFAULT false,
            "charges" integer NOT NULL DEFAULT 10,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_user_talismans" PRIMARY KEY ("id"),
            CONSTRAINT "FK_user_talismans_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_user_talismans_template" FOREIGN KEY ("talismanTemplateId") REFERENCES "talisman_templates"("id") ON DELETE CASCADE
          )
        `);
        await this.talismanTemplateRepository.query(`CREATE INDEX "IDX_user_talismans_userId" ON "user_talismans" ("userId")`);
        await this.talismanTemplateRepository.query(`CREATE INDEX "IDX_user_talismans_equipped" ON "user_talismans" ("userId", "equipped") WHERE "equipped" = true`);
        const count = await this.talismanTemplateRepository.count();
        if (count === 0) {
          await this.talismanTemplateRepository.query(`
            INSERT INTO "talisman_templates" ("id", "name", "description", "image", "bonusScorePct", "bonusCashPct", "bonusArenaPointsPct", "priceCredits", "priceCash", "initialCharges", "isActive", "isForSale")
            VALUES
              (uuid_generate_v4(), 'Talismã do Iniciante', 'Bônus modestos na Arena.', NULL, 5, 5, 10, 500, 50, 10, true, true),
              (uuid_generate_v4(), 'Talismã do Guerreiro', 'Aumenta recompensas da Arena.', NULL, 10, 10, 15, 1500, 150, 15, true, true),
              (uuid_generate_v4(), 'Talismã do Mestre', 'Grandes bônus em Score, Cash e Arena Points.', NULL, 15, 15, 20, 4000, 400, 20, true, true),
              (uuid_generate_v4(), 'Talismã Lendário', 'Máximos bônus na Arena de Duelos.', NULL, 25, 25, 30, 10000, 1000, 30, true, true)
          `);
        }
        console.log('✅ [ShopService] Tabelas de talismãs criadas com sucesso.');
      } else {
        const cols = await this.talismanTemplateRepository.query(`
          SELECT column_name FROM information_schema.columns WHERE table_name = 'talisman_templates' AND column_name = 'initialCharges'
        `);
        if (cols.length === 0) {
          await this.talismanTemplateRepository.query(`ALTER TABLE "talisman_templates" ADD COLUMN IF NOT EXISTS "initialCharges" integer NOT NULL DEFAULT 10`);
          console.log('✅ [ShopService] Coluna initialCharges adicionada em talisman_templates.');
        }
        const userCols = await this.talismanTemplateRepository.query(`
          SELECT column_name FROM information_schema.columns WHERE table_name = 'user_talismans' AND column_name = 'charges'
        `);
        if (userCols.length === 0) {
          await this.talismanTemplateRepository.query(`ALTER TABLE "user_talismans" ADD COLUMN IF NOT EXISTS "charges" integer NOT NULL DEFAULT 10`);
          console.log('✅ [ShopService] Coluna charges adicionada em user_talismans.');
        }
      }
    } catch (error: any) {
      console.error('❌ [ShopService] Erro ao criar tabelas de talismãs:', error?.message || error);
    }

    // ==================== MALJETAS (CAPACIDADE/DECKS POR NÍVEL) ====================
    try {
      const maletaTableExists = await this.maletaTemplateRepository.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'maleta_templates'
      `);

      if (maletaTableExists.length === 0) {
        console.log('🔧 [ShopService] Criando tabelas maleta_templates e user_maletas...');
        await this.maletaTemplateRepository.query(`
          CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        `).catch(() => {});

        await this.maletaTemplateRepository.query(`
          CREATE TABLE "maleta_templates" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" character varying(120) NOT NULL,
            "description" text,
            "image" character varying(500),
            "bonusDecks" integer NOT NULL DEFAULT 1,
            "bonusMaletaCapacity" integer NOT NULL DEFAULT 100,
            "priceCredits" integer DEFAULT 0,
            "priceCash" integer DEFAULT 0,
            "isActive" boolean NOT NULL DEFAULT true,
            "isForSale" boolean NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_maleta_templates" PRIMARY KEY ("id")
          )
        `);

        await this.maletaTemplateRepository.query(`
          CREATE TABLE "user_maletas" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "userId" integer NOT NULL,
            "maletaTemplateId" uuid NOT NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_user_maletas" PRIMARY KEY ("id"),
            CONSTRAINT "FK_user_maletas_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_user_maletas_template" FOREIGN KEY ("maletaTemplateId") REFERENCES "maleta_templates"("id") ON DELETE CASCADE
          )
        `);

        await this.maletaTemplateRepository.query(`CREATE INDEX "IDX_user_maletas_userId" ON "user_maletas" ("userId")`);
        await this.maletaTemplateRepository.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_maletas_userId_templateId"
          ON "user_maletas"("userId", "maletaTemplateId")
        `);

        const count = await this.maletaTemplateRepository.count();
        if (count === 0) {
          await this.maletaTemplateRepository.query(`
            INSERT INTO "maleta_templates" ("id", "name", "description", "image", "bonusDecks", "bonusMaletaCapacity", "priceCredits", "priceCash", "isActive", "isForSale")
            VALUES
              (uuid_generate_v4(), 'Maleta Inicial', 'Aumenta seus limites para criar mais decks e guardar mais cartas.', NULL, 1, 100, 2500, 250, true, true),
              (uuid_generate_v4(), 'Maleta Pro', 'Mais espaço para decks e cartas.', NULL, 2, 200, 5000, 500, true, true),
              (uuid_generate_v4(), 'Maleta Lendária', 'Limites máximos para o colecionador.', NULL, 3, 400, 10000, 1000, true, true)
          `);
        }

        console.log('✅ [ShopService] Tabelas de maletas criadas com sucesso.');
      }
    } catch (error: any) {
      console.error('❌ [ShopService] Erro ao criar tabelas de maletas:', error?.message || error);
    }
  }

  // Adicionar carta automaticamente na loja quando for cadastrada
  async addCardToShop(card: Card): Promise<ShopItem> {
    // Verificar se a carta já está na loja
    const existingItem = await this.shopItemRepository.findOne({
      where: { card: { id: card.id } },
    });

    if (existingItem) {
      return existingItem;
    }

    // Definir preço baseado na raridade
    const price = this.calculatePriceByRarity(card.rarity);

    const shopItem = this.shopItemRepository.create({
      card: card,
      currency: ShopItemCurrency.COINS,
      price: price,
      discount: 0,
      isAvailable: true,
      isFeatured: false,
      isLimited: false,
      stock: null, // Estoque ilimitado
    } as any);

    return this.shopItemRepository.save(shopItem) as any;
  }

  // Calcular preço baseado na raridade
  private calculatePriceByRarity(rarity: CardRarity): number {
    const priceMap = {
      [CardRarity.COMMON]: 100,
      [CardRarity.RARE]: 500,
      [CardRarity.SUPER_RARE]: 1500,
      [CardRarity.ULTRA_RARE]: 5000,
      [CardRarity.SECRET_RARE]: 10000,
      [CardRarity.LEGENDARY]: 50000,
    };

    return priceMap[rarity] || 100;
  }

  // Listar itens da loja
  async getShopItems(filters?: {
    currency?: ShopItemCurrency;
    isFeatured?: boolean;
    isAvailable?: boolean;
  }): Promise<ShopItem[]> {
    try {
      const query = this.shopItemRepository.createQueryBuilder('shopItem')
        .leftJoinAndSelect('shopItem.card', 'card')
        .where('shopItem.isAvailable = :isAvailable', { isAvailable: filters?.isAvailable ?? true });

      if (filters?.currency) {
        query.andWhere('shopItem.currency = :currency', { currency: filters.currency });
      }

      if (filters?.isFeatured !== undefined) {
        query.andWhere('shopItem.isFeatured = :isFeatured', { isFeatured: filters.isFeatured });
      }

      query.orderBy('shopItem.isFeatured', 'DESC')
        .addOrderBy('card.rarity', 'DESC')
        .addOrderBy('shopItem.createdAt', 'DESC')
        .take(500); // Limite de 500 itens

      return await Promise.race([
        query.getMany(),
        new Promise<ShopItem[]>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 1000)
        )
      ]).catch(() => []);
    } catch (error) {
      return [];
    }
  }

  // Buscar item específico
  async getShopItem(id: string): Promise<ShopItem | null> {
    return this.shopItemRepository.findOne({
      where: { id },
      relations: ['card'],
    });
  }

  // Atualizar item da loja
  async updateShopItem(
    id: string,
    updateData: Partial<ShopItem>
  ): Promise<ShopItem | null> {
    await this.shopItemRepository.update(id, updateData);
    return this.getShopItem(id);
  }

  // Remover item da loja
  async removeShopItem(id: string): Promise<void> {
    await this.shopItemRepository.delete(id);
  }

  // Remover carta da loja (por card_id)
  async removeCardFromShop(cardId: string): Promise<void> {
    await this.shopItemRepository.delete({ card: { id: cardId } as any });
    console.log(`🗑️ Item de loja removido para carta ${cardId}`);
  }

  // Atualizar carta na loja
  async updateCardInShop(card: Card): Promise<void> {
    const shopItem = await this.shopItemRepository.findOne({
      where: { card: { id: card.id } },
    });

    if (shopItem) {
      // Atualizar preço baseado na raridade se não tiver preço customizado
      // SISTEMA DE MOEDAS REMOVIDO - apenas Credits e Cash
      if (!card.priceCredits && !card.priceCash) {
        shopItem.price = this.calculatePriceByRarity(card.rarity);
      }
      await this.shopItemRepository.save(shopItem);
      console.log(`🔄 Item de loja atualizado para carta ${card.id}`);
    }
  }

  // ==================== SISTEMA DE COMPRA COMPLETO ====================
  
  async purchaseCard(userId: number, purchaseDto: PurchaseCardDto): Promise<{
    success: boolean;
    message: string;
    card: Card;
    userCard: UserCard;
    remainingBalance: { coins?: number; credits?: number; cash?: number };
  }> {
    console.log('🛒🛒🛒 SERVICE.purchaseCard() CHAMADO! 🛒🛒🛒');
    console.log('UserId:', userId);
    console.log('PurchaseDto:', purchaseDto);
    
    // 1. BUSCAR CARTA
    const card = await this.cardRepository.findOne({
      where: { id: purchaseDto.cardId },
    });

    if (!card) {
      throw new NotFoundException('Carta não encontrada');
    }

    if (!card.isForSale) {
      throw new BadRequestException('Esta carta não está disponível para compra');
    }

    // 2. BUSCAR USUÁRIO
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    console.log('💰 SALDO DO USUÁRIO NO BANCO:');
    console.log('   - Credits:', user.credits);
    console.log('   - Cash:', user.cash);
    console.log('   - User Object:', JSON.stringify(user, null, 2));

    const quantity = Math.min(Math.max(1, Number(purchaseDto.quantity) || 1), 99);

    // 3. VERIFICAR PREÇO E SALDO (preço unitário * quantidade)
    const { price: unitPrice, canPurchase, missingAmount } = await this.checkUserBalanceWithPromotion(
      user,
      card,
      purchaseDto.paymentMethod
    );
    const totalPrice = unitPrice * quantity;

    console.log('🔍 RESULTADO DA VERIFICAÇÃO:');
    console.log('   - Preço unitário:', unitPrice, 'Quantidade:', quantity, 'Total:', totalPrice);
    console.log('   - Pode comprar?', canPurchase);
    console.log('   - Falta:', missingAmount);

    const userBalance = purchaseDto.paymentMethod === 'credits' ? (user.credits || 0) : (user.cash || 0);
    if (userBalance < totalPrice) {
      throw new BadRequestException(
        `Saldo insuficiente! Total: ${totalPrice} ${this.getCurrencyName(purchaseDto.paymentMethod)}. Você tem ${userBalance}. Faltam ${totalPrice - userBalance}`
      );
    }

    // 4. DEDUZIR DO SALDO DO USUÁRIO (total = preço * quantidade)
    this.deductBalance(user, totalPrice, purchaseDto.paymentMethod);
    await this.userRepository.save(user);

    // 5. ADICIONAR CARTAS AO INVENTÁRIO (quantidade)
    const userCard = await this.addCardToUserInventory(userId, card.id, 'PURCHASE', quantity);

    // 6. LOG
    console.log(`✅ Compra realizada:
      - Usuário: ${user.username}
      - Carta: ${card.name}
      - Quantidade: ${quantity}
      - Total: ${totalPrice} ${purchaseDto.paymentMethod}
      - Saldo restante: ${this.getBalance(user, purchaseDto.paymentMethod)}
    `);

    return {
      success: true,
      message: `Carta "${card.name}" comprada com sucesso!`,
      card,
      userCard,
      remainingBalance: {
        credits: user.credits,
        cash: user.cash,
      },
    };
  }

  // ==================== VERIFICAR SALDO DO USUÁRIO ====================
  private async checkUserBalanceWithPromotion(
    user: User,
    card: Card,
    paymentMethod: string
  ): Promise<{ price: number; canPurchase: boolean; missingAmount: number }> {
    let basePrice = 0;
    let userBalance = 0;

    switch (paymentMethod) {
      case 'coins':
        throw new BadRequestException('Sistema de moedas foi desativado. Use Créditos ou Cash.');
      case 'credits':
        basePrice = card.priceCredits || 0;
        userBalance = user.credits || 0;
        break;
      case 'cash':
        basePrice = Number(card.priceCash) || 0;
        userBalance = user.cash || 0;
        break;
    }

    let price = basePrice;
    const promotionsMap = await this.promotionsService.findActiveForCardIds([card.id]);
    const promo = promotionsMap.get(card.id);
    if (promo) {
      price = this.promotionsService.getEffectivePrice(basePrice, promo.discountPercent);
    }

    // Verificar se a carta tem preço definido para este método
    // Permite preço 0 (grátis), mas não permite undefined/null
    if (price === undefined || price === null) {
      throw new BadRequestException(
        `Esta carta não tem preço definido para ${this.getCurrencyName(paymentMethod)}`
      );
    }

    const canPurchase = userBalance >= price;
    const missingAmount = canPurchase ? 0 : price - userBalance;

    return { price, canPurchase, missingAmount };
  }

  // ==================== DEDUZIR SALDO ====================
  private deductBalance(user: User, amount: number, paymentMethod: string): void {
    switch (paymentMethod) {
      case 'credits':
        user.credits -= amount;
        break;
      case 'cash':
        user.cash -= amount;
        break;
      default:
        throw new BadRequestException('Método de pagamento inválido');
    }
  }

  // ==================== ADICIONAR CARTA AO INVENTÁRIO ====================
  async addCardToUserInventory(
    userId: number,
    cardId: string,
    acquiredBy: 'PURCHASE' | 'REWARD' | 'DROP' | 'GIFT' = 'PURCHASE',
    quantity: number = 1
  ): Promise<UserCard> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'maletaCapacity'],
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    const maletaCapacity = Math.max(1, Number((user as any).maletaCapacity ?? 500));
    const totalRow = await this.userCardRepository
      .createQueryBuilder('uc')
      .select('COALESCE(SUM(uc.quantity), 0)', 'total')
      .where('uc.userId = :userId', { userId })
      .getRawOne<{ total: string }>();
    const currentTotal = Number(totalRow?.total ?? 0);
    if (currentTotal + quantity > maletaCapacity) {
      const available = Math.max(0, maletaCapacity - currentTotal);
      throw new BadRequestException(
        `Sua maleta está cheia (${currentTotal}/${maletaCapacity}). Espaço restante: ${available}. Compre uma maleta na loja para aumentar a capacidade.`,
      );
    }

    // Verificar se usuário já tem esta carta
    const existingUserCard = await this.userCardRepository.findOne({
      where: { userId, cardId },
    });

    if (existingUserCard) {
      // Aumentar quantidade
      existingUserCard.quantity += quantity;
      return this.userCardRepository.save(existingUserCard);
    }

    // Criar nova entrada no inventário
    const userCard = this.userCardRepository.create({
      userId,
      cardId,
      quantity: quantity,
      acquiredBy,
    });

    return this.userCardRepository.save(userCard);
  }

  async purchaseBriefcase(
    userId: number,
    maletaTemplateId: string,
    paymentMethod: 'credits' | 'cash',
  ): Promise<{
    success: boolean;
    message: string;
    remainingBalance: { credits: number; cash: number };
    limits: { maxDecks: number; maletaCapacity: number };
  }> {
    const template = await this.maletaTemplateRepository.findOne({ where: { id: maletaTemplateId } });
    if (!template || !template.isActive || !template.isForSale) {
      throw new BadRequestException('Esta maleta não está disponível para compra');
    }

    const price = paymentMethod === 'credits' ? (template.priceCredits ?? 0) : (template.priceCash ?? 0);
    if (!price || price <= 0) {
      throw new BadRequestException(`Esta maleta não tem preço definido para ${this.getCurrencyName(paymentMethod)}`);
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'credits', 'cash', 'maxDecks', 'maletaCapacity'],
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const balance = paymentMethod === 'credits' ? (user.credits || 0) : (user.cash || 0);
    if (balance < price) {
      throw new BadRequestException(
        `Saldo insuficiente! Precisa de ${price} ${this.getCurrencyName(paymentMethod)}. Você tem ${balance}.`,
      );
    }

    const alreadyOwned = await this.userMaletaRepository.findOne({
      where: { userId, maletaTemplateId },
    });
    if (alreadyOwned) {
      throw new BadRequestException('Você já possui esta maleta');
    }

    this.deductBalance(user, price, paymentMethod);
    user.maxDecks = Math.max(1, Number((user as any).maxDecks ?? 3)) + Number(template.bonusDecks ?? 0);
    user.maletaCapacity =
      Math.max(1, Number((user as any).maletaCapacity ?? 500)) + Number(template.bonusMaletaCapacity ?? 0);
    await this.userRepository.save(user);

    const userMaleta = this.userMaletaRepository.create({
      userId,
      maletaTemplateId,
    } as any);
    await this.userMaletaRepository.save(userMaleta);

    return {
      success: true,
      message: `Maleta "${template.name}" comprada! Limites aumentados (+${template.bonusDecks} deck(s), +${template.bonusMaletaCapacity} cartas).`,
      remainingBalance: { credits: user.credits ?? 0, cash: user.cash ?? 0 },
      limits: {
        maxDecks: user.maxDecks,
        maletaCapacity: user.maletaCapacity,
      },
    };
  }

  // ==================== QUANTIDADE DE CARTAS EM DECKS DO USUÁRIO ====================
  /** Retorna quantas cópias da carta estão em decks do usuário (não podem ser vendidas). */
  async getQuantityInDecks(userId: number, cardId: string): Promise<number> {
    const count = await this.deckCardRepository
      .createQueryBuilder('dc')
      .innerJoin('dc.deck', 'd')
      .where('d.userId = :userId', { userId })
      .andWhere('dc.cardId = :cardId', { cardId })
      .getCount();
    return count;
  }

  // ==================== BUSCAR INVENTÁRIO DO USUÁRIO ====================
  async getUserInventory(userId: number): Promise<{
    cards: (UserCard & { quantityInDecks?: number; sellableQuantity?: number })[];
    playmats: any[];
    skins: any[];
    talismans: any[];
    maletas: Array<{
      id: string;
      maletaTemplateId: string;
      name: string;
      description: string | null;
      image: string | null;
      bonusDecks: number;
      bonusMaletaCapacity: number;
      purchasedAt: Date;
    }>;
    maletaLimits: { maxDecks: number; maletaCapacity: number };
  }> {
    try {
      const cards = await Promise.race([
        this.userCardRepository.find({
          where: { userId },
          relations: ['card'],
          order: { createdAt: 'DESC' },
          take: 1000, // Limite de 1000 itens
        }),
        new Promise<UserCard[]>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 1000)
        )
      ]).catch(() => []);

      // Quantidade de cada carta nos decks do usuário (cardId -> count)
      const cardIds = cards.map(c => c.cardId);
      const inDecksMap: Record<string, number> = {};
      if (cardIds.length > 0) {
        const rows = await this.deckCardRepository
          .createQueryBuilder('dc')
          .innerJoin('dc.deck', 'd')
          .select('dc.cardId', 'cardId')
          .addSelect('COUNT(*)', 'cnt')
          .where('d.userId = :userId', { userId })
          .andWhere('dc.cardId IN (:...cardIds)', { cardIds })
          .groupBy('dc.cardId')
          .getRawMany();
        rows.forEach((r: { cardId: string; cnt: string }) => {
          inDecksMap[r.cardId] = parseInt(r.cnt, 10) || 0;
        });
      }

      const cardsWithSellable = cards.map(uc => {
        const quantityInDecks = inDecksMap[uc.cardId] || 0;
        const sellableQuantity = Math.max(0, uc.quantity - quantityInDecks);
        return { ...uc, quantityInDecks, sellableQuantity };
      });

      // Buscar usuário para obter playmats e sleeves comprados (ownedSleeveIds, ownedPlaymatIds)
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: [
          'equippedPlaymatId',
          'equippedPlaymatImage',
          'equippedSkinId',
          'equippedSkinImage',
          'ownedSleeveIds',
          'ownedPlaymatIds',
          'maxDecks',
          'maletaCapacity',
        ],
      });

      const playmats: any[] = [];
      const skins: any[] = [];

      const ownedSleeveIds = Array.isArray(user?.ownedSleeveIds) ? user.ownedSleeveIds : [];
      const ownedPlaymatIds = Array.isArray(user?.ownedPlaymatIds) ? user.ownedPlaymatIds : [];

      for (const id of ownedPlaymatIds) {
        try {
          const pm = await this.cosmeticsService.findOnePlaymat(id);
          playmats.push({ id: pm.id, name: pm.name, image: pm.image });
        } catch {
          // Playmat pode ter sido removido do catálogo
        }
      }

      for (const id of ownedSleeveIds) {
        try {
          const sl = await this.cosmeticsService.findOneSleeve(id);
          skins.push({ id: sl.id, name: sl.name, image: sl.image });
        } catch {
          // Sleeve pode ter sido removido do catálogo
        }
      }

      // Talismãs do usuário (com template eager)
      const userTalismans = await this.userTalismanRepository.find({
        where: { userId },
        relations: ['template'],
        order: { createdAt: 'DESC' },
      }).catch(() => []);
      const talismans = userTalismans.map((ut: UserTalisman) => ({
        id: ut.id,
        talismanTemplateId: ut.talismanTemplateId,
        equipped: ut.equipped,
        charges: ut.charges ?? 10,
        name: ut.template?.name,
        description: ut.template?.description,
        image: ut.template?.image,
        bonusScorePct: ut.template?.bonusScorePct ?? 0,
        bonusCashPct: ut.template?.bonusCashPct ?? 0,
        bonusArenaPointsPct: ut.template?.bonusArenaPointsPct ?? 0,
        initialCharges: ut.template?.initialCharges ?? 10,
      }));

      const userMaletas = await this.userMaletaRepository
        .find({
          where: { userId },
          relations: ['template'],
          order: { createdAt: 'ASC' },
        })
        .catch(() => []);

      const maletas = userMaletas.map((um: UserMaleta) => ({
        id: um.id,
        maletaTemplateId: um.maletaTemplateId,
        name: um.template?.name ?? 'Maleta',
        description: um.template?.description ?? null,
        image: um.template?.image ?? null,
        bonusDecks: Number(um.template?.bonusDecks ?? 0),
        bonusMaletaCapacity: Number(um.template?.bonusMaletaCapacity ?? 0),
        purchasedAt: um.createdAt,
      }));

      const maletaLimits = {
        maxDecks: Math.max(1, Number((user as any)?.maxDecks ?? 3)),
        maletaCapacity: Math.max(1, Number((user as any)?.maletaCapacity ?? 500)),
      };

      return { cards: cardsWithSellable, playmats, skins, talismans, maletas, maletaLimits };
    } catch (error) {
      console.error('❌ [getUserInventory] Erro ao buscar inventário:', error);
      return {
        cards: [],
        playmats: [],
        skins: [],
        talismans: [],
        maletas: [],
        maletaLimits: { maxDecks: 3, maletaCapacity: 500 },
      };
    }
  }

  // ==================== TALISMÃS ====================
  async getTalismanTemplates(): Promise<TalismanTemplate[]> {
    return this.talismanTemplateRepository.find({
      where: { isActive: true, isForSale: true },
      order: { bonusArenaPointsPct: 'ASC' },
    });
  }

  /** Lista todos os talismãs para o admin (incluindo inativos). */
  async getTalismanTemplatesForAdmin(): Promise<TalismanTemplate[]> {
    return this.talismanTemplateRepository.find({
      order: { bonusArenaPointsPct: 'ASC', name: 'ASC' },
    });
  }

  /** Cria um novo template de talismã (admin). */
  async createTalismanTemplate(dto: {
    name: string;
    description?: string | null;
    image?: string | null;
    bonusScorePct?: number;
    bonusCashPct?: number;
    bonusArenaPointsPct?: number;
    priceCredits?: number | null;
    priceCash?: number | null;
    initialCharges?: number;
    isActive?: boolean;
    isForSale?: boolean;
  }): Promise<TalismanTemplate> {
    const template = this.talismanTemplateRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      image: dto.image?.trim() || null,
      bonusScorePct: dto.bonusScorePct ?? 0,
      bonusCashPct: dto.bonusCashPct ?? 0,
      bonusArenaPointsPct: dto.bonusArenaPointsPct ?? 0,
      priceCredits: dto.priceCredits ?? 0,
      priceCash: dto.priceCash ?? 0,
      initialCharges: dto.initialCharges ?? 10,
      isActive: dto.isActive ?? true,
      isForSale: dto.isForSale ?? true,
    });
    return this.talismanTemplateRepository.save(template);
  }

  /** Atualiza um template de talismã (admin). */
  async updateTalismanTemplate(
    id: string,
    dto: Partial<{
      name: string;
      description: string | null;
      image: string | null;
      bonusScorePct: number;
      bonusCashPct: number;
      bonusArenaPointsPct: number;
      priceCredits: number | null;
      priceCash: number | null;
      initialCharges: number;
      isActive: boolean;
      isForSale: boolean;
    }>
  ): Promise<TalismanTemplate> {
    const template = await this.talismanTemplateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Talismã não encontrado');
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.description !== undefined) template.description = dto.description?.trim() || null;
    if (dto.image !== undefined) template.image = dto.image?.trim() || null;
    if (dto.bonusScorePct !== undefined) template.bonusScorePct = dto.bonusScorePct;
    if (dto.bonusCashPct !== undefined) template.bonusCashPct = dto.bonusCashPct;
    if (dto.bonusArenaPointsPct !== undefined) template.bonusArenaPointsPct = dto.bonusArenaPointsPct;
    if (dto.priceCredits !== undefined) template.priceCredits = dto.priceCredits;
    if (dto.priceCash !== undefined) template.priceCash = dto.priceCash;
    if (dto.initialCharges !== undefined) template.initialCharges = dto.initialCharges;
    if (dto.isActive !== undefined) template.isActive = dto.isActive;
    if (dto.isForSale !== undefined) template.isForSale = dto.isForSale;
    return this.talismanTemplateRepository.save(template);
  }

  /** Remove um template de talismã (admin). Usuários que tinham esse talismã perdem a referência (CASCADE). */
  async deleteTalismanTemplate(id: string): Promise<void> {
    const template = await this.talismanTemplateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Talismã não encontrado');
    await this.talismanTemplateRepository.remove(template);
  }

  // ==================== MALJETAS (LIMITES) ====================
  async getMaletaTemplates(): Promise<MaletaTemplate[]> {
    return this.maletaTemplateRepository.find({
      where: { isActive: true, isForSale: true },
      order: { bonusMaletaCapacity: 'ASC', bonusDecks: 'ASC', createdAt: 'ASC' },
    });
  }

  async getMaletaTemplatesForAdmin(): Promise<MaletaTemplate[]> {
    return this.maletaTemplateRepository.find({
      order: { bonusMaletaCapacity: 'ASC', bonusDecks: 'ASC', createdAt: 'ASC' },
    });
  }

  async createMaletaTemplate(dto: {
    name: string;
    description?: string | null;
    image?: string | null;
    bonusDecks?: number;
    bonusMaletaCapacity?: number;
    priceCredits?: number | null;
    priceCash?: number | null;
    isActive?: boolean;
    isForSale?: boolean;
  }): Promise<MaletaTemplate> {
    const template = this.maletaTemplateRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      image: dto.image?.trim() || null,
      bonusDecks: Math.max(0, Number(dto.bonusDecks ?? 0)),
      bonusMaletaCapacity: Math.max(0, Number(dto.bonusMaletaCapacity ?? 0)),
      priceCredits: dto.priceCredits == null ? 0 : Math.max(0, Number(dto.priceCredits)),
      priceCash: dto.priceCash == null ? 0 : Math.max(0, Number(dto.priceCash)),
      isActive: dto.isActive ?? true,
      isForSale: dto.isForSale ?? true,
    });
    return this.maletaTemplateRepository.save(template);
  }

  async updateMaletaTemplate(
    id: string,
    dto: Partial<{
      name: string;
      description: string | null;
      image: string | null;
      bonusDecks: number;
      bonusMaletaCapacity: number;
      priceCredits: number | null;
      priceCash: number | null;
      isActive: boolean;
      isForSale: boolean;
    }>,
  ): Promise<MaletaTemplate> {
    const template = await this.maletaTemplateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Maleta não encontrada');

    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.description !== undefined) template.description = dto.description?.trim() || null;
    if (dto.image !== undefined) template.image = dto.image?.trim() || null;
    if (dto.bonusDecks !== undefined) template.bonusDecks = Math.max(0, Number(dto.bonusDecks));
    if (dto.bonusMaletaCapacity !== undefined) template.bonusMaletaCapacity = Math.max(0, Number(dto.bonusMaletaCapacity));
    if (dto.priceCredits !== undefined) template.priceCredits = dto.priceCredits == null ? null : Math.max(0, Number(dto.priceCredits));
    if (dto.priceCash !== undefined) template.priceCash = dto.priceCash == null ? null : Math.max(0, Number(dto.priceCash));
    if (dto.isActive !== undefined) template.isActive = dto.isActive;
    if (dto.isForSale !== undefined) template.isForSale = dto.isForSale;

    return this.maletaTemplateRepository.save(template);
  }

  async deleteMaletaTemplate(id: string): Promise<void> {
    const template = await this.maletaTemplateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('Maleta não encontrada');
    await this.maletaTemplateRepository.remove(template);
  }

  async purchaseTalisman(
    userId: number,
    templateId: string,
    paymentMethod: 'credits' | 'cash'
  ): Promise<{ success: boolean; message: string; remainingBalance: { credits: number; cash: number } }> {
    const template = await this.talismanTemplateRepository.findOne({ where: { id: templateId } });
    if (!template || !template.isForSale || !template.isActive) {
      throw new BadRequestException('Este talismã não está disponível para compra');
    }

    const price = paymentMethod === 'credits' ? (template.priceCredits ?? 0) : (template.priceCash ?? 0);
    if (price <= 0) {
      throw new BadRequestException(`Este talismã não tem preço definido para ${this.getCurrencyName(paymentMethod)}`);
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const balance = paymentMethod === 'credits' ? (user.credits || 0) : (user.cash || 0);
    if (balance < price) {
      throw new BadRequestException(
        `Saldo insuficiente! Precisa de ${price} ${this.getCurrencyName(paymentMethod)}. Você tem ${balance}.`
      );
    }

    this.deductBalance(user, price, paymentMethod);
    await this.userRepository.save(user);

    const userTalisman = this.userTalismanRepository.create({
      userId,
      talismanTemplateId: templateId,
      equipped: false,
      charges: template.initialCharges ?? 10,
    });
    await this.userTalismanRepository.save(userTalisman);

    return {
      success: true,
      message: `Talismã "${template.name}" comprado com sucesso!`,
      remainingBalance: { credits: user.credits ?? 0, cash: user.cash ?? 0 },
    };
  }

  async equipTalisman(userId: number, userTalismanId: string): Promise<{ success: boolean; message: string }> {
    const userTalisman = await this.userTalismanRepository.findOne({
      where: { id: userTalismanId, userId },
      relations: ['template'],
    });
    if (!userTalisman) {
      throw new NotFoundException('Talismã não encontrado no seu inventário');
    }

    // Desequipar todos os outros talismãs do usuário
    await this.userTalismanRepository.update({ userId }, { equipped: false });
    // Equipar este
    userTalisman.equipped = true;
    await this.userTalismanRepository.save(userTalisman);

    return { success: true, message: `Talismã "${userTalisman.template?.name}" equipado!` };
  }

  async unequipTalisman(userId: number): Promise<{ success: boolean; message: string }> {
    await this.userTalismanRepository.update({ userId }, { equipped: false });
    return { success: true, message: 'Talismã desequipado.' };
  }

  /** Retorna o talismã equipado do usuário (para aplicar bônus na arena). */
  async getEquippedTalisman(userId: number): Promise<{ bonusScorePct: number; bonusCashPct: number; bonusArenaPointsPct: number } | null> {
    const ut = await this.userTalismanRepository.findOne({
      where: { userId, equipped: true },
      relations: ['template'],
    });
    if (!ut?.template) return null;
    return {
      bonusScorePct: ut.template.bonusScorePct ?? 0,
      bonusCashPct: ut.template.bonusCashPct ?? 0,
      bonusArenaPointsPct: ut.template.bonusArenaPointsPct ?? 0,
    };
  }

  /** Retorna dados do talismã equipado para exibição no frontend (nome + bônus). */
  async getEquippedTalismanForDisplay(userId: number): Promise<{ name: string; bonusScorePct: number; bonusCashPct: number; bonusArenaPointsPct: number; charges: number } | null> {
    const ut = await this.userTalismanRepository.findOne({
      where: { userId, equipped: true },
      relations: ['template'],
    });
    if (!ut?.template) return null;
    return {
      name: ut.template.name ?? 'Talismã',
      bonusScorePct: ut.template.bonusScorePct ?? 0,
      bonusCashPct: ut.template.bonusCashPct ?? 0,
      bonusArenaPointsPct: ut.template.bonusArenaPointsPct ?? 0,
      charges: ut.charges ?? 0,
    };
  }

  /** Consome 1 carga do talismã equipado do usuário após um duelo na arena. Se chegar a 0, remove o talismã. */
  async consumeTalismanChargeForArenaDuel(userId: number): Promise<void> {
    const ut = await this.userTalismanRepository.findOne({
      where: { userId, equipped: true },
    });
    if (!ut) return;
    ut.charges = (ut.charges ?? 10) - 1;
    if (ut.charges <= 0) {
      await this.userTalismanRepository.remove(ut);
      return;
    }
    await this.userTalismanRepository.save(ut);
  }

  /** Retorna bônus de talismã equipado para vários usuários (uma query). */
  async getEquippedTalismansForUsers(
    userIds: number[]
  ): Promise<Map<number, { bonusScorePct: number; bonusCashPct: number; bonusArenaPointsPct: number }>> {
    if (userIds.length === 0) return new Map();
    const list = await this.userTalismanRepository.find({
      where: { userId: In(userIds), equipped: true },
      relations: ['template'],
    });
    const map = new Map<number, { bonusScorePct: number; bonusCashPct: number; bonusArenaPointsPct: number }>();
    for (const ut of list) {
      if (ut.template) {
        map.set(ut.userId, {
          bonusScorePct: ut.template.bonusScorePct ?? 0,
          bonusCashPct: ut.template.bonusCashPct ?? 0,
          bonusArenaPointsPct: ut.template.bonusArenaPointsPct ?? 0,
        });
      }
    }
    return map;
  }

  // ==================== COMPRAR SLEEVE ====================
  async purchaseSleeve(
    userId: number,
    sleeveId: string,
    paymentMethod: string
  ): Promise<{ success: boolean; message: string; remainingBalance: { credits: number; cash: number } }> {
    const sleeve = await this.cosmeticsService.findOneSleeve(sleeveId);
    if (!sleeve.isForSale || !sleeve.isActive) {
      throw new BadRequestException('Esta sleeve não está disponível para compra');
    }

    const price = paymentMethod === 'credits' ? (sleeve.priceCredits ?? 0) : (sleeve.priceCash ?? 0);
    if (price <= 0) {
      throw new BadRequestException(`Esta sleeve não tem preço definido para ${this.getCurrencyName(paymentMethod)}`);
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const balance = paymentMethod === 'credits' ? (user.credits || 0) : (user.cash || 0);
    if (balance < price) {
      throw new BadRequestException(
        `Saldo insuficiente! Precisa de ${price} ${this.getCurrencyName(paymentMethod)}. Você tem ${balance}.`
      );
    }

    const ownedIds = Array.isArray(user.ownedSleeveIds) ? user.ownedSleeveIds : [];
    if (ownedIds.includes(sleeveId)) {
      throw new BadRequestException('Você já possui esta sleeve');
    }

    this.deductBalance(user, price, paymentMethod);
    user.ownedSleeveIds = [...ownedIds, sleeveId];
    await this.userRepository.save(user);

    return {
      success: true,
      message: `Sleeve "${sleeve.name}" comprada com sucesso!`,
      remainingBalance: { credits: user.credits ?? 0, cash: user.cash ?? 0 },
    };
  }

  // ==================== COMPRAR PLAYMAT ====================
  async purchasePlaymat(
    userId: number,
    playmatId: string,
    paymentMethod: string
  ): Promise<{ success: boolean; message: string; remainingBalance: { credits: number; cash: number } }> {
    const playmat = await this.cosmeticsService.findOnePlaymat(playmatId);
    if (!playmat.isForSale || !playmat.isActive) {
      throw new BadRequestException('Este playmat não está disponível para compra');
    }

    const price = paymentMethod === 'credits' ? (playmat.priceCredits ?? 0) : (playmat.priceCash ?? 0);
    if (price <= 0) {
      throw new BadRequestException(`Este playmat não tem preço definido para ${this.getCurrencyName(paymentMethod)}`);
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const balance = paymentMethod === 'credits' ? (user.credits || 0) : (user.cash || 0);
    if (balance < price) {
      throw new BadRequestException(
        `Saldo insuficiente! Precisa de ${price} ${this.getCurrencyName(paymentMethod)}. Você tem ${balance}.`
      );
    }

    const ownedIds = Array.isArray(user.ownedPlaymatIds) ? user.ownedPlaymatIds : [];
    if (ownedIds.includes(playmatId)) {
      throw new BadRequestException('Você já possui este playmat');
    }

    this.deductBalance(user, price, paymentMethod);
    user.ownedPlaymatIds = [...ownedIds, playmatId];
    await this.userRepository.save(user);

    return {
      success: true,
      message: `Playmat "${playmat.name}" comprado com sucesso!`,
      remainingBalance: { credits: user.credits ?? 0, cash: user.cash ?? 0 },
    };
  }

  // ==================== VERIFICAR SE USUÁRIO TEM CARTA ====================
  async userHasCard(userId: number, cardId: string): Promise<boolean> {
    const userCard = await this.userCardRepository.findOne({
      where: { userId, cardId },
    });
    return !!userCard && userCard.quantity > 0;
  }

  // ==================== VENDER CARTA ====================
  async sellCard(
    userId: number,
    cardId: string,
    quantity: number = 1
  ): Promise<{
    success: boolean;
    message: string;
    creditsGained?: number;
    cashGained?: number;
    remainingQuantity?: number;
  }> {
    // Buscar a carta do usuário
    const userCard = await this.userCardRepository.findOne({
      where: { userId, cardId },
      relations: ['card'],
    });

    if (!userCard || userCard.quantity < quantity) {
      throw new BadRequestException(
        `Você não possui ${quantity} cópia(s) desta carta`
      );
    }

    const quantityInDecks = await this.getQuantityInDecks(userId, cardId);
    const sellableQuantity = userCard.quantity - quantityInDecks;
    if (sellableQuantity <= 0) {
      throw new BadRequestException(
        'Esta carta está em um ou mais decks. Remova-a dos decks para poder vendê-la (só é possível vender cartas da maleta).'
      );
    }
    if (quantity > sellableQuantity) {
      throw new BadRequestException(
        `Você só pode vender ${sellableQuantity} cópia(s) desta carta (as outras ${quantityInDecks} estão em deck(s)).`
      );
    }

    const card = userCard.card;
    if (!card) {
      throw new NotFoundException('Carta não encontrada');
    }

    // Garantir preços da carta (buscar do BD se relação veio sem preço)
    let buyPriceCredits = Number(card.priceCredits) || 0;
    let buyPriceCash = Number(card.priceCash) || 0;
    if (buyPriceCredits === 0 && buyPriceCash === 0) {
      const cardPrices = await this.cardRepository.findOne({
        where: { id: cardId },
        select: ['priceCredits', 'priceCash'],
      });
      if (cardPrices) {
        buyPriceCredits = Number(cardPrices.priceCredits) || 0;
        buyPriceCash = Number(cardPrices.priceCash) || 0;
      }
    }

    // Preço de venda = metade do valor de compra (sempre)
    const sellPriceCredits = Math.floor(buyPriceCredits / 2);
    const sellPriceCash = Math.floor(buyPriceCash / 2);

    if (sellPriceCredits === 0 && sellPriceCash === 0) {
      throw new BadRequestException('Esta carta não pode ser vendida (sem preço definido)');
    }

    // Remover carta do inventário
    if (userCard.quantity === quantity) {
      // Se vender todas as cópias, deletar do inventário
      await this.userCardRepository.remove(userCard);
    } else {
      // Se vender apenas algumas, reduzir quantidade
      userCard.quantity -= quantity;
      await this.userCardRepository.save(userCard);
    }

    // Adicionar créditos/cash ao usuário (apenas via addCurrency para não somar duas vezes)
    const user = await this.userRepository.findOne({ where: { id: userId }, select: ['username'] });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const creditsAmount = sellPriceCredits * quantity;
    const cashAmount = sellPriceCash * quantity;

    if (creditsAmount > 0) {
      await this.economyService.addCurrency(
        userId,
        CurrencyType.CREDITS,
        creditsAmount,
        TransactionType.EARN,
        `Venda de ${quantity} cópia(s) de ${card.name}`,
        { cardId, cardName: card.name, quantity, type: 'CARD_SALE' }
      );
    }
    if (cashAmount > 0) {
      await this.economyService.addCurrency(
        userId,
        CurrencyType.CASH,
        cashAmount,
        TransactionType.EARN,
        `Venda de ${quantity} cópia(s) de ${card.name}`,
        { cardId, cardName: card.name, quantity, type: 'CARD_SALE' }
      );
    }

    console.log(`💰 Usuário ${user.username} vendeu ${quantity} cópia(s) de ${card.name} por ${creditsAmount} créditos e ${cashAmount} cash (metade do valor)`);

    return {
      success: true,
      message: `Carta(s) vendida(s) com sucesso!`,
      creditsGained: creditsAmount,
      cashGained: cashAmount,
      remainingQuantity: userCard.quantity - quantity >= 0 ? userCard.quantity - quantity : 0,
    };
  }

  // ==================== HELPERS ====================
  private getCurrencyName(paymentMethod: string): string {
    const names: Record<string, string> = {
      'coins': 'moedas',
      'credits': 'créditos',
      'cash': 'cash',
    };
    return names[paymentMethod] || 'moeda desconhecida';
  }

  private getBalance(user: User, paymentMethod: string): number {
    switch (paymentMethod) {
      case 'credits':
        return user.credits || 0;
      case 'cash':
        return user.cash || 0;
      default:
        return 0;
    }
  }

  // ==================== ADICIONAR SALDO (ADMIN) ====================
  async addUserBalance(
    userId: number,
    amount: number,
    currency: 'credits' | 'cash'
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    switch (currency) {
      case 'credits':
        user.credits += amount;
        break;
      case 'cash':
        user.cash += amount;
        break;
    }

    await this.userRepository.save(user);
    console.log(`💰 Adicionado ${amount} ${currency} para ${user.username}`);
    
    return user;
  }
}
