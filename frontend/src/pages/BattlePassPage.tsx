import GameIcon from '../components/GameIcon';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import CardImage from '../components/CardImage';
import { useI18n } from '../i18n/I18nContext';

type RewardType = 'none' | 'credits' | 'cash' | 'card';

interface RewardCard {
  id: string;
  name: string;
  cardImage: string;
}

interface LevelView {
  id: string;
  level: number;
  xpRequired: number;
  freeRewardType: RewardType;
  freeRewardAmount: number;
  freeRewardCardId: string | null;
  freeRewardCard: RewardCard | null;
  premiumRewardType: RewardType;
  premiumRewardAmount: number;
  premiumRewardCardId: string | null;
  premiumRewardCard: RewardCard | null;
}

interface SeasonView {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  premiumPriceCredits: number;
  xpPerWin: number;
  xpPerLoss: number;
  bannerUrl: string | null;
}

interface ProgressView {
  xp: number;
  hasPremium: boolean;
  claimedFreeLevels: number[];
  claimedPremiumLevels: number[];
  currentLevel: number;
  nextLevelXp: number | null;
  prevLevelXp: number;
}

function formatReward(
  type: RewardType,
  amount: number,
  card: RewardCard | null,
  t: (key: string) => string,
) {
  if (type === 'none') return '—';
  if (type === 'credits') return `${amount} ${t('battlePass.credits')}`;
  if (type === 'cash') return `${amount} ${t('profileCard.cash')}`;
  if (type === 'card') {
    return card?.name
      ? `${card.name}${amount > 1 ? ` ×${amount}` : ''}`
      : t('shop.cards');
  }
  return '—';
}

function RewardCell({
  type,
  amount,
  card,
  unlocked,
  claimed,
  lockedPremium,
  onClaim,
  claiming,
}: {
  type: RewardType;
  amount: number;
  card: RewardCard | null;
  unlocked: boolean;
  claimed: boolean;
  lockedPremium?: boolean;
  onClaim: () => void;
  claiming: boolean;
}) {
  const { t } = useI18n();

  if (type === 'none') {
    return (
      <div className="h-full min-h-[88px] flex items-center justify-center text-white/25 text-sm border border-dashed border-white/10 rounded-lg">
        —
      </div>
    );
  }

  return (
    <div
      className={`min-h-[88px] rounded-lg border p-2 flex flex-col items-center justify-between gap-1 ${
        claimed
          ? 'border-emerald-500/40 bg-emerald-950/30'
          : unlocked && !lockedPremium
            ? 'border-amber-400/50 bg-amber-950/20'
            : 'border-white/10 bg-black/30 opacity-70'
      }`}
    >
      {type === 'card' && card?.cardImage ? (
        <div className="w-12 h-[70px] overflow-hidden rounded">
          <CardImage
            card={{ name: card.name, cardImage: card.cardImage }}
            className="w-full h-full"
            singleLayerImage
            objectFit="cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="text-2xl mt-1">{type === 'credits' ? '💎' : '💵'}</div>
      )}
      <div className="text-[11px] text-center leading-tight text-white/85 px-1">
        {formatReward(type, amount, card, t)}
      </div>
      {claimed ? (
        <span className="text-[10px] uppercase tracking-wide text-emerald-400">{t('battlePass.claimed')}</span>
      ) : lockedPremium ? (
        <span className="text-[10px] text-white/40">{t('battlePass.premium')}</span>
      ) : unlocked ? (
        <button
          type="button"
          disabled={claiming}
          onClick={onClaim}
          className="text-[11px] px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50"
        >
          {t('battlePass.claim')}
        </button>
      ) : (
        <span className="text-[10px] text-white/35">{t('battlePass.locked')}</span>
      )}
    </div>
  );
}

export default function BattlePassPage() {
  const { t } = useI18n();
  const { refreshUser } = useAuthStore();
  const [season, setSeason] = useState<SeasonView | null>(null);
  const [levels, setLevels] = useState<LevelView[]>([]);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/battle-pass/current', { timeout: 20000 });
      setSeason(res.data?.season ?? null);
      setLevels(Array.isArray(res.data?.levels) ? res.data.levels : []);
      setProgress(res.data?.progress ?? null);
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao carregar o passe',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const applyPayload = (data: any) => {
    setSeason(data?.season ?? null);
    setLevels(Array.isArray(data?.levels) ? data.levels : []);
    setProgress(data?.progress ?? null);
  };

  const claim = async (level: number, track: 'free' | 'premium') => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post('/battle-pass/claim', { level, track });
      applyPayload(res.data);
      await refreshUser();
      setMessage({ type: 'success', text: `Recompensa do nível ${level} resgatada!` });
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Não foi possível resgatar',
      });
    } finally {
      setBusy(false);
    }
  };

  const claimAll = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post('/battle-pass/claim-all');
      applyPayload(res.data);
      await refreshUser();
      const n = res.data?.claimedCount ?? 0;
      setMessage({
        type: 'success',
        text: n > 0 ? `${n} recompensa(s) resgatada(s)!` : 'Nada pendente para resgatar.',
      });
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Erro ao resgatar',
      });
    } finally {
      setBusy(false);
    }
  };

  const buyPremium = async () => {
    if (!season) return;
    if (
      !confirm(
        `Desbloquear Passe Premium por ${season.premiumPriceCredits} créditos?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.post('/battle-pass/buy-premium');
      applyPayload(res.data);
      await refreshUser();
      setMessage({ type: 'success', text: 'Passe Premium desbloqueado!' });
    } catch (e: any) {
      setMessage({
        type: 'error',
        text: e.response?.data?.message || 'Não foi possível comprar o premium',
      });
    } finally {
      setBusy(false);
    }
  };

  const xp = progress?.xp ?? 0;
  const currentLevel = progress?.currentLevel ?? 0;
  const prevXp = progress?.prevLevelXp ?? 0;
  const nextXp = progress?.nextLevelXp;
  const barPct =
    nextXp != null && nextXp > prevXp
      ? Math.min(100, Math.max(0, ((xp - prevXp) / (nextXp - prevXp)) * 100))
      : currentLevel > 0
        ? 100
        : 0;

  const daysLeft = season
    ? Math.max(
        0,
        Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl mb-8 border border-amber-500/25 bg-gradient-to-br from-slate-950 via-amber-950/40 to-slate-900"
      >
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 20% 20%, rgba(251,191,36,0.25), transparent 50%), radial-gradient(ellipse at 80% 0%, rgba(245,158,11,0.15), transparent 45%)',
          }}
        />
        <div className="relative p-6 md:p-8">
          <p className="text-amber-300/80 text-sm tracking-[0.2em] uppercase mb-2">
            {t('battlePass.title')}
          </p>
          <h1 className="game-screen-heading mb-3"><span className="game-screen-icon"><GameIcon route="/battle-pass" size={26} /></span>
            {loading ? t('common.loading') : season?.name || t('battlePass.noSeason')}
          </h1>
          {season?.description && (
            <p className="text-white/70 max-w-2xl mb-4">{season.description}</p>
          )}

          {season && progress && (
            <>
              <div className="flex flex-wrap gap-4 items-end mb-4">
                <div>
                  <div className="text-xs text-white/50">{t('battlePass.passLevel')}</div>
                  <div className="text-3xl font-bold text-amber-300">{currentLevel}</div>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex justify-between text-xs text-white/50 mb-1">
                    <span>{xp} XP</span>
                    <span>
                      {nextXp != null ? `${nextXp} XP` : t('battlePass.maxLevel')}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-black/50 overflow-hidden border border-white/10">
                    <motion.div
                      className="h-full bg-gradient-to-r from-amber-600 to-yellow-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${barPct}%` }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>
                <div className="text-sm text-white/60">
                  {daysLeft} {t('battlePass.daysLeft')} · +{season.xpPerWin} XP vitória / +
                  {season.xpPerLoss} derrota
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {!progress.hasPremium ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={buyPremium}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 font-semibold disabled:opacity-50"
                  >
                    {t('battlePass.unlockPremium')} ({season.premiumPriceCredits} {t('battlePass.credits')})
                  </button>
                ) : (
                  <span className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 text-sm font-medium">
                    {t('battlePass.premiumActive')}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={claimAll}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                >
                  {t('battlePass.claimAll')}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {message && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg border ${
            message.type === 'success'
              ? 'bg-emerald-900/40 border-emerald-500/40'
              : 'bg-red-900/40 border-red-500/40'
          }`}
        >
          {message.text}
        </div>
      )}

      {!loading && !season && (
        <div className="text-center py-16 rounded-xl border border-white/10 bg-black/30">
          <p className="text-xl text-white/70">{t('battlePass.noActivePass')}</p>
          <p className="text-white/40 mt-2">{t('battlePass.comeBack')}</p>
        </div>
      )}

      {season && levels.length > 0 && (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-[56px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] bg-white/5 text-xs uppercase tracking-wide text-white/50 px-2 py-2 sticky top-0 z-10">
            <div className="text-center">{t('battlePass.level')}</div>
            <div className="text-center text-emerald-300/70">{t('battlePass.free')}</div>
            <div className="text-center text-amber-300/70">{t('battlePass.premium')}</div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-white/5">
            {levels.map((lvl, i) => {
              const unlocked = xp >= lvl.xpRequired;
              const freeClaimed = (progress?.claimedFreeLevels || []).includes(lvl.level);
              const premClaimed = (progress?.claimedPremiumLevels || []).includes(lvl.level);
              const isCurrent = lvl.level === currentLevel;

              return (
                <motion.div
                  key={lvl.id || lvl.level}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.4) }}
                  className={`grid grid-cols-[56px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] gap-2 p-2 items-stretch ${
                    isCurrent ? 'bg-amber-500/10' : unlocked ? 'bg-black/20' : 'bg-black/40'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${
                        unlocked
                          ? 'border-amber-400 text-amber-200 bg-amber-500/20'
                          : 'border-white/20 text-white/40'
                      }`}
                    >
                      {lvl.level}
                    </div>
                    <div className="text-[10px] text-white/35 mt-1">{lvl.xpRequired} XP</div>
                  </div>
                  <RewardCell
                    type={lvl.freeRewardType}
                    amount={lvl.freeRewardAmount}
                    card={lvl.freeRewardCard}
                    unlocked={unlocked}
                    claimed={freeClaimed}
                    claiming={busy}
                    onClaim={() => claim(lvl.level, 'free')}
                  />
                  <RewardCell
                    type={lvl.premiumRewardType}
                    amount={lvl.premiumRewardAmount}
                    card={lvl.premiumRewardCard}
                    unlocked={unlocked}
                    claimed={premClaimed}
                    lockedPremium={!progress?.hasPremium}
                    claiming={busy}
                    onClaim={() => claim(lvl.level, 'premium')}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
