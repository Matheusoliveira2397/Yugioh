import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopItem, ShopItemCurrency } from './entities/shop-item.entity';
import { Card, CardRarity } from '../cards/entities/card.entity';
import { UserCard } from './entities/user-card.entity';
import { User } from '../users/entities/user.entity';
import { PurchaseCardDto, PaymentMethod } from './dto/purchase-card.dto';

@Injectable()
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
      .addOrderBy('shopItem.createdAt', 'DESC');

    return query.getMany();
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
      if (!card.priceCoins && !card.priceCredits && !card.priceCash) {
        shopItem.price = this.calculatePriceByRarity(card.rarity);
      }
      await this.shopItemRepository.save(shopItem);
      console.log(`🔄 Item de loja atualizado para carta ${card.id}`);
    }
  }

  // ==================== SISTEMA DE COMPRA COMPLETO ====================
  
  async purchaseCard(userId: string, purchaseDto: PurchaseCardDto): Promise<{
    success: boolean;
    message: string;
    card: Card;
    userCard: UserCard;
    remainingBalance: { coins?: number; credits?: number; cash?: number };
  }> {
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

    // 3. VERIFICAR PREÇO E SALDO
    const { price, canPurchase, missingAmount } = this.checkUserBalance(
      user,
      card,
      purchaseDto.paymentMethod
    );

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
        coins: user.coins,
        credits: user.credits,
        cash: user.cash,
      },
    };
  }

  // ==================== VERIFICAR SALDO DO USUÁRIO ====================
  private checkUserBalance(
    user: User,
    card: Card,
    paymentMethod: PaymentMethod
  ): { price: number; canPurchase: boolean; missingAmount: number } {
    let price = 0;
    let userBalance = 0;

    // Determinar preço e saldo baseado no método de pagamento
    switch (paymentMethod) {
      case PaymentMethod.COINS:
        price = card.priceCoins || 0;
        userBalance = user.coins || 0;
        break;
      case PaymentMethod.CREDITS:
        price = card.priceCredits || 0;
        userBalance = user.credits || 0;
        break;
      case PaymentMethod.CASH:
        price = Number(card.priceCash) || 0;
        userBalance = user.cash || 0;
        break;
    }

    // Verificar se a carta tem preço para este método
    if (price === 0) {
      throw new BadRequestException(
        `Esta carta não pode ser comprada com ${this.getCurrencyName(paymentMethod)}`
      );
    }

    const canPurchase = userBalance >= price;
    const missingAmount = canPurchase ? 0 : price - userBalance;

    return { price, canPurchase, missingAmount };
  }

  // ==================== DEDUZIR SALDO ====================
  private deductBalance(user: User, amount: number, paymentMethod: PaymentMethod): void {
    switch (paymentMethod) {
      case PaymentMethod.COINS:
        user.coins -= amount;
        break;
      case PaymentMethod.CREDITS:
        user.credits -= amount;
        break;
      case PaymentMethod.CASH:
        user.cash -= amount;
        break;
    }
  }

  // ==================== ADICIONAR CARTA AO INVENTÁRIO ====================
  async addCardToUserInventory(
    userId: string,
    cardId: string,
    acquiredBy: 'PURCHASE' | 'REWARD' | 'DROP' | 'GIFT' = 'PURCHASE'
  ): Promise<UserCard> {
    // Verificar se usuário já tem esta carta
    const existingUserCard = await this.userCardRepository.findOne({
      where: { userId, cardId },
    });

    if (existingUserCard) {
      // Aumentar quantidade
      existingUserCard.quantity += 1;
      return this.userCardRepository.save(existingUserCard);
    }

    // Criar nova entrada no inventário
    const userCard = this.userCardRepository.create({
      userId,
      cardId,
      quantity: 1,
      acquiredBy,
    });

    return this.userCardRepository.save(userCard);
  }

  // ==================== BUSCAR INVENTÁRIO DO USUÁRIO ====================
  async getUserInventory(userId: string): Promise<UserCard[]> {
    return this.userCardRepository.find({
      where: { userId },
      relations: ['card'],
      order: { createdAt: 'DESC' },
    });
  }

  // ==================== VERIFICAR SE USUÁRIO TEM CARTA ====================
  async userHasCard(userId: string, cardId: string): Promise<boolean> {
    const userCard = await this.userCardRepository.findOne({
      where: { userId, cardId },
    });
    return !!userCard && userCard.quantity > 0;
  }

  // ==================== HELPERS ====================
  private getCurrencyName(paymentMethod: PaymentMethod): string {
    const names = {
      [PaymentMethod.COINS]: 'moedas',
      [PaymentMethod.CREDITS]: 'créditos',
      [PaymentMethod.CASH]: 'cash',
    };
    return names[paymentMethod];
  }

  private getBalance(user: User, paymentMethod: PaymentMethod): number {
    switch (paymentMethod) {
      case PaymentMethod.COINS:
        return user.coins || 0;
      case PaymentMethod.CREDITS:
        return user.credits || 0;
      case PaymentMethod.CASH:
        return user.cash || 0;
    }
  }

  // ==================== ADICIONAR SALDO (ADMIN) ====================
  async addUserBalance(
    userId: string,
    amount: number,
    currency: 'coins' | 'credits' | 'cash'
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    switch (currency) {
      case 'coins':
        user.coins += amount;
        break;
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
