import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopItem, ShopItemCurrency } from './entities/shop-item.entity';
import { Card, CardRarity } from '../cards/entities/card.entity';
import { UserCard } from './entities/user-card.entity';
import { User } from '../users/entities/user.entity';
import { PurchaseCardDto, PaymentMethod } from './dto/purchase-card.dto';
import { EconomyService } from '../economy/economy.service';
import { CurrencyType, TransactionType } from '../economy/entities/transaction.entity';

// Mantém apenas UMA definição da classe ShopService
export class ShopService {
  constructor(
    @InjectRepository(ShopItem)
    private shopItemRepository: Repository<ShopItem>,
    @InjectRepository(UserCard)
    private userCardRepository: Repository<UserCard>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Card)
    private cardRepository: Repository<Card>,
    @Inject(EconomyService)
    private economyService: EconomyService,
  ) {}

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

    // 3. VERIFICAR PREÇO E SALDO
    const { price, canPurchase, missingAmount } = this.checkUserBalance(
      user,
      card,
      purchaseDto.paymentMethod
    );

    console.log('🔍 RESULTADO DA VERIFICAÇÃO:');
    console.log('   - Preço:', price);
    console.log('   - Pode comprar?', canPurchase);
    console.log('   - Falta:', missingAmount);

    if (!canPurchase) {
      throw new BadRequestException(
        `Saldo insuficiente! Faltam ${missingAmount} ${this.getCurrencyName(purchaseDto.paymentMethod)}`
      );
    }

    // 4. DEDUZIR DO SALDO DO USUÁRIO
    this.deductBalance(user, price, purchaseDto.paymentMethod);
    await this.userRepository.save(user);

    // 5. ADICIONAR CARTA AO INVENTÁRIO
    const userCard = await this.addCardToUserInventory(userId, card.id, 'PURCHASE');

    // 6. LOG
    console.log(`✅ Compra realizada:
      - Usuário: ${user.username}
      - Carta: ${card.name}
      - Preço: ${price} ${purchaseDto.paymentMethod}
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
  private checkUserBalance(
    user: User,
    card: Card,
    paymentMethod: string
  ): { price: number; canPurchase: boolean; missingAmount: number } {
    let price = 0;
    let userBalance = 0;

    // Determinar preço e saldo baseado no método de pagamento
    // SISTEMA DE MOEDAS REMOVIDO - apenas Credits e Cash
    switch (paymentMethod) {
      case 'coins':
        // MOEDAS DESATIVADAS - retornar erro
        throw new BadRequestException('Sistema de moedas foi desativado. Use Créditos ou Cash.');
      case 'credits':
        price = card.priceCredits || 0;
        userBalance = user.credits || 0;
        break;
      case 'cash':
        price = Number(card.priceCash) || 0;
        userBalance = user.cash || 0;
        break;
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

  // ==================== BUSCAR INVENTÁRIO DO USUÁRIO ====================
  async getUserInventory(userId: number): Promise<UserCard[]> {
    try {
      return await Promise.race([
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
    } catch (error) {
      return [];
    }
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

    const card = userCard.card;
    if (!card) {
      throw new NotFoundException('Carta não encontrada');
    }

    // Calcular preço de venda (metade do preço de compra)
    const sellPriceCredits = card.priceCredits 
      ? Math.floor(card.priceCredits / 2) 
      : 0;
    const sellPriceCash = card.priceCash 
      ? Math.floor(card.priceCash / 2) 
      : 0;

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

    // Adicionar créditos/cash ao usuário
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (sellPriceCredits > 0) {
      user.credits = (user.credits || 0) + (sellPriceCredits * quantity);
    }
    if (sellPriceCash > 0) {
      user.cash = (user.cash || 0) + (sellPriceCash * quantity);
    }

    await this.userRepository.save(user);

    // Registrar transação
    if (sellPriceCredits > 0) {
      await this.economyService.addCurrency(
        userId,
        CurrencyType.CREDITS,
        sellPriceCredits * quantity,
        TransactionType.EARN,
        `Venda de ${quantity} cópia(s) de ${card.name}`,
        { cardId, cardName: card.name, quantity, type: 'CARD_SALE' }
      );
    }
    if (sellPriceCash > 0) {
      await this.economyService.addCurrency(
        userId,
        CurrencyType.CASH,
        sellPriceCash * quantity,
        TransactionType.EARN,
        `Venda de ${quantity} cópia(s) de ${card.name}`,
        { cardId, cardName: card.name, quantity, type: 'CARD_SALE' }
      );
    }

    console.log(`💰 Usuário ${user.username} vendeu ${quantity} cópia(s) de ${card.name} por ${sellPriceCredits * quantity} créditos e ${sellPriceCash * quantity} cash`);

    return {
      success: true,
      message: `Carta(s) vendida(s) com sucesso!`,
      creditsGained: sellPriceCredits * quantity,
      cashGained: sellPriceCash * quantity,
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
