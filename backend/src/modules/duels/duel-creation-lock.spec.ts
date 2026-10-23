import { withDuelPlayerLocks } from './duel-creation-lock';

function fakeRepository() {
  const events: string[] = [];
  const runner = {
    isTransactionActive: false,
    connect: jest.fn(async () => { events.push('connect'); }),
    startTransaction: jest.fn(async () => { runner.isTransactionActive = true; events.push('begin'); }),
    query: jest.fn(async (_sql: string, params: number[]) => { events.push('lock:' + params[1]); }),
    commitTransaction: jest.fn(async () => { runner.isTransactionActive = false; events.push('commit'); }),
    rollbackTransaction: jest.fn(async () => { runner.isTransactionActive = false; events.push('rollback'); }),
    release: jest.fn(async () => { events.push('release'); }),
  };
  const repository = { manager: { connection: { createQueryRunner: () => runner } } };
  return { repository: repository as any, runner, events };
}

describe('PostgreSQL duel player creation locks', () => {
  it('locks each player in ascending order, with no duplicates, and commits only after creation', async () => {
    const { repository, runner, events } = fakeRepository();
    const result = await withDuelPlayerLocks(repository, [9, 3, 9], async () => {
      events.push('create-duel');
      return 'duel-id';
    });
    expect(result).toBe('duel-id');
    expect(events).toEqual(['connect', 'begin', 'lock:3', 'lock:9', 'create-duel', 'commit', 'release']);
    expect(runner.query).toHaveBeenNthCalledWith(1, 'SELECT pg_advisory_xact_lock($1, $2)', [7312007, 3]);
  });

  it('rolls back and releases the connection when creation fails', async () => {
    const { repository, events } = fakeRepository();
    await expect(withDuelPlayerLocks(repository, [1, 2], async () => {
      throw new Error('could not create');
    })).rejects.toThrow('could not create');
    expect(events).toEqual(['connect', 'begin', 'lock:1', 'lock:2', 'rollback', 'release']);
  });

  it('rejects invalid users before obtaining a connection', async () => {
    const { repository, runner } = fakeRepository();
    await expect(withDuelPlayerLocks(repository, [0, 2], async () => 'ok')).rejects.toThrow('IDs de jogadores inválidos');
    expect(runner.connect).not.toHaveBeenCalled();
  });
});
