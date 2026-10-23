import GameIcon from '../components/GameIcon';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import TournamentBracket from '../components/TournamentBracket';
import './TournamentPage.css';
import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { formatScore } from '../utils/formatScore';
import { useI18n } from '../i18n/I18nContext';

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
  finishedAt?: string;
  prizeFirst: number;
  prizeSecond: number;
  prizeThird: number;
  entryFee: number;
  entryFeeType?: 'credit' | 'cash';
  banlist?: string[];
  createdAt: string;
  updatedAt: string;
  winnerId?: number;
  winner?: {
    id: number;
    nickname: string;
    profileImage?: string;
  };
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
  isThirdPlaceMatch?: boolean;
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
  const { t } = useI18n();
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
  const [bracketRound, setBracketRound] = useState(1);
  const [bracketFullView, setBracketFullView] = useState(false);
  const [bracketError, setBracketError] = useState(false);
  const bracketCloseRef = useRef<HTMLButtonElement>(null);
  const [registeringTournamentId, setRegisteringTournamentId] = useState<string | null>(null);

  const [ranking, setRanking] = useState<{ rank: number; userId: number; nickname: string; profileImage: string | null; clanTag: string | null; tournamentPoints: number; className: string; classOrder: number }[]>([]);
  const [rankingClasses, setRankingClasses] = useState<{ id: string; name: string; minPoints: number; maxPlayers: number | null; order: number }[]>([]);
  const [loadingRanking, setLoadingRanking] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'open' | 'progress' | 'finished'>('open');

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

  const loadTop3 = async (tournamentId: string) => {
    setLoadingTop3(true);
    try {
      const response = await api.get(`/tournaments/${tournamentId}/top3`);
      setTop3(response.data);
    } catch (error) {
      console.error('Erro ao carregar pódio:', error);
      setTop3([]);
    } finally {
      setLoadingTop3(false);
    }
  };

  const loadBracket = async (tournamentId: string) => {
    setLoadingBracket(true);
    setBracketError(false);
    try {
      const response = await api.get(`/tournaments/${tournamentId}/bracket`);
      setBracket(response.data);
    } catch (error) {
      console.error('Erro ao carregar chave:', error);
      setBracket(null);
      setBracketError(true);
    } finally {
      setLoadingBracket(false);
    }
  };

  const refreshTournamentDetail = async (id: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingDetail(true);
    try {
      const res = await api.get<Tournament>(`/tournaments/${id}`);
      const t = res.data;
      setSelectedTournament(t);
      if (t.status === 'finished') {
        await loadTop3(t.id);
      } else {
        setTop3([]);
      }
      if (
        t.status === 'registration_closed' ||
        t.status === 'in_progress' ||
        t.status === 'finished'
      ) {
        await loadBracket(t.id);
      }
      return t;
    } catch {
      if (!opts?.silent) setSelectedTournament(null);
      return null;
    } finally {
      if (!opts?.silent) setLoadingDetail(false);
    }
  };

  const openBracket = (id: string) => {
    setBracketRound(1);
    setBracketFullView(false);
    setShowBracket(true);
    void loadBracket(id);
  };
  useEffect(() => {
    if (!showBracket) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    bracketCloseRef.current?.focus();
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowBracket(false); };
    document.addEventListener('keydown', onEscape);
    return () => { document.removeEventListener('keydown', onEscape); document.body.style.overflow = overflow; previous?.focus(); };
  }, [showBracket]);

  // Ao estar em /tournaments/:id, carregar o torneio e dados (top3, bracket)
  useEffect(() => {
    if (!tournamentIdParam) {
      setSelectedTournament(null);
      setBracket(null);
      setTop3([]);
      return;
    }
    refreshTournamentDetail(tournamentIdParam);
  }, [tournamentIdParam]);

  // Enquanto o torneio está em andamento, atualiza status/chave/pódio periodicamente
  useEffect(() => {
    if (!tournamentIdParam || selectedTournament?.status !== 'in_progress') return;
    const interval = setInterval(() => {
      refreshTournamentDetail(tournamentIdParam, { silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [tournamentIdParam, selectedTournament?.status]);

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

  const handleRegister = async (tournamentId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    const tournament = tournaments.find((t) => t.id === tournamentId) ?? selectedTournament;
    if (tournament && tournament.currentParticipants >= tournament.maxParticipants) {
      alert(t('tournament.full'));
      return;
    }
    setRegisteringTournamentId(tournamentId);
    try {
      await api.post(`/tournaments/${tournamentId}/register`);
      alert(t('tournament.registeredOk'));
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
      case 'scheduled': return t('tournament.scheduled');
      case 'registration_open': return t('tournament.registrationOpen');
      case 'registration_closed': return t('tournament.registrationClosed');
      case 'in_progress': return t('tournament.inProgress');
      case 'finished': return t('tournament.finished');
      case 'cancelled': return t('tournament.cancelled');
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

  const tabFilters: {
    id: typeof activeTab;
    label: string;
    icon: string;
    list: Tournament[];
    emptyMsg: string;
  }[] = [
    {
      id: 'upcoming',
      label: t('tournament.nextTournaments'),
      icon: '📅',
      list: proximos,
      emptyMsg: t('tournament.noneAvailable'),
    },
    {
      id: 'open',
      label: t('tournament.registrationOpen'),
      icon: '✅',
      list: inscricoesAbertas,
      emptyMsg: t('tournament.noOpenRegistration'),
    },
    {
      id: 'progress',
      label: t('tournament.inProgress'),
      icon: '⚔️',
      list: emAndamento,
      emptyMsg: t('tournament.noneAvailable'),
    },
    {
      id: 'finished',
      label: t('tournament.finished'),
      icon: '🏆',
      list: finalizados,
      emptyMsg: t('tournament.noneAvailable'),
    },
  ];

  const activeFilter = tabFilters.find((tab) => tab.id === activeTab) ?? tabFilters[1];

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
                {t('tournament.full')}
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

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">{t('tournament.loading')}</div>
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

  const getFaseAtual = (tournament: Tournament) => {
    if (tournament.status === 'finished') return t('tournament.finished');
    if (tournament.status === 'in_progress') return t('tournament.inProgress');
    if (tournament.status === 'registration_closed') return t('tournament.registrationClosed');
    if (tournament.status === 'registration_open') return t('tournament.registrationOpen');
    return t('tournament.scheduled');
  };

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-7 max-w-7xl mx-auto">
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

        <header className="game-screen-hero mb-6">
          <p className="game-screen-kicker">Arena competitiva</p>
          <h1 className="game-screen-heading"><span className="game-screen-icon"><GameIcon route="/tournaments" size={27} /></span>{t('tournament.title')}</h1>
          <p className="game-screen-subtitle">{t('tournament.subtitle')}</p>
        </header>

        {loadingDetail && (
          <div className="text-white py-12 text-center">Carregando torneio...</div>
        )}

        {tournamentIdParam && !loadingDetail && !selectedTournament && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-4">{t('tournament.notFound')}</p>
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
                {selectedTournament.status === 'finished' && (selectedTournament.winner || top3.find((p) => p.position === 1)) && (
                  <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 w-fit">
                    <img
                      src={getProfileImageUrl(
                        selectedTournament.winner?.profileImage ??
                          top3.find((p) => p.position === 1)?.user.profileImage,
                      )}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-emerald-400/60"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                      }}
                    />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-semibold">Campeão</p>
                      <p className="text-emerald-300 font-bold">
                        {selectedTournament.winner?.nickname ??
                          top3.find((p) => p.position === 1)?.user.nickname}
                      </p>
                    </div>
                  </div>
                )}
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
                            {row.isRound &&
                              (selectedTournament.status === 'registration_closed' ||
                                selectedTournament.status === 'in_progress' ||
                                selectedTournament.status === 'finished') && (
                              <button
                                type="button"
                                onClick={() => {
                                  openBracket(selectedTournament.id);
                                }}
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

            {/* Chave: disponível quando as vagas enchem (registration_closed) ou torneio em andamento/finalizado */}
            {(selectedTournament.status === 'registration_closed' ||
              selectedTournament.status === 'in_progress' ||
              selectedTournament.status === 'finished') && (
              <div id="chave-torneio" className="border-t border-amber-500/20 pt-6 mb-6 scroll-mt-4">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                      <span>🏆</span> Chave do Torneio
                    </h3>
                    {selectedTournament.status === 'registration_closed' && (
                      <p className="text-gray-400 text-sm mt-1">
                        Vagas preenchidas — a chave já está disponível. Início em{' '}
                        <span className="text-amber-300 font-medium">
                          {new Date(selectedTournament.startAt).toLocaleString('pt-BR', {
                            dateStyle: 'long',
                            timeStyle: 'short',
                          })}
                        </span>
                        .
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      openBracket(selectedTournament.id);
                    }}
                    className="px-4 py-2 bg-amber-500/30 border border-amber-500/50 hover:bg-amber-500/50 text-amber-200 rounded-lg transition-all flex items-center gap-2 text-sm font-semibold"
                  >
                    🔍 Ver Chave
                  </button>
                </div>
              </div>
            )}

            {/* Modal da chave — todos os confrontos */}
            {showBracket && selectedTournament && (
              <div
                className="tourney-modal-scrim fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5"
                onClick={() => setShowBracket(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Chave do torneio"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="tourney-modal-panel relative w-full max-w-6xl max-h-[94dvh] overflow-hidden rounded-xl border border-amber-500/40 shadow-2xl flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="tourney-modal-header sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-amber-500/25 px-4 py-3 backdrop-blur">
                    <div>
                      <h3 className="text-lg font-bold text-amber-300">{selectedTournament.name}</h3>
                      <p className="text-xs text-gray-400">
                        {selectedTournament.currentParticipants}/{selectedTournament.maxParticipants} participantes
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBracket(false)}
                      ref={bracketCloseRef}
                      className="tourney-control rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-white/90"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="tourney-modal-body overflow-y-auto flex-1 min-h-0 p-3 sm:p-5">
                    {loadingBracket ? (
                      <div role="status" className="text-white text-center py-12">Carregando confrontos...</div>
                     ) : bracketError ? (
                      <div role="alert" className="text-center py-12">
                        <p className="mb-3 text-white">Não foi possível carregar a chave.</p>
                        <button className="tourney-control" type="button" onClick={() => loadBracket(selectedTournament.id)}>Tentar novamente</button>
                      </div>
                    ) : bracket && bracket.totalRounds > 0 ? (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex gap-2">
                            <button type="button" aria-pressed={!bracketFullView} className={`tourney-control ${!bracketFullView ? 'tourney-control-active' : ''}`} onClick={() => setBracketFullView(false)}>Por rodada</button>
                            <button type="button" aria-pressed={bracketFullView} className={`tourney-control ${bracketFullView ? 'tourney-control-active' : ''}`} onClick={() => setBracketFullView(true)}>Chave completa</button>
                          </div>
                          <button type="button" className="tourney-control" disabled={loadingBracket} onClick={() => loadBracket(selectedTournament.id)}>{loadingBracket ? 'Atualizando...' : '↻ Atualizar'}</button>
                        </div>
                        {!bracketFullView && (
                          <nav className="tourney-round-tabs flex gap-2 overflow-x-auto pb-2" aria-label="Rodadas">
                            {Array.from({ length: bracket.totalRounds }, (_, index) => index + 1).map((round) => (
                              <button key={round} type="button" aria-pressed={bracketRound === round}
                                className={`tourney-control shrink-0 ${bracketRound === round ? 'tourney-control-active' : ''}`}
                                onClick={() => setBracketRound(round)}>
                                {round === bracket.totalRounds ? 'Final' : round === bracket.totalRounds - 1 ? 'Semifinal' : round === bracket.totalRounds - 2 ? 'Quartas' : `Rodada ${round}`}
                              </button>
                            ))}
                          </nav>
                        )}
                        {!bracketFullView && (
                          <div>
                        {[bracketRound].map((round) => {
                          const matches = bracket.rounds[round] || [];
                          const roundName =
                            round === bracket.totalRounds
                              ? 'Final'
                              : round === bracket.totalRounds - 1
                                ? 'Semifinal'
                                : round === bracket.totalRounds - 2
                                  ? 'Quartas'
                                  : `Rodada ${round}`;
                          return (
                            <div key={round}>
                              <h4 className="text-sm font-bold uppercase tracking-wider text-champion-gold mb-3">
                                {roundName}
                              </h4>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {matches.map((match) => {
                                  const isThird = (match as Match & { isThirdPlaceMatch?: boolean }).isThirdPlaceMatch;
                                  return (
                                    <div
                                      key={match.id}
                                      className="tourney-match-card rounded-lg border border-amber-400/25 px-3 py-3"
                                    >
                                      {isThird && (
                                        <p className="text-[10px] font-semibold uppercase text-amber-400 mb-1.5">
                                          Disputa de 3º lugar
                                        </p>
                                      )}
                                      <div className="flex items-center justify-between gap-2 text-sm">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <img
                                            src={getProfileImageUrl(match.player1?.profileImage)}
                                            alt=""
                                            className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20 shrink-0"
                                            onError={(e) => {
                                              e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                                            }}
                                          />
                                          <span
                                            className={`truncate font-medium ${
                                              match.winnerId === match.player1Id
                                                ? 'text-emerald-400'
                                                : 'text-white'
                                            }`}
                                          >
                                            {match.player1?.nickname || 'Aguardando...'}
                                          </span>
                                        </div>
                                        <span className="text-white/40 text-xs shrink-0">vs</span>
                                        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                          <span
                                            className={`truncate font-medium text-right ${
                                              match.winnerId === match.player2Id
                                                ? 'text-emerald-400'
                                                : 'text-white'
                                            }`}
                                          >
                                            {match.player2?.nickname || 'Aguardando...'}
                                          </span>
                                          <img
                                            src={getProfileImageUrl(match.player2?.profileImage)}
                                            alt=""
                                            className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20 shrink-0"
                                            onError={(e) => {
                                              e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                                            }}
                                          />
                                        </div>
                                      </div>
                                      <p className="mt-2 text-[10px] uppercase tracking-wide text-white/45">
                                        {match.status === 'finished'
                                          ? 'Finalizado'
                                          : match.status === 'in_progress'
                                            ? 'Em andamento'
                                            : match.status === 'ready'
                                              ? 'Pronto'
                                              : match.status === 'walkover'
                                                ? 'W.O. / Bye'
                                                : 'Agendado'}
                                        {match.scheduledAt
                                          ? ` · ${new Date(match.scheduledAt).toLocaleString('pt-BR', {
                                              dateStyle: 'short',
                                              timeStyle: 'short',
                                            })}`
                                          : ''}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                          </div>
                        )}
                        {bracketFullView && (
                          <div className="tourney-bracket-full overflow-auto" tabIndex={0} aria-label="Visão completa da chave">
                            <TournamentBracket bracket={bracket} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-center py-12">Chave ainda não foi gerada.</p>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Premiação — estilo dourado / dark */}
              <div className="border-t border-amber-500/20 pt-6">
                <h3 className="text-2xl font-bold text-amber-400 mb-1">Premiação</h3>
                {selectedTournament.status === 'finished' ? (
                  <p className="text-emerald-400 text-sm mb-4 font-medium">
                    Torneio finalizado — premiações entregues. Confira o pódio abaixo.
                  </p>
                ) : (
                  <p className="text-gray-500 text-sm mb-4">Quem vence a final é o campeão. Prêmios em créditos.</p>
                )}
                {loadingTop3 && selectedTournament.status === 'finished' ? (
                  <div className="text-gray-400 py-6">Carregando pódio...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { place: 1, prize: top3.find((p) => p.position === 1)?.prize ?? selectedTournament.prizeFirst, player: top3.find((p) => p.position === 1) },
                      { place: 2, prize: top3.find((p) => p.position === 2)?.prize ?? selectedTournament.prizeSecond, player: top3.find((p) => p.position === 2) },
                      { place: 3, prize: top3.find((p) => p.position === 3)?.prize ?? selectedTournament.prizeThird, player: top3.find((p) => p.position === 3) },
                      { place: 4, prize: top3.find((p) => p.position === 4)?.prize ?? 0, player: top3.find((p) => p.position === 4) ?? null },
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
                              {place === 1 && <p className="text-amber-400 text-xs font-bold mt-0.5">{t('tournament.champion')}</p>}
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
                    {t('tournament.full')}
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

        {!tournamentIdParam && (
          <section className="mb-10">
            <div className="flex flex-wrap gap-2 mb-5">
              {tabFilters.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      isActive
                        ? 'bg-champion-gold/20 border-champion-gold/60 text-champion-gold shadow-[0_0_12px_rgba(232,197,71,0.2)]'
                        : 'bg-black/25 border-white/15 text-white/75 hover:border-champion-gold/35 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span aria-hidden>{tab.icon}</span>
                    <span>{tab.label}</span>
                    <span
                      className={`ml-0.5 min-w-[1.25rem] rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                        isActive ? 'bg-champion-gold/25 text-champion-gold' : 'bg-white/10 text-white/60'
                      }`}
                    >
                      {tab.list.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeFilter.list.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeFilter.list.map(renderTournamentCard)}
              </div>
            ) : (
              <p className="text-gray-500 text-sm py-6 text-center rounded-xl border border-white/10 bg-black/20">
                {activeFilter.emptyMsg}
              </p>
            )}
          </section>
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
                          <td className="p-3 text-amber-300 font-semibold">{formatScore(row.tournamentPoints)}</td>
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
            <p className="text-xl">{t('tournament.noneAvailable')}</p>
          </div>
        )}
    </div>
  );
}
