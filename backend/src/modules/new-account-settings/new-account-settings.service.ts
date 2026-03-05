import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewAccountSettings } from '../admin/entities/new-account-settings.entity';

@Injectable()
export class NewAccountSettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(NewAccountSettings)
    private newAccountSettingsRepository: Repository<NewAccountSettings>,
  ) {}

  async onModuleInit() {
    // Verificar e criar tabela new_account_settings se não existir
    try {
      console.log('🔧 [NewAccountSettingsService] Verificando tabela new_account_settings...');
      
      const tableExists = await this.newAccountSettingsRepository.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name = 'new_account_settings'
      `);
      
      // Se a tabela já existe, adicionar colunas de cosméticos padrão ANTES de qualquer find()
      if (tableExists.length > 0) {
        try {
          await this.newAccountSettingsRepository.query(`ALTER TABLE new_account_settings ADD COLUMN IF NOT EXISTS "defaultPlaymatId" VARCHAR(36) NULL`);
          await this.newAccountSettingsRepository.query(`ALTER TABLE new_account_settings ADD COLUMN IF NOT EXISTS "defaultSkinId" VARCHAR(36) NULL`);
          console.log('🔧 [NewAccountSettingsService] Colunas defaultPlaymatId/defaultSkinId verificadas');
        } catch (alterErr: any) {
          console.warn('⚠️ [NewAccountSettingsService] ALTER TABLE (defaultPlaymatId/defaultSkinId):', alterErr?.message || alterErr);
        }
      }
      
      if (tableExists.length === 0) {
        console.log('🔧 [NewAccountSettingsService] Tabela new_account_settings não existe. Criando automaticamente...');
        
        // Verificar se gen_random_uuid() está disponível
        let uuidFunction = 'gen_random_uuid()';
        try {
          await this.newAccountSettingsRepository.query(`SELECT gen_random_uuid();`);
        } catch (testError: any) {
          try {
            await this.newAccountSettingsRepository.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
            uuidFunction = 'uuid_generate_v4()';
            console.log('ℹ️ [NewAccountSettingsService] Usando uuid_generate_v4() para UUIDs');
          } catch (extError: any) {
            console.warn('⚠️ [NewAccountSettingsService] Nenhuma função UUID disponível, usando gen_random_uuid() como padrão');
          }
        }
        
        await this.newAccountSettingsRepository.query(`
          CREATE TABLE IF NOT EXISTS "new_account_settings" (
            "id" uuid PRIMARY KEY DEFAULT ${uuidFunction},
            "initialCredits" INTEGER NOT NULL DEFAULT 50,
            "initialCash" INTEGER NOT NULL DEFAULT 50000,
            "availableInitialDeckIds" JSONB NOT NULL DEFAULT '[]',
            "defaultPlaymatId" VARCHAR(36) NULL,
            "defaultSkinId" VARCHAR(36) NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        // Criar registro padrão se não existir
        const existingSettings = await this.newAccountSettingsRepository.find();
        if (existingSettings.length === 0) {
          const defaultSettings = this.newAccountSettingsRepository.create({
            initialCredits: 50,
            initialCash: 50000,
            availableInitialDeckIds: [],
            defaultPlaymatId: null,
            defaultSkinId: null,
          });
          await this.newAccountSettingsRepository.save(defaultSettings);
          console.log('✅ [NewAccountSettingsService] Configurações padrão de contas novas criadas');
        }
        
        console.log('✅ [NewAccountSettingsService] Tabela new_account_settings criada com sucesso!');
      } else {
        console.log('✅ [NewAccountSettingsService] Tabela new_account_settings já existe');
        
        // Garantir que existe pelo menos um registro
        const existingSettings = await this.newAccountSettingsRepository.find();
        if (existingSettings.length === 0) {
          const defaultSettings = this.newAccountSettingsRepository.create({
            initialCredits: 50,
            initialCash: 50000,
            availableInitialDeckIds: [],
            defaultPlaymatId: null,
            defaultSkinId: null,
          });
          await this.newAccountSettingsRepository.save(defaultSettings);
          console.log('✅ [NewAccountSettingsService] Configurações padrão de contas novas criadas');
        }
      }
    } catch (error: any) {
      console.error('❌ [NewAccountSettingsService] Erro ao verificar/criar tabela new_account_settings:', error);
    }
  }

  async getSettings(): Promise<NewAccountSettings> {
    // Buscar todos os registros e pegar o primeiro (deve haver apenas um)
    const allSettings = await this.newAccountSettingsRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });

    let settings = allSettings.length > 0 ? allSettings[0] : null;

    if (!settings) {
      // Criar configurações padrão se não existir
      settings = this.newAccountSettingsRepository.create({
        initialCredits: 50,
        initialCash: 50000,
        availableInitialDeckIds: [],
        defaultPlaymatId: null,
        defaultSkinId: null,
      });
      settings = await this.newAccountSettingsRepository.save(settings);
    }

    // Normalizar para garantir que frontend e registro usem os valores corretos
    // (evita problemas de tipo ou colunas antigas sem defaultPlaymatId/defaultSkinId)
    const raw = settings as any;
    const defaultPlaymatId = raw.defaultPlaymatId != null && String(raw.defaultPlaymatId).trim() !== ''
      ? String(raw.defaultPlaymatId).trim()
      : null;
    const defaultSkinId = raw.defaultSkinId != null && String(raw.defaultSkinId).trim() !== ''
      ? String(raw.defaultSkinId).trim()
      : null;
    const availableInitialDeckIds = Array.isArray(raw.availableInitialDeckIds)
      ? raw.availableInitialDeckIds.map((id: any) => String(id))
      : [];

    return {
      ...settings,
      defaultPlaymatId,
      defaultSkinId,
      availableInitialDeckIds,
    } as NewAccountSettings;
  }

  async updateSettings(data: {
    initialCredits?: number;
    initialCash?: number;
    availableInitialDeckIds?: string[];
    defaultPlaymatId?: string | null;
    defaultSkinId?: string | null;
  }): Promise<NewAccountSettings> {
    // Buscar todos os registros e pegar o primeiro (deve haver apenas um)
    const allSettings = await this.newAccountSettingsRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });

    let settings = allSettings.length > 0 ? allSettings[0] : null;

    if (!settings) {
      settings = this.newAccountSettingsRepository.create({
        initialCredits: data.initialCredits ?? 50,
        initialCash: data.initialCash ?? 50000,
        availableInitialDeckIds: data.availableInitialDeckIds ?? [],
        defaultPlaymatId: data.defaultPlaymatId ?? null,
        defaultSkinId: data.defaultSkinId ?? null,
      });
    } else {
      if (data.initialCredits !== undefined) settings.initialCredits = data.initialCredits;
      if (data.initialCash !== undefined) settings.initialCash = data.initialCash;
      if (data.availableInitialDeckIds !== undefined) settings.availableInitialDeckIds = data.availableInitialDeckIds;
      if (data.defaultPlaymatId !== undefined) settings.defaultPlaymatId = data.defaultPlaymatId;
      if (data.defaultSkinId !== undefined) settings.defaultSkinId = data.defaultSkinId;
    }

    return await this.newAccountSettingsRepository.save(settings);
  }
}

