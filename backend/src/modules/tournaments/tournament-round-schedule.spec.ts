import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_ROUND_INTERVAL_MINUTES,
  roundScheduledAt,
  validateRoundIntervalMinutes,
} from './tournament-round-schedule';

describe('Agendamento configurável das fases do torneio', () => {
  const start = '2026-11-01T12:00:00.000Z';

  it('preserva 60 minutos como padrão para torneios antigos', () => {
    expect(DEFAULT_ROUND_INTERVAL_MINUTES).toBe(60);
    expect(roundScheduledAt(start, 1).toISOString()).toBe(start);
    expect(roundScheduledAt(start, 2).toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('agenda as fases consecutivas segundo o valor configurado', () => {
    expect(roundScheduledAt(start, 1, 30).toISOString()).toBe(start);
    expect(roundScheduledAt(start, 2, 30).toISOString()).toBe('2026-11-01T12:30:00.000Z');
    expect(roundScheduledAt(start, 3, 30).toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('permite intervalos curtos e longos sem confundir com duração do turno', () => {
    expect(roundScheduledAt(start, 2, 1).toISOString()).toBe('2026-11-01T12:01:00.000Z');
    expect(roundScheduledAt(start, 2, 1440).toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });

  it.each([0, -1, 1.5, 10081, NaN, Infinity, '30', null, undefined])(
    'rejeita intervalo inválido %s', (minutes) => {
      expect(() => validateRoundIntervalMinutes(minutes)).toThrow(BadRequestException);
    },
  );

  it('impede rodadas inválidas', () => {
    expect(() => roundScheduledAt(start, 0, 60)).toThrow(BadRequestException);
    expect(() => roundScheduledAt('not-a-date', 2, 60)).toThrow(BadRequestException);
  });
});
