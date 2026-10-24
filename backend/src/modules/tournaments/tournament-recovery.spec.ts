import { TournamentsService } from './tournaments.service';
import { Duel, DuelResult, DuelStatus } from '../duels/entities/duel.entity';

describe('Recuperação de resultados após queda do servidor', () => {
  it('propaga vitória de duelo finalizado que ficou preso na chave', async () => {
    const service = Object.create(TournamentsService.prototype) as any;
    service.logger = { warn: jest.fn(), error: jest.fn() };
    service.matchRepository = { find: jest.fn(async () => [{ id: 'match-1', duelId: 'duel-1' }]) };
    service.tournamentRepository = { manager: { getRepository: (type: any) => {
      expect(type).toBe(Duel);
      return { findOne: jest.fn(async () => ({
        id: 'duel-1', status: DuelStatus.FINISHED,
        result: DuelResult.PLAYER2_WIN, winnerId: 22,
      })) };
    } } };
    service.updateTournamentMatchFromDuel = jest.fn(async () => {});
    await service.reconcileFinishedDuelMatches();
    expect(service.updateTournamentMatchFromDuel).toHaveBeenCalledWith(
      'duel-1', 22, DuelResult.PLAYER2_WIN,
    );
  });

  it('desempata duelos encerrados sem vencedor por pontos de vida', async () => {
    const service = Object.create(TournamentsService.prototype) as any;
    service.logger = { warn: jest.fn(), error: jest.fn() };
    service.matchRepository = { find: jest.fn(async () => [{ id: 'match-2', duelId: 'duel-2' }]) };
    service.tournamentRepository = { manager: { getRepository: () => ({
      findOne: jest.fn(async () => ({
        id: 'duel-2', status: DuelStatus.FINISHED,
        result: DuelResult.DRAW, winnerId: null,
        player1Id: 12, player2Id: 24,
        player1LifePoints: 7900, player2LifePoints: 2100,
        player1Field: {}, player2Field: {},
      })),
    }) } };
    service.updateTournamentMatchFromDuel = jest.fn(async () => {});
    await service.reconcileFinishedDuelMatches();
    expect(service.updateTournamentMatchFromDuel).toHaveBeenCalledWith(
      'duel-2', 12, DuelResult.PLAYER1_WIN,
    );
  });
});
