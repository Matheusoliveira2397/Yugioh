import { motion } from 'framer-motion';
import { useState } from 'react';

interface Match {
  id: string;
  round: number;
  matchNumber: number;
  player1Id?: number;
  player2Id?: number;
  winnerId?: number;
  status: string;
  player1?: {
    id: number;
    nickname: string;
    profileImage?: string;
  };
  player2?: {
    id: number;
    nickname: string;
    profileImage?: string;
  };
  winner?: {
    id: number;
    nickname: string;
  };
  player1Score?: number;
  player2Score?: number;
  scheduledAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface Bracket {
  tournament: {
    id: string;
    name: string;
    status: string;
    currentRound: number;
    maxParticipants: number;
    currentParticipants: number;
  };
  rounds: { [round: number]: Match[] };
  totalRounds: number;
}

interface TournamentBracketProps {
  bracket: Bracket;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function TournamentBracket({ bracket }: TournamentBracketProps) {
  const [hoveredMatch, setHoveredMatch] = useState<string | null>(null);

  // Organizar matches por rodada
  const organizeMatches = () => {
    const rounds: { [round: number]: Match[] } = {};
    
    for (let round = 1; round <= bracket.totalRounds; round++) {
      rounds[round] = bracket.rounds[round] || [];
    }
    
    return rounds;
  };

  const organizedRounds = organizeMatches();
  const totalRounds = bracket.totalRounds;

  // Calcular posições para layout dividido (esquerda/direita)
  const getMatchPosition = (round: number, matchIndex: number, totalMatchesInRound: number) => {
    const isLeftSide = round <= Math.ceil(totalRounds / 2);
    const spacing = 120; // Espaçamento vertical entre matches
    const baseOffset = 0;
    
    return {
      top: baseOffset + (matchIndex * spacing),
      side: isLeftSide ? 'left' : 'right'
    };
  };

  // Calcular scores do duelo (se disponível)
  const getMatchScores = (match: Match) => {
    // Por enquanto, retornar null se não houver scores explícitos
    // Os scores podem vir do duelo associado
    return {
      player1Score: match.player1Score ?? null,
      player2Score: match.player2Score ?? null,
    };
  };

  // Renderizar match box
  const renderMatchBox = (match: Match, round: number, matchIndex: number, side: 'left' | 'right') => {
    const isWinner1 = match.winnerId === match.player1Id;
    const isWinner2 = match.winnerId === match.player2Id;
    const isFinished = match.status === 'finished';
    const isInProgress = match.status === 'in_progress';
    const isReady = match.status === 'ready' || match.status === 'scheduled';

    return (
      <motion.div
        key={match.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.02 }}
        onHoverStart={() => setHoveredMatch(match.id)}
        onHoverEnd={() => setHoveredMatch(null)}
        className={`relative z-10 w-[260px] bg-black/60 rounded-lg border-2 ${
          isFinished && (isWinner1 || isWinner2)
            ? 'border-[#00ff88] shadow-[0_0_20px_rgba(0,255,136,0.5)]'
            : isInProgress
            ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] animate-pulse'
            : 'border-[#00ff88]/50 shadow-[0_0_10px_rgba(0,255,136,0.3)]'
        } transition-all duration-300`}
        style={{
          marginTop: matchIndex === 0 ? '0' : '20px',
        }}
      >
        {/* Player 1 */}
        <div className={`p-3 rounded-t-lg transition-all ${
          isWinner1 ? 'bg-[#00ff88]/20' : isFinished && !isWinner1 ? 'bg-red-500/10' : 'bg-slate-800/50'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
              {match.player1 ? (
                <img
                  src={match.player1.profileImage ? `${API_URL}${match.player1.profileImage}` : '/images/default.png'}
                  alt={match.player1.nickname}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/images/default.png';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-xs">
                  ?
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${
                isWinner1 ? 'text-[#00ff88]' : isFinished && !isWinner1 ? 'text-red-400' : 'text-white'
              }`}>
                {match.player1?.nickname || 'Aguardando...'}
              </p>
            </div>
            {isFinished && (
              <span className={`text-lg font-bold ${
                isWinner1 ? 'text-[#00ff88]' : 'text-slate-400'
              }`}>
                {getMatchScores(match).player1Score ?? '-'}
              </span>
            )}
          </div>
        </div>

        {/* Player 2 */}
        <div className={`p-3 rounded-b-lg transition-all ${
          isWinner2 ? 'bg-[#00ff88]/20' : isFinished && !isWinner2 ? 'bg-red-500/10' : 'bg-slate-800/50'
        }`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
              {match.player2 ? (
                <img
                  src={match.player2.profileImage ? `${API_URL}${match.player2.profileImage}` : '/images/default.png'}
                  alt={match.player2.nickname}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '/images/default.png';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-xs">
                  ?
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold truncate ${
                isWinner2 ? 'text-[#00ff88]' : isFinished && !isWinner2 ? 'text-red-400' : 'text-white'
              }`}>
                {match.player2?.nickname || 'Aguardando...'}
              </p>
            </div>
            {isFinished && (
              <span className={`text-lg font-bold ${
                isWinner2 ? 'text-[#00ff88]' : 'text-slate-400'
              }`}>
                {getMatchScores(match).player2Score ?? '-'}
              </span>
            )}
          </div>
        </div>

        {/* Status badge */}
        {isInProgress && (
          <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
            ⚔️
          </div>
        )}
        {isReady && match.player1Id && match.player2Id && (
          <div className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
            ⏳
          </div>
        )}
      </motion.div>
    );
  };

  // Dividir rounds em esquerda e direita
  const leftRounds: number[] = [];
  const rightRounds: number[] = [];
  
  for (let i = 1; i <= totalRounds; i++) {
    if (i <= Math.ceil(totalRounds / 2)) {
      leftRounds.push(i);
    } else {
      rightRounds.push(i);
    }
  }

  return (
    <div className="relative w-full py-8 px-4 overflow-x-auto" style={{ minHeight: '800px' }}>
      {/* Background com efeito de partículas */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-blue-900/20 pointer-events-none" />
      
      {/* Título do Torneio */}
      <div className="text-center mb-8 relative z-10">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 drop-shadow-lg">
          {bracket.tournament.name}
        </h2>
        <p className="text-slate-400 text-sm">
          {bracket.tournament.currentParticipants} Participantes
        </p>
      </div>

      {/* Bracket Container */}
      <div className="relative max-w-[1600px] mx-auto">
        <div className="flex justify-between items-start gap-12">
          {/* Lado Esquerdo */}
          <div className="flex-1 relative">
            <div className="space-y-12">
              {leftRounds.map((round) => {
                const matches = organizedRounds[round] || [];
                const roundName = 
                  round === totalRounds ? 'Final' :
                  round === totalRounds - 1 ? 'Semifinal' :
                  round === totalRounds - 2 ? 'Quartas' :
                  `Rodada ${round}`;

                return (
                  <div key={round} className="relative">
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold text-[#00ff88] drop-shadow-[0_0_8px_rgba(0,255,136,0.8)]">
                        {roundName}
                      </h3>
                    </div>
                    <div className="space-y-6">
                      {matches.map((match, matchIndex) => (
                        <div key={match.id} className="relative">
                          {renderMatchBox(match, round, matchIndex, 'left')}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lado Direito */}
          <div className="flex-1 relative">
            <div className="space-y-12">
              {rightRounds.map((round) => {
                const matches = organizedRounds[round] || [];
                const roundName = 
                  round === totalRounds ? 'Final' :
                  round === totalRounds - 1 ? 'Semifinal' :
                  round === totalRounds - 2 ? 'Quartas' :
                  `Rodada ${round}`;

                return (
                  <div key={round} className="relative">
                    <div className="text-center mb-6">
                      <h3 className="text-xl font-bold text-[#00ff88] drop-shadow-[0_0_8px_rgba(0,255,136,0.8)]">
                        {roundName}
                      </h3>
                    </div>
                    <div className="space-y-6">
                      {matches.map((match, matchIndex) => (
                        <div key={match.id} className="relative flex justify-end">
                          {renderMatchBox(match, round, matchIndex, 'right')}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CHAMPION Box (centro inferior) */}
        {totalRounds > 0 && organizedRounds[totalRounds] && organizedRounds[totalRounds].length > 0 && (
          <div className="absolute -bottom-20 left-1/2 transform -translate-x-1/2 z-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-[300px] bg-black/80 rounded-lg border-2 border-[#00ff88] shadow-[0_0_30px_rgba(0,255,136,0.6)] p-6 text-center"
            >
              <h3 className="text-2xl font-bold text-[#00ff88] mb-4 drop-shadow-[0_0_10px_rgba(0,255,136,0.8)]">
                CHAMPION
              </h3>
              {bracket.tournament.status === 'finished' && organizedRounds[totalRounds][0]?.winner ? (
                <div className="space-y-2">
                  <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-4 border-[#00ff88]">
                    <img
                      src={organizedRounds[totalRounds][0].winner.profileImage ? `${API_URL}${organizedRounds[totalRounds][0].winner.profileImage}` : '/images/default.png'}
                      alt={organizedRounds[totalRounds][0].winner.nickname}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                  </div>
                  <p className="text-xl font-bold text-[#00ff88]">
                    {organizedRounds[totalRounds][0].winner.nickname}
                  </p>
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Aguardando vencedor...</p>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

