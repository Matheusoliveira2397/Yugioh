import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RandomDuelLevelRange } from './entities/random-duel-level-range.entity';

@Injectable()
export class RandomDuelLevelRangesService implements OnModuleInit {
  private readonly logger = new Logger(RandomDuelLevelRangesService.name);
  private cachedRanges: RandomDuelLevelRange[] = [];

  constructor(
    @InjectRepository(RandomDuelLevelRange)
    private levelRangeRepository: Repository<RandomDuelLevelRange>,
  ) {}

  async onModuleInit() {
    await this.ensureColumnsExist();
    await this.ensureDefaultRanges();
    await this.refreshCache();
  }

  /**
   * Garante que as colunas cashOnWin e cashOnLoss existem
   */
  private async ensureColumnsExist() {
    try {
      await this.levelRangeRepository.query(`
        DO $$
        BEGIN
            -- Adicionar coluna cashOnWin se não existir
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'random_duel_level_ranges' 
                AND column_name = 'cashOnWin'
            ) THEN
                ALTER TABLE "random_duel_level_ranges" ADD COLUMN "cashOnWin" INTEGER DEFAULT 0;
                RAISE NOTICE 'Coluna cashOnWin adicionada';
            END IF;
            
            -- Adicionar coluna cashOnLoss se não existir
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'random_duel_level_ranges' 
                AND column_name = 'cashOnLoss'
            ) THEN
                ALTER TABLE "random_duel_level_ranges" ADD COLUMN "cashOnLoss" INTEGER DEFAULT 0;
                RAISE NOTICE 'Coluna cashOnLoss adicionada';
            END IF;
        END $$;
      `);
      this.logger.log('✅ Colunas cashOnWin e cashOnLoss verificadas');
    } catch (error: any) {
      // Se a tabela não existir, será criada em createTable()
      if (error.message && error.message.includes('does not exist')) {
        this.logger.warn('⚠️ Tabela não existe ainda. Será criada...');
      } else {
        this.logger.error('❌ Erro ao verificar colunas:', error);
      }
    }
  }

  /**
   * Garante que existem faixas padrão
   */
  private async ensureDefaultRanges() {
    try {
      const count = await this.levelRangeRepository.count();
      
      if (count === 0) {
        this.logger.log('📊 Criando faixas padrão para Random Duel...');
        const defaultRanges = [
          { minLevel: 1, maxLevel: 5, name: 'Nível 1-5', order: 1, isActive: true },
          { minLevel: 6, maxLevel: 10, name: 'Nível 6-10', order: 2, isActive: true },
          { minLevel: 11, maxLevel: 20, name: 'Nível 11-20', order: 3, isActive: true },
          { minLevel: 21, maxLevel: 50, name: 'Nível 21-50', order: 4, isActive: true },
          { minLevel: 51, maxLevel: 100, name: 'Nível 51-100', order: 5, isActive: true },
        ];

        const ranges = defaultRanges.map(data => 
          this.levelRangeRepository.create(data)
        );
        await this.levelRangeRepository.save(ranges);
        this.logger.log(`✅ ${ranges.length} faixas padrão criadas`);
      }
    } catch (error: any) {
      // Se a tabela não existir, criar
      if (error.message && error.message.includes('does not exist')) {
        this.logger.warn('⚠️ Tabela não existe. Criando...');
        await this.createTable();
        await this.ensureDefaultRanges();
      } else {
        this.logger.error('❌ Erro ao verificar faixas padrão:', error);
      }
    }
  }

  /**
   * Cria a tabela se não existir
   */
  private async createTable() {
    try {
      await this.levelRangeRepository.query(`
        CREATE TABLE IF NOT EXISTS random_duel_level_ranges (
          id SERIAL PRIMARY KEY,
          "minLevel" INTEGER NOT NULL,
          "maxLevel" INTEGER NOT NULL,
          name VARCHAR(100) NOT NULL,
          "order" INTEGER DEFAULT 0,
          "isActive" BOOLEAN DEFAULT true,
          "cashOnWin" INTEGER DEFAULT 0,
          "cashOnLoss" INTEGER DEFAULT 0,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_random_duel_level_ranges_active ON random_duel_level_ranges("isActive");
        CREATE INDEX IF NOT EXISTS idx_random_duel_level_ranges_order ON random_duel_level_ranges("order");
      `);
      
      // Verificar e adicionar colunas se a tabela já existir mas não tiver as colunas
      await this.levelRangeRepository.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'random_duel_level_ranges' 
                AND column_name = 'cashOnWin'
            ) THEN
                ALTER TABLE "random_duel_level_ranges" ADD COLUMN "cashOnWin" INTEGER DEFAULT 0;
            END IF;
            
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'random_duel_level_ranges' 
                AND column_name = 'cashOnLoss'
            ) THEN
                ALTER TABLE "random_duel_level_ranges" ADD COLUMN "cashOnLoss" INTEGER DEFAULT 0;
            END IF;
        END $$;
      `);
      
      this.logger.log('✅ Tabela random_duel_level_ranges criada/atualizada');
    } catch (error: any) {
      this.logger.error('❌ Erro ao criar tabela:', error);
    }
  }

  /**
   * Atualiza o cache das faixas
   */
  async refreshCache() {
    try {
      this.cachedRanges = await this.levelRangeRepository.find({
        where: { isActive: true },
        order: { order: 'ASC' },
      });
      this.logger.debug(`📊 Cache atualizado: ${this.cachedRanges.length} faixas ativas`);
    } catch (error: any) {
      // Se o erro for sobre coluna não existir, tentar adicionar e retry
      if (error.message && error.message.includes('does not exist') && error.message.includes('cashOnWin')) {
        this.logger.warn('⚠️ Coluna cashOnWin não existe. Adicionando...');
        await this.ensureColumnsExist();
        // Retry após adicionar as colunas
        this.cachedRanges = await this.levelRangeRepository.find({
          where: { isActive: true },
          order: { order: 'ASC' },
        });
        this.logger.debug(`📊 Cache atualizado: ${this.cachedRanges.length} faixas ativas`);
      } else {
        this.logger.error('❌ Erro ao atualizar cache:', error);
      }
    }
  }

  /**
   * Busca todas as faixas (incluindo inativas)
   */
  async getAllRanges(): Promise<RandomDuelLevelRange[]> {
    try {
      return await this.levelRangeRepository.find({
        order: { order: 'ASC' },
      });
    } catch (error: any) {
      // Se o erro for sobre coluna não existir, tentar adicionar e retry
      if (error.message && error.message.includes('does not exist') && error.message.includes('cashOnWin')) {
        this.logger.warn('⚠️ Coluna cashOnWin não existe. Adicionando...');
        await this.ensureColumnsExist();
        // Retry após adicionar as colunas
        return await this.levelRangeRepository.find({
          order: { order: 'ASC' },
        });
      }
      throw error;
    }
  }

  /**
   * Busca apenas faixas ativas (do cache)
   */
  getActiveRanges(): RandomDuelLevelRange[] {
    return this.cachedRanges;
  }

  /**
   * Verifica se dois níveis podem se enfrentar
   */
  canMatch(level1: number, level2: number): boolean {
    for (const range of this.cachedRanges) {
      const level1InRange = level1 >= range.minLevel && level1 <= range.maxLevel;
      const level2InRange = level2 >= range.minLevel && level2 <= range.maxLevel;
      
      if (level1InRange && level2InRange) {
        return true;
      }
    }
    return false;
  }

  /**
   * Busca a faixa de um nível específico
   */
  getRangeForLevel(level: number): RandomDuelLevelRange | null {
    for (const range of this.cachedRanges) {
      if (level >= range.minLevel && level <= range.maxLevel) {
        return range;
      }
    }
    return null;
  }

  /**
   * Cria uma nova faixa
   */
  async createRange(data: {
    minLevel: number;
    maxLevel: number;
    name: string;
    order?: number;
    isActive?: boolean;
    cashOnWin?: number;
    cashOnLoss?: number;
  }): Promise<RandomDuelLevelRange> {
    const range = this.levelRangeRepository.create({
      minLevel: data.minLevel,
      maxLevel: data.maxLevel,
      name: data.name,
      order: data.order ?? 0,
      isActive: data.isActive ?? true,
      cashOnWin: data.cashOnWin ?? 0,
      cashOnLoss: data.cashOnLoss ?? 0,
    });

    const saved = await this.levelRangeRepository.save(range);
    await this.refreshCache();
    return saved;
  }

  /**
   * Atualiza uma faixa
   */
  async updateRange(
    id: number,
    data: {
      minLevel?: number;
      maxLevel?: number;
      name?: string;
      order?: number;
      isActive?: boolean;
      cashOnWin?: number;
      cashOnLoss?: number;
    },
  ): Promise<RandomDuelLevelRange> {
    const range = await this.levelRangeRepository.findOne({ where: { id } });
    if (!range) {
      throw new Error('Faixa não encontrada');
    }

    Object.assign(range, data);
    const saved = await this.levelRangeRepository.save(range);
    await this.refreshCache();
    return saved;
  }

  /**
   * Deleta uma faixa
   */
  async deleteRange(id: number): Promise<void> {
    await this.levelRangeRepository.delete(id);
    await this.refreshCache();
  }
}

