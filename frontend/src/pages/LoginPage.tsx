import GameIcon from '../components/GameIcon';
import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import axios from 'axios';
import LatestCardsMarquee, { type MarqueeCard } from '../components/LatestCardsMarquee';
import LanguageSelector from '../components/LanguageSelector';
import { SocialBrandIcon, socialPlatformLabel } from '../components/SocialBrandIcon';
import { getImageUrl, getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { formatScore } from '../utils/formatScore';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';
import GoogleSignInButton from '../components/GoogleSignInButton';

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

interface SocialMedia {
  id: string;
  platform: string;
  url: string;
  label: string | null;
  icon: string | null;
  order?: number;
  isActive?: boolean;
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailResent, setEmailResent] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [forgotMessage, setForgotMessage] = useState('');
  const [shopCards, setShopCards] = useState<MarqueeCard[]>([]);
  const [topPlayersGlobal, setTopPlayersGlobal] = useState<TopPlayer[]>([]);
  const [topPlayersSeason, setTopPlayersSeason] = useState<TopPlayer[]>([]);
  const [topClansGeneral, setTopClansGeneral] = useState<TopClan[]>([]);
  const [topClansSeason, setTopClansSeason] = useState<TopClan[]>([]);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [socialMedia, setSocialMedia] = useState<SocialMedia[]>([]);
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { t } = useI18n();

  const mapPlayer = (p: any) => ({
    id: String(p.id ?? p.userId ?? ''),
    nickname: p.nickname ?? '',
    username: p.username ?? p.nickname,
    clanTag: p.clanTag,
    score: p.score ?? p.totalScore ?? 0,
    wins: p.wins ?? p.winsGeral ?? p.winsSeason ?? 0,
    losses: p.losses ?? p.lossesGeral ?? p.lossesSeason ?? 0,
    level: p.level ?? 1,
    profileImage: p.profileImage,
  });

  const mapClan = (g: any) => ({
    id: g.id ?? '',
    name: g.name ?? '',
    tag: g.tag ?? '',
    totalScore: g.totalScore ?? g.seasonScore ?? g.score ?? 0,
    memberCount: g.memberCount ?? 0,
    logo: g.logo,
  });

  useEffect(() => {
    let cancelled = false;

    // Prioridade: rankings (acima da dobra) — formulário de login já está na tela
    Promise.all([
      axios.get(`${API_URL}/users/ranking/general?limit=5`, { timeout: 10000 }).then((r) => {
        if (!Array.isArray(r.data)) return [];
        return r.data.slice(0, 5).map(mapPlayer);
      }).catch(() => []),
      axios.get(`${API_URL}/users/ranking/top5`, { timeout: 10000 }).then((r) => {
        if (!Array.isArray(r.data)) return [];
        return r.data.slice(0, 5).map(mapPlayer);
      }).catch(() => []),
      axios.get(`${API_URL}/groups/ranking/top5`, { timeout: 10000 }).then((r) => {
        if (!Array.isArray(r.data)) return [];
        return r.data.slice(0, 3).map(mapClan);
      }).catch(() => []),
      axios.get(`${API_URL}/groups/ranking/season?limit=3`, { timeout: 10000 }).then((r) => {
        if (!Array.isArray(r.data)) return [];
        return r.data.slice(0, 3).map(mapClan);
      }).catch(() => []),
    ]).then(([playersGlobal, playersSeason, clansGeneral, clansSeason]) => {
      if (cancelled) return;
      setTopPlayersGlobal(playersGlobal);
      setTopPlayersSeason(playersSeason);
      setTopClansGeneral(clansGeneral);
      setTopClansSeason(clansSeason);
    });

    // Secundário: cartas / stats / redes (não bloqueia o paint inicial)
    Promise.all([
      axios.get(`${API_URL}/cards/shop/for-sale?limit=10&lite=1`, { timeout: 8000 }).then((r) => (Array.isArray(r.data) ? r.data.slice(0, 10) : [])).catch(() => []),
      axios.get(`${API_URL}/public/stats`, { timeout: 10000 }).then((r) => r.data).catch(() => null),
      axios.get(`${API_URL}/public/social-media/active`, { timeout: 8000 }).then((r) => (Array.isArray(r.data) ? r.data : [])).catch(() => []),
    ]).then(([cards, publicStats, social]) => {
      if (cancelled) return;
      setShopCards(cards);
      setStats(publicStats);
      setSocialMedia(social);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    setEmailNotVerified(false);
    setEmailResent(false);

    try {
      await login(username, password);
      navigate('/home');
    } catch (err: any) {
      const errorData = err.response?.data;
      const message = errorData?.message || t('login.errorInvalid');
      
      // Verificar se é erro de email não verificado
      if (errorData?.code === 'EMAIL_NOT_VERIFIED' || message.includes('confirme seu email')) {
        setEmailNotVerified(true);
        setUserEmail(errorData?.email || '');
        setError(t('login.errorEmailNotVerified'));
      } else {
        setError(message);
      }
      return;
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
      setError(err.response?.data?.message || t('login.sending'));
    } finally {
      setResendingEmail(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotStatus('loading');
    setForgotMessage('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/forgot-password`, { email: forgotEmail.trim().toLowerCase() });
      setForgotStatus('success');
      setForgotMessage(data.message);
    } catch (err: any) {
      setForgotStatus('error');
      setForgotMessage(err.response?.data?.message || t('login.forgotError'));
    }
  };

  const openForgotPassword = () => {
    setShowForgotPassword(true);
    setForgotEmail('');
    setForgotStatus('idle');
    setForgotMessage('');
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] game-overlay backdrop-blur-[2px]" aria-hidden />

      {/* Header: título + área de login */}
      <header className="relative z-10 w-full game-nav">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Link to="/" className="flex-shrink-0">
                <motion.h1
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-xl sm:text-2xl font-display font-bold text-champion"
                >
                  {t('login.gameTitle')}
                </motion.h1>
              </Link>
              <LanguageSelector variant="compact" className="sm:ml-2 [&_button]:border-champion-gold/30" />
            </div>

            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex flex-col gap-3 w-full sm:w-auto"
            >
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-2" noValidate>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                    <label htmlFor="login-input" className="sr-only">{t('login.usernameOrEmail')}</label>
                    <input
                      id="login-input"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="game-input flex-1 min-w-[140px] sm:w-36"
                      placeholder={t('login.usernameOrEmail')}
                      required
                    />
                    <label htmlFor="password" className="sr-only">{t('login.password')}</label>
                    <div className="relative flex-1 sm:w-36 min-w-[140px]">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="game-input w-full pr-10"
                        placeholder={t('login.password')}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/60 hover:text-champion-gold hover:bg-champion-gold/10 focus:outline-none focus:ring-2 focus:ring-champion-gold/40"
                        title={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                        aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      >
                        {showPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="btn-champion shrink-0 focus:outline-none focus:ring-2 focus:ring-champion-gold/50 focus:ring-offset-2 focus:ring-offset-transparent"
                  >
                    {t('login.submit')}
                  </button>
                </form>
              </div>
              <div className="flex flex-col gap-2 w-full sm:max-w-md">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <span className="flex-1 h-px bg-white/15" />
                  <span>{t('login.or')}</span>
                  <span className="flex-1 h-px bg-white/15" />
                </div>
                <GoogleSignInButton label={t('login.continueWithGoogle')} showConfigHint />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={openForgotPassword}
                  className="text-white/80 hover:text-white transition-colors underline underline-offset-2 font-medium"
                >
                  {t('login.forgotPassword')}
                </button>
                <span className="text-white/40">·</span>
                <Link to="/register" className="text-champion-gold hover:text-white font-medium transition-colors">
                  {t('login.createAccount')}
                </Link>
              </div>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg px-3 py-2.5 text-sm border backdrop-blur-sm"
                  style={{
                    borderColor: emailNotVerified ? 'rgba(251,191,36,0.5)' : 'rgba(248,113,113,0.5)',
                    backgroundColor: emailNotVerified ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)',
                  }}
                >
                  <p className={emailNotVerified ? 'text-amber-100' : 'text-red-100'}>{error}</p>
                  {emailNotVerified && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-amber-200/90">{t('login.didNotReceiveEmail')}</p>
                      {emailResent ? (
                        <p className="text-xs text-green-300 font-medium">{t('login.emailResent')}</p>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendVerificationEmail}
                          disabled={resendingEmail}
                          className="mt-1 py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                        >
                          {resendingEmail ? t('login.sending') : t('login.resendVerification')}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>
      </header>

      {/* Modal Recuperar senha */}
      {showForgotPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 duel-modal-scrim"
          onClick={() => { if (forgotStatus !== 'success') setShowForgotPassword(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="game-panel p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="forgot-title" className="text-lg font-bold text-white">
                {t('login.forgotPassword')}
              </h2>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                aria-label={t('common.close')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p className="text-white/70 text-sm mb-4">
              {t('login.forgotHint')}
            </p>
            {forgotStatus === 'success' && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/20 border border-green-500/40 text-green-200 text-sm">
                {forgotMessage}
              </div>
            )}
            {forgotStatus === 'error' && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
                {forgotMessage}
              </div>
            )}
            {forgotStatus !== 'success' && (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <label htmlFor="forgot-email-modal" className="block text-sm font-medium text-white/90">
                  Email
                </label>
                <input
                  id="forgot-email-modal"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="game-input w-full"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="flex-1 py-2.5 rounded-lg font-medium text-white/80 bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={forgotStatus === 'loading'}
                    className="flex-1 btn-champion disabled:opacity-60"
                  >
                    {forgotStatus === 'loading' ? t('login.sending') : t('login.sendLink')}
                  </button>
                </div>
              </form>
            )}
            {forgotStatus === 'success' && (
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="w-full btn-champion"
              >
                {t('common.close')}
              </button>
            )}
          </motion.div>
        </div>
      )}

      {/* Conteúdo principal */}
      <main className="flex-1 relative z-10 pt-4 sm:pt-6 pb-8 px-4">
        <div className="max-w-6xl w-full mx-auto flex flex-col gap-6">
          <section className="game-screen-hero" aria-labelledby="login-welcome-title">
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="game-screen-kicker">Yu-Gi-Oh! RPG · Academia de Duelistas</p>
                <h2 id="login-welcome-title" className="game-screen-heading">
                  <span className="game-screen-icon"><GameIcon route="/random-duel" size={27} /></span>
                  Entre na arena. Sua jornada começa aqui.
                </h2>
                <p className="game-screen-subtitle">Colecione cartas, desafie outros duelistas, participe de torneios e construa sua história.</p>
              </div>
              <Link to="/register" className="ui-button-primary inline-flex shrink-0 items-center justify-center gap-2 self-start md:self-auto">
                <GameIcon route="/profile" size={19} /> Criar minha conta
              </Link>
            </div>
          </section>
          {/* Grid: Rankings à esquerda | Stats + destaque à direita */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
            {/* Card único: Top Duelistas (Global + Season lado a lado) */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="lg:col-span-5 game-panel"
            >
              <div className="game-panel-header">
                <h2 className="game-panel-title text-base flex items-center gap-2">
                  <span className="text-xl">🏆</span> {t('loginRankings.top5Duelists')}
                </h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 min-h-[200px]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-champion-gold/90 font-semibold mb-2">{t('loginRankings.global')}</p>
                  {topPlayersGlobal.length === 0 ? (
                    <p className="text-white/40 text-xs">{t('common.loading')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {topPlayersGlobal.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                          <img src={getProfileImageUrl(p.profileImage)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-champion-gold/30" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-xs font-medium truncate block">{p.clanTag ? `[${p.clanTag}] ` : ''}{p.nickname || p.username || '—'}</span>
                            <span className="text-champion-amber text-[10px]">{formatScore(p.score)} {t('common.pts')}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-champion-cyan/90 font-semibold mb-2">{t('loginRankings.season')}</p>
                  {topPlayersSeason.length === 0 ? (
                    <p className="text-white/40 text-xs">{t('common.loading')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {topPlayersSeason.map((p, i) => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`}</span>
                          <img src={getProfileImageUrl(p.profileImage)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-champion-cyan/30" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-xs font-medium truncate block">{p.clanTag ? `[${p.clanTag}] ` : ''}{p.nickname || p.username || '—'}</span>
                            <span className="text-champion-cyan/90 text-[10px]">{formatScore(p.score)} {t('common.pts')}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Card único: Top 3 Clãs (Geral + Season) */}
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="lg:col-span-4 game-panel"
            >
              <div className="game-panel-header" style={{ background: 'linear-gradient(90deg, rgba(196, 60, 60, 0.14), transparent 70%)' }}>
                <h2 className="game-panel-title text-base flex items-center gap-2">
                  <span className="text-xl">⚔️</span> {t('loginRankings.top3Clans')}
                </h2>
              </div>
              <div className="p-4 grid grid-cols-2 gap-4 min-h-[200px]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-champion-gold/90 font-semibold mb-2">{t('loginRankings.general')}</p>
                  {topClansGeneral.length === 0 ? (
                    <p className="text-white/40 text-xs">{t('common.loading')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {topClansGeneral.map((c, i) => (
                        <li key={c.id} className="flex items-center gap-2">
                          <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          <img src={getImageUrl(c.logo)} alt="" className="w-7 h-7 rounded object-cover shrink-0 ring-1 ring-champion-gold/25" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-xs font-medium truncate block">[{c.tag}] {c.name}</span>
                            <span className="text-champion-amber text-[10px]">{formatScore(c.totalScore)} {t('common.pts')}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-champion-cyan/90 font-semibold mb-2">{t('loginRankings.season')}</p>
                  {topClansSeason.length === 0 ? (
                    <p className="text-white/40 text-xs">{t('common.loading')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {topClansSeason.map((c, i) => (
                        <li key={c.id} className="flex items-center gap-2">
                          <span className="text-white/80 text-xs w-5 shrink-0">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                          <img src={getImageUrl(c.logo)} alt="" className="w-7 h-7 rounded object-cover shrink-0 ring-1 ring-champion-cyan/25" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_PROFILE_IMAGE_PATH; }} />
                          <div className="min-w-0 flex-1">
                            <span className="text-white text-xs font-medium truncate block">[{c.tag}] {c.name}</span>
                            <span className="text-champion-cyan/90 text-[10px]">{formatScore(c.totalScore)} {t('common.pts')}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Coluna direita: Stats em grid */}
            <motion.aside
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="lg:col-span-3"
            >
              <div className="game-panel sticky top-4">
                <div className="game-panel-header">
                  <h2 className="game-panel-title text-base flex items-center gap-2">
                    <span className="text-xl">📊</span> {t('loginRankings.statistics')}
                  </h2>
                </div>
                {stats === null ? (
                  <div className="p-4"><p className="text-white/40 text-xs">{t('common.loading')}</p></div>
                ) : (
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <div className="game-stat-chip">
                      <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.seasonLabel')}</p>
                      <p className="text-white font-bold text-sm">{stats.currentSeasonNumber}º</p>
                    </div>
                    {stats.seasonEndsInDays != null && (
                      <div className="game-stat-chip">
                        <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.endsIn')}</p>
                        <p className="text-champion-gold font-bold text-sm">{stats.seasonEndsInDays} {t('loginRankings.days')}</p>
                      </div>
                    )}
                    <div className="game-stat-chip">
                      <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.duelists')}</p>
                      <p className="text-white font-bold text-sm">{stats.totalDuelists.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="game-stat-chip">
                      <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.duels')}</p>
                      <p className="text-white font-bold text-sm">{stats.totalDuels.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="game-stat-chip col-span-2" style={{ background: 'rgba(61, 184, 197, 0.1)', borderColor: 'rgba(61, 184, 197, 0.25)' }}>
                      <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.onlineNow')}</p>
                      <p className="text-champion-cyan font-bold text-lg">{stats.playersOnline.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="game-stat-chip">
                      <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.tournaments')}</p>
                      <p className="text-white font-bold text-sm">{stats.tournamentsFinished.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="game-stat-chip">
                      <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.cards')}</p>
                      <p className="text-white font-bold text-sm">{stats.cardsRegistered.toLocaleString('pt-BR')}</p>
                    </div>
                    {(stats.maxOnlineToday > 0 || stats.maxOnlineYesterday > 0) && (
                      <>
                        {stats.maxOnlineToday > 0 && (
                          <div className="game-stat-chip">
                            <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.maxToday')}</p>
                            <p className="text-white font-bold text-sm">{stats.maxOnlineToday.toLocaleString('pt-BR')}</p>
                          </div>
                        )}
                        {stats.maxOnlineYesterday > 0 && (
                          <div className="game-stat-chip">
                            <p className="text-[10px] uppercase tracking-wider text-arena-mist">{t('loginRankings.maxYesterday')}</p>
                            <p className="text-white font-bold text-sm">{stats.maxOnlineYesterday.toLocaleString('pt-BR')}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.aside>
          </div>

          {socialMedia.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.12 }}
              className="game-panel"
              aria-label="Redes sociais"
            >
              <div className="game-panel-header" style={{ background: 'linear-gradient(90deg, rgba(61, 184, 197, 0.14), transparent 70%)' }}>
                <h2 className="game-panel-title text-sm flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    🌐
                  </span>
                  Redes sociais
                </h2>
              </div>
              <div className="p-4 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                {socialMedia.map((s) => {
                  const name =
                    (s.label && s.label.trim()) || socialPlatformLabel(s.platform, s.url);
                  return (
                    <a
                      key={s.id}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      title={name}
                      aria-label={name}
                      className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-champion-gold/10 border border-champion-gold/25 hover:bg-champion-gold/20 hover:border-champion-gold/50 transition-colors"
                    >
                      <SocialBrandIcon platform={s.platform} url={s.url} size={22} />
                    </a>
                  );
                })}
              </div>
            </motion.section>
          )}

          {/* Marquee de cartas — largura total */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.15 }}>
            <LatestCardsMarquee cards={shopCards} showVerLoja />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
