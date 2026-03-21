import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import TournamentBracket from '../components/TournamentBracket';
import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';

interface Tournament {
  id: string;
  name: string;
  description?: string;
  format: string;
  maxParticipants: number;
  currentParticipants: number;
  minLevel?: number;
  maxLevel?: number | null;
  status: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
  entryFee: number;
  entryFeeType?: 'credit' | 'cash';
  banlist?: string[];
  createdAt: string;
  updatedAt: string;
  creator?: {
    id: number;
    nickname: string;
  };
  participants?: { userId: number; user?: { id: number } }[];
}

interface Top3Player {
  position: number;
  user: {
    id: number;
    nickname: string;
    profileImage: string;
  };
  prize: number;
}

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

export default function TournamentPage() {
  const { id: tournamentIdParam } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [top3, setTop3] = useState<Top3Player[]>([]);
  const [loadingTop3, setLoadingTop3] = useState(false);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [showBracket, setShowBracket] = useState(false);
  const [registeringTournamentId, setRegisteringTournamentId] = useState<string | null>(null);

  const [ranking, setRanking] = useState<{ rank: number; userId: number; nickname: string; profileImage: string | null; clanTag: string | null; tournamentPoints: number; className: string; classOrder: number }[]>([]);
  const [rankingClasses, setRankingClasses] = useState<{ id: string; name: string; minPoints: number; maxPlayers: number | null; order: number }[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);

  useEffect(() => {
    loadTournaments();
  }, []);

  useEffect(() => {
    if (!tournamentIdParam) {
      setLoadingRanking(true);
      api
        .get('/tournaments/ranking/list')
        .then((r) => {
          setRanking(r.data.ranking ?? []);
          setRankingClasses(r.data.classes ?? []);
        })
        .catch(() => {
          setRanking([]);
          setRankingClasses([]);
        })
        .finally(() => setLoadingRanking(false));
    }
  }, [tournamentIdParam]);

  // Ao estar em /tournaments/:id, carregar o torneio e dados (top3, bracket)
  useEffect(() => {
    if (!tournamentIdParam) {
      setSelectedTournament(null);
      setBracket(null);
      setTop3([]);
      return;
    }
    setLoadingDetail(true);
    api
      .get<Tournament>(`/tournaments/${tournamentIdParam}`)
      .then((res) => {
        setSelectedTournament(res.data);
        const t = res.data;
        if (t.status === 'finished') loadTop3(t.id);
        if (t.status === 'in_progress' || t.status === 'finished') loadBracket(t.id);
      })
      .catch(() => {
        setSelectedTournament(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [tournamentIdParam]);

  const loadTournaments = async () => {
    try {
      const response = await api.get('/tournaments');
      setTournaments(response.data);
    } catch (error) {
      console.error('Erro ao carregar torneios:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTop3 = async (tournamentId: string) => {
    if (selectedTournament?.status !== 'finished') return;
    
    setLoadingTop3(true);
    try {
      const response = await api.get(`/tournaments/${tournamentId}/top3`);
      setTop3(response.data);
    } catch (error) {
      console.error('Erro ao carregar top 3:', error);
      setTop3([]);
    } finally {
      setLoadingTop3(false);
    }
  };

  const handleRegister = async (tournamentId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    const tournament = tournaments.find((t) => t.id === tournamentId) ?? selectedTournament;
    if (tournament && tournament.currentParticipants >= tournament.maxParticipants) {
      alert('Torneio cheio. Não há mais vagas.');
      return;
    }
    setRegisteringTournamentId(tournamentId);
    try {
      await api.post(`/tournaments/${tournamentId}/register`);
      alert('Inscrição realizada com sucesso!');
      const { data: freshList } = await api.get<Tournament[]>('/tournaments');
      setTournaments(freshList);
      const updated = freshList.find((t) => t.id === tournamentId);
      if (updated && (selectedTournament?.id === tournamentId || tournamentIdParam === tournamentId)) {
        setSelectedTournament(updated);
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao se inscrever no torneio');
    } finally {
      setRegisteringTournamentId(null);
    }
  };

  const loadBracket = async (tournamentId: string) => {
    setLoadingBracket(true);
    try {
      const response = await api.get(`/tournaments/${tournamentId}/bracket`);
      setBracket(response.data);
    } catch (error) {
      console.error('Erro ao carregar bracket:', error);
      setBracket(null);
    } finally {
      setLoadingBracket(false);
    }
  };

  const handleViewDetails = (tournament: Tournament) => {
    navigate(`/tournaments/${tournament.id}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-gray-500';
      case 'registration_open': return 'bg-green-500';
      case 'registration_closed': return 'bg-yellow-500';
      case 'in_progress': return 'bg-amber-500';
      case 'finished': return 'bg-purple-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Agendado';
      case 'registration_open': return 'Inscrições Abertas';
      case 'registration_closed': return 'Inscrições Fechadas';
      case 'in_progress': return 'Em Andamento';
      case 'finished': return 'Finalizado';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const getFormatLabel = (format: string) => {
    switch (format) {
      case 'single_elimination': return 'Mata-Mata';
      case 'double_elimination': return 'Dupla Eliminação';
      case 'swiss': return 'Sistema Suíço';
      case 'round_robin': return 'Todos contra Todos';
      default: return format;
    }
  };

  const isUserRegistered = (tournament: Tournament) => {
    if (!user?.id) return false;
    const id = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
    return tournament.participants?.some((p) => p.userId === id || p.user?.id === id) ?? false;
  };

  const proximos = tournaments.filter((t) => t.status === 'scheduled');
  const inscricoesAbertas = tournaments.filter((t) => t.status === 'registration_open');
  const emAndamento = tournaments.filter((t) => t.status === 'registration_closed' || t.status === 'in_progress');
  const finalizados = tournaments.filter((t) => t.status === 'finished');

  const renderTournamentCard = (tournament: Tournament) => {
    const registered = isUserRegistered(tournament);
    const isFull = tournament.currentParticipants >= tournament.maxParticipants;
    return (
      <motion.div
        key={tournament.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-purple-500/50 transition-all cursor-pointer"
        onClick={() => handleViewDetails(tournament)}
      >
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-lg font-bold text-white line-clamp-2 pr-2">{tournament.name}</h3>
          <div className="flex flex-shrink-0 items-center gap-1.5 flex-wrap justify-end">
            {registered && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-600/90 text-white">
                Inscrito
              </span>
            )}
            {isFull && tournament.status === 'registration_open' && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-600/90 text-white">
                Cheio
              </span>
            )}
            <span className={`px-2 py-0.5 rounded text-xs text-white ${getStatusColor(tournament.status)}`}>
              {getStatusLabel(tournament.status)}
            </span>
          </div>
        </div>
        <div className="space-y-1.5 text-gray-400 text-sm mb-4">
          <p>📅 Início: {new Date(tournament.startAt).toLocaleString('pt-BR')}</p>
          <p>👥 {tournament.currentParticipants}/{tournament.maxParticipants} participantes</p>
          <p>🏆 1º: {tournament.prizeFirst} créditos</p>
          {tournament.entryFee > 0 && <p>💰 Taxa: {tournament.entryFee} {tournament.entryFeeType === 'cash' ? 'cash' : 'créditos'}</p>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleViewDetails(tournament);
          }}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-sm transition-colors"
        >
          Ver detalhes
        </button>
      </motion.div>
    );
  };

  const renderSection = (title: string, icon: string, list: Tournament[], emptyMsg: string) => (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        <span className="text-sm font-normal text-gray-400">({list.length})</span>
      </h2>
      {list.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(renderTournamentCard)}
        </div>
      ) : (
        <p className="text-gray-500 text-sm py-4">{emptyMsg}</p>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando torneios...</div>
      </div>
    );
  }

  const ROUND_INTERVAL_MS = 30 * 60 * 1000; // 30 min entre rodadas

  const getSchedulePhases = (t: Tournament) => {
    const totalRounds = Math.ceil(Math.log2(Math.max(2, t.maxParticipants)));
    const start = new Date(t.startAt);
    const phases: { fase: string; turno: string; horario: string; isRound?: boolean }[] = [
      { fase: 'Inscrições', turno: '—', horario: new Date(t.registrationOpenAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
      { fase: 'Fechamento inscrições / Sorteio', turno: '—', horario: new Date(t.registrationCloseAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    ];
    if (t.maxParticipants > 8) {
      const divulgaçãoAt = new Date(t.registrationCloseAt);
      phases.push({ fase: 'Divulgação dos Grupos', turno: '—', horario: divulgaçãoAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) });
    }
    for (let r = 1; r <= totalRounds; r++) {
      const roundTime = new Date(start.getTime() + (r - 1) * ROUND_INTERVAL_MS);
      const label = r === totalRounds ? 'Final' : r === totalRounds - 1 ? 'Semi-final' : r === totalRounds - 2 && totalRounds >= 4 ? 'Quartas de Final' : `Eliminatórias - Rodada ${r}`;
      phases.push({
        fase: label,
        turno: String(r),
        horario: roundTime.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        isRound: true,
      });
    }
    return phases;
  };

  const getFaseAtual = (t: Tournament) => {
    if (t.status === 'finished') return 'Finalizado';
    if (t.status === 'in_progress') return 'Eliminatórias';
    if (t.status === 'registration_closed') return 'Sorteio / Aguardando início';
    if (t.status === 'registration_open') return 'Inscrições abertas';
    return 'Agendado';
  };

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
        {tournamentIdParam && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => navigate('/tournaments')}
              className="text-amber-400 hover:text-amber-300 flex items-center gap-2 text-sm"
            >
              ← Voltar aos torneios
            </button>
          </div>
        )}

        <h1 className="text-4xl font-bold text-white mb-2">Torneios</h1>
        <p className="text-gray-400 mb-8">Inscreva-se, acompanhe as chaves e confira os resultados.</p>

        {loadingDetail && (
          <div className="text-white py-12 text-center">Carregando torneio...</div>
        )}

        {tournamentIdParam && !loadingDetail && !selectedTournament && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-4">Torneio não encontrado.</p>
            <button type="button" onClick={() => navigate('/tournaments')} className="text-amber-400 hover:text-amber-300 underline">
              Ver todos os torneios
            </button>
          </div>
        )}

        {selectedTournament && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden mb-8 border border-amber-500/30 bg-gray-900/60 backdrop-blur-sm shadow-2xl"
          >
            {/* Header com Nível Mínimo, Vagas e Fase atual */}
            <div className="flex flex-wrap justify-between items-center gap-4 p-4 sm:p-6 border-b border-amber-500/20 bg-gray-800/40 backdrop-blur-sm">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-4 mb-2">
                  <span className="flex items-center gap-1.5 text-amber-300/90 text-sm">
                    <span className="opacity-80">Nível:</span>
                    <span className="font-bold">
                      {selectedTournament.maxLevel != null
                        ? `${selectedTournament.minLevel ?? 1} – ${selectedTournament.maxLevel}`
                        : `${selectedTournament.minLevel ?? 1}+`}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-300/90 text-sm">
                    <span className="opacity-80">Vagas:</span>
                    <span className="font-bold">{selectedTournament.currentParticipants} / {selectedTournament.maxParticipants}</span>
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">{selectedTournament.name}</h2>
                <p className="text-gray-400 text-sm">{selectedTournament.description || 'Mata-mata: perdeu está fora, quem ganhou passa de fase.'}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold text-sm whitespace-nowrap">
                  Fase atual: {getFaseAtual(selectedTournament)}
                </span>
                <button
                  onClick={() => navigate('/tournaments')}
                  className="text-gray-400 hover:text-white text-2xl p-1"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {/* Cronograma */}
              <div className="mb-8">
                <h3 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2">
                  <span className="text-2xl">🏆</span> Cronograma
                </h3>
                <div className="overflow-x-auto rounded-lg border border-amber-500/20 bg-gray-800/40 backdrop-blur-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-amber-500/30">
                        <th className="p-3 text-amber-400/90 font-semibold">Fase</th>
                        <th className="p-3 text-amber-400/90 font-semibold">Turno</th>
                        <th className="p-3 text-amber-400/90 font-semibold">Horário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSchedulePhases(selectedTournament).map((row, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-3 text-white flex items-center gap-2">
                            <span className="text-amber-400">🏆</span>
                            {row.fase}
                          </td>
                          <td className="p-3 text-gray-400">{row.turno}</td>
                          <td className="p-3 text-gray-300 flex items-center justify-between gap-2">
                            {row.horario}
                            {row.isRound && (selectedTournament.status === 'in_progress' || selectedTournament.status === 'finished') && (
                              <button
                                type="button"
                                onClick={() => document.getElementById('chave-torneio')?.scrollIntoView({ behavior: 'smooth' })}
                                className="text-amber-400 hover:text-amber-300 p-1 rounded"
                                title="Ver chave do torneio"
                                aria-label="Ver chave"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Info rápida */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <div className="rounded-lg p-3 border border-amber-500/20 bg-gray-800/40 backdrop-blur-sm">
                  <p className="text-amber-400/80 text-xs">Formato</p>
                  <p className="text-white font-semibold">{getFormatLabel(selectedTournament.format)}</p>
                </div>
                <div className="rounded-lg p-3 border border-amber-500/20 bg-gray-800/40 backdrop-blur-sm">
                  <p className="text-amber-400/80 text-xs">Participantes</p>
                  <p className="text-white font-semibold">{selectedTournament.currentParticipants}/{selectedTournament.maxParticipants}</p>
                </div>
                <div className="rounded-lg p-3 border border-amber-500/20 bg-gray-800/40 backdrop-blur-sm">
                  <p className="text-amber-400/80 text-xs">Taxa</p>
                  <p className="text-white font-semibold">{selectedTournament.entryFee} {selectedTournament.entryFeeType === 'cash' ? 'cash' : 'créditos'}</p>
                </div>
                <div className="rounded-lg p-3 border border-amber-500/20 bg-gray-800/40 backdrop-blur-sm">
                  <p className="text-amber-400/80 text-xs">Status</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs text-white ${getStatusColor(selectedTournament.status)}`}>
                    {getStatusLabel(selectedTournament.status)}
                  </span>
                </div>
              </div>

            {/* Chave do torneio: só após início do torneio (in_progress ou finished) */}
            {(selectedTournament.status === 'in_progress' || selectedTournament.status === 'finished') && (
              <div id="chave-torneio" className="border-t border-amber-500/20 pt-6 mb-6 scroll-mt-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                    <span>🏆</span> Chave do Torneio
                  </h3>
                  <button
                    onClick={() => {
                      if (!showBracket && !bracket) {
                        loadBracket(selectedTournament.id);
                      }
                      setShowBracket(!showBracket);
                    }}
                    className="px-4 py-2 bg-amber-500/30 border border-amber-500/50 hover:bg-amber-500/50 text-amber-200 rounded-lg transition-all flex items-center gap-2 text-sm font-semibold"
                  >
                    {showBracket ? '👁️ Ocultar' : '🔍 Ver Chave'}
                  </button>
                </div>
                
                {showBracket && (
                  <>
                    {loadingBracket ? (
                      <div className="text-white text-center py-8">Carregando chave...</div>
                    ) : bracket && bracket.totalRounds > 0 ? (
                      <div className="relative">
                        <TournamentBracket bracket={bracket} />
                      </div>
                    ) : (
                      <p className="text-gray-400 text-center py-8">Chave ainda não foi gerada.</p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Inscrições fechadas, torneio ainda não começou: aviso de quando a chave sai */}
            {selectedTournament.status === 'registration_closed' && (
              <div className="border-t border-amber-500/20 pt-6 mb-6">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                  <p className="text-amber-200 font-semibold mb-1">Inscrições encerradas</p>
                  <p className="text-gray-400 text-sm">
                    A chave do torneio será divulgada no início do torneio, em{' '}
                    <span className="text-amber-300 font-medium">
                      {new Date(selectedTournament.startAt).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
                    </span>.
                  </p>
                </div>
              </div>
            )}

            {/* Premiação — estilo dourado / dark */}
              <div className="border-t border-amber-500/20 pt-6">
                <h3 className="text-2xl font-bold text-amber-400 mb-1">Premiação</h3>
                <p className="text-gray-500 text-sm mb-4">Quem vence a final é o campeão. Prêmios em créditos.</p>
                {loadingTop3 && selectedTournament.status === 'finished' ? (
                  <div className="text-gray-400 py-6">Carregando pódio...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { place: 1, prize: selectedTournament.prizeFirst, player: top3.find((p) => p.position === 1) },
                      { place: 2, prize: selectedTournament.prizeSecond, player: top3.find((p) => p.position === 2) },
                      { place: 3, prize: selectedTournament.prizeThird, player: top3.find((p) => p.position === 3) },
                      { place: 4, prize: 0, player: null },
                    ].map(({ place, prize, player }) => (
                      <motion.div
                        key={place}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-xl border border-amber-500/30 bg-gray-800/50 backdrop-blur-sm overflow-hidden"
                      >
                        <div className="bg-amber-500/25 border-b border-amber-500/40 py-2 text-center">
                          <span className="font-bold text-amber-300">{place}° Lugar</span>
                        </div>
                        <div className="p-4 text-center">
                          {player ? (
                            <>
                              <div className="w-16 h-16 mx-auto mb-2 rounded-full overflow-hidden border-2 border-amber-500/50">
                                <img
                                  src={getProfileImageUrl(player.user.profileImage)}
                                  alt={player.user.nickname}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH; }}
                                />
                              </div>
                              <p className="text-white font-semibold truncate">{player.user.nickname}</p>
                              {place === 1 && <p className="text-amber-400 text-xs font-bold mt-0.5">CAMPEÃO</p>}
                            </>
                          ) : (
                            <p className="text-gray-500 text-sm py-4">—</p>
                          )}
                          <p className="text-emerald-400 text-sm font-medium mt-2">💰 {prize.toLocaleString('pt-BR')} créditos</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

            {selectedTournament.status === 'registration_open' && (
              <>
                {isUserRegistered(selectedTournament) ? (
                  <div className="w-full px-6 py-3 rounded-lg border-2 border-green-500/60 bg-green-500/20 text-green-300 font-bold text-center">
                    ✓ Você já está inscrito neste torneio
                  </div>
                ) : selectedTournament.currentParticipants >= selectedTournament.maxParticipants ? (
                  <div className="w-full px-6 py-3 rounded-lg border-2 border-amber-500/60 bg-amber-500/20 text-amber-200 font-bold text-center">
                    Torneio cheio. Não há mais vagas.
                  </div>
                ) : (
                  <button
                    onClick={() => handleRegister(selectedTournament.id)}
                    disabled={registeringTournamentId === selectedTournament.id}
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-800 text-white font-bold rounded-lg hover:from-green-700 hover:to-green-900 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {registeringTournamentId === selectedTournament.id ? 'Inscrevendo...' : 'Inscrever-se'}
                  </button>
                )}
              </>
            )}
            </div>
          </motion.div>
        )}

        {!tournamentIdParam && renderSection(
          'Próximos torneios',
          '📅',
          proximos,
          'Nenhum torneio agendado no momento.'
        )}
        {!tournamentIdParam && renderSection(
          'Inscrições Abertas',
          '✅',
          inscricoesAbertas,
          'Nenhum torneio com inscrições abertas.'
        )}
        {!tournamentIdParam && renderSection(
          'Em Andamento',
          '⚔️',
          emAndamento,
          'Nenhum torneio em andamento.'
        )}
        {!tournamentIdParam && renderSection(
          'Finalizados',
          '🏆',
          finalizados,
          'Nenhum torneio finalizado.'
        )}

        {/* Ranking de Torneios - Classes Obelisco, Rá, Slifer */}
        {!tournamentIdParam && (
          <section className="mt-10 border-t border-amber-500/20 pt-8">
            <h2 className="text-2xl font-bold text-amber-400 mb-2 flex items-center gap-2">
              <span>🏅</span> Ranking de Torneios
            </h2>
            <p className="text-gray-400 text-sm mb-4">Pontos obtidos em torneios definem sua classe. Obelisco e Rá têm vagas limitadas.</p>
            {rankingClasses.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                {rankingClasses.map((c) => (
                  <div key={c.id} className="rounded-lg border border-amber-500/30 bg-gray-800/40 px-4 py-2">
                    <span className="font-semibold text-amber-300">{c.name}</span>
                    <span className="text-gray-400 text-sm ml-2">mín. {c.minPoints} pts</span>
                    {c.maxPlayers != null && <span className="text-gray-400 text-sm ml-2">· máx. {c.maxPlayers} jogadores</span>}
                  </div>
                ))}
              </div>
            )}
            {loadingRanking ? (
              <div className="text-gray-400 py-8 text-center">Carregando ranking...</div>
            ) : ranking.length === 0 ? (
              <div className="text-gray-500 py-6 text-center">Nenhum duelista com pontos de torneio ainda.</div>
            ) : (
              <div className="rounded-xl border border-amber-500/20 bg-gray-800/40 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-amber-500/30">
                        <th className="p-3 text-amber-400/90 font-semibold">#</th>
                        <th className="p-3 text-amber-400/90 font-semibold">Duelista</th>
                        <th className="p-3 text-amber-400/90 font-semibold">Classe</th>
                        <th className="p-3 text-amber-400/90 font-semibold">Pontos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((row) => (
                        <tr key={row.userId} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-3 text-white font-mono">{row.rank}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <img src={getProfileImageUrl(row.profileImage)} alt="" className="w-8 h-8 rounded-full object-cover border border-amber-500/30" onError={(e) => { e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                              <span className="text-white font-medium">{row.clanTag ? `|${row.clanTag}| ` : ''}{row.nickname}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-sm font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">{row.className}</span>
                          </td>
                          <td className="p-3 text-amber-300 font-semibold">{row.tournamentPoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {!tournamentIdParam && tournaments.length === 0 && !loading && (
          <div className="text-center text-gray-400 py-12">
            <p className="text-xl">Nenhum torneio disponível no momento</p>
          </div>
        )}
    </div>
  );
}
