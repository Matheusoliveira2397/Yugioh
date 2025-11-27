import { Controller, Get, Param, Delete, Body, UseGuards, Request } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DuelStatus, TurnPhase } from './entities/duel.entity';

@Controller('duels')
export class DuelsController {
  constructor(private readonly duelsService: DuelsService) {}

  @Get('health')
  async healthCheck() {
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      message: 'Duels service is running' 
    };
  }

  @Get('recreate-table')
  @UseGuards(JwtAuthGuard)
  async recreateTable(@Request() req: any) {
    try {
      const repo = this.duelsService['duelsRepository'];
      
      console.log('🗑️ [recreate-table] Iniciando recriação da tabela duels...');
      
      // 1. Apagar a tabela
      console.log('🗑️ [recreate-table] Apagando tabela duels...');
      await repo.query('DROP TABLE IF EXISTS duels CASCADE');
      console.log('✅ [recreate-table] Tabela apagada');
      
      // 2. Criar enums
      console.log('🔧 [recreate-table] Criando enums...');
      await repo.query(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelstatus') THEN
                CREATE TYPE "duelstatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelresult') THEN
                CREATE TYPE "duelresult" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'CANCELLED');
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turnphase') THEN
                CREATE TYPE "turnphase" AS ENUM ('DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END');
            END IF;
        END $$;
      `);
      console.log('✅ [recreate-table] Enums criados');
      
      // 3. Criar tabela
      console.log('🔧 [recreate-table] Criando tabela duels...');
      await repo.query(`
        CREATE TABLE duels (
            id SERIAL PRIMARY KEY,
            "player1_id" INTEGER NOT NULL,
            "player2_id" INTEGER NOT NULL,
            status "duelstatus" NOT NULL DEFAULT 'WAITING',
            "player1LifePoints" INTEGER NOT NULL DEFAULT 8000,
            "player2LifePoints" INTEGER NOT NULL DEFAULT 8000,
            result "duelresult" NULL,
            "winnerId" INTEGER NULL,
            "player1Field" JSONB NULL,
            "player2Field" JSONB NULL,
            "currentTurn" INTEGER NOT NULL DEFAULT 1,
            "currentPhase" "turnphase" NOT NULL DEFAULT 'DRAW',
            "duelTime" INTEGER NOT NULL DEFAULT 0,
            "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
            "finishedAt" TIMESTAMP NULL
        )
      `);
      console.log('✅ [recreate-table] Tabela criada');
      
      // 4. Adicionar Foreign Keys
      console.log('🔧 [recreate-table] Adicionando Foreign Keys...');
      await repo.query(`
        ALTER TABLE duels 
            ADD CONSTRAINT fk_duels_player1 FOREIGN KEY ("player1_id") REFERENCES users(id) ON DELETE CASCADE,
            ADD CONSTRAINT fk_duels_player2 FOREIGN KEY ("player2_id") REFERENCES users(id) ON DELETE CASCADE,
            ADD CONSTRAINT fk_duels_winner FOREIGN KEY ("winnerId") REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log('✅ [recreate-table] Foreign Keys adicionadas');
      
      // 5. Criar índices
      console.log('🔧 [recreate-table] Criando índices...');
      await repo.query(`
        CREATE INDEX idx_duels_player1_status ON duels("player1_id", status);
        CREATE INDEX idx_duels_player2_status ON duels("player2_id", status);
        CREATE INDEX idx_duels_status_updated_at ON duels(status, "updatedAt");
        CREATE INDEX idx_duels_status ON duels(status);
        CREATE INDEX idx_duels_duel_time ON duels("duelTime");
      `);
      console.log('✅ [recreate-table] Índices criados');
      
      // 6. Verificar estrutura
      const tableInfo = await repo.query(`
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
        FROM information_schema.columns
        WHERE table_name = 'duels'
        ORDER BY ordinal_position
      `);
      
      // 7. Contar duelos (deve ser 0)
      const count = await repo.count();
      
      return {
        success: true,
        message: 'Tabela duels recriada com sucesso!',
        tableStructure: tableInfo,
        duelCount: count,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('❌ [recreate-table] Erro:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        errorDetail: error?.detail,
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('diagnostic')
  @UseGuards(JwtAuthGuard)
  async diagnostic(@Request() req: any) {
    try {
      const repo = this.duelsService['duelsRepository'];
      const userId = req.user.id;
      
      const results: any = {
        timestamp: new Date().toISOString(),
        userId: userId,
        checks: {}
      };
      
      // 1. Verificar se repositório existe
      results.checks.repositoryExists = !!repo;
      results.checks.repositoryType = typeof repo;
      
      // 2. Verificar conexão
      try {
        const connectionTest = await repo.query('SELECT 1 as test');
        results.checks.connection = { success: true, result: connectionTest };
      } catch (e: any) {
        results.checks.connection = { success: false, error: e.message };
      }
      
      // 3. Verificar tabela
      try {
        const tableExists = await repo.query(`
          SELECT EXISTS (
            SELECT FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename = 'duels'
          )
        `);
        results.checks.tableExists = tableExists[0]?.exists || false;
      } catch (e: any) {
        results.checks.tableExists = { error: e.message };
      }
      
      // 4. Contar duelos
      try {
        const count = await repo.count();
        results.checks.duelCount = count;
      } catch (e: any) {
        results.checks.duelCount = { error: e.message };
      }
      
      // 5. Verificar último duelo
      try {
        const lastDuel = await repo.findOne({
          order: { createdAt: 'DESC' },
          select: ['id', 'player1Id', 'player2Id', 'status', 'createdAt']
        });
        results.checks.lastDuel = lastDuel || null;
      } catch (e: any) {
        results.checks.lastDuel = { error: e.message };
      }
      
      // 6. Verificar estrutura da tabela
      try {
        const columns = await repo.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = 'duels'
          ORDER BY ordinal_position
        `);
        results.checks.tableColumns = columns;
      } catch (e: any) {
        results.checks.tableColumns = { error: e.message };
      }
      
      // 7. Verificar se há duelos do usuário
      try {
        const userDuels = await repo.find({
          where: [
            { player1Id: userId },
            { player2Id: userId }
          ],
          take: 5,
          order: { createdAt: 'DESC' },
          select: ['id', 'player1Id', 'player2Id', 'status', 'createdAt']
        });
        results.checks.userDuels = userDuels;
        results.checks.userDuelsCount = userDuels.length;
      } catch (e: any) {
        results.checks.userDuels = { error: e.message };
      }
      
      // 8. Verificar DATABASE_URL
      results.checks.databaseUrl = process.env.DATABASE_URL ? 'SET' : 'NOT SET';
      
      // 9. Verificar métodos do repositório
      results.checks.repositoryMethods = {
        save: typeof repo.save,
        insert: typeof repo.insert,
        findOne: typeof repo.findOne,
        find: typeof repo.find,
        count: typeof repo.count,
        query: typeof repo.query
      };
      
      return {
        success: true,
        ...results
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('test-db-check')
  @UseGuards(JwtAuthGuard)
  async testDbCheck(@Request() req: any) {
    try {
      const userId = req.user.id;
      
      // Buscar duelos do banco diretamente
      const allDuels = await this.duelsService['duelsRepository'].find({
        where: [
          { player1Id: userId },
          { player2Id: userId }
        ],
        order: { createdAt: 'DESC' },
        take: 10,
        select: ['id', 'player1Id', 'player2Id', 'status', 'currentTurn', 'currentPhase', 'duelTime', 'createdAt', 'updatedAt']
      });

      // Contar duelos ativos no banco
      const activeInDb = await this.duelsService['duelsRepository'].count({
        where: [
          { player1Id: userId, status: DuelStatus.IN_PROGRESS },
          { player2Id: userId, status: DuelStatus.IN_PROGRESS }
        ]
      });

      // Contar todos os duelos no banco (para debug)
      const totalInDb = await this.duelsService['duelsRepository'].count();

      return {
        success: true,
        message: 'Verificação do banco de dados',
        totalDuels: allDuels.length,
        totalInDatabase: totalInDb,
        activeDuelsInDb: activeInDb,
        recentDuels: allDuels.map(d => ({
          id: d.id,
          player1Id: d.player1Id,
          player2Id: d.player2Id,
          status: d.status,
          currentTurn: d.currentTurn,
          currentPhase: d.currentPhase,
          duelTime: d.duelTime,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('check-database-connection')
  @UseGuards(JwtAuthGuard)
  async checkDatabaseConnection(@Request() req: any) {
    try {
      const repo = this.duelsService['duelsRepository'];
      
      // Verificar conexão e obter informações do banco
      const dbInfo = await repo.query(`
        SELECT 
          current_database() as database_name,
          current_user as user_name,
          inet_server_addr() as server_address,
          inet_server_port() as server_port,
          version() as postgres_version
      `);
      
      // Verificar se está no banco correto (yugioh_db)
      const isCorrectDatabase = dbInfo[0]?.database_name === 'yugioh_db';
      if (!isCorrectDatabase) {
        console.warn(`⚠️ [check-database-connection] ATENÇÃO: Banco atual é "${dbInfo[0]?.database_name}", esperado "yugioh_db"!`);
      }
      
      // Verificar se a tabela duels existe
      const tableExists = await repo.query(`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = 'duels'
        )
      `);
      
      // Contar duelos
      const duelCount = await repo.count();
      
      // Verificar último duelo criado
      const lastDuel = await repo.findOne({
        order: { createdAt: 'DESC' },
        select: ['id', 'player1Id', 'player2Id', 'status', 'createdAt']
      });
      
      // Verificar DATABASE_URL (sem mostrar senha)
      const databaseUrl = process.env.DATABASE_URL || 'NOT SET';
      const maskedUrl = databaseUrl.replace(/:[^:@]+@/, ':****@'); // Mascarar senha
      
      // Extrair informações da URL
      let parsedUrl: any = {};
      try {
        if (databaseUrl && databaseUrl !== 'NOT SET') {
          const url = new URL(databaseUrl);
          parsedUrl = {
            protocol: url.protocol,
            host: url.hostname,
            port: url.port || (url.protocol === 'postgresql:' ? '5432' : '8080'),
            database: url.pathname.replace('/', ''),
            user: url.username
          };
        }
      } catch (e) {
        // Ignorar erro de parsing
      }
      
      return {
        success: true,
        databaseInfo: dbInfo[0] || {},
        isCorrectDatabase: isCorrectDatabase,
        expectedDatabase: 'yugioh_db',
        actualDatabase: dbInfo[0]?.database_name,
        tableExists: tableExists[0]?.exists || false,
        duelCount: duelCount,
        lastDuel: lastDuel || null,
        databaseUrl: maskedUrl,
        parsedUrl: parsedUrl,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      const databaseUrl = process.env.DATABASE_URL || 'NOT SET';
      let parsedUrl: any = {};
      try {
        if (databaseUrl && databaseUrl !== 'NOT SET') {
          const url = new URL(databaseUrl);
          parsedUrl = {
            protocol: url.protocol,
            host: url.hostname,
            port: url.port || (url.protocol === 'postgresql:' ? '5432' : '8080'),
            database: url.pathname.replace('/', ''),
            user: url.username
          };
        }
      } catch (e) {
        // Ignorar erro de parsing
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        databaseUrl: databaseUrl !== 'NOT SET' ? 'SET (but connection failed)' : 'NOT SET',
        parsedUrl: parsedUrl,
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }
  
  @Get('test-insert-sql-direct-no-auth')
  async testInsertSqlDirectNoAuth() {
    try {
      const repo = this.duelsService['duelsRepository'];
      
      console.log('🧪 [test-insert-sql-direct-no-auth] Testando INSERT SQL direto (SEM AUTH)...');
      
      // Verificar banco
      const dbInfo = await repo.query(`SELECT current_database() as database_name`);
      const currentDb = dbInfo[0]?.database_name;
      console.log('🧪 [test-insert-sql-direct-no-auth] Banco:', currentDb);
      
      // Contar antes
      const countBefore = await repo.count();
      console.log('🧪 [test-insert-sql-direct-no-auth] Total antes:', countBefore);
      
      // INSERT SQL direto
      const insertQuery = `
        INSERT INTO duels (
          "player1_id", "player2_id", status, "player1LifePoints", "player2LifePoints",
          "currentTurn", "currentPhase", "duelTime", "player1Field", "player2Field",
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id, status, "player1_id", "player2_id", "createdAt"
      `;
      
      const insertValues = [
        1, // player1_id
        1, // player2_id
        'IN_PROGRESS',
        8000,
        8000,
        1,
        'DRAW',
        0,
        JSON.stringify({ deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] }),
        JSON.stringify({ deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] }),
      ];
      
      console.log('🧪 [test-insert-sql-direct-no-auth] Executando INSERT SQL direto...');
      const result = await repo.query(insertQuery, insertValues);
      console.log('🧪 [test-insert-sql-direct-no-auth] Resultado:', result);
      
      if (result && result.length > 0) {
        const newId = result[0].id;
        console.log('🧪 [test-insert-sql-direct-no-auth] ID gerado:', newId);
        
        // Verificar se foi salvo
        const savedDuel = await repo.findOne({ where: { id: newId } });
        console.log('🧪 [test-insert-sql-direct-no-auth] Duelo encontrado:', savedDuel ? 'SIM' : 'NÃO');
        
        // Contar depois
        const countAfter = await repo.count();
        console.log('🧪 [test-insert-sql-direct-no-auth] Total depois:', countAfter);
        
        // Verificar com query direta
        const directQuery = await repo.query(
          `SELECT id, "player1_id", "player2_id", status, "createdAt" FROM duels WHERE id = $1`,
          [newId]
        );
        console.log('🧪 [test-insert-sql-direct-no-auth] Query direta:', directQuery);
        
        return {
          success: true,
          message: 'INSERT SQL direto funcionou!',
          insertedId: newId,
          countBefore: countBefore,
          countAfter: countAfter,
          savedDuel: savedDuel ? { id: savedDuel.id, status: savedDuel.status } : null,
          directQuery: directQuery,
          database: currentDb,
          note: 'Duelo de teste NÃO foi deletado para você verificar no banco'
        };
      } else {
        return {
          success: false,
          message: 'INSERT executado mas não retornou resultado',
          result: result
        };
      }
    } catch (error: any) {
      console.error('🧪 [test-insert-sql-direct-no-auth] Erro:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        errorDetail: error?.detail,
        errorQuery: error?.query,
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('test-insert-sql-direct')
  @UseGuards(JwtAuthGuard)
  async testInsertSqlDirect(@Request() req: any) {
    try {
      const repo = this.duelsService['duelsRepository'];
      const userId = req.user.id;
      
      console.log('🧪 [test-insert-sql-direct] Testando INSERT SQL direto...');
      
      // Verificar banco
      const dbInfo = await repo.query(`SELECT current_database() as database_name`);
      const currentDb = dbInfo[0]?.database_name;
      console.log('🧪 [test-insert-sql-direct] Banco:', currentDb);
      
      // Contar antes
      const countBefore = await repo.count();
      console.log('🧪 [test-insert-sql-direct] Total antes:', countBefore);
      
      // INSERT SQL direto
      const insertQuery = `
        INSERT INTO duels (
          "player1_id", "player2_id", status, "player1LifePoints", "player2LifePoints",
          "currentTurn", "currentPhase", "duelTime", "player1Field", "player2Field",
          "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING id, status, "player1_id", "player2_id", "createdAt"
      `;
      
      const insertValues = [
        userId,
        userId,
        'IN_PROGRESS',
        8000,
        8000,
        1,
        'DRAW',
        0,
        JSON.stringify({ deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] }),
        JSON.stringify({ deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] }),
      ];
      
      console.log('🧪 [test-insert-sql-direct] Executando INSERT SQL direto...');
      const result = await repo.query(insertQuery, insertValues);
      console.log('🧪 [test-insert-sql-direct] Resultado:', result);
      
      if (result && result.length > 0) {
        const newId = result[0].id;
        console.log('🧪 [test-insert-sql-direct] ID gerado:', newId);
        
        // Verificar se foi salvo
        const savedDuel = await repo.findOne({ where: { id: newId } });
        console.log('🧪 [test-insert-sql-direct] Duelo encontrado:', savedDuel ? 'SIM' : 'NÃO');
        
        // Contar depois
        const countAfter = await repo.count();
        console.log('🧪 [test-insert-sql-direct] Total depois:', countAfter);
        
        // Deletar
        await repo.delete(newId);
        console.log('🧪 [test-insert-sql-direct] Duelo deletado');
        
        return {
          success: true,
          message: 'INSERT SQL direto funcionou!',
          insertedId: newId,
          countBefore: countBefore,
          countAfter: countAfter,
          savedDuel: savedDuel ? { id: savedDuel.id, status: savedDuel.status } : null,
          database: currentDb,
          deleted: true
        };
      } else {
        return {
          success: false,
          message: 'INSERT executado mas não retornou resultado',
          result: result
        };
      }
    } catch (error: any) {
      console.error('🧪 [test-insert-sql-direct] Erro:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        errorDetail: error?.detail,
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('test-insert-simple')
  @UseGuards(JwtAuthGuard)
  async testInsertSimple(@Request() req: any) {
    try {
      const repo = this.duelsService['duelsRepository'];
      const userId = req.user.id;
      
      console.log('🧪 [test-insert-simple] Iniciando teste simples de insert...');
      console.log('🧪 [test-insert-simple] User ID:', userId);
      console.log('🧪 [test-insert-simple] DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
      
      // Verificar conexão primeiro
      const connectionTest = await repo.query('SELECT 1 as test');
      console.log('🧪 [test-insert-simple] Conexão OK:', connectionTest);
      
      // Contar antes
      const countBefore = await repo.count();
      console.log('🧪 [test-insert-simple] Total de duelos antes:', countBefore);
      
      // Teste simples
      const testDuel = {
        player1Id: userId,
        player2Id: userId,
        status: DuelStatus.IN_PROGRESS,
        player1LifePoints: 8000,
        player2LifePoints: 8000,
        currentTurn: 1,
        currentPhase: TurnPhase.DRAW,
        duelTime: 0,
        player1Field: { deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] },
        player2Field: { deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] },
      };
      
      console.log('🧪 [test-insert-simple] Dados do teste:', JSON.stringify(testDuel, null, 2));
      
      const result = await repo.insert(testDuel);
      console.log('🧪 [test-insert-simple] Resultado do insert:', JSON.stringify(result, null, 2));
      
      const newId = result.identifiers?.[0]?.id || result.raw?.[0]?.id || result.generatedMaps?.[0]?.id;
      console.log('🧪 [test-insert-simple] ID gerado:', newId);
      
      if (newId) {
        // Verificar se foi salvo
        const savedDuel = await repo.findOne({ where: { id: newId } });
        console.log('🧪 [test-insert-simple] Duelo encontrado após insert:', savedDuel ? 'SIM' : 'NÃO');
        
        // Contar depois
        const countAfter = await repo.count();
        console.log('🧪 [test-insert-simple] Total de duelos depois:', countAfter);
        
        // Deletar o teste
        await repo.delete(newId);
        console.log('🧪 [test-insert-simple] Duelo de teste deletado');
        
        return {
          success: true,
          message: 'Teste de insert bem-sucedido',
          insertedId: newId,
          countBefore: countBefore,
          countAfter: countAfter,
          savedDuel: savedDuel ? { id: savedDuel.id, status: savedDuel.status } : null,
          deleted: true
        };
      } else {
        return {
          success: false,
          message: 'Insert executado mas ID não foi retornado',
          result: result
        };
      }
    } catch (error: any) {
      console.error('🧪 [test-insert-simple] Erro:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        errorDetail: error?.detail,
        databaseUrl: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('check-table-structure')
  @UseGuards(JwtAuthGuard)
  async checkTableStructure(@Request() req: any) {
    try {
      const repo = this.duelsService['duelsRepository'];
      
      // Verificar estrutura completa da tabela
      const tableInfo = await repo.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'duels'
        ORDER BY ordinal_position
      `);
      
      // Verificar constraints NOT NULL
      const notNullColumns = await repo.query(`
        SELECT 
          column_name,
          is_nullable
        FROM information_schema.columns
        WHERE table_name = 'duels' 
        AND is_nullable = 'NO'
        ORDER BY ordinal_position
      `);
      
      // Verificar se a tabela existe
      const tableExists = await repo.query(`
        SELECT EXISTS (
          SELECT FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = 'duels'
        )
      `);
      
      // Verificar enums
      const enums = await repo.query(`
        SELECT 
          t.typname as enum_name,
          e.enumlabel as enum_value
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        WHERE t.typname IN ('duelstatus', 'duelresult', 'turnphase')
        ORDER BY t.typname, e.enumsortorder
      `);
      
      // Verificar sequence do ID
      const sequenceInfo = await repo.query(`
        SELECT 
          sequencename,
          last_value,
          is_called
        FROM pg_sequences
        WHERE sequencename = 'duels_id_seq'
      `);
      
      return {
        success: true,
        tableExists: tableExists[0]?.exists || false,
        tableStructure: tableInfo,
        notNullColumns: notNullColumns,
        enums: enums,
        sequenceInfo: sequenceInfo[0] || null,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('fix-database')
  @UseGuards(JwtAuthGuard)
  async fixDatabase(@Request() req: any) {
    try {
      console.log('🔧 [fix-database] Iniciando correção da estrutura do banco...');
      const repo = this.duelsService['duelsRepository'];
      
      // 1. Criar enums se não existirem
      await repo.query(`
        DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelstatus') THEN
                CREATE TYPE "duelstatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelresult') THEN
                CREATE TYPE "duelresult" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'CANCELLED');
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'turnphase') THEN
                CREATE TYPE "turnphase" AS ENUM ('DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END');
            END IF;
        END $$;
      `);
      console.log('✅ [fix-database] Enums verificados/criados');
      
      // 2. Adicionar colunas faltantes
      await repo.query(`
        ALTER TABLE duels 
        ADD COLUMN IF NOT EXISTS "player1_id" INTEGER,
        ADD COLUMN IF NOT EXISTS "player2_id" INTEGER,
        ADD COLUMN IF NOT EXISTS "status" "duelstatus" DEFAULT 'WAITING',
        ADD COLUMN IF NOT EXISTS "player1LifePoints" INTEGER DEFAULT 8000,
        ADD COLUMN IF NOT EXISTS "player2LifePoints" INTEGER DEFAULT 8000,
        ADD COLUMN IF NOT EXISTS "result" "duelresult",
        ADD COLUMN IF NOT EXISTS "winnerId" INTEGER,
        ADD COLUMN IF NOT EXISTS "player1Field" JSONB,
        ADD COLUMN IF NOT EXISTS "player2Field" JSONB,
        ADD COLUMN IF NOT EXISTS "currentTurn" INTEGER DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "currentPhase" "turnphase" DEFAULT 'DRAW',
        ADD COLUMN IF NOT EXISTS "duelTime" INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS "finishedAt" TIMESTAMP;
      `);
      console.log('✅ [fix-database] Colunas verificadas/adicionadas');
      
      // 3. Garantir que id é SERIAL
      await repo.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'duels_id_seq') THEN
                CREATE SEQUENCE IF NOT EXISTS duels_id_seq;
                ALTER TABLE duels ALTER COLUMN id SET DEFAULT nextval('duels_id_seq');
                SELECT setval('duels_id_seq', COALESCE((SELECT MAX(id) FROM duels), 0) + 1, false);
            END IF;
        END $$;
      `);
      console.log('✅ [fix-database] Sequence verificada/criada');
      
      // 4. Verificar estrutura atual
      const tableInfo = await repo.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'duels'
        ORDER BY ordinal_position
      `);
      
      // 5. Estatísticas
      const stats = await repo.query(`
        SELECT 
            COUNT(*) as total_duels,
            COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END) as active_duels
        FROM duels
      `);
      
      return {
        success: true,
        message: 'Estrutura do banco verificada e corrigida',
        tableStructure: tableInfo,
        statistics: stats[0] || {},
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error('❌ [fix-database] Erro:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        errorDetail: error?.detail,
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  }

  @Get('test-insert')
  @UseGuards(JwtAuthGuard)
  async testInsert(@Request() req: any) {
    try {
      const userId = req.user.id;
      
      console.log('🧪 [test-insert] Iniciando teste de insert...');
      console.log('🧪 [test-insert] User ID:', userId);
      
      // Verificar estrutura da tabela primeiro
      const tableInfo = await this.duelsService['duelsRepository'].query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'duels'
        ORDER BY ordinal_position
      `);
      console.log('🧪 [test-insert] Estrutura da tabela duels:', tableInfo);
      
      // Contar duelos antes
      const countBefore = await this.duelsService['duelsRepository'].count();
      console.log('🧪 [test-insert] Total de duelos antes:', countBefore);
      
      // Teste simples de insert
      const testDuel = {
        player1Id: userId,
        player2Id: userId, // Mesmo usuário para teste
        status: DuelStatus.IN_PROGRESS,
        player1LifePoints: 8000,
        player2LifePoints: 8000,
        currentTurn: 1,
        currentPhase: TurnPhase.DRAW,
        duelTime: 0,
        player1Field: { deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] },
        player2Field: { deck: [], hand: [], monsters: [], spellTrap: [], graveyard: [] },
      };

      console.log('🧪 [test-insert] Dados do teste:', JSON.stringify(testDuel, null, 2));
      
      const result = await this.duelsService['duelsRepository'].insert(testDuel);
      console.log('🧪 [test-insert] Resultado do insert:', JSON.stringify(result, null, 2));
      console.log('🧪 [test-insert] Tipo do resultado:', typeof result);
      console.log('🧪 [test-insert] Keys do resultado:', Object.keys(result || {}));
      
      // Tentar obter ID de múltiplas formas
      let newId = result.identifiers?.[0]?.id;
      console.log('🧪 [test-insert] ID de identifiers[0].id:', newId);
      
      if (!newId && result.raw && Array.isArray(result.raw) && result.raw.length > 0) {
        newId = result.raw[0]?.id;
        console.log('🧪 [test-insert] ID de raw[0].id:', newId);
      }
      
      if (!newId && result.generatedMaps && Array.isArray(result.generatedMaps) && result.generatedMaps.length > 0) {
        newId = result.generatedMaps[0]?.id;
        console.log('🧪 [test-insert] ID de generatedMaps[0].id:', newId);
      }
      
      // Contar duelos depois
      const countAfter = await this.duelsService['duelsRepository'].count();
      console.log('🧪 [test-insert] Total de duelos depois:', countAfter);
      
      if (newId) {
        // Buscar o duelo inserido
        const savedDuel = await this.duelsService['duelsRepository'].findOne({ where: { id: newId } });
        console.log('🧪 [test-insert] Duelo encontrado:', savedDuel ? `ID: ${savedDuel.id}` : 'null');
        
        // Deletar o duelo de teste
        await this.duelsService['duelsRepository'].delete(newId);
        console.log('🧪 [test-insert] Duelo de teste deletado');
        
        return {
          success: true,
          message: 'Teste de insert bem-sucedido',
          insertedId: newId,
          countBefore,
          countAfter,
          savedDuel: savedDuel ? {
            id: savedDuel.id,
            player1Id: savedDuel.player1Id,
            player2Id: savedDuel.player2Id,
            status: savedDuel.status,
            currentPhase: savedDuel.currentPhase,
          } : null,
          deleted: true,
          tableStructure: tableInfo
        };
      } else {
        // Tentar buscar o último inserido
        const lastDuel = await this.duelsService['duelsRepository'].findOne({
          where: { player1Id: userId, player2Id: userId },
          order: { createdAt: 'DESC' }
        });
        
        return {
          success: false,
          message: 'Insert executado mas ID não foi retornado',
          countBefore,
          countAfter,
          lastDuelFound: lastDuel ? { id: lastDuel.id } : null,
          result: result,
          tableStructure: tableInfo
        };
      }
    } catch (error: any) {
      console.error('🧪 [test-insert] Erro:', error);
      console.error('🧪 [test-insert] Código do erro:', error?.code);
      console.error('🧪 [test-insert] Mensagem:', error?.message);
      console.error('🧪 [test-insert] Detalhes:', error?.detail);
      console.error('🧪 [test-insert] Query:', error?.query);
      console.error('🧪 [test-insert] Parâmetros:', error?.parameters);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        errorCode: error?.code,
        errorDetail: error?.detail,
        errorQuery: error?.query,
        errorParameters: error?.parameters,
        stack: error instanceof Error ? error.stack : undefined,
        details: error
      };
    }
  }

  @Get('my-duels')
  @UseGuards(JwtAuthGuard)
  async getMyDuels(@Request() req: any) {
    const userId = req.user.id;
    return this.duelsService.getUserDuels(userId);
  }

  @Get('my-active-duels')
  @UseGuards(JwtAuthGuard)
  async getMyActiveDuels(@Request() req: any) {
    try {
      const userId = req.user.id;
      // Timeout adicional no controller para garantir que nunca bloqueia por mais de 3 segundos
      const duels = await Promise.race([
        this.duelsService.getActiveDuels(userId),
        new Promise<[]>((resolve) => 
          setTimeout(() => {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`[getMyActiveDuels] Timeout - retornando array vazio para usuário ${userId}`);
            }
            resolve([]);
          }, 3000)
        )
      ]);
      return duels || [];
    } catch (error) {
      // Sempre retornar array vazio em caso de erro - não bloquear o sistema
      if (process.env.NODE_ENV === 'development') {
        console.error(`[getMyActiveDuels] Erro ao buscar duelos ativos:`, error);
      }
      return [];
    }
  }

  @Get('my-finished-duels')
  @UseGuards(JwtAuthGuard)
  async getMyFinishedDuels(@Request() req: any) {
    const userId = req.user.id;
    return this.duelsService.getFinishedDuels(userId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async getUserDuels(@Param('userId') userId: string) {
    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum)) {
      throw new Error('ID de usuário inválido');
    }
    return this.duelsService.getUserDuels(userIdNum);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getDuel(@Param('id') id: string) {
    // ID agora é UUID, não precisa converter para número
    if (!id || id.trim() === '') {
      throw new Error('ID de duelo inválido');
    }
    const duelId = id;
    console.log(`🔍 [getDuel] ==========================================`);
    console.log(`🔍 [getDuel] Buscando duelo ${duelId} (tipo: ${typeof duelId})...`);
    console.log(`🔍 [getDuel] Tamanho: ${duelId.length} caracteres`);
    
    // Buscar primeiro em memória
    let duel = this.duelsService.findDuelByIdLight(duelId);
    console.log(`🔍 [getDuel] Busca em memória: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
    
    // Se não encontrou em memória, buscar no banco
    if (!duel) {
      console.log(`🔍 [getDuel] Duelo não encontrado em memória, buscando no banco...`);
      duel = await this.duelsService.findDuelByIdFromDatabase(duelId);
      console.log(`🔍 [getDuel] Busca no banco: ${duel ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
    }
    
    if (!duel) {
      console.error(`❌ [getDuel] Duelo ${duelId} não encontrado!`);
      console.error(`❌ [getDuel] ==========================================`);
      throw new Error('Duelo não encontrado');
    }
    
    console.log(`✅ [getDuel] Duelo ${duelId} encontrado! ID: ${duel.id}`);
    console.log(`✅ [getDuel] ==========================================`);
    return duel;
  }

  @Get(':id/logs')
  @UseGuards(JwtAuthGuard)
  async getDuelLogs(@Param('id') id: string) {
    // ID agora é UUID, não precisa converter para número
    if (!id || id.trim() === '') {
      throw new Error('ID de duelo inválido');
    }
    return this.duelsService.getDuelLogs(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteDuel(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.id;
    // ID agora é UUID, não precisa converter para número
    if (!id || id.trim() === '') {
      throw new Error('ID de duelo inválido');
    }
    const duelId = id;
    return this.duelsService.deleteInactiveDuel(duelId, userId);
  }

  @Delete('batch/delete')
  @UseGuards(JwtAuthGuard)
  async deleteMultipleDuels(@Body() body: { duelIds: (string | number)[] }, @Request() req: any) {
    const userId = req.user.id;
    const { duelIds } = body;
    
    if (!Array.isArray(duelIds) || duelIds.length === 0) {
      return { success: false, message: 'Lista de IDs de duelos inválida' };
    }
    
    // IDs agora são UUIDs (strings), não precisa converter para número
    const validIds = duelIds.filter(id => id && (typeof id === 'string' || typeof id === 'number'));
    
    return this.duelsService.deleteMultipleInactiveDuels(userId, validIds);
  }

  @Get('test-create-duel-direct')
  @UseGuards(JwtAuthGuard)
  async testCreateDuelDirect(@Request() req: any) {
    try {
      const userId = req.user.id;
      console.log(`🧪 [test-create-duel-direct] ==========================================`);
      console.log(`🧪 [test-create-duel-direct] Testando criação direta de duelo para user ${userId}`);
      
      // Contar duelos antes
      const repo = this.duelsService['duelsRepository'];
      const countBefore = await repo.count();
      console.log(`🧪 [test-create-duel-direct] Total de duelos ANTES: ${countBefore}`);
      
      // Criar duelo com o próprio usuário (para teste)
      console.log(`🧪 [test-create-duel-direct] Chamando createDuel(${userId}, ${userId})...`);
      const duel = await this.duelsService.createDuel(userId, userId);
      
      console.log(`🧪 [test-create-duel-direct] createDuel() retornou:`, duel ? `ID: ${duel.id}` : 'null');
      
      if (duel && duel.id) {
        console.log(`✅ [test-create-duel-direct] Duelo criado com sucesso! ID: ${duel.id} (tipo: ${typeof duel.id})`);
        
        // Aguardar um pouco para garantir commit
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verificar se está no banco
        console.log(`🔍 [test-create-duel-direct] Verificando se duelo ${duel.id} está no banco...`);
        const verifyDuel = await repo.findOne({ where: { id: duel.id }, select: ['id', 'status', 'player1Id', 'player2Id'] });
        console.log(`🔍 [test-create-duel-direct] Resultado da verificação:`, verifyDuel ? 'ENCONTRADO' : 'NÃO ENCONTRADO');
        
        // Contar duelos depois
        const countAfter = await repo.count();
        console.log(`🧪 [test-create-duel-direct] Total de duelos DEPOIS: ${countAfter}`);
        console.log(`🧪 [test-create-duel-direct] Diferença: ${countAfter - countBefore}`);
        
        // Buscar todos os duelos recentes
        const recentDuels = await repo.find({ 
          take: 5,
          order: { createdAt: 'DESC' },
          select: ['id', 'player1Id', 'player2Id', 'status', 'createdAt']
        });
        console.log(`🧪 [test-create-duel-direct] Últimos 5 duelos no banco:`, recentDuels);
        
        return {
          success: true,
          message: 'Duelo criado com sucesso',
          duel: {
            id: duel.id,
            idType: typeof duel.id,
            status: duel.status,
            player1Id: duel.player1Id,
            player2Id: duel.player2Id,
          },
          inDatabase: !!verifyDuel,
          databaseDuel: verifyDuel ? {
            id: verifyDuel.id,
            status: verifyDuel.status,
            player1Id: verifyDuel.player1Id,
            player2Id: verifyDuel.player2Id,
          } : null,
          countBefore: countBefore,
          countAfter: countAfter,
          difference: countAfter - countBefore,
          recentDuels: recentDuels,
        };
      } else {
        console.error(`❌ [test-create-duel-direct] Duelo retornou null ou sem ID`);
        return {
          success: false,
          message: 'Duelo retornou null ou sem ID',
          duel: duel,
        };
      }
    } catch (error: any) {
      console.error(`❌ [test-create-duel-direct] Erro:`, error);
      return {
        success: false,
        message: 'Erro ao criar duelo',
        error: error?.message || String(error),
        stack: error?.stack,
      };
    }
  }
}
