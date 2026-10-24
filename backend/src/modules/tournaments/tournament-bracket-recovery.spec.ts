import { TournamentsService } from './tournaments.service';
import { TournamentFormat, TournamentStatus } from './entities/tournament.entity';
import { MatchStatus } from './entities/tournament-match.entity';

describe('Recuperação de classificação em chaves eliminatórias', () => {
  const tournament = {
    id: 'tournament-1', name: 'Torneio', status: TournamentStatus.IN_PROGRESS,
    format: TournamentFormat.SINGLE_ELIMINATION,
  };
  const semifinal1: any = {
    id: 'semi-1', round: 1, matchNumber: 1,
    tournamentId: tournament.id, status: MatchStatus.FINISHED,
    player1Id: 10, player2Id: 20, winnerId: 10, nextMatchId: 'final',
  };
  const semifinal2: any = {
    id: 'semi-2', round: 1, matchNumber: 2,
    tournamentId: tournament.id, status: MatchStatus.FINISHED,
    player1Id: 30, player2Id: 40, winnerId: 40, nextMatchId: 'final',
  };
  const final: any = {
    id: 'final', round: 2, matchNumber: 1,
    tournamentId: tournament.id, status: MatchStatus.SCHEDULED,
    player1Id: null, player2Id: null, duelId: null,
  };

  function createService(matches: any[]) {
    const service = Object.create(TournamentsService.prototype) as any;
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service.tournamentRepository = {
      find: jest.fn(async () => [tournament]),
    };
    const save = jest.fn(async (match: any) => match);
    service.matchRepository = {
      find: jest.fn(async () => matches),
      save,
    };
    return { service, save };
  }

  it('restaura classificados e deixa final READY sem alterar duelos', async () => {
    const game = { ...final };
    const { service, save } = createService([{ ...semifinal1 }, { ...semifinal2 }, game]);
    await service.reconcileBracketProgress();
    expect(game).toMatchObject({
      player1Id: 10, player2Id: 40, status: MatchStatus.READY,
    });
    expect(save).toHaveBeenCalledTimes(1);
    await service.reconcileBracketProgress();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('não sobrescreve partida que já tem duelo ativo', async () => {
    const started = { ...final, duelId: 'duel-123', status: MatchStatus.IN_PROGRESS };
    const { service, save } = createService([{ ...semifinal1 }, { ...semifinal2 }, started]);
    await service.reconcileBracketProgress();
    expect(save).not.toHaveBeenCalled();
  });
});
