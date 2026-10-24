import { MatchStatus } from './entities/tournament-match.entity';

export type RoundRobinAction = 'wait' | 'advance' | 'finish';

/**
 * Todos contra todos não usa nextMatchId. A rodada avança quando seus jogos
 * terminam; o torneio só finaliza quando TODAS as rodadas terminaram.
 */
export function roundRobinAction(
  matches: ReadonlyArray<{ round: number; status: MatchStatus }>,
  currentRound: number,
): RoundRobinAction {
  if (matches.length === 0) return 'wait';
  const settled = (match: { status: MatchStatus }) =>
    [MatchStatus.FINISHED, MatchStatus.WALKOVER, MatchStatus.CANCELLED].includes(match.status);
  if (matches.every(settled)) return 'finish';
  const current = matches.filter((match) => match.round === currentRound);
  if (current.length && current.every(settled) &&
      currentRound < Math.max(...matches.map((match) => match.round))) return 'advance';
  return 'wait';
}
