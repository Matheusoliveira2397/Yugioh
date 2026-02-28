import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import axios from 'axios';
import LatestCardsMarquee, { type MarqueeCard } from '../components/LatestCardsMarquee';
import { getImageUrl } from '../utils/imageUrl';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface TopPlayer {
  id: string;
  nickname: string;
  username?: string;
  clanTag?: string;
  score?: number;
  wins?: number;
  losses?: number;
  level?: number;
  profileImage?: string;
}

interface TopClan {
  id: string;
  name: string;
  tag: string;
  totalScore?: number;
  memberCount?: number;
  logo?: string;
}

interface PublicStats {
  currentSeasonNumber: number;
  seasonEndsAt: string | null;
  seasonEndsInDays: number | null;
  totalDuelists: number;
  totalDuels: number;
  tournamentsFinished: number;
  cardsRegistered: number;
  playersOnline: number;
  maxOnlineToday: number;
  maxOnlineYesterday: number;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailResent, setEmailResent] = useState(false);
  const [shopCards, setShopCards] = useState<MarqueeCard[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [topClans, setTopClans] = useState<TopClan[]>([]);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const navigate = useNavigate();
  const { login } = useAuthStore();

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/cards/shop/for-sale`, { timeout: 20000 }).then((r) => (Array.isArray(r.data) ? r.data.slice(0, 16) : [])).catch(() => []),
      axios.get(`${API_URL}/users/ranking/top5`).then((r) => {
        if (!Array.isArray(r.data)) return [];
        return r.data.slice(0, 5).map((p: any) => ({
          id: String(p.id ?? p.userId ?? ''),
          nickname: p.nickname ?? '',
          username: p.username ?? p.nickname,
          clanTag: p.clanTag,
          score: p.score ?? p.totalScore ?? 0,
          wins: p.wins ?? p.winsGeral ?? p.winsSeason ?? 0,
          losses: p.losses ?? p.lossesGeral ?? p.lossesSeason ?? 0,
          level: p.level ?? 1,
          profileImage: p.profileImage,
        }));
      }).catch(() => []),
      axios.get(`${API_URL}/groups/ranking/top5`).then((r) => {
        if (!Array.isArray(r.data)) return [];
        return r.data.slice(0, 5).map((g: any) => ({
          id: g.id ?? '',
          name: g.name ?? '',
          tag: g.tag ?? '',
          totalScore: g.totalScore ?? g.score ?? 0,
          memberCount: g.memberCount ?? 0,
          logo: g.logo,
        }));
      }).catch(() => []),
      axios.get(`${API_URL}/public/stats`).then((r) => r.data).catch(() => null),
    ]).then(([cards, players, clans, publicStats]) => {
      setShopCards(cards);
      setTopPlayers(players);
      setTopClans(clans);
      setStats(publicStats);
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailNotVerified(false);
    setEmailResent(false);

    try {
      await login(username, password);
      navigate('/home');
    } catch (err: any) {
      const errorData = err.response?.data;
      const message = errorData?.message || 'Usuário ou senha inválidos';
      
      // Verificar se é erro de email não verificado
      if (errorData?.code === 'EMAIL_NOT_VERIFIED' || message.includes('confirme seu email')) {
        setEmailNotVerified(true);
        setUserEmail(errorData?.email || '');
        setError('Por favor, confirme seu email antes de fazer login. Verifique sua caixa de entrada.');
      } else {
        setError(message);
      }
    }
  };

  const handleResendVerificationEmail = async () => {
    if (!userEmail) return;
    
    setResendingEmail(true);
    setEmailResent(false);
    
    try {
      await axios.post(`${API_URL}/auth/resend-verification-email`, { email: userEmail });
      setEmailResent(true);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao reenviar email de verificação');
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        backgroundImage: 'url(/images/backgroundLogin.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay suave */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden />

      {/* Faixa superior: título + login integrados ao layout */}
      <header className="relative z-10 w-full border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="flex-shrink-0">
            <motion.h1
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
            >
              Yu-Gi-Oh! Online
            </motion.h1>
          </Link>

          {/* Entrar no Jogo — compacto, canto superior direito */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex flex-wrap items-center gap-2 sm:gap-3"
          >
            <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 sm:gap-2">
              <label htmlFor="username" className="sr-only">Usuário</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-24 sm:w-28 py-2 px-3 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-purple-400/60 focus:border-purple-400/50"
                placeholder="Usuário"
                required
              />
              <label htmlFor="password" className="sr-only">Senha</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-24 sm:w-28 py-2 px-3 rounded-lg text-sm bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-purple-400/60 focus:border-purple-400/50"
                placeholder="Senha"
                required
              />
              <button
                type="submit"
                className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-purple-400/50 transition-all active:scale-[0.98]"
              >
                Entrar
              </button>
            </form>
            <span className="text-white/50 text-sm hidden sm:inline">|</span>
            <Link
              to="/register"
              className="text-sm text-purple-300 hover:text-white font-medium transition-colors"
            >
              Criar conta
            </Link>
          </motion.div>
        </div>
      </header>

      {/* Mensagem de erro — abaixo do header, integrada à tela */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-4 mt-4 max-w-2xl rounded-xl px-4 py-3 text-sm border border-white/10 bg-black/30 backdrop-blur-sm"
          style={{
            borderColor: emailNotVerified ? 'rgba(251,191,36,0.4)' : 'rgba(248,113,113,0.4)',
            backgroundColor: emailNotVerified ? 'rgba(251,191,36,0.15)' : 'rgba(248,113,113,0.15)',
          }}
        >
          <p className={emailNotVerified ? 'text-amber-100' : 'text-red-100'}>{error}</p>
          {emailNotVerified && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-amber-200/90">Não recebeu o email? Verifique o spam ou reenvie.</p>
              {emailResent ? (
                <p className="text-xs text-green-300 font-medium">Email reenviado. Confira sua caixa.</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResendVerificationEmail}
                  disabled={resendingEmail}
                  className="py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                >
                  {resendingEmail ? 'Enviando...' : 'Reenviar confirmação'}
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Conteúdo principal — esquerda: Top Duelistas, Top Clãs, marquee; direita: O que rolou até agora */}
      <main className="flex-1 relative z-10 flex flex-col justify-center pt-6 pb-8 px-4">
        <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna esquerda */}
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm p-4"
              >
                <h3 className="text-sm font-bold text-white/90 mb-3 flex items-center gap-2">
                  <span>🏆</span> Top 5 Duelistas
                </h3>
                {topPlayers.length === 0 ? (
                  <p className="text-white/50 text-xs">Carregando...</p>
                ) : (
                  <ul className="space-y-1.5">
                    {topPlayers.map((p, i) => (
                      <li key={p.id} className="flex items-center gap-2 text-xs">
                        <span className="text-white/70 w-5">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                        <img
                          src={getImageUrl(p.profileImage)}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/images/default.png'; }}
                        />
                        <span className="text-white truncate flex-1 min-w-0">
                          {p.clanTag ? `|${p.clanTag}| ` : ''}{p.nickname || p.username || '—'}
                        </span>
                        <span className="text-white/60 shrink-0">{p.score ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm p-4"
              >
                <h3 className="text-sm font-bold text-white/90 mb-3 flex items-center gap-2">
                  <span>⚔️</span> Top 5 Clãs
                </h3>
                {topClans.length === 0 ? (
                  <p className="text-white/50 text-xs">Carregando...</p>
                ) : (
                  <ul className="space-y-1.5">
                    {topClans.map((c, i) => (
                      <li key={c.id} className="flex items-center gap-2 text-xs">
                        <span className="text-white/70 w-5">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                        <img
                          src={getImageUrl(c.logo)}
                          alt=""
                          className="w-6 h-6 rounded object-cover flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/images/default.png'; }}
                        />
                        <span className="text-white truncate flex-1 min-w-0">[{c.tag}] {c.name}</span>
                        <span className="text-white/60 shrink-0">{c.totalScore ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </div>
            <LatestCardsMarquee cards={shopCards} showVerLoja />
          </div>

          {/* Coluna direita — O que rolou até agora */}
          <motion.aside
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-4"
          >
            <div className="rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm p-4 sticky top-4">
              <h3 className="text-sm font-bold text-white/90 mb-3 flex items-center gap-2">
                <span>📊</span> O que rolou até agora
              </h3>
              {stats === null ? (
                <p className="text-white/50 text-xs">Carregando...</p>
              ) : (
                <dl className="space-y-2.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/70">Season atual</dt>
                    <dd className="text-white font-semibold">{stats.currentSeasonNumber}º</dd>
                  </div>
                  {stats.seasonEndsInDays !== null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-white/70">Season termina em</dt>
                      <dd className="text-white font-semibold">{stats.seasonEndsInDays} dias</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/70">Duelistas</dt>
                    <dd className="text-white font-semibold">{stats.totalDuelists.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/70">Duelos</dt>
                    <dd className="text-white font-semibold">{stats.totalDuels.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/70">Torneios finalizados</dt>
                    <dd className="text-white font-semibold">{stats.tournamentsFinished.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/70">Cartas cadastradas</dt>
                    <dd className="text-white font-semibold">{stats.cardsRegistered.toLocaleString('pt-BR')}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/70">Jogadores online</dt>
                    <dd className="text-green-300 font-semibold">{stats.playersOnline.toLocaleString('pt-BR')}</dd>
                  </div>
                  {(stats.maxOnlineToday > 0 || stats.maxOnlineYesterday > 0) && (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/70">Máx. de hoje</dt>
                        <dd className="text-white font-semibold">{stats.maxOnlineToday.toLocaleString('pt-BR')}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-white/70">Máx. de ontem</dt>
                        <dd className="text-white font-semibold">{stats.maxOnlineYesterday.toLocaleString('pt-BR')}</dd>
                      </div>
                    </>
                  )}
                </dl>
              )}
            </div>
          </motion.aside>
        </div>
      </main>
    </div>
  );
}
