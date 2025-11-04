import { MigrationInterface, QueryRunner } from "typeorm";

export class GameMechanics1762071600000 implements MigrationInterface {
    name = 'GameMechanics1762071600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create seasons table
        await queryRunner.query(`
            CREATE TABLE "seasons" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "seasonNumber" integer NOT NULL,
                "startDate" TIMESTAMP NOT NULL DEFAULT now(),
                "endDate" TIMESTAMP NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "prizes" jsonb NOT NULL DEFAULT '{"first":{"trophy":1,"coins":10000,"credits":500},"second":{"trophy":0,"coins":5000,"credits":250},"third":{"trophy":0,"coins":2500,"credits":100}}',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_seasons" PRIMARY KEY ("id")
            )
        `);

        // Create season_rankings table
        await queryRunner.query(`
            CREATE TABLE "season_rankings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "seasonScore" integer NOT NULL DEFAULT 0,
                "wins" integer NOT NULL DEFAULT 0,
                "losses" integer NOT NULL DEFAULT 0,
                "rank" integer NOT NULL DEFAULT 0,
                "division" character varying NOT NULL DEFAULT 'BRONZE',
                "divisionPoints" integer NOT NULL DEFAULT 0,
                "trophy" integer NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "seasonId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                CONSTRAINT "PK_season_rankings" PRIMARY KEY ("id")
            )
        `);

        // Create groups table
        await queryRunner.query(`
            CREATE TABLE "groups" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "tag" character varying(6) NOT NULL,
                "description" text,
                "logo" character varying,
                "totalScore" integer NOT NULL DEFAULT 0,
                "maxMembers" integer NOT NULL DEFAULT 50,
                "isPublic" boolean NOT NULL DEFAULT true,
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "leaderId" uuid NOT NULL,
                CONSTRAINT "UQ_groups_name" UNIQUE ("name"),
                CONSTRAINT "UQ_groups_tag" UNIQUE ("tag"),
                CONSTRAINT "PK_groups" PRIMARY KEY ("id")
            )
        `);

        // Create group_members table
        await queryRunner.query(`
            CREATE TABLE "group_members" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "weeklyScore" integer NOT NULL DEFAULT 0,
                "seasonScore" integer NOT NULL DEFAULT 0,
                "totalScore" integer NOT NULL DEFAULT 0,
                "contributedWins" integer NOT NULL DEFAULT 0,
                "contributedLosses" integer NOT NULL DEFAULT 0,
                "role" character varying NOT NULL DEFAULT 'MEMBER',
                "weeklyScoreResetAt" TIMESTAMP NOT NULL DEFAULT now(),
                "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "groupId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                CONSTRAINT "PK_group_members" PRIMARY KEY ("id")
            )
        `);

        // Create transactions table
        await queryRunner.query(`
            CREATE TABLE "transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "amount" integer NOT NULL,
                "currencyType" character varying NOT NULL,
                "transactionType" character varying NOT NULL,
                "description" character varying,
                "metadata" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "userId" uuid NOT NULL,
                CONSTRAINT "PK_transactions" PRIMARY KEY ("id")
            )
        `);

        // Add new columns to users table
        await queryRunner.query(`
            ALTER TABLE "users" 
            ADD COLUMN "coins" integer NOT NULL DEFAULT 0,
            ADD COLUMN "credits" integer NOT NULL DEFAULT 0,
            ADD COLUMN "cash" integer NOT NULL DEFAULT 0,
            ADD COLUMN "level" integer NOT NULL DEFAULT 1,
            ADD COLUMN "experience" integer NOT NULL DEFAULT 0,
            ADD COLUMN "totalScore" integer NOT NULL DEFAULT 0
        `);

        // Create indexes
        await queryRunner.query(`CREATE INDEX "IDX_season_rankings_season_user" ON "season_rankings" ("seasonId", "userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_season_rankings_season_score" ON "season_rankings" ("seasonId", "seasonScore" DESC)`);
        await queryRunner.query(`CREATE INDEX "IDX_group_members_group_user" ON "group_members" ("groupId", "userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_transactions_user_created" ON "transactions" ("userId", "createdAt" DESC)`);

        // Add foreign keys
        await queryRunner.query(`
            ALTER TABLE "season_rankings" 
            ADD CONSTRAINT "FK_season_rankings_season" 
            FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "season_rankings" 
            ADD CONSTRAINT "FK_season_rankings_user" 
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "groups" 
            ADD CONSTRAINT "FK_groups_leader" 
            FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "group_members" 
            ADD CONSTRAINT "FK_group_members_group" 
            FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "group_members" 
            ADD CONSTRAINT "FK_group_members_user" 
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "transactions" 
            ADD CONSTRAINT "FK_transactions_user" 
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys
        await queryRunner.query(`ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_user"`);
        await queryRunner.query(`ALTER TABLE "group_members" DROP CONSTRAINT "FK_group_members_user"`);
        await queryRunner.query(`ALTER TABLE "group_members" DROP CONSTRAINT "FK_group_members_group"`);
        await queryRunner.query(`ALTER TABLE "groups" DROP CONSTRAINT "FK_groups_leader"`);
        await queryRunner.query(`ALTER TABLE "season_rankings" DROP CONSTRAINT "FK_season_rankings_user"`);
        await queryRunner.query(`ALTER TABLE "season_rankings" DROP CONSTRAINT "FK_season_rankings_season"`);

        // Drop indexes
        await queryRunner.query(`DROP INDEX "IDX_transactions_user_created"`);
        await queryRunner.query(`DROP INDEX "IDX_group_members_group_user"`);
        await queryRunner.query(`DROP INDEX "IDX_season_rankings_season_score"`);
        await queryRunner.query(`DROP INDEX "IDX_season_rankings_season_user"`);

        // Remove columns from users table
        await queryRunner.query(`
            ALTER TABLE "users" 
            DROP COLUMN "totalScore",
            DROP COLUMN "experience",
            DROP COLUMN "level",
            DROP COLUMN "cash",
            DROP COLUMN "credits",
            DROP COLUMN "coins"
        `);

        // Drop tables
        await queryRunner.query(`DROP TABLE "transactions"`);
        await queryRunner.query(`DROP TABLE "group_members"`);
        await queryRunner.query(`DROP TABLE "groups"`);
        await queryRunner.query(`DROP TABLE "season_rankings"`);
        await queryRunner.query(`DROP TABLE "seasons"`);
    }
}
