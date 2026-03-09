import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import axios from 'axios';
import { getImageUrl } from '../utils/imageUrl';
import { getDivisionDisplayName, getDivisionImagePath } from '../utils/divisionDisplay';

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
  seasonId?: string | null;
  seasonName?: string | null;
  group?: {
    id: string;
    name: string;
    tag: string;
  };
}

interface Season {
  id: string;
  name: string;
  seasonNumber?: number;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
}

interface RankedGroup {
  rank: number;
  id: string;
  name: string;
  tag: string;
  logo?: string;
  banner?: string;
  seasonScore: number;
  totalScore: number;
  memberCount: number;
  totalWins: number;
  totalLosses: number;
  leader?: {
    nickname: string;
    profileImage?: string;
  };
}

interface Division {
  id: string;
  name: string;
  order: number;
  isAvailable?: boolean;
}

export default function RankingPage() {
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [allPlayers, setAllPlayers] = useState<RankedPlayer[]>([]); // Todos os players (sem filtro)
  const [groups, setGroups] = useState<RankedGroup[]>([]);
  const [rankingType, setRankingType] = useState<'duelista' | 'clan'>('duelista'); // Por padrão, mostrar duelista
  const [activeTab, setActiveTab] = useState<'season' | 'general'>('season');
  const [selectedDivision, setSelectedDivision] = useState<string | null>('Legendary');
  const [loading, setLoading] = useState(true);
  const [availableDivisions, setAvailableDivisions] = useState<Division[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null); // null = season atual
  const { token, user } = useAuthStore();

  useEffect(() => {
    fetchAvailableDivisions();
    fetchRanking();
    if (activeTab === 'season' && selectedDivision === null && rankingType === 'duelista') {
      setSelectedDivision('Legendary');
    }
  }, [activeTab, rankingType]);

  useEffect(() => {
    if (activeTab === 'season') {
      fetchSeasons();
    }
  }, [activeTab]);

  const fetchSeasons = async () => {
    try {
      const response = await axios.get(`${API_URL}/seasons/all`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setSeasons(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao buscar seasons:', error);
      setSeasons([]);
    }
  };

  const fetchAvailableDivisions = async () => {
    try {
      // Usar endpoint público que não requer autenticação
      const response = await axios.get(`${API_URL}/public/divisions/available`);
      const available = response.data || [];
      setAvailableDivisions(available);
      
      // Se estiver no ranking da season e não houver divisão selecionada, selecionar a primeira disponível
      if (activeTab === 'season' && available.length > 0 && !selectedDivision) {
        setSelectedDivision(available[0].name);
      }
    } catch (error) {
      console.error('Erro ao buscar divisões disponíveis:', error);
      // Em caso de erro, usar todas as divisões padrão
      setAvailableDivisions([
        { id: '1', name: 'Legendary', order: 7, isAvailable: true },
        { id: '2', name: 'Master', order: 6, isAvailable: true },
        { id: '3', name: 'Diamond', order: 5, isAvailable: true },
        { id: '4', name: 'Gold', order: 4, isAvailable: true },
        { id: '5', name: 'Silver', order: 3, isAvailable: true },
        { id: '6', name: 'Bronze', order: 1, isAvailable: true },
      ]);
    }
  };

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

  // Quando a divisão selecionada mudar, aplicar filtro local (apenas para ranking da season)
  useEffect(() => {
    if (rankingType === 'duelista' && activeTab === 'season') {
      if (allPlayers.length > 0) {
        if (selectedDivision && selectedDivision !== 'all') {
          // Aplicar filtro local nos dados já carregados (apenas para season)
          applyDivisionFilter(allPlayers, selectedDivision);
        } else {
          // Se não há divisão selecionada ou selecionou "all", mostrar todos
          setPlayers(allPlayers);
        }
      } else {
        // Se não há dados carregados, buscar todos primeiro
        fetchRanking();
      }
    } else if (rankingType === 'duelista' && activeTab === 'general') {
      // No ranking geral, sempre mostrar todos sem filtro
      if (allPlayers.length > 0) {
        setPlayers(allPlayers);
      } else {
        fetchRanking();
      }
    }
  }, [selectedDivision, activeTab, rankingType, allPlayers]);
  
  // Quando mudar o tipo de ranking, aba ou season selecionada, buscar dados
  useEffect(() => {
    if (rankingType === 'duelista' && activeTab === 'season' && !selectedDivision) {
      setSelectedDivision('Legendary');
    }
    fetchRanking();
  }, [rankingType, activeTab, selectedSeasonId]);

  const fetchRanking = async () => {
    setLoading(true);
    try {
      if (rankingType === 'clan') {
        // Buscar ranking de clãs
        const endpoint = activeTab === 'season' 
          ? `${API_URL}/groups/ranking/season`
          : `${API_URL}/groups/ranking/general`;

        console.log(`🔍 [RankingPage] Buscando ranking de clãs de: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (Array.isArray(response.data)) {
          setGroups(response.data);
        } else {
          console.error('❌ [RankingPage] Resposta de clãs não é um array:', response.data);
          setGroups([]);
        }
      } else {
        // Buscar ranking de duelistas
        const endpoint = activeTab === 'season' 
          ? `${API_URL}/users/ranking/season`
          : `${API_URL}/users/ranking/general`;

        const params = activeTab === 'season' && selectedSeasonId
          ? { seasonId: selectedSeasonId }
          : {};

        console.log(`🔍 [RankingPage] Buscando ranking de: ${endpoint}`, params);
        
        const response = await axios.get(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        
        if (Array.isArray(response.data)) {
          const normalizedData = response.data.map((p: any) => {
            // Normalizar divisão corretamente
            let divisionRaw = p.division || 'Bronze';
            let divisionNormalized = String(divisionRaw).trim();
            
            // Normalizar para formato padrão
            const divisionUpper = divisionNormalized.toUpperCase();
            if (divisionUpper === 'BRONZE' || divisionUpper === '') divisionNormalized = 'Bronze';
            else if (divisionUpper === 'SILVER' || divisionUpper === 'PRATA') divisionNormalized = 'Silver';
            else if (divisionUpper === 'GOLD' || divisionUpper === 'OURO') divisionNormalized = 'Gold';
            else if (divisionUpper === 'PLATINUM') divisionNormalized = 'Platinum';
            else if (divisionUpper === 'DIAMOND' || divisionUpper === 'DIAMANTE') divisionNormalized = 'Diamond';
            else if (divisionUpper === 'MASTER' || divisionUpper === 'MESTRE') divisionNormalized = 'Master';
            else if (divisionUpper === 'LEGENDARY' || divisionUpper === 'DESAFIANTE') divisionNormalized = 'Legendary';
            else divisionNormalized = 'Bronze'; // Fallback
            
            return {
              ...p,
              division: divisionNormalized
            };
          });
          
          setAllPlayers(normalizedData);
          // Aplicar filtro de divisão apenas para ranking da season
          if (activeTab === 'season' && selectedDivision && selectedDivision !== 'all') {
            applyDivisionFilter(normalizedData, selectedDivision);
          } else {
            setPlayers(normalizedData);
          }
        } else {
          setAllPlayers([]);
          setPlayers([]);
        }
      }
    } catch (error: any) {
      console.error('❌ [RankingPage] Erro ao buscar ranking:', error);
      if (rankingType === 'clan') {
        setGroups([]);
      } else {
        setAllPlayers([]);
        setPlayers([]);
      }
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

  const getDivisionImage = (division: string): string | null => getDivisionImagePath(division);

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
            <span className="hidden sm:inline">Ranking</span>
            <span className="sm:hidden">Ranking</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-lg">
            {rankingType === 'duelista' ? 'Veja os melhores duelistas do jogo' : 'Veja os melhores clãs do jogo'}
          </p>
        </motion.div>

        {/* Tabs Duelista/Clã - Season e Geral */}
        <div className="flex gap-2 md:gap-4 mb-4 md:mb-6 justify-center">
          <button
            onClick={() => {
              setRankingType('duelista');
              if (activeTab === 'season') setSelectedDivision('Legendary');
              else setSelectedDivision(null);
            }}
            className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-bold transition-all duration-300 text-sm sm:text-lg ${
              rankingType === 'duelista'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-purple-500/50 scale-105'
                : 'text-slate-400 hover:bg-white/10 hover:text-white hover:scale-105 border border-white/20'
            }`}
          >
            <span className="hidden sm:inline">⚔️ Duelista</span>
            <span className="sm:hidden">⚔️ Duelista</span>
          </button>
          <button
            onClick={() => {
              setRankingType('clan');
              setSelectedDivision(null);
            }}
            className={`flex-1 sm:flex-none px-4 sm:px-8 py-2 sm:py-3 rounded-xl font-bold transition-all duration-300 text-sm sm:text-lg ${
              rankingType === 'clan'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-purple-500/50 scale-105'
                : 'text-slate-400 hover:bg-white/10 hover:text-white hover:scale-105 border border-white/20'
            }`}
          >
            <span className="hidden sm:inline">🏰 Clã</span>
            <span className="sm:hidden">🏰 Clã</span>
          </button>
        </div>

        {/* Tabs Season/Geral */}
        <div className="flex gap-2 md:gap-4 mb-4 md:mb-8 justify-center">
          <button
            onClick={() => {
              setActiveTab('season');
              if (rankingType === 'duelista') {
                // Manter divisão selecionada ou selecionar "Desafiante" por padrão
                if (!selectedDivision) {
                  setSelectedDivision('Legendary');
                }
              }
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
              setSelectedDivision(null);
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

        {/* Filtro de Season - Apenas para Ranking da Season (Duelista) */}
        {rankingType === 'duelista' && activeTab === 'season' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <div className="flex flex-wrap gap-2 justify-center items-center">
              <label className="text-slate-300 text-sm font-medium whitespace-nowrap">Season:</label>
              <select
                value={selectedSeasonId ?? ''}
                onChange={(e) => setSelectedSeasonId(e.target.value ? e.target.value : null)}
                className="bg-slate-800 border border-white/30 rounded-lg px-3 py-2 text-white text-sm font-medium focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none min-w-[180px] appearance-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
              >
                <option value="" className="bg-slate-800 text-white">
                  Season atual
                </option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-800 text-white">
                    {s.name} {s.isActive ? '(ativa)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </motion.div>
        )}

        {/* Filtro de Divisões - Apenas para Ranking da Season */}
        {rankingType === 'duelista' && activeTab === 'season' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 md:mb-8"
          >
            <div className="flex gap-1 sm:gap-2 md:gap-3 lg:gap-4 justify-center items-center w-full">
              {/* Divisões com logos - Apenas divisões disponíveis */}
              {availableDivisions.map((division) => {
                const divisionName = typeof division === 'object' && 'name' in division ? division.name : division;
                const displayNameMap: { [key: string]: string } = {
                  'Legendary': 'Desafiante',
                  'Master': 'Mestre',
                  'Diamond': 'Diamante',
                  'Gold': 'Ouro',
                  'Silver': 'Prata',
                  'Bronze': 'Bronze',
                };
                const displayName = typeof division === 'object' && 'displayName' in division 
                  ? division.displayName 
                  : displayNameMap[divisionName] || divisionName;
                const imagePath = getDivisionImage(divisionName);
                const isSelected = selectedDivision?.toUpperCase() === divisionName.toUpperCase();
                
                return (
                  <button
                    key={divisionName}
                    onClick={() => {
                      // Quando clicar no emblema, sempre mostrar os usuários daquela divisão
                      setSelectedDivision(divisionName);
                    }}
                    className={`flex flex-col items-center transition-all duration-300 flex-1 max-w-[280px] sm:max-w-[360px] md:max-w-[500px] lg:max-w-[650px] xl:max-w-[750px] cursor-pointer ${
                      isSelected
                        ? 'scale-110 opacity-100'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                    style={{ gap: 0 }}
                    title={`Clique para ver duelistas da divisão ${displayName}`}
                  >
                    {imagePath && (
                      <img
                        src={imagePath}
                        alt={displayName}
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
                    <span className="text-white font-semibold text-[10px] sm:text-xs md:text-sm whitespace-nowrap" style={{ marginTop: '-6rem' }}>{displayName}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Ranking - Desktop Table / Mobile Cards */}
        {rankingType === 'duelista' ? (
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
                      <th className="px-4 lg:px-6 py-3 lg:py-4 text-center text-purple-300 font-bold text-sm lg:text-lg">Divisão</th>
                    )}
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-right text-purple-300 font-bold text-sm lg:text-lg">Score</th>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-center text-purple-300 font-bold text-sm lg:text-lg">V/D</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={activeTab === 'season' ? 4 : 5} className="px-6 py-12 text-center text-slate-400 text-xl">
                        Carregando ranking...
                      </td>
                    </tr>
                  ) : sortedPlayers.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'season' ? 4 : 5} className="px-6 py-12 text-center text-slate-400">
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
                              src={getImageUrl(player.profileImage)}
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
                                    : player.nickname
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
                          <td className="px-4 lg:px-6 py-3 lg:py-5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {(() => {
                                const divisionImage = getDivisionImage(player.division);
                                const divisionLabel = getDivisionDisplayName(player.division || 'Bronze');
                                return divisionImage ? (
                                  <img 
                                    src={divisionImage}
                                    alt={divisionLabel}
                                    className="w-6 h-6 lg:w-8 lg:h-8 object-contain"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : null;
                              })()}
                              <span className={`font-bold text-sm lg:text-lg ${getDivisionColor(player.division)}`}>
                                {getDivisionDisplayName(player.division || 'Bronze')}
                              </span>
                            </div>
                          </td>
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
                          src={getImageUrl(player.profileImage)}
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
                                : player.nickname
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
                    <div className="grid gap-2 text-xs grid-cols-2">
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
                        <div>
                          <span className="text-slate-400">Divisão: </span>
                          <span className={`font-bold ${getDivisionColor(player.division)} flex items-center gap-1`}>
                            {(() => {
                              const divisionImage = getDivisionImage(player.division);
                              const divisionLabel = getDivisionDisplayName(player.division || 'Bronze');
                              return divisionImage ? (
                                <img 
                                  src={divisionImage}
                                  alt={divisionLabel}
                                  className="w-5 h-5 object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : null;
                            })()}
                            {getDivisionDisplayName(player.division || 'Bronze')}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
        ) : (
          /* Ranking de Clãs */
          <div className="rounded-2xl border border-white/20 overflow-hidden mx-auto max-w-6xl">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left text-purple-300 font-bold text-sm lg:text-lg">#</th>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left text-purple-300 font-bold text-sm lg:text-lg">Clã</th>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-left text-purple-300 font-bold text-sm lg:text-lg">Líder</th>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-center text-purple-300 font-bold text-sm lg:text-lg">Membros</th>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-right text-purple-300 font-bold text-sm lg:text-lg">Score</th>
                    <th className="px-4 lg:px-6 py-3 lg:py-4 text-center text-purple-300 font-bold text-sm lg:text-lg">V/D</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-xl">
                        Carregando ranking...
                      </td>
                    </tr>
                  ) : groups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        Nenhum clã encontrado
                      </td>
                    </tr>
                  ) : (
                    groups.map((group) => {
                      const score = activeTab === 'season' ? group.seasonScore : group.totalScore;
                      return (
                        <motion.tr
                          key={group.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: group.rank * 0.05 }}
                          className="border-t border-white/20 hover:bg-white/10 transition-all duration-300"
                        >
                          <td className="px-4 lg:px-6 py-3 lg:py-5">
                            <span className={`text-xl lg:text-3xl font-bold ${getRankColor(group.rank)}`}>
                              {group.rank === 1 && '🥇'}
                              {group.rank === 2 && '🥈'}
                              {group.rank === 3 && '🥉'}
                              {group.rank > 3 && `${group.rank}°`}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-5">
                            <Link
                              to={`/groups/${group.id}`}
                              className="flex items-center gap-2 lg:gap-4 hover:opacity-80 transition-opacity"
                            >
                              {group.logo ? (
                                <img
                                  src={getImageUrl(group.logo)}
                                  alt={group.name}
                                  className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl object-cover border-2 border-cyan-500"
                                  onError={(e) => {
                                    e.currentTarget.src = '/images/default.png';
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 lg:w-14 lg:h-14 rounded-xl bg-cyan-900/50 border-2 border-cyan-500 flex items-center justify-center">
                                  <span className="text-cyan-400 font-bold text-xs lg:text-lg">[{group.tag}]</span>
                                </div>
                              )}
                              <div>
                                <p className="text-white font-bold text-sm lg:text-lg">
                                  [{group.tag}] {group.name}
                                </p>
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-5">
                            {group.leader ? (
                              <div className="flex items-center gap-2">
                                {group.leader.profileImage ? (
                                  <img
                                    src={getImageUrl(group.leader.profileImage)}
                                    alt={group.leader.nickname}
                                    className="w-8 h-8 lg:w-10 lg:h-10 rounded-full object-cover border border-purple-500"
                                    onError={(e) => {
                                      e.currentTarget.src = '/images/default.png';
                                    }}
                                  />
                                ) : null}
                                <span className="text-slate-300 text-sm lg:text-base">{group.leader.nickname}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-sm">Sem líder</span>
                            )}
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-5 text-center">
                            <span className="text-cyan-400 font-bold text-sm lg:text-lg">{group.memberCount || 0}</span>
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-5 text-right">
                            <span className="text-lg lg:text-2xl font-bold text-yellow-400">
                              {typeof score === 'number' ? score.toLocaleString() : Number(score || 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-5 text-center">
                            <div className="flex items-center justify-center gap-1 lg:gap-2">
                              <span className="text-green-400 font-bold text-sm lg:text-base">{group.totalWins || 0}</span>
                              <span className="text-slate-400">/</span>
                              <span className="text-red-400 font-bold text-sm lg:text-base">{group.totalLosses || 0}</span>
                            </div>
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
              ) : groups.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  Nenhum clã encontrado
                </div>
              ) : (
                groups.map((group) => {
                  const score = activeTab === 'season' ? group.seasonScore : group.totalScore;
                  return (
                    <motion.div
                      key={group.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: group.rank * 0.05 }}
                      className="rounded-xl p-3 border border-white/20 shadow-lg hover:scale-[1.02] transition-all duration-200"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-2xl font-bold ${getRankColor(group.rank)}`}>
                          {group.rank === 1 && '🥇'}
                          {group.rank === 2 && '🥈'}
                          {group.rank === 3 && '🥉'}
                          {group.rank > 3 && `${group.rank}°`}
                        </span>
                        <Link
                          to={`/groups/${group.id}`}
                          className="flex items-center gap-2 flex-1 min-w-0"
                        >
                          {group.logo ? (
                            <img
                              src={getImageUrl(group.logo)}
                              alt={group.name}
                              className="w-12 h-12 rounded-xl object-cover border-2 border-cyan-500 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = '/images/default.png';
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-cyan-900/50 border-2 border-cyan-500 flex items-center justify-center flex-shrink-0">
                              <span className="text-cyan-400 font-bold text-xs">[{group.tag}]</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm truncate">
                              [{group.tag}] {group.name}
                            </p>
                            {group.leader && (
                              <p className="text-slate-400 text-xs">Líder: {group.leader.nickname}</p>
                            )}
                          </div>
                        </Link>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400">Score: </span>
                          <span className="text-yellow-400 font-bold">
                            {typeof score === 'number' ? score.toLocaleString() : Number(score || 0).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Membros: </span>
                          <span className="text-cyan-400 font-bold">{group.memberCount || 0}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">V/D: </span>
                          <span className="text-green-400 font-bold">{group.totalWins || 0}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-red-400 font-bold">{group.totalLosses || 0}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
