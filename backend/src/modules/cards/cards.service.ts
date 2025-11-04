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
    const card = await this.cardsRepository.findOne({ where: { id } });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  async create(cardData: Partial<Card>): Promise<Card> {
    console.log('📝 Criando carta com dados:', JSON.stringify(cardData, null, 2));
    
    if (!cardData.name) {
      throw new BadRequestException('Nome da carta é obrigatório');
    }

    // Criar a carta
    const card = this.cardsRepository.create(cardData);
    const savedCard = await this.cardsRepository.save(card);
    console.log('✅ Carta criada com sucesso:', savedCard.id);
    
    // Se isForSale = true, adiciona automaticamente à loja
    if (savedCard.isForSale) {
      try {
        await this.shopService.addCardToShop(savedCard);
        console.log('🛒 Carta adicionada à loja automaticamente');
      } catch (error) {
        console.error('❌ Erro ao adicionar carta à loja:', error.message);
      }
    }
    
    return savedCard;
  }

  async update(id: string, cardData: Partial<Card>): Promise<Card> {
    const card = await this.findOne(id);
    const wasForSale = card.isForSale;
    
    Object.assign(card, cardData);
    const updatedCard = await this.cardsRepository.save(card);
    
    // Se mudou de não-venda para venda, adicionar à loja
    if (!wasForSale && updatedCard.isForSale) {
      try {
        await this.shopService.addCardToShop(updatedCard);
        console.log('🛒 Carta adicionada à loja');
      } catch (error) {
        console.error('❌ Erro ao adicionar carta à loja:', error.message);
      }
    }
    
    // Se mudou de venda para não-venda, remover da loja
    if (wasForSale && !updatedCard.isForSale) {
      try {
        await this.shopService.removeCardFromShop(id);
        console.log('🗑️ Carta removida da loja');
      } catch (error) {
        console.error('❌ Erro ao remover carta da loja:', error.message);
      }
    }
    
    // Se ainda está à venda, atualizar na loja
    if (wasForSale && updatedCard.isForSale) {
      try {
        await this.shopService.updateCardInShop(updatedCard);
        console.log('🔄 Carta atualizada na loja');
      } catch (error) {
        console.error('❌ Erro ao atualizar carta na loja:', error.message);
      }
    }
    
    return updatedCard;
  }

  async delete(id: string): Promise<void> {
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
  }

  async hardDelete(id: string): Promise<void> {
    // Remover da loja antes de deletar
    try {
      await this.shopService.removeCardFromShop(id);
    } catch (error) {
      console.error('❌ Erro ao remover carta da loja:', error.message);
    }
    
    await this.cardsRepository.delete(id);
    console.log('🗑️ Carta deletada permanentemente');
  }

  async getAllAdmin(): Promise<Card[]> {
    // Para admin ver todas, incluindo inativas
    return this.cardsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getCardsForSale(): Promise<Card[]> {
    // Retorna apenas cartas ativas e à venda
    return this.cardsRepository.find({
      where: { 
        isActive: true, 
        isForSale: true 
      },
      order: { 
        rarity: 'DESC',
        createdAt: 'DESC' 
      },
    });
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

    // Criar objeto de efeito
    const effect = {
      type: addEffectDto.effectType,
      timing: addEffectDto.timing,
      condition: addEffectDto.condition,
      action: addEffectDto.action,
      target: addEffectDto.target,
      params: addEffectDto.params,
      cost: addEffectDto.cost,
    };

    // Adicionar efeito à carta
    card.effect = effect;
    
    const updatedCard = await this.cardsRepository.save(card);
    console.log(`✨ Efeito adicionado à carta "${card.name}"`);
    
    return updatedCard;
  }

  // ==================== REMOVER EFEITO DA CARTA ====================
  async removeEffectFromCard(cardName: string): Promise<Card> {
    const card = await this.findByNameExact(cardName);
    
    if (!card) {
      throw new NotFoundException(`Carta "${cardName}" não encontrada`);
    }

    card.effect = undefined;
    
    const updatedCard = await this.cardsRepository.save(card);
    console.log(`🗑️ Efeito removido da carta "${card.name}"`);
    
    return updatedCard;
  }

  // ==================== LISTAR CARTAS COM EFEITOS ====================
  async findCardsWithEffects(): Promise<Card[]> {
    return this.cardsRepository
      .createQueryBuilder('card')
      .where('card.effect IS NOT NULL')
      .andWhere('card.isActive = :isActive', { isActive: true })
      .orderBy('card.name', 'ASC')
      .getMany();
  }

  // ==================== LISTAR CARTAS SEM EFEITOS ====================
  async findCardsWithoutEffects(): Promise<Card[]> {
    return this.cardsRepository
      .createQueryBuilder('card')
      .where('card.effect IS NULL')
      .andWhere('card.isActive = :isActive', { isActive: true })
      .andWhere('card.type = :type', { type: 'Monster' })
      .orderBy('card.name', 'ASC')
      .getMany();
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
