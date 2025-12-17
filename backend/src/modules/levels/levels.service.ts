import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from './entities/level.entity';

@Injectable()
export class LevelsService implements OnModuleInit {
  private readonly logger = new Logger(LevelsService.name);

  constructor(
    @InjectRepository(Level)
    private levelRepository: Repository<Level>,
  ) {}

  async onModuleInit() {
    await this.ensureLevelsTable();
  }

  /**
   * Garante que a tabela de níveis está populada
   */
  private async ensureLevelsTable() {
    try {
      const count = await this.levelRepository.count();
      
      if (count === 0) {
        this.logger.log('📊 Tabela de níveis vazia. Populando...');
        await this.populateLevelsTable();
        this.logger.log('✅ Tabela de níveis populada com sucesso');
      } else {
        this.logger.log(`✅ Tabela de níveis já possui ${count} registros`);
      }
    } catch (error: any) {
      // Se a tabela não existir, criar e popular
      if (error.message && error.message.includes('does not exist')) {
        this.logger.warn('⚠️ Tabela de níveis não existe. Criando...');
        await this.createLevelsTable();
        await this.populateLevelsTable();
      } else {
        this.logger.error('❌ Erro ao verificar tabela de níveis:', error);
      }
    }
  }

  /**
   * Cria a tabela de níveis se não existir
   */
  private async createLevelsTable() {
    try {
      await this.levelRepository.query(`
        CREATE TABLE IF NOT EXISTS levels (
          id SERIAL PRIMARY KEY,
          level INTEGER UNIQUE NOT NULL,
          "requiredScore" INTEGER NOT NULL,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_levels_level ON levels(level);
        CREATE INDEX IF NOT EXISTS idx_levels_requiredScore ON levels("requiredScore");
      `);
      this.logger.log('✅ Tabela de níveis criada');
    } catch (error: any) {
      this.logger.error('❌ Erro ao criar tabela de níveis:', error);
    }
  }

  /**
   * Popula a tabela de níveis com os valores fornecidos
   */
  private async populateLevelsTable() {
    const levelsData = [
      { level: 1, requiredScore: 0 },
      { level: 2, requiredScore: 100 },
      { level: 3, requiredScore: 250 },
      { level: 4, requiredScore: 450 },
      { level: 5, requiredScore: 700 },
      { level: 6, requiredScore: 1000 },
      { level: 7, requiredScore: 1350 },
      { level: 8, requiredScore: 1750 },
      { level: 9, requiredScore: 2200 },
      { level: 10, requiredScore: 2700 },
      { level: 11, requiredScore: 3250 },
      { level: 12, requiredScore: 4000 },
      { level: 13, requiredScore: 4850 },
      { level: 14, requiredScore: 5800 },
      { level: 15, requiredScore: 6850 },
      { level: 16, requiredScore: 8000 },
      { level: 17, requiredScore: 9250 },
      { level: 18, requiredScore: 10600 },
      { level: 19, requiredScore: 12050 },
      { level: 20, requiredScore: 13600 },
      { level: 21, requiredScore: 15250 },
      { level: 22, requiredScore: 17000 },
      { level: 23, requiredScore: 18850 },
      { level: 24, requiredScore: 20800 },
      { level: 25, requiredScore: 22850 },
      { level: 26, requiredScore: 25000 },
      { level: 27, requiredScore: 27250 },
      { level: 28, requiredScore: 29600 },
      { level: 29, requiredScore: 32050 },
      { level: 30, requiredScore: 34600 },
      { level: 31, requiredScore: 37250 },
      { level: 32, requiredScore: 40000 },
      { level: 33, requiredScore: 42850 },
      { level: 34, requiredScore: 45800 },
      { level: 35, requiredScore: 48850 },
      { level: 36, requiredScore: 52000 },
      { level: 37, requiredScore: 55250 },
      { level: 38, requiredScore: 58600 },
      { level: 39, requiredScore: 62050 },
      { level: 40, requiredScore: 65600 },
      { level: 41, requiredScore: 69250 },
      { level: 42, requiredScore: 73000 },
      { level: 43, requiredScore: 76850 },
      { level: 44, requiredScore: 80800 },
      { level: 45, requiredScore: 84850 },
      { level: 46, requiredScore: 89000 },
      { level: 47, requiredScore: 93250 },
      { level: 48, requiredScore: 97600 },
      { level: 49, requiredScore: 102050 },
      { level: 50, requiredScore: 106600 },
      { level: 51, requiredScore: 111250 },
      { level: 52, requiredScore: 116000 },
      { level: 53, requiredScore: 120850 },
      { level: 54, requiredScore: 125800 },
      { level: 55, requiredScore: 130850 },
      { level: 56, requiredScore: 136000 },
      { level: 57, requiredScore: 141250 },
      { level: 58, requiredScore: 146600 },
      { level: 59, requiredScore: 152050 },
      { level: 60, requiredScore: 157600 },
      { level: 61, requiredScore: 163250 },
      { level: 62, requiredScore: 169000 },
      { level: 63, requiredScore: 174850 },
      { level: 64, requiredScore: 180800 },
      { level: 65, requiredScore: 186850 },
      { level: 66, requiredScore: 193000 },
      { level: 67, requiredScore: 199250 },
      { level: 68, requiredScore: 205600 },
      { level: 69, requiredScore: 212050 },
      { level: 70, requiredScore: 218600 },
      { level: 71, requiredScore: 225250 },
      { level: 72, requiredScore: 232000 },
      { level: 73, requiredScore: 238850 },
      { level: 74, requiredScore: 245800 },
      { level: 75, requiredScore: 252850 },
      { level: 76, requiredScore: 260000 },
      { level: 77, requiredScore: 267250 },
      { level: 78, requiredScore: 274600 },
      { level: 79, requiredScore: 282050 },
      { level: 80, requiredScore: 289600 },
      { level: 81, requiredScore: 297250 },
      { level: 82, requiredScore: 305000 },
      { level: 83, requiredScore: 312850 },
      { level: 84, requiredScore: 320800 },
      { level: 85, requiredScore: 328850 },
      { level: 86, requiredScore: 337000 },
      { level: 87, requiredScore: 345250 },
      { level: 88, requiredScore: 353600 },
      { level: 89, requiredScore: 362050 },
      { level: 90, requiredScore: 370600 },
      { level: 91, requiredScore: 379250 },
      { level: 92, requiredScore: 388000 },
      { level: 93, requiredScore: 396850 },
      { level: 94, requiredScore: 405800 },
      { level: 95, requiredScore: 414850 },
      { level: 96, requiredScore: 424000 },
      { level: 97, requiredScore: 433250 },
      { level: 98, requiredScore: 442600 },
      { level: 99, requiredScore: 452050 },
      { level: 100, requiredScore: 461600 },
    ];

    try {
      // Inserir todos os níveis
      const levels = levelsData.map(data => this.levelRepository.create(data));
      await this.levelRepository.save(levels);
      this.logger.log(`✅ ${levels.length} níveis inseridos na tabela`);
    } catch (error: any) {
      this.logger.error('❌ Erro ao popular tabela de níveis:', error);
      throw error;
    }
  }

  /**
   * Calcula o nível baseado no score total
   */
  async calculateLevel(totalScore: number): Promise<number> {
    if (!totalScore || totalScore < 0 || isNaN(totalScore)) {
      this.logger.debug(`📊 [calculateLevel] totalScore inválido ou negativo: ${totalScore}, retornando nível 1`);
      return 1;
    }

    try {
      // Garantir que a tabela está populada antes de calcular
      const count = await this.levelRepository.count();
      if (count === 0) {
        this.logger.warn('⚠️ [calculateLevel] Tabela de níveis vazia. Populando...');
        await this.ensureLevelsTable();
      }

      // Converter totalScore para número inteiro para comparação
      const scoreInt = Math.floor(totalScore);

      // Buscar o maior nível que o usuário pode ter com base no score
      // Usar query SQL direta para garantir que funcione
      const result = await this.levelRepository.query(
        `SELECT level FROM levels WHERE "requiredScore" <= $1 ORDER BY level DESC LIMIT 1`,
        [scoreInt]
      );

      let calculatedLevel = 1;
      if (result && result.length > 0 && result[0].level) {
        calculatedLevel = parseInt(result[0].level, 10) || 1;
      }

      this.logger.debug(`📊 [calculateLevel] totalScore: ${totalScore} (int: ${scoreInt}) -> nível: ${calculatedLevel}`);
      
      return calculatedLevel;
    } catch (error: any) {
      this.logger.error(`❌ [calculateLevel] Erro ao calcular nível para totalScore ${totalScore}:`, error.message);
      this.logger.error(`❌ [calculateLevel] Stack:`, error.stack);
      
      // Tentar método alternativo com QueryBuilder
      try {
        const level = await this.levelRepository
          .createQueryBuilder('level')
          .where('level.requiredScore <= :score', { score: Math.floor(totalScore) })
          .orderBy('level.level', 'DESC')
          .limit(1)
          .getOne();

        if (level) {
          this.logger.log(`✅ [calculateLevel] Nível calculado via QueryBuilder fallback: ${level.level}`);
          return level.level;
        }
      } catch (fallbackError: any) {
        this.logger.error(`❌ [calculateLevel] Erro no fallback QueryBuilder:`, fallbackError.message);
      }
      
      // Em caso de erro, retornar nível 1 como fallback
      return 1;
    }
  }

  /**
   * Busca informações sobre um nível específico
   */
  async getLevelInfo(level: number): Promise<Level | null> {
    return this.levelRepository.findOne({
      where: { level },
    });
  }

  /**
   * Busca informações sobre o próximo nível
   */
  async getNextLevelInfo(currentLevel: number): Promise<Level | null> {
    return this.levelRepository.findOne({
      where: { level: currentLevel + 1 },
    });
  }

  /**
   * Busca todos os níveis
   */
  async getAllLevels(): Promise<Level[]> {
    return this.levelRepository.find({
      order: { level: 'ASC' },
    });
  }

  /**
   * Calcula o progresso para o próximo nível (0-100)
   */
  async calculateProgressToNextLevel(currentLevel: number, totalScore: number): Promise<number> {
    const currentLevelInfo = await this.getLevelInfo(currentLevel);
    const nextLevelInfo = await this.getNextLevelInfo(currentLevel);

    if (!currentLevelInfo || !nextLevelInfo) {
      return 0;
    }

    const scoreInCurrentLevel = totalScore - currentLevelInfo.requiredScore;
    const scoreNeededForNext = nextLevelInfo.requiredScore - currentLevelInfo.requiredScore;

    if (scoreNeededForNext === 0) {
      return 100;
    }

    const progress = (scoreInCurrentLevel / scoreNeededForNext) * 100;
    return Math.min(100, Math.max(0, Math.round(progress * 100) / 100));
  }

  /**
   * Busca os próximos N níveis a partir do nível atual
   */
  async getNextLevels(currentLevel: number, count: number = 10): Promise<Level[]> {
    try {
      const levels = await this.levelRepository
        .createQueryBuilder('level')
        .where('level.level > :currentLevel', { currentLevel })
        .orderBy('level.level', 'ASC')
        .limit(count)
        .getMany();

      return levels;
    } catch (error: any) {
      this.logger.error(`❌ [getNextLevels] Erro ao buscar próximos níveis:`, error.message);
      return [];
    }
  }
}

