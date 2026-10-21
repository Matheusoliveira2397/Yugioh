/**
 * Persistência pura da memória da IA (sem Nest).
 * Compatível com BotExperienceService → uploads/bot-ai-memory.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BotLesson } from './bot-action.types';

const MAX_LESSONS = 500;

export function defaultMemoryPath(): string {
  // Docker: /app/uploads. Local (Windows/macOS): <cwd>/uploads
  const inDocker =
    process.cwd().replace(/\\/g, '/').startsWith('/app') && fs.existsSync('/app/uploads');
  const root = process.env.UPLOADS_ROOT || (inDocker ? '/app/uploads' : path.join(process.cwd(), 'uploads'));
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(root, 'bot-ai-memory.json');
}

export function loadLessons(filePath = defaultMemoryPath()): BotLesson[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(raw?.lessons) ? raw.lessons : [];
  } catch {
    return [];
  }
}

export function saveLessons(lessons: BotLesson[], filePath = defaultMemoryPath()): void {
  const trimmed = [...lessons]
    .sort((a, b) => b.reward - a.reward || b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_LESSONS);
  fs.writeFileSync(filePath, JSON.stringify({ lessons: trimmed, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

export function appendLessons(
  newOnes: Array<Omit<BotLesson, 'id' | 'createdAt'> & { id?: string; createdAt?: string }>,
  filePath = defaultMemoryPath(),
): BotLesson[] {
  const existing = loadLessons(filePath);
  const stamped: BotLesson[] = newOnes
    .filter((l) => l.reward > 0)
    .map((l) => ({
      id: l.id || randomUUID(),
      situationKey: String(l.situationKey || '').slice(0, 200),
      actionType: l.actionType,
      actionData: l.actionData || {},
      label: l.label,
      reward: l.reward,
      difficulty: l.difficulty,
      createdAt: l.createdAt || new Date().toISOString(),
    }));
  const merged = [...existing, ...stamped];
  saveLessons(merged, filePath);
  return loadLessons(filePath);
}

/** Recall leve (mesmo critério do serviço Nest). */
export function recallLessons(
  lessons: BotLesson[],
  situationKey: string,
  limit = 10,
): BotLesson[] {
  const phase = situationKey.split('|')[0] || '';
  const scored = lessons.map((l) => {
    let score = l.reward;
    if (l.situationKey.startsWith(phase)) score += 20;
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

export function memoryStats(filePath = defaultMemoryPath()) {
  const lessons = loadLessons(filePath);
  const byType: Record<string, number> = {};
  for (const l of lessons) {
    byType[l.actionType] = (byType[l.actionType] || 0) + 1;
  }
  return { count: lessons.length, filePath, byType };
}
