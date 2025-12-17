import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
  const [allPlayers, setAllPlayers] = useState<RankedPlayer[]>([]); // Todos os players (sem filtro)
  const [activeTab, setActiveTab] = useState<'season' | 'general'>('season');
  const [selectedDivision, setSelectedDivision] = useState<string | null>('Legendary'); // Por padrão, mostrar "Desafiante" no ranking da season
  const [loading, setLoading] = useState(true);
  const { token, user } = useAuthStore();

  useEffect(() => {
    fetchRanking();
    // Quando entrar no ranking da season, selecionar "Desafiante" por padrão
    if (activeTab === 'season' && selectedDivision === null) {
      setSelectedDivision('Legendary');
    }
  }, [activeTab]);

  // Função para aplicar filtro de divisão
  const applyDivisionFilter = (playersList: RankedPlayer[], division: string | null) => {
    console.log('🔍 [applyDivisionFilter] Aplicando filtro:', {
      totalPlayers: playersList.length,
      selectedDivision: division,
      firstPlayer: playersList[0] ? { nickname: playersList[0].nickname, division: playersList[0].division } : null,
      sampleDivisions: [...new Set(playersList.slice(0, 10).map(p => p.division || 'Bronze'))]
    });
    
    if (!division || division === 'all' || division === null) {
      console.log('✅ [applyDivisionFilter] Mostrando TODOS os jogadores (sem filtro):', playersList.length);
      setPlayers(playersList);
    } else {
      const filterDivisionUpper = division.trim().toUpperCase();
      
      // Mapear nome do botão para valores possíveis que podem vir do banco
      // O backend retorna divisões normalizadas (Bronze, Silver, Gold, etc.)
      // Mas também pode retornar em português (Prata, Ouro, etc.)
      const filterDivisionMap: { [key: string]: string[] } = {
        'LEGENDARY': ['Legendary', 'LEGENDARY', 'Desafiante', 'DESAFIANTE'],
        'MASTER': ['Master', 'MASTER', 'Mestre', 'MESTRE'],
        'DIAMOND': ['Diamond', 'DIAMOND', 'Diamante', 'DIAMANTE'],
        'GOLD': ['Gold', 'GOLD', 'Ouro', 'OURO'],
        'SILVER': ['Silver', 'SILVER', 'Prata', 'PRATA'],
        'BRONZE': ['Bronze', 'BRONZE'],
      };
      
      const possibleFilterValues = filterDivisionMap[filterDivisionUpper] || [filterDivisionUpper];
      
      console.log(`🔍 [applyDivisionFilter] Filtrando por divisão: "${division}" (${filterDivisionUpper})`);
      console.log(`🔍 [applyDivisionFilter] Valores possíveis para comparação:`, possibleFilterValues);
      
      // Log de amostra das divisões dos jogadores
      const sampleDivisions = [...new Set(playersList.slice(0, 20).map(p => p.division || 'Bronze'))];
      console.log(`🔍 [applyDivisionFilter] Amostra de divisões dos jogadores (primeiros 20):`, sampleDivisions);
      
      const filtered = playersList.filter(p => {
        // Normalizar divisão do jogador (vem do campo division da tabela users)
        const playerDivisionRaw = p.division || 'Bronze';
        let playerDivision = String(playerDivisionRaw).trim();
        
        // Normalizar divisão do jogador para formato padrão (igual ao backend)
        const playerDivisionUpper = playerDivision.toUpperCase();
        if (playerDivisionUpper === 'BRONZE' || playerDivisionUpper === '') playerDivision = 'Bronze';
        else if (playerDivisionUpper === 'SILVER' || playerDivisionUpper === 'PRATA') playerDivision = 'Silver';
        else if (playerDivisionUpper === 'GOLD' || playerDivisionUpper === 'OURO') playerDivision = 'Gold';
        else if (playerDivisionUpper === 'PLATINUM') playerDivision = 'Platinum';
        else if (playerDivisionUpper === 'DIAMOND' || playerDivisionUpper === 'DIAMANTE') playerDivision = 'Diamond';
        else if (playerDivisionUpper === 'MASTER' || playerDivisionUpper === 'MESTRE') playerDivision = 'Master';
        else if (playerDivisionUpper === 'LEGENDARY' || playerDivisionUpper === 'DESAFIANTE') playerDivision = 'Legendary';
        else playerDivision = 'Bronze';
        
        // Normalizar filtro também para formato padrão
        let normalizedFilter = division.trim();
        const filterUpper = normalizedFilter.toUpperCase();
        if (filterUpper === 'BRONZE') normalizedFilter = 'Bronze';
        else if (filterUpper === 'SILVER' || filterUpper === 'PRATA') normalizedFilter = 'Silver';
        else if (filterUpper === 'GOLD' || filterUpper === 'OURO') normalizedFilter = 'Gold';
        else if (filterUpper === 'PLATINUM') normalizedFilter = 'Platinum';
        else if (filterUpper === 'DIAMOND' || filterUpper === 'DIAMANTE') normalizedFilter = 'Diamond';
        else if (filterUpper === 'MASTER' || filterUpper === 'MESTRE') normalizedFilter = 'Master';
        else if (filterUpper === 'LEGENDARY' || filterUpper === 'DESAFIANTE') normalizedFilter = 'Legendary';
        else normalizedFilter = 'Bronze';
        
        // Comparar divisões normalizadas
        const matches = playerDivision === normalizedFilter;
        
        if (matches) {
          console.log(`✅ [applyDivisionFilter] MATCH! Jogador: ${p.nickname}, Divisão original: "${playerDivisionRaw}", Normalizada: "${playerDivision}", Filtro: "${division}" -> "${normalizedFilter}"`);
        }
        
        return matches;
      });
      
      // Log detalhado do resultado
      console.log(`📊 [applyDivisionFilter] Resultado do filtro: ${filtered.length} jogadores encontrados de ${playersList.length} total`);
      if (filtered.length > 0) {
        const filteredDivisions = [...new Set(filtered.map(p => p.division))];
        console.log(`📊 [applyDivisionFilter] Divisões dos jogadores filtrados:`, filteredDivisions);
      } else {
        console.warn(`⚠️ [applyDivisionFilter] NENHUM jogador encontrado para divisão "${division}"!`);
        console.warn(`⚠️ [applyDivisionFilter] Divisões disponíveis nos jogadores:`, [...new Set(playersList.map(p => p.division || 'Bronze'))]);
      }
      console.log(`🔍 [applyDivisionFilter] Filtrado para divisão "${division}": ${filtered.length} jogadores de ${playersList.length} total`);
      setPlayers(filtered);
    }
  };

  // Quando a divisão selecionada mudar, aplicar filtro
  useEffect(() => {
    console.log('🔄 [RankingPage] useEffect - activeTab:', activeTab, 'selectedDivision:', selectedDivision, 'allPlayers.length:', allPlayers.length);
    if (activeTab === 'season') {
      // Quando entrar no ranking da season pela primeira vez, selecionar "Desafiante" por padrão
      if (selectedDivision === null && allPlayers.length > 0) {
        console.log('✅ [RankingPage] Selecionando "Desafiante" por padrão no ranking da season');
        setSelectedDivision('Legendary');
        return;
      }
      
      // Se não há divisão selecionada (null), mostrar todos
      if (selectedDivision === null || selectedDivision === 'all') {
        console.log('✅ [RankingPage] Mostrando todos os jogadores (sem filtro de divisão)');
        setPlayers(allPlayers);
      } else {
        // Aplicar filtro de divisão
        applyDivisionFilter(allPlayers, selectedDivision);
      }
    } else {
      // No ranking geral, não há filtro de divisão
      setPlayers(allPlayers);
    }
  }, [selectedDivision, activeTab, allPlayers]);

  const fetchRanking = async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === 'season' 
        ? `${API_URL}/users/ranking/season`
        : `${API_URL}/users/ranking/general`;

      console.log(`🔍 [RankingPage] Buscando ranking de: ${endpoint}`);
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('📊 [RankingPage] Resposta completa:', response);
      console.log('📊 [RankingPage] Status:', response.status);
      console.log('📊 [RankingPage] Dados recebidos:', response.data);
      console.log('📊 [RankingPage] Tipo dos dados:', typeof response.data);
      console.log('📊 [RankingPage] É array?', Array.isArray(response.data));
      console.log('📊 [RankingPage] Total de jogadores:', response.data?.length || 0);
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        console.log('📊 [RankingPage] Primeiro jogador:', response.data[0]);
        console.log('📊 [RankingPage] clanTag do primeiro jogador:', response.data[0]?.clanTag);
        console.log('📊 [RankingPage] Divisão do primeiro jogador:', response.data[0]?.division);
        const divisions = response.data.map((p: any) => p.division).filter((d: any) => d);
        console.log('📊 [RankingPage] Divisões únicas encontradas:', [...new Set(divisions)]);
      } else {
        console.warn('⚠️ [RankingPage] Resposta vazia ou não é um array!', response.data);
      }
      
      if (Array.isArray(response.data)) {
        console.log('✅ [RankingPage] Dados recebidos do backend:', {
          total: response.data.length,
          firstPlayer: response.data[0] ? {
            nickname: response.data[0].nickname,
            division: response.data[0].division,
            seasonScore: response.data[0].seasonScore
          } : null,
          divisions: [...new Set(response.data.map((p: any) => p.division).filter((d: any) => d))]
        });
        
        // Normalizar divisões para garantir formato consistente
        const normalizedData = response.data.map((p: any) => {
          const divisionRaw = p.division || 'Bronze';
          const divisionNormalized = String(divisionRaw).trim();
          return {
            ...p,
            division: divisionNormalized
          };
        });
        
        // Log de todas as divisões únicas recebidas
        const uniqueDivisions = [...new Set(normalizedData.map((p: any) => p.division))];
        console.log(`📊 [RankingPage] Divisões únicas recebidas do backend:`, uniqueDivisions);
        console.log(`📊 [RankingPage] Total de jogadores por divisão:`, uniqueDivisions.map(div => ({
          division: div,
          count: normalizedData.filter((p: any) => p.division === div).length
        })));
        
        setAllPlayers(normalizedData);
        // Aplicar filtro de divisão se houver
        // Se selectedDivision for null, mostrar todos
        if (activeTab === 'season') {
          applyDivisionFilter(normalizedData, selectedDivision);
        } else {
          setPlayers(normalizedData);
        }
      } else {
        console.error('❌ [RankingPage] Resposta não é um array:', response.data);
        console.error('❌ [RankingPage] Tipo da resposta:', typeof response.data);
        console.error('❌ [RankingPage] Resposta completa:', JSON.stringify(response.data, null, 2));
        setAllPlayers([]);
        setPlayers([]);
      }
    } catch (error: any) {
      console.error('❌ [RankingPage] Erro ao buscar ranking:', error);
      console.error('❌ [RankingPage] Mensagem de erro:', error.message);
      console.error('❌ [RankingPage] Stack:', error.stack);
      if (error.response) {
        console.error('❌ [RankingPage] Resposta de erro do servidor:', error.response.data);
        console.error('❌ [RankingPage] Status do erro:', error.response.status);
      }
      setAllPlayers([]);
      setPlayers([]);
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
      'DESAFIANTE': 'text-red-400',
      'MESTRE': 'text-purple-400',
      'DIAMANTE': 'text-blue-400',
      'OURO': 'text-yellow-400',
      'PRATA': 'text-gray-400',
    };
    return colors[division?.toUpperCase()] || 'text-orange-600';
  };

  // Função para obter o caminho da imagem da divisão
  const getDivisionImage = (division: string): string | null => {
    if (!division) return null;
    
    // Normalizar o nome da divisão (remover espaços, converter para maiúsculas)
    const normalizedDivision = division.trim().toUpperCase();
    
    // Mapear nomes das divisões para os nomes dos arquivos
    const divisionMap: { [key: string]: string } = {
      'BRONZE': 'Bronze',
      'SILVER': 'Prata',
      'GOLD': 'Ouro',
      'PLATINUM': 'Ouro', // Se houver Platinum, usar Ouro como fallback
      'DIAMOND': 'Diamante',
      'DIAMANTE': 'Diamante',
      'MASTER': 'Mestre',
      'MESTRE': 'Mestre',
      'LEGENDARY': 'Desafiante',
      'DESAFIANTE': 'Desafiante',
      'PRATA': 'Prata',
      'OURO': 'Ouro',
    };
    
    const divisionName = divisionMap[normalizedDivision];
    if (!divisionName) return null;
    
    // Retornar apenas PNG (JPG não existe)
    return `/images/Divisões/${divisionName}.png`;
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
    <div className="min-h-screen p-2 sm:p-4 md:p-8 relative z-10 flex flex-col items-center">
      <div className="max-w-7xl w-full mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 md:mb-8 text-center"
        >
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white mb-2 flex items-center justify-center gap-2 md:gap-3">
            <span className="text-3xl sm:text-4xl md:text-6xl">📊</span>
            <span className="hidden sm:inline">Ranking de Duelistas</span>
            <span className="sm:hidden">Ranking</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-lg">
            Veja os melhores duelistas do jogo
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 md:gap-4 mb-4 md:mb-8 justify-center">
          <button
            onClick={() => {
              setActiveTab('season');
              setSelectedDivision('Legendary'); // Selecionar "Desafiante" por padrão ao entrar no ranking da season
            }}
            className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-bold transition-all duration-300 text-sm sm:text-lg ${
              activeTab === 'season'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-purple-500/50 scale-105'
                : 'text-slate-400 hover:bg-white/10 hover:text-white hover:scale-105 border border-white/20'
            }`}
          >
            <span className="hidden sm:inline">🏆 Ranking da Season</span>
            <span className="sm:hidden">🏆 Season</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('general');
              setSelectedDivision(null); // Resetar filtro ao mudar de aba
            }}
            className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-bold transition-all duration-300 text-sm sm:text-lg ${
              activeTab === 'general'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-purple-500/50 scale-105'
                : 'text-slate-400 hover:bg-white/10 hover:text-white hover:scale-105 border border-white/20'
            }`}
          >
            <span className="hidden sm:inline">⭐ Ranking Geral</span>
            <span className="sm:hidden">⭐ Geral</span>
          </button>
        </div>

        {/* Filtro de Divisões - Apenas para Ranking da Season */}
        {activeTab === 'season' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 md:mb-8"
          >
            <div className="flex gap-1 sm:gap-2 md:gap-3 lg:gap-4 justify-center items-center w-full">
              {/* Divisões com logos - Ordem da maior para a menor */}
              {[
                { name: 'Legendary', displayName: 'Desafiante' },
                { name: 'Master', displayName: 'Mestre' },
                { name: 'Diamond', displayName: 'Diamante' },
                { name: 'Gold', displayName: 'Ouro' },
                { name: 'Silver', displayName: 'Prata' },
                { name: 'Bronze', displayName: 'Bronze' },
              ].map((division) => {
                const imagePath = getDivisionImage(division.name);
                const isSelected = selectedDivision?.toUpperCase() === division.name.toUpperCase();
                
                return (
                  <button
                    key={division.name}
                    onClick={() => setSelectedDivision(isSelected ? null : division.name)}
                    className={`flex flex-col items-center transition-all duration-300 flex-1 max-w-[280px] sm:max-w-[360px] md:max-w-[500px] lg:max-w-[650px] xl:max-w-[750px] ${
                      isSelected
                        ? 'scale-110 opacity-100'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                    style={{ gap: 0 }}
                  >
                    {imagePath && (
                      <img
                        src={imagePath}
                        alt={division.displayName}
                        className="object-contain"
                        style={{
                          width: 'clamp(12rem, 20vw, 30rem)',
                          height: 'clamp(12rem, 20vw, 30rem)',
                        }}
                        onLoad={() => {
                          console.log('✅ Imagem carregada:', imagePath);
                        }}
                        onError={(e) => {
                          console.error('❌ Erro ao carregar imagem da divisão:', imagePath);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <span className="text-white font-semibold text-[10px] sm:text-xs md:text-sm whitespace-nowrap" style={{ marginTop: '-6rem' }}>{division.displayName}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Ranking - Desktop Table / Mobile Cards */}
        <div className="rounded-2xl border border-white/20 overflow-hidden mx-auto max-w-6xl">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 lg:px-6 py-3 lg:py-4 text-left text-purple-300 font-bold text-sm lg:text-lg">
                    {activeTab === 'season' ? 'Posição' : '#'}
                  </th>
                  <th className="px-4 lg:px-6 py-3 lg:py-4 text-left text-purple-300 font-bold text-sm lg:text-lg">Duelista</th>
                  {activeTab === 'general' && (
                    <>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-left text-purple-300 font-bold text-sm lg:text-lg">Clã</th>
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-center text-purple-300 font-bold text-sm lg:text-lg">Divisão</th>
                    </>
                  )}
                  <th className="px-4 lg:px-6 py-3 lg:py-4 text-right text-purple-300 font-bold text-sm lg:text-lg">Score</th>
                  <th className="px-4 lg:px-6 py-3 lg:py-4 text-center text-purple-300 font-bold text-sm lg:text-lg">V/D</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={activeTab === 'season' ? 4 : 6} className="px-6 py-12 text-center text-slate-400 text-xl">
                      Carregando ranking...
                    </td>
                  </tr>
                ) : sortedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'season' ? 4 : 6} className="px-6 py-12 text-center text-slate-400">
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
                        className={`border-t border-white/20 hover:bg-white/10 transition-all duration-300 ${
                          isCurrentUser ? 'border-purple-500/50' : ''
                        }`}
                      >
                        <td className="px-4 lg:px-6 py-3 lg:py-5">
                          <span className={`text-xl lg:text-3xl font-bold ${getRankColor(rank)}`}>
                            {rank === 1 && '🥇'}
                            {rank === 2 && '🥈'}
                            {rank === 3 && '🥉'}
                            {rank > 3 && `${rank}°`}
                          </span>
                        </td>
                        <td className="px-4 lg:px-6 py-3 lg:py-5">
                          <Link
                            to={`/profile/${player.id}`}
                            className="flex items-center gap-2 lg:gap-4 hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={`http://localhost:3000${player.profileImage}`}
                              alt={player.nickname}
                              className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl object-cover border-2 border-purple-500"
                              onError={(e) => {
                                e.currentTarget.src = '/images/default.png';
                              }}
                            />
                            <div>
                              <p className="text-white font-bold text-sm lg:text-lg flex items-center gap-1 lg:gap-2">
                                <span className="truncate max-w-[120px] lg:max-w-none">
                                  {activeTab === 'season' 
                                    ? (player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname)
                                    : (player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname)
                                  }
                                </span>
                                {isCurrentUser && (
                                  <span className="text-xs bg-purple-600 px-1.5 lg:px-2 py-0.5 rounded">VOCÊ</span>
                                )}
                              </p>
                              <p className="text-slate-400 text-xs lg:text-sm">Nível {player.level}</p>
                            </div>
                          </Link>
                        </td>
                        {activeTab === 'general' && (
                          <>
                            <td className="px-4 lg:px-6 py-3 lg:py-5">
                              {player.group ? (
                                <Link
                                  to={`/groups/${player.group.id}`}
                                  className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors flex items-center gap-1 lg:gap-2"
                                >
                                  <span className="text-xs lg:text-base truncate max-w-[100px] lg:max-w-none">[{player.group.tag}] {player.group.name}</span>
                                </Link>
                              ) : (
                                <span className="text-slate-500 text-xs lg:text-sm">Sem clã</span>
                              )}
                            </td>
                            <td className="px-4 lg:px-6 py-3 lg:py-5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                {(() => {
                                  const divisionImage = getDivisionImage(player.division);
                                  return divisionImage ? (
                                    <img 
                                      src={divisionImage}
                                      alt={player.division || 'Bronze'}
                                      className="w-6 h-6 lg:w-8 lg:h-8 object-contain"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  ) : null;
                                })()}
                                <span className={`font-bold text-sm lg:text-lg ${getDivisionColor(player.division)}`}>
                                  {player.division || 'Bronze'}
                                </span>
                              </div>
                            </td>
                          </>
                        )}
                        <td className="px-4 lg:px-6 py-3 lg:py-5 text-right">
                          <span className="text-lg lg:text-2xl font-bold text-yellow-400">
                            {activeTab === 'general' 
                              ? (typeof score === 'number' ? score.toFixed(1) : Number(score || 0).toFixed(1))
                              : (typeof score === 'number' ? score.toLocaleString() : Number(score || 0).toLocaleString())}
                          </span>
                        </td>
                        <td className="px-4 lg:px-6 py-3 lg:py-5 text-center">
                          <div className="flex items-center justify-center gap-1 lg:gap-2">
                            <span className="text-green-400 font-bold text-sm lg:text-base">{player.wins || 0}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-red-400 font-bold text-sm lg:text-base">{player.losses || 0}</span>
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

          {/* Mobile Cards */}
          <div className="md:hidden p-2 space-y-2">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-lg">
                Carregando ranking...
              </div>
            ) : sortedPlayers.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                Nenhum duelista encontrado
              </div>
            ) : (
              sortedPlayers.map((player, index) => {
                const rank = index + 1;
                const score = activeTab === 'season' ? player.seasonScore : player.totalScore;
                const isCurrentUser = player.id === user?.id;

                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`rounded-xl p-3 border shadow-lg ${
                      isCurrentUser ? 'border-purple-500/60 shadow-purple-500/20' : 'border-white/20'
                    } hover:scale-[1.02] transition-all duration-200`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-2xl font-bold ${getRankColor(rank)}`}>
                        {rank === 1 && '🥇'}
                        {rank === 2 && '🥈'}
                        {rank === 3 && '🥉'}
                        {rank > 3 && `${rank}°`}
                      </span>
                      <Link
                        to={`/profile/${player.id}`}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <img
                          src={`http://localhost:3000${player.profileImage}`}
                          alt={player.nickname}
                          className="w-12 h-12 rounded-xl object-cover border-2 border-purple-500 flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = '/images/default.png';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm flex items-center gap-1">
                            <span className="truncate">
                              {activeTab === 'season' 
                                ? (player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname)
                                : (player.clanTag ? `|${player.clanTag}| ${player.nickname}` : player.nickname)
                              }
                            </span>
                            {isCurrentUser && (
                              <span className="text-xs bg-purple-600 px-1.5 py-0.5 rounded">VOCÊ</span>
                            )}
                          </p>
                          <p className="text-slate-400 text-xs">Nível {player.level}</p>
                        </div>
                      </Link>
                    </div>
                    <div className={`grid gap-2 text-xs ${activeTab === 'season' ? 'grid-cols-2' : 'grid-cols-2'}`}>
                      <div>
                        <span className="text-slate-400">Score: </span>
                        <span className="text-yellow-400 font-bold">
                          {activeTab === 'general' 
                            ? (typeof score === 'number' ? score.toFixed(1) : Number(score || 0).toFixed(1))
                            : (typeof score === 'number' ? score.toLocaleString() : Number(score || 0).toLocaleString())}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">V/D: </span>
                        <span className="text-green-400 font-bold">{player.wins || 0}</span>
                        <span className="text-slate-400">/</span>
                        <span className="text-red-400 font-bold">{player.losses || 0}</span>
                      </div>
                      {activeTab === 'general' && (
                        <>
                          <div>
                            <span className="text-slate-400">Divisão: </span>
                            <span className={`font-bold ${getDivisionColor(player.division)} flex items-center gap-1`}>
                              {(() => {
                                const divisionImage = getDivisionImage(player.division);
                                return divisionImage ? (
                                  <img 
                                    src={divisionImage}
                                    alt={player.division || 'Bronze'}
                                    className="w-5 h-5 object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : null;
                              })()}
                              {player.division || 'Bronze'}
                            </span>
                          </div>
                          {player.group && (
                            <div>
                              <span className="text-slate-400">Clã: </span>
                              <Link
                                to={`/groups/${player.group.id}`}
                                className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors truncate block"
                              >
                                [{player.group.tag}]
                              </Link>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
