import { TournamentsService } from './tournaments.service';
import { Tournament, TournamentStatus } from './entities/tournament.entity';
import { TournamentParticipant } from './entities/tournament-participant.entity';
import { User } from '../users/entities/user.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { Achievement } from '../users/entities/achievement.entity';

describe('Premiações de torneio — entrega idempotente', () => {
  it('entrega créditos, cash, estrelas, cartas, troféu e ranking apenas uma vez', async () => {
    const tournament: any = {
      id: 't-1', name: 'Torneio teste', status: TournamentStatus.FINISHED,
      prizeFirst: 50, prizeSecond: 0, prizeThird: 0,
      prizeDetails: {
        1: { credit: 100, cash: 10, stars: 3, cardIds: ['card-1'], trophyTitle: 'Campeão' },
        _automaticAwardsVersion: 2,
      },
    };
    let requestedPlace = 0;
    const increments: Array<[string, number]> = [];
    const inventorySave = jest.fn(async () => ({}));
    const achievementsSave = jest.fn(async () => ({}));
    const tournamentRepository = {
      createQueryBuilder: () => ({
        setLock() { return this; },
        where() { return this; },
        async getOne() { return tournament; },
      }),
      save: jest.fn(async (entity: any) => entity),
    };
    const participants = {
      createQueryBuilder: () => ({
        where() { return this; },
        andWhere(_expression: string, values: { place: number }) {
          requestedPlace = values.place;
          return this;
        },
        async getMany() { return requestedPlace === 1 ? [{ userId: 41 }] : []; },
      }),
    };
    const userRepository = {
      createQueryBuilder: () => ({
        setLock() { return this; },
        where() { return this; },
        async getOne() { return { id: 41 }; },
      }),
      increment: jest.fn(async (_where: any, field: string, value: number) => {
        increments.push([field, value]);
      }),
    };
    const cards = { findOne: jest.fn(async () => null), create: (record: any) => record, save: inventorySave };
    const achievements = { create: (record: any) => record, save: achievementsSave };
    const repositories: Record<string, any> = {
      [Tournament.name]: tournamentRepository,
      [TournamentParticipant.name]: participants,
      [User.name]: userRepository,
      [UserCard.name]: cards,
      [Achievement.name]: achievements,
    };
    const manager = { getRepository: (entity: any) => repositories[entity.name] };
    const service = Object.create(TournamentsService.prototype) as any;
    service.logger = { log: jest.fn(), error: jest.fn() };
    service.tournamentRepository = {
      manager: { transaction: (fn: (manager: any) => Promise<any>) => fn(manager) },
    };
    await service.distributePrizes(tournament);
    await service.distributePrizes(tournament);
    expect(increments).toEqual([
      ['credits', 100], ['cash', 10], ['stars', 3], ['tournamentPoints', 100],
    ]);
    expect(inventorySave).toHaveBeenCalledTimes(1);
    expect(achievementsSave).toHaveBeenCalledTimes(1);
    expect(tournament.prizeDetails._awardedPlaces).toEqual([1]);
    expect(tournamentRepository.save).toHaveBeenCalledTimes(1);
  });
});
