import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { PromoCode, PromoCodeRewardType } from './entities/promo-code.entity';
import { PromoCodeRedemption } from './entities/promo-code-redemption.entity';
import { EconomyService } from '../economy/economy.service';
import {
  CurrencyType,
  TransactionType,
} from '../economy/entities/transaction.entity';
import { ShopService } from '../shop/shop.service';
import { Card } from '../cards/entities/card.entity';

export type PromoCodeInput = {
  code?: string;
  label?: string | null;
  isActive?: boolean;
  maxUses?: number | null;
  maxUsesPerUser?: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  rewardType?: string;
  rewardAmount?: number;
  rewardCardId?: string | null;
};

@Injectable()
export class PromoCodesService implements OnModuleInit {
  private readonly logger = new Logger(PromoCodesService.name);

  constructor(
    @InjectRepository(PromoCode)
    private readonly promoCodeRepo: Repository<PromoCode>,
    @InjectRepository(PromoCodeRedemption)
    private readonly redemptionRepo: Repository<PromoCodeRedemption>,
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    private readonly dataSource: DataSource,
    private readonly economyService: EconomyService,
    private readonly shopService: ShopService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureTables();
    } catch (e) {
      this.logger.error('Erro ao garantir tabelas de códigos de resgate:', e);
    }
  }

  private async ensureTables() {
    const qr = this.dataSource.createQueryRunner();
    try {
      await qr.connect();
      try {
        await qr.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
      } catch {
        /* já existe */
      }
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "promo_codes" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "code" varchar(64) NOT NULL,
          "label" varchar(120),
          "isActive" boolean NOT NULL DEFAULT true,
          "maxUses" int,
          "usesCount" int NOT NULL DEFAULT 0,
          "maxUsesPerUser" int NOT NULL DEFAULT 1,
          "startsAt" TIMESTAMPTZ,
          "expiresAt" TIMESTAMPTZ,
          "rewardType" varchar(20) NOT NULL DEFAULT 'credits',
          "rewardAmount" int NOT NULL DEFAULT 0,
          "rewardCardId" uuid,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_promo_codes_code" UNIQUE ("code")
        )
      `);
      await qr.query(`
        CREATE TABLE IF NOT EXISTS "promo_code_redemptions" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "promoCodeId" uuid NOT NULL REFERENCES "promo_codes"("id") ON DELETE CASCADE,
          "userId" int NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await qr.query(
        `CREATE INDEX IF NOT EXISTS "IDX_promo_codes_active" ON "promo_codes" ("isActive")`,
      );
      await qr.query(
        `CREATE INDEX IF NOT EXISTS "IDX_promo_code_redemptions_code_user" ON "promo_code_redemptions" ("promoCodeId", "userId")`,
      );
      await qr.query(
        `CREATE INDEX IF NOT EXISTS "IDX_promo_code_redemptions_userId" ON "promo_code_redemptions" ("userId")`,
      );
      this.logger.log('Tabelas de códigos de resgate verificadas/criadas.');
    } finally {
      await qr.release();
    }
  }

  private normalizeCode(raw: string): string {
    return String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  private generateRandomCode(length = 10): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  private normalizeRewardType(value?: string): PromoCodeRewardType {
    const v = String(value || PromoCodeRewardType.CREDITS).toLowerCase();
    if (v === PromoCodeRewardType.CASH) return PromoCodeRewardType.CASH;
    if (v === PromoCodeRewardType.CARD) return PromoCodeRewardType.CARD;
    return PromoCodeRewardType.CREDITS;
  }

  private parseOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Data inválida');
    }
    return d;
  }

  private async assertRewardValid(
    rewardType: PromoCodeRewardType,
    rewardAmount: number,
    rewardCardId: string | null,
  ) {
    if (rewardType === PromoCodeRewardType.CARD) {
      if (!rewardCardId) {
        throw new BadRequestException('Informe a carta da recompensa');
      }
      const card = await this.cardRepo.findOne({
        where: { id: rewardCardId },
        select: ['id'],
      });
      if (!card) throw new BadRequestException('Carta da recompensa não encontrada');
      return;
    }
    if (rewardAmount <= 0) {
      throw new BadRequestException('Quantidade da recompensa deve ser maior que zero');
    }
  }

  private async enrichWithCard(row: PromoCode) {
    if (row.rewardType !== PromoCodeRewardType.CARD || !row.rewardCardId) {
      return { ...row, rewardCard: null as null };
    }
    const card = await this.cardRepo.findOne({
      where: { id: row.rewardCardId },
      select: ['id', 'name', 'cardImage'],
    });
    return {
      ...row,
      rewardCard: card
        ? { id: card.id, name: card.name, cardImage: card.cardImage }
        : null,
    };
  }

  async findAllAdmin() {
    const rows = await this.promoCodeRepo.find({
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((r) => this.enrichWithCard(r)));
  }

  async create(input: PromoCodeInput) {
    let code = this.normalizeCode(input.code || '');
    if (!code) {
      for (let i = 0; i < 8; i++) {
        code = this.generateRandomCode(10);
        const exists = await this.promoCodeRepo.findOne({ where: { code } });
        if (!exists) break;
      }
    }
    if (!code || code.length < 3) {
      throw new BadRequestException('Código deve ter pelo menos 3 caracteres');
    }
    if (code.length > 64) {
      throw new BadRequestException('Código muito longo (máx. 64)');
    }

    const existing = await this.promoCodeRepo.findOne({ where: { code } });
    if (existing) {
      throw new BadRequestException('Este código já existe');
    }

    const rewardType = this.normalizeRewardType(input.rewardType);
    const rewardAmount = Math.max(0, Math.floor(Number(input.rewardAmount) || 0));
    const rewardCardId =
      rewardType === PromoCodeRewardType.CARD
        ? input.rewardCardId || null
        : null;

    await this.assertRewardValid(rewardType, rewardAmount, rewardCardId);

    const maxUses =
      input.maxUses === undefined || input.maxUses === null
        ? null
        : Math.max(1, Math.floor(Number(input.maxUses)));

    const maxUsesPerUser = Math.max(
      1,
      Math.floor(Number(input.maxUsesPerUser ?? 1) || 1),
    );

    const row = this.promoCodeRepo.create({
      code,
      label: input.label?.trim() || null,
      isActive: input.isActive !== false,
      maxUses,
      usesCount: 0,
      maxUsesPerUser,
      startsAt: this.parseOptionalDate(input.startsAt),
      expiresAt: this.parseOptionalDate(input.expiresAt),
      rewardType,
      rewardAmount:
        rewardType === PromoCodeRewardType.CARD
          ? Math.max(1, rewardAmount || 1)
          : rewardAmount,
      rewardCardId,
    });

    const saved = await this.promoCodeRepo.save(row);
    return this.enrichWithCard(saved);
  }

  async update(id: string, input: PromoCodeInput) {
    const row = await this.promoCodeRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Código não encontrado');

    if (input.code !== undefined) {
      const code = this.normalizeCode(input.code);
      if (!code || code.length < 3) {
        throw new BadRequestException('Código deve ter pelo menos 3 caracteres');
      }
      if (code !== row.code) {
        const exists = await this.promoCodeRepo.findOne({ where: { code } });
        if (exists) throw new BadRequestException('Este código já existe');
        row.code = code;
      }
    }

    if (input.label !== undefined) {
      row.label = input.label?.trim() || null;
    }
    if (input.isActive !== undefined) {
      row.isActive = !!input.isActive;
    }
    if (input.maxUses !== undefined) {
      row.maxUses =
        input.maxUses === null
          ? null
          : Math.max(1, Math.floor(Number(input.maxUses)));
    }
    if (input.maxUsesPerUser !== undefined) {
      row.maxUsesPerUser = Math.max(
        1,
        Math.floor(Number(input.maxUsesPerUser) || 1),
      );
    }
    if (input.startsAt !== undefined) {
      row.startsAt = this.parseOptionalDate(input.startsAt);
    }
    if (input.expiresAt !== undefined) {
      row.expiresAt = this.parseOptionalDate(input.expiresAt);
    }

    if (input.rewardType !== undefined) {
      row.rewardType = this.normalizeRewardType(input.rewardType);
    }
    if (input.rewardAmount !== undefined) {
      row.rewardAmount = Math.max(0, Math.floor(Number(input.rewardAmount) || 0));
    }
    if (input.rewardCardId !== undefined) {
      row.rewardCardId =
        row.rewardType === PromoCodeRewardType.CARD
          ? input.rewardCardId || null
          : null;
    }
    if (row.rewardType !== PromoCodeRewardType.CARD) {
      row.rewardCardId = null;
    } else {
      row.rewardAmount = Math.max(1, row.rewardAmount || 1);
    }

    await this.assertRewardValid(
      row.rewardType,
      row.rewardAmount,
      row.rewardCardId,
    );

    const saved = await this.promoCodeRepo.save(row);
    return this.enrichWithCard(saved);
  }

  async setActive(id: string, isActive: boolean) {
    return this.update(id, { isActive });
  }

  async remove(id: string) {
    const row = await this.promoCodeRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Código não encontrado');
    await this.promoCodeRepo.remove(row);
    return { ok: true };
  }

  private async grantReward(
    userId: number,
    type: PromoCodeRewardType,
    amount: number,
    cardId: string | null,
    label: string,
  ) {
    if (type === PromoCodeRewardType.CREDITS) {
      if (amount > 0) {
        await this.economyService.addCurrency(
          userId,
          CurrencyType.CREDITS,
          amount,
          TransactionType.REWARD,
          label,
        );
      }
      return { rewardType: type, rewardAmount: amount, rewardCardId: null as string | null };
    }
    if (type === PromoCodeRewardType.CASH) {
      if (amount > 0) {
        await this.economyService.addCurrency(
          userId,
          CurrencyType.CASH,
          amount,
          TransactionType.REWARD,
          label,
        );
      }
      return { rewardType: type, rewardAmount: amount, rewardCardId: null as string | null };
    }
    if (type === PromoCodeRewardType.CARD) {
      if (!cardId) throw new BadRequestException('Recompensa de carta sem cardId');
      const qty = Math.max(1, amount || 1);
      await this.shopService.addCardToUserInventory(userId, cardId, 'REWARD', qty);
      return { rewardType: type, rewardAmount: qty, rewardCardId: cardId };
    }
    throw new BadRequestException('Tipo de recompensa inválido');
  }

  async redeem(userId: number, rawCode: string) {
    const code = this.normalizeCode(rawCode);
    if (!code) throw new BadRequestException('Informe o código');

    return this.dataSource.transaction(async (manager) => {
      const promoRepo = manager.getRepository(PromoCode);
      const redemptionRepo = manager.getRepository(PromoCodeRedemption);

      const promo = await promoRepo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.code = :code', { code })
        .getOne();

      if (!promo) {
        throw new NotFoundException('Código inválido');
      }
      if (!promo.isActive) {
        throw new BadRequestException('Este código não está ativo');
      }

      const now = new Date();
      if (promo.startsAt && now < promo.startsAt) {
        throw new BadRequestException('Este código ainda não está disponível');
      }
      if (promo.expiresAt && now > promo.expiresAt) {
        throw new BadRequestException('Este código expirou');
      }
      if (promo.maxUses != null && promo.usesCount >= promo.maxUses) {
        throw new BadRequestException('Este código atingiu o limite de usos');
      }

      const userUses = await redemptionRepo.count({
        where: { promoCodeId: promo.id, userId },
      });
      if (userUses >= promo.maxUsesPerUser) {
        throw new BadRequestException('Você já resgatou este código');
      }

      const granted = await this.grantReward(
        userId,
        promo.rewardType,
        promo.rewardAmount,
        promo.rewardCardId,
        `Código de resgate: ${promo.code}`,
      );

      await redemptionRepo.save(
        redemptionRepo.create({
          promoCodeId: promo.id,
          userId,
        }),
      );

      promo.usesCount = (promo.usesCount || 0) + 1;
      await promoRepo.save(promo);

      let rewardCard: { id: string; name: string; cardImage: string } | null =
        null;
      if (granted.rewardCardId) {
        const card = await manager.getRepository(Card).findOne({
          where: { id: granted.rewardCardId },
          select: ['id', 'name', 'cardImage'],
        });
        if (card) {
          rewardCard = {
            id: card.id,
            name: card.name,
            cardImage: card.cardImage,
          };
        }
      }

      return {
        ok: true,
        code: promo.code,
        label: promo.label,
        reward: {
          type: granted.rewardType,
          amount: granted.rewardAmount,
          card: rewardCard,
        },
        message: this.formatRewardMessage(granted.rewardType, granted.rewardAmount, rewardCard?.name),
      };
    });
  }

  private formatRewardMessage(
    type: PromoCodeRewardType,
    amount: number,
    cardName?: string,
  ): string {
    if (type === PromoCodeRewardType.CREDITS) {
      return `Você recebeu ${amount} crédito${amount === 1 ? '' : 's'}!`;
    }
    if (type === PromoCodeRewardType.CASH) {
      return `Você recebeu ${amount} cash!`;
    }
    if (type === PromoCodeRewardType.CARD) {
      const name = cardName || 'carta';
      return amount > 1
        ? `Você recebeu ${amount}x ${name}!`
        : `Você recebeu ${name}!`;
    }
    return 'Código resgatado com sucesso!';
  }
}
