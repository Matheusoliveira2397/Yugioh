import { Repository } from 'typeorm';

/**
 * Serializa a criação de partidas de jogadores compartilhados entre instâncias.
 *
 * Locks transacionais consultivos do PostgreSQL são adquiridos por userId em
 * ordem fixa. O lock é liberado pelo COMMIT/ROLLBACK ou queda da conexão.
 * O callback deve verificar duelos ativos E completar a criação ainda sob lock.
 */
export async function withDuelPlayerLocks<T>(
  repository: Pick<Repository<any>, 'manager'>,
  playerIds: number[],
  operation: () => Promise<T>,
): Promise<T> {
  const ids = [...new Set(playerIds)].sort((a, b) => a - b);
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)) {
    throw new Error('IDs de jogadores inválidos para criação de duelo');
  }

  const runner = repository.manager.connection.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    // Namespace constante: isolado dos outros advisory locks da aplicação.
    for (const id of ids) {
      await runner.query('SELECT pg_advisory_xact_lock($1, $2)', [7312007, id]);
    }
    const result = await operation();
    await runner.commitTransaction();
    return result;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
