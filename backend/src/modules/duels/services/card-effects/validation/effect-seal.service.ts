import { Injectable } from '@nestjs/common';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { logger } from '../../../../../common/utils/logger.util';

/**
 * Selo de regressão dos efeitos.
 *
 * Guarda a lista de cartas canônicas já registradas. No boot:
 * - Se alguma carta do selo SUMIU do registry → ERRO (efeito sumiu/quebrou)
 * - Se novas cartas apareceram → atualiza o selo (ok, você adicionou efeito)
 *
 * Isso evita o cenário: “efeito X funcionava e depois parou” por remoção
 * acidental, colisão ou registro incompleto.
 */
@Injectable()
export class EffectSealService {
  private readonly sealPath: string;

  constructor(private readonly registry: CardEffectRegistryService) {
    this.sealPath = join(
      process.cwd(),
      'src',
      'modules',
      'duels',
      'services',
      'card-effects',
      'validation',
      'effects-seal.json',
    );
  }

  async verifyAndUpdateSeal(): Promise<SealReport> {
    const current = this.registry.getRegisteredCards();
    const currentSet = new Set(current);

    let sealed: string[] = [];
    if (existsSync(this.sealPath)) {
      try {
        const raw = await readFile(this.sealPath, 'utf-8');
        const data = JSON.parse(raw);
        sealed = Array.isArray(data.canonicalCards) ? data.canonicalCards : [];
      } catch (error) {
        logger.error(`❌ [EffectSeal] Falha ao ler selo:`, error);
      }
    }

    const missing = sealed.filter((k) => !currentSet.has(k));
    const added = current.filter((k) => !sealed.includes(k));

    const report: SealReport = {
      sealPath: this.sealPath,
      sealedCount: sealed.length,
      currentCount: current.length,
      missing,
      added,
      ok: missing.length === 0,
    };

    if (missing.length > 0) {
      logger.error(
        `❌ [EffectSeal] REGRESSÃO: ${missing.length} efeito(s) que estavam selados SUMIRAM do registry:`,
      );
      for (const m of missing) {
        logger.error(`   - ${m}`);
      }
      logger.error(
        `❌ [EffectSeal] Não remova/renomeie efeitos registrados sem atualizar o selo de propósito. ` +
          `Corrija o registro ou restaure o arquivo do efeito.`,
      );
    }

    if (added.length > 0) {
      logger.info(`🆕 [EffectSeal] ${added.length} efeito(s) novo(s) detectado(s): ${added.join(', ')}`);
    }

    // Atualiza selo apenas se não houver regressão (não “apaga” cartas faltando)
    if (report.ok) {
      await this.writeSeal(current, added.length > 0 ? 'added-effects' : 'boot-ok');
      logger.info(
        `✅ [EffectSeal] Selo OK — ${current.length} efeitos canônicos preservados`,
      );
    }

    return report;
  }

  private async writeSeal(canonicalCards: string[], reason: string): Promise<void> {
    const dir = join(this.sealPath, '..');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const payload = {
      updatedAt: new Date().toISOString(),
      reason,
      canonicalCards: [...canonicalCards].sort(),
      note:
        'Não delete entradas manualmente. Novos efeitos entram sozinhos no boot. ' +
        'Se um efeito sumir, o boot acusa regressão.',
    };
    await writeFile(this.sealPath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}

export interface SealReport {
  sealPath: string;
  sealedCount: number;
  currentCount: number;
  missing: string[];
  added: string[];
  ok: boolean;
}
