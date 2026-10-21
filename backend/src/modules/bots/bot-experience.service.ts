import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BotLesson } from './bot-action.types';

/**
 * Memória de experiências do bot (aprendizado por casos).
 * Guarda jogadas com recompensa positiva e injeta no prompt da IA.
 */
@Injectable()
export class BotExperienceService implements OnModuleInit {
  private readonly logger = new Logger(BotExperienceService.name);
  private lessons: BotLesson[] = [];
  private filePath = '';
  private lastMtimeMs = 0;

  onModuleInit() {
    const inDocker =
      process.cwd().replace(/\\/g, '/').startsWith('/app') && fs.existsSync('/app/uploads');
    const root =
      process.env.UPLOADS_ROOT || (inDocker ? '/app/uploads' : path.join(process.cwd(), 'uploads'));
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch {
      /* ignore */
    }
    this.filePath = path.join(root, 'bot-ai-memory.json');
    this.load();
    this.logger.log(`Memória do bot: ${this.lessons.length} lições em ${this.filePath}`);
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const st = fs.statSync(this.filePath);
        this.lastMtimeMs = st.mtimeMs;
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.lessons = Array.isArray(raw?.lessons) ? raw.lessons : [];
      }
    } catch (e) {
      this.logger.warn('Falha ao carregar memória do bot: ' + String(e));
      this.lessons = [];
    }
  }

  /** Recarrega se o arquivo mudou (ex.: treino self-play em paralelo). */
  private reloadIfStale() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const st = fs.statSync(this.filePath);
      if (st.mtimeMs > this.lastMtimeMs) {
        const prev = this.lessons.length;
        this.load();
        if (this.lessons.length !== prev) {
          this.logger.log(`Memória atualizada: ${prev} → ${this.lessons.length} lições`);
        }
      }
    } catch {
      /* ignore */
    }
  }

  private persist() {
    try {
      // Mantém as melhores / mais recentes
      this.lessons = this.lessons
        .sort((a, b) => b.reward - a.reward || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 400);
      fs.writeFileSync(this.filePath, JSON.stringify({ lessons: this.lessons }, null, 2), 'utf8');
    } catch (e) {
      this.logger.warn('Falha ao salvar memória do bot: ' + String(e));
    }
  }

  remember(input: {
    situationKey: string;
    actionType: string;
    actionData: Record<string, any>;
    label: string;
    reward: number;
    difficulty: string;
  }) {
    if (input.reward <= 0) return;
    this.lessons.push({
      id: randomUUID(),
      situationKey: input.situationKey.slice(0, 200),
      actionType: input.actionType,
      actionData: input.actionData,
      label: input.label,
      reward: input.reward,
      difficulty: input.difficulty,
      createdAt: new Date().toISOString(),
    });
    this.persist();
  }

  /** Lições parecidas com a situação atual (few-shot para o LLM). */
  recall(situationKey: string, limit = 8): BotLesson[] {
    this.reloadIfStale();
    const phase = situationKey.split('|')[0] || '';
    const scored = this.lessons.map((l) => {
      let score = l.reward;
      if (l.situationKey.startsWith(phase)) score += 20;
      // overlap simples de tokens
      const a = new Set(situationKey.split(/[^a-zA-Z0-9]+/));
      const b = l.situationKey.split(/[^a-zA-Z0-9]+/);
      let overlap = 0;
      for (const t of b) if (a.has(t)) overlap += 1;
      score += overlap * 2;
      return { l, score };
    });
    return scored
      .sort((x, y) => y.score - x.score)
      .slice(0, limit)
      .map((x) => x.l);
  }

  stats() {
    return { count: this.lessons.length, filePath: this.filePath };
  }
}
