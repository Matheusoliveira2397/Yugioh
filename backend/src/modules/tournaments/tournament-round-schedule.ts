import { BadRequestException } from '@nestjs/common';

/** Intervalo entre horários de INÍCIO das rodadas, não duração do duelo. */
export const DEFAULT_ROUND_INTERVAL_MINUTES = 60;
export const MIN_ROUND_INTERVAL_MINUTES = 1;
export const MAX_ROUND_INTERVAL_MINUTES = 10080; // 7 dias

/** Validação única usada em criação, edição e geração de chave. */
export function validateRoundIntervalMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) ||
      value < MIN_ROUND_INTERVAL_MINUTES || value > MAX_ROUND_INTERVAL_MINUTES) {
    throw new BadRequestException(
      `O intervalo entre rodadas deve ser um número inteiro de ${MIN_ROUND_INTERVAL_MINUTES} a ${MAX_ROUND_INTERVAL_MINUTES} minutos.`,
    );
  }
  return value;
}

/** Usa a mesma regra em mata-mata e pontos corridos, inclusive no 3º lugar. */
export function roundScheduledAt(
  startAt: Date | string,
  round: number,
  intervalMinutes: number = DEFAULT_ROUND_INTERVAL_MINUTES,
): Date {
  const minutes = validateRoundIntervalMinutes(intervalMinutes);
  if (!Number.isInteger(round) || round < 1) {
    throw new BadRequestException('Número da rodada inválido');
  }
  const base = new Date(startAt).getTime();
  if (!Number.isFinite(base)) {
    throw new BadRequestException('Data inicial do torneio inválida');
  }
  return new Date(base + (round - 1) * minutes * 60_000);
}
