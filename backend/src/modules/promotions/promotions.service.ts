import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CardPromotion } from './entities/card-promotion.entity';
import { Card } from '../cards/entities/card.entity';

export interface CreatePromotionDto {
  cardId: string;
  discountPercent: number;
  startsAt: string; // ISO date
  endsAt: string;
  label?: string | null;
}

export interface UpdatePromotionDto {
  discountPercent?: number;
  startsAt?: string;
  endsAt?: string;
  label?: string | null;
}

@Injectable()
export class PromotionsService implements OnModuleInit {
  constructor(
    @InjectRepository(CardPromotion)
    private promotionRepository: Repository<CardPromotion>,
  ) {}

  async onModuleInit() {
    try {
      const tableExists = await this.promotionRepository.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'card_promotions'
      `);
      if (tableExists.length === 0) {
        await this.promotionRepository.query(`
          CREATE TABLE "card_promotions" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "cardId" uuid NOT NULL,
            "discountPercent" integer NOT NULL DEFAULT 0,
            "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "label" character varying(120),
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_card_promotions" PRIMARY KEY ("id"),
            CONSTRAINT "FK_card_promotions_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
          )
        `);
        await this.promotionRepository.query(`CREATE INDEX "IDX_card_promotions_cardId" ON "card_promotions" ("cardId")`);
        await this.promotionRepository.query(`CREATE INDEX "IDX_card_promotions_dates" ON "card_promotions" ("startsAt", "endsAt")`);
      }
    } catch (e) {
      // ignore if table already exists or migration already ran
    }
  }

  async findAll(): Promise<(CardPromotion & { card?: Card })[]> {
    return this.promotionRepository.find({
      relations: ['card'],
      order: { startsAt: 'DESC' },
    });
  }

  async findActiveForCardIds(cardIds: string[]): Promise<Map<string, CardPromotion>> {
    if (cardIds.length === 0) return new Map();
    const now = new Date();
    const list = await this.promotionRepository
      .createQueryBuilder('p')
      .where('p.cardId IN (:...ids)', { ids: cardIds })
      .andWhere('p.startsAt <= :now', { now })
      .andWhere('p.endsAt >= :now', { now })
      .orderBy('p.discountPercent', 'DESC') // maior desconto primeiro
      .getMany();

    const map = new Map<string, CardPromotion>();
    for (const p of list) {
      if (!map.has(p.cardId)) map.set(p.cardId, p);
    }
    return map;
  }

  async findOne(id: string): Promise<CardPromotion> {
    const p = await this.promotionRepository.findOne({
      where: { id },
      relations: ['card'],
    });
    if (!p) throw new NotFoundException('Promoção não encontrada');
    return p;
  }

  async create(dto: CreatePromotionDto): Promise<CardPromotion> {
    const discount = Math.min(100, Math.max(0, Number(dto.discountPercent) || 0));
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt deve ser posterior a startsAt');
    }
    const promotion = this.promotionRepository.create({
      cardId: dto.cardId,
      discountPercent: discount,
      startsAt,
      endsAt,
      label: dto.label ?? null,
    });
    return this.promotionRepository.save(promotion);
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<CardPromotion> {
    const promotion = await this.findOne(id);
    if (dto.discountPercent !== undefined) {
      promotion.discountPercent = Math.min(100, Math.max(0, Number(dto.discountPercent)));
    }
    if (dto.startsAt !== undefined) promotion.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) promotion.endsAt = new Date(dto.endsAt);
    if (dto.label !== undefined) promotion.label = dto.label ?? null;
    if (promotion.endsAt <= promotion.startsAt) {
      throw new BadRequestException('endsAt deve ser posterior a startsAt');
    }
    return this.promotionRepository.save(promotion);
  }

  async remove(id: string): Promise<void> {
    const p = await this.promotionRepository.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Promoção não encontrada');
    await this.promotionRepository.remove(p);
  }

  /** Preço efetivo após desconto (para créditos ou cash). */
  getEffectivePrice(originalPrice: number, discountPercent: number): number {
    if (originalPrice == null || originalPrice <= 0) return originalPrice;
    const discount = Math.min(100, Math.max(0, discountPercent));
    return Math.max(0, Math.floor(originalPrice * (1 - discount / 100)));
  }
}
