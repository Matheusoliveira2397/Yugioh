import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

interface RankedPlayer {
  id: string;
  nickname: string;
  clanTag?: string;
  profileImage: string;
  level: number;
  totalScore: number;
  seasonScore: number;
  division: string;
  wins: number;
  losses: number;
  group?: {
    id: string;
    name: string;
    tag: string;
  };
}

export default function RankingPage() {
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [activeTab, setActiveTab] = useState<'season' | 'general'>('season');
  const [loading, setLoading] = useState(true);
  const { token, user } = useAuthStore();

  useEffect(() => {
    fetchRanking();
  }, [activeTab]);

  const fetchRanking = async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === 'season' 
        ? 'http://localhost:3000/users/ranking/season'
        : 'http://localhost:3000/users/ranking/general';

      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('📊 [RankingPage] Dados recebidos:', response.data);
      console.log('📊 [RankingPage] Primeiro jogador:', response.data[0]);
      console.log('📊 [RankingPage] clanTag do primeiro jogador:', response.data[0]?.clanTag);
      
      setPlayers(response.data);
    } catch (error) {
      console.error('Erro ao buscar ranking:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDivisionColor = (division: string) => {
    const colors: { [key: string]: string } = {
      'BRONZE': 'text-orange-600',
      'SILVER': 'text-gray-400',
      'GOLD': 'text-yellow-400',
      'PLATINUM': 'text-cyan-400',
      'DIAMOND': 'text-blue-400',
      'MASTER': 'text-purple-400',
      'LEGENDARY': 'text-red-400',
    };
    return colors[division?.toUpperCase()] || 'text-orange-600';
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-orange-600';
    return 'text-slate-400';
  };

  const sortedPlayers = [...players].sort((a, b) => {
    const scoreA = activeTab === 'season' ? a.seasonScore : a.totalScore;
    const scoreB = activeTab === 'season' ? b.seasonScore : b.totalScore;
    return scoreB - scoreA;
  });

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
            <span className="text-6xl">📊</span>
            Ranking de Duelistas
          </h1>
          <p className="text-slate-400 text-lg">
            Veja os melhores duelistas do jogo
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => setActiveTab('season')}
            className={`px-8 py-3 rounded-xl font-bold transition-all text-lg ${
              activeTab === 'season'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            🏆 Ranking da Season
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-8 py-3 rounded-xl font-bold transition-all text-lg ${
              activeTab === 'general'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            ⭐ Ranking Geral
          </button>
        </div>

        {/* Ranking Table */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-6 py-4 text-left text-slate-300 font-bold text-lg">#</th>
                  <th className="px-6 py-4 text-left text-slate-300 font-bold text-lg">Duelista</th>
                  <th className="px-6 py-4 text-left text-slate-300 font-bold text-lg">Clã</th>
                  <th className="px-6 py-4 text-center text-slate-300 font-bold text-lg">Divisão</th>
                  <th className="px-6 py-4 text-right text-slate-300 font-bold text-lg">Score</th>
                  <th className="px-6 py-4 text-center text-slate-300 font-bold text-lg">V/D</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xl">
                      Carregando ranking...
                    </td>
                  </tr>
                ) : sortedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Nenhum duelista encontrado
                    </td>
                  </tr>
                ) : (
                  sortedPlayers.map((player, index) => {
                    const rank = index + 1;
                    const score = activeTab === 'season' ? player.seasonScore : player.totalScore;
                    const isCurrentUser = player.id === user?.id;

                    return (
                      <motion.tr
                        key={player.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`border-t border-slate-700/50 hover:bg-slate-800/50 transition-all ${
                          isCurrentUser ? 'bg-purple-900/20' : ''
                        }`}
                      >
                        {/* Rank */}
                        <td className="px-6 py-5">
                          <span className={`text-3xl font-bold ${getRankColor(rank)}`}>
                            {rank === 1 && '🥇'}
                            {rank === 2 && '🥈'}
                            {rank === 3 && '🥉'}
                            {rank > 3 && `${rank}°`}
                          </span>
                        </td>

                        {/* Duelista */}
                        <td className="px-6 py-5">
                          <Link
                            to={`/profile/${player.id}`}
                            className="flex items-center gap-4 hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={`http://localhost:3000${player.profileImage}`}
                              alt={player.nickname}
                              className="w-14 h-14 rounded-xl object-cover border-2 border-purple-500"
                              onError={(e) => {
                                e.currentTarget.src = '/images/default.png';
                              }}
                            />
                            <div>
                              <p className="text-white font-bold text-lg flex items-center gap-2">
                                {player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname}
                                {isCurrentUser && (
                                  <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">VOCÊ</span>
                                )}
                              </p>
                              <p className="text-slate-400 text-sm">Nível {player.level}</p>
                            </div>
                          </Link>
                        </td>

                        {/* Clã */}
                        <td className="px-6 py-5">
                          {player.group ? (
                            <Link
                              to={`/groups/${player.group.id}`}
                              className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors"
                            >
                              [{player.group.tag}] {player.group.name}
                            </Link>
                          ) : (
                            <span className="text-slate-500 text-sm">Sem clã</span>
                          )}
                        </td>

                        {/* Divisão */}
                        <td className="px-6 py-5 text-center">
                          <span className={`font-bold text-lg ${getDivisionColor(player.division)}`}>
                            {player.division || 'Bronze'}
                          </span>
                        </td>

                        {/* Score */}
                        <td className="px-6 py-5 text-right">
                          <span className="text-2xl font-bold text-yellow-400">
                            {score.toLocaleString()}
                          </span>
                        </td>

                        {/* V/D */}
                        <td className="px-6 py-5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-green-400 font-bold">{player.wins || 0}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-red-400 font-bold">{player.losses || 0}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {(player.wins || 0) + (player.losses || 0) > 0
                              ? `${(((player.wins || 0) / ((player.wins || 0) + (player.losses || 0))) * 100).toFixed(1)}%`
                              : '0%'}
                          </p>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
