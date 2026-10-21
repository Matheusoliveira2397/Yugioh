import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditPackage } from './entities/credit-package.entity';
import { CreditPaymentContact } from './entities/credit-payment-contact.entity';

export interface CreditPackagePublicDto {
  id: string;
  credits: number;
  bonus?: number;
  price: number;
  popular?: boolean;
  description?: string;
}

export interface CreateCreditPackageDto {
  credits: number;
  bonusCredits?: number;
  priceBrl: number;
  description?: string | null;
  isPopular?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateCreditPackageDto = Partial<CreateCreditPackageDto>;

export interface CreditPaymentContactPublicDto {
  pixKey: string | null;
  whatsapp: string | null;
}

@Injectable()
export class CreditPackagesService implements OnModuleInit {
  constructor(
    @InjectRepository(CreditPackage)
    private readonly repo: Repository<CreditPackage>,
    @InjectRepository(CreditPaymentContact)
    private readonly contactRepo: Repository<CreditPaymentContact>,
  ) {}

  async onModuleInit() {
    try {
      const tableExists = await this.repo.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'credit_packages'
      `);
      if (!tableExists.length) {
        await this.repo.query(`
          CREATE TABLE "credit_packages" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "credits" integer NOT NULL,
            "bonusCredits" integer NOT NULL DEFAULT 0,
            "priceBrl" numeric(10,2) NOT NULL,
            "description" character varying(255),
            "isPopular" boolean NOT NULL DEFAULT false,
            "sortOrder" integer NOT NULL DEFAULT 0,
            "isActive" boolean NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_credit_packages" PRIMARY KEY ("id")
          )
        `);
        await this.repo.query(
          `CREATE INDEX "IDX_credit_packages_active_sort" ON "credit_packages" ("isActive", "sortOrder")`,
        );
      }
    } catch {
      // tabela já existe ou migração aplicada
    }

    try {
      const contactTable = await this.repo.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'credit_payment_contact'
      `);
      if (!contactTable.length) {
        await this.repo.query(`
          CREATE TABLE "credit_payment_contact" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "pixKey" character varying(255),
            "whatsapp" character varying(64),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_credit_payment_contact" PRIMARY KEY ("id")
          )
        `);
      }
    } catch {
      // ignore
    }

    const contactCount = await this.contactRepo.count();
    if (contactCount === 0) {
      await this.contactRepo.save(this.contactRepo.create({ pixKey: null, whatsapp: null }));
    }

    const cnt = await this.repo.count();
    if (cnt === 0) {
      const defaults: CreateCreditPackageDto[] = [
        { credits: 100, bonusCredits: 0, priceBrl: 9.9, description: 'Pacote básico', sortOrder: 10 },
        {
          credits: 250,
          bonusCredits: 25,
          priceBrl: 19.9,
          description: 'Melhor custo-benefício',
          isPopular: true,
          sortOrder: 20,
        },
        { credits: 500, bonusCredits: 75, priceBrl: 34.9, description: 'Pacote intermediário', sortOrder: 30 },
        { credits: 1000, bonusCredits: 200, priceBrl: 59.9, description: 'Pacote premium', sortOrder: 40 },
        { credits: 2500, bonusCredits: 750, priceBrl: 129.9, description: 'Pacote máximo', sortOrder: 50 },
      ];
      for (const d of defaults) {
        await this.createInternal(d);
      }
    }
  }

  private numPrice(v: string | number): number {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
  }

  toPublicDto(row: CreditPackage): CreditPackagePublicDto {
    const bonus = row.bonusCredits || 0;
    const out: CreditPackagePublicDto = {
      id: row.id,
      credits: row.credits,
      price: this.numPrice(row.priceBrl),
      popular: row.isPopular || undefined,
    };
    if (bonus > 0) out.bonus = bonus;
    if (row.description) out.description = row.description;
    return out;
  }

  async findPublicActive(): Promise<CreditPackagePublicDto[]> {
    const rows = await this.repo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', credits: 'ASC' },
    });
    return rows.map((r) => this.toPublicDto(r));
  }

  async findAllAdmin(): Promise<CreditPackage[]> {
    return this.repo.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<CreditPackage> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Pacote de créditos não encontrado');
    return row;
  }

  private validateDto(d: CreateCreditPackageDto | UpdateCreditPackageDto, isFull: boolean) {
    const credits = d.credits !== undefined ? Number(d.credits) : NaN;
    const price = d.priceBrl !== undefined ? Number(d.priceBrl) : NaN;
    if (isFull) {
      if (!Number.isFinite(credits) || credits < 1) {
        throw new BadRequestException('credits deve ser um inteiro ≥ 1');
      }
      if (!Number.isFinite(price) || price <= 0) {
        throw new BadRequestException('priceBrl deve ser maior que zero');
      }
    } else {
      if (d.credits !== undefined && (!Number.isFinite(credits) || credits < 1)) {
        throw new BadRequestException('credits deve ser um inteiro ≥ 1');
      }
      if (d.priceBrl !== undefined && (!Number.isFinite(price) || price <= 0)) {
        throw new BadRequestException('priceBrl deve ser maior que zero');
      }
    }
    const bonus = d.bonusCredits !== undefined ? Number(d.bonusCredits) : 0;
    if (d.bonusCredits !== undefined && (!Number.isFinite(bonus) || bonus < 0)) {
      throw new BadRequestException('bonusCredits deve ser ≥ 0');
    }
  }

  private async createInternal(dto: CreateCreditPackageDto): Promise<CreditPackage> {
    this.validateDto(dto, true);
    const row = this.repo.create({
      credits: Math.floor(Number(dto.credits)),
      bonusCredits: Math.max(0, Math.floor(Number(dto.bonusCredits ?? 0))),
      priceBrl: String(Number(dto.priceBrl).toFixed(2)),
      description: dto.description?.trim() || null,
      isPopular: !!dto.isPopular,
      sortOrder: Number.isFinite(Number(dto.sortOrder)) ? Number(dto.sortOrder) : 0,
      isActive: dto.isActive !== false,
    });
    return this.repo.save(row);
  }

  async create(dto: CreateCreditPackageDto): Promise<CreditPackage> {
    return this.createInternal(dto);
  }

  async update(id: string, dto: UpdateCreditPackageDto): Promise<CreditPackage> {
    const row = await this.findOne(id);
    if (Object.keys(dto).length) {
      this.validateDto(
        {
          credits: dto.credits ?? row.credits,
          bonusCredits: dto.bonusCredits ?? row.bonusCredits,
          priceBrl: dto.priceBrl ?? this.numPrice(row.priceBrl),
          description: dto.description !== undefined ? dto.description : row.description,
          isPopular: dto.isPopular ?? row.isPopular,
          sortOrder: dto.sortOrder ?? row.sortOrder,
          isActive: dto.isActive ?? row.isActive,
        },
        false,
      );
    }
    if (dto.credits !== undefined) row.credits = Math.floor(Number(dto.credits));
    if (dto.bonusCredits !== undefined) {
      row.bonusCredits = Math.max(0, Math.floor(Number(dto.bonusCredits)));
    }
    if (dto.priceBrl !== undefined) {
      row.priceBrl = String(Number(dto.priceBrl).toFixed(2));
    }
    if (dto.description !== undefined) {
      row.description = dto.description?.trim() || null;
    }
    if (dto.isPopular !== undefined) row.isPopular = !!dto.isPopular;
    if (dto.sortOrder !== undefined) {
      row.sortOrder = Number.isFinite(Number(dto.sortOrder)) ? Number(dto.sortOrder) : 0;
    }
    if (dto.isActive !== undefined) row.isActive = !!dto.isActive;
    return this.repo.save(row);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }

  private async getOrCreateContactRow(): Promise<CreditPaymentContact> {
    const rows = await this.contactRepo.find({ take: 1, order: { updatedAt: 'DESC' } });
    if (rows.length) return rows[0];
    return this.contactRepo.save(this.contactRepo.create({ pixKey: null, whatsapp: null }));
  }

  private trimContact(value: string, maxLen: number, label: string): string | null {
    const t = String(value).trim();
    if (!t) return null;
    if (t.length > maxLen) {
      throw new BadRequestException(`${label} pode ter no máximo ${maxLen} caracteres`);
    }
    return t;
  }

  async getPublicPaymentContact(): Promise<CreditPaymentContactPublicDto> {
    const row = await this.getOrCreateContactRow();
    return {
      pixKey: row.pixKey?.trim() || null,
      whatsapp: row.whatsapp?.trim() || null,
    };
  }

  async getPaymentContactAdmin(): Promise<CreditPaymentContact> {
    return this.getOrCreateContactRow();
  }

  async updatePaymentContact(dto: {
    pixKey?: string | null;
    whatsapp?: string | null;
  }): Promise<CreditPaymentContact> {
    const row = await this.getOrCreateContactRow();
    if (dto.pixKey !== undefined) {
      row.pixKey =
        dto.pixKey === null ? null : this.trimContact(String(dto.pixKey), 255, 'Chave PIX');
    }
    if (dto.whatsapp !== undefined) {
      row.whatsapp =
        dto.whatsapp === null ? null : this.trimContact(String(dto.whatsapp), 64, 'WhatsApp');
    }
    return this.contactRepo.save(row);
  }
}
