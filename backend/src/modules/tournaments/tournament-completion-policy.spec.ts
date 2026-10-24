import { MatchStatus } from './entities/tournament-match.entity';
import { roundRobinAction } from './tournament-completion-policy';

describe('Torneios todos-contra-todos — avanço e finalização', () => {
  const completed = { round: 1, status: MatchStatus.FINISHED };
  it('não conclui torneios sem partidas', () => {
    expect(roundRobinAction([], 1)).toBe('wait');
  });
  it('avança para a fase seguinte quando a atual terminou', () => {
    expect(roundRobinAction([
      completed,
      { round: 1, status: MatchStatus.WALKOVER },
      { round: 2, status: MatchStatus.READY },
    ], 1)).toBe('advance');
  });
  it('não avança enquanto restar duelo da fase atual', () => {
    expect(roundRobinAction([
      completed,
      { round: 1, status: MatchStatus.IN_PROGRESS },
      { round: 2, status: MatchStatus.READY },
    ], 1)).toBe('wait');
  });
  it('finaliza só depois que todas as fases estiverem resolvidas', () => {
    expect(roundRobinAction([
      completed,
      { round: 2, status: MatchStatus.WALKOVER },
      { round: 3, status: MatchStatus.FINISHED },
    ], 3)).toBe('finish');
  });
  it('conta partidas canceladas como resolvidas, sem travar fase', () => {
    expect(roundRobinAction([
      { round: 1, status: MatchStatus.CANCELLED },
      { round: 2, status: MatchStatus.READY },
    ], 1)).toBe('advance');
  });
});
