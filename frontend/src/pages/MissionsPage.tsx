import GameIcon from '../components/GameIcon';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/axios';
import { useI18n } from '../i18n/I18nContext';
import CardImage from '../components/CardImage';

type RewardType = 'none' | 'credits' | 'cash' | 'card' | 'battle_pass_xp';

interface RewardCard {
  id: string;
  name: string;
  cardImage: string;
}

interface ObjectiveView {
  id: string;
  type: string;
  targetAmount: number;
  current: number;
  meta: { maxPosition?: number };
  label: string;
  done: boolean;
}

interface MissionView {
  id: string;
  title: string;
  description: string | null;
  rewardType: RewardType;
  rewardAmount: number;
  rewardCard: RewardCard | null;
  objectives: ObjectiveView[];
  completed: boolean;
  claimed: boolean;
  periodKey: string;
}

interface CategoryTab {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  resetType: string;
  missions: MissionView[];
}

function resetLabel(resetType: string, t: (k: string) => string) {
  switch (resetType) {
    case 'daily':
      return t('missions.resetDaily');
    case 'weekly':
      return t('missions.resetWeekly');
    case 'season':
      return t('missions.resetSeason');
    case 'manual':
      return t('missions.resetManual');
    default:
      return t('missions.resetNone');
  }
}

function formatReward(
  type: RewardType,
  amount: number,
  card: RewardCard | null,
  t: (k: string) => string,
) {
  if (type === 'none') return t('missions.noReward');
  if (type === 'credits') return `${amount} ${t('battlePass.credits')}`;
  if (type === 'cash') return `${amount} ${t('profileCard.cash')}`;
  if (type === 'battle_pass_xp') return `${amount} ${t('missions.battlePassXp')}`;
  if (type === 'card') {
    return card?.name
      ? `${card.name}${amount > 1 ? ` ×${amount}` : ''}`
      : t('shop.cards');
  }
  return '—';
}

function objectiveHint(obj: ObjectiveView) {
  if (obj.type === 'ARENA_TOP_N') {
    const n = obj.meta?.maxPosition || 5;
    return `Top ${n} · ${obj.current}/${obj.targetAmount}`;
  }
  return `${obj.current}/${obj.targetAmount}`;
}

export default function MissionsPage() {
  const { t } = useI18n();
  const [tabs, setTabs] = useState<CategoryTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimingAll, setClaimingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      try {
        await api.post('/missions/track-login');
      } catch {
        /* ignore */
      }
      const res = await api.get('/missions', { timeout: 20000 });
      const cats: CategoryTab[] = Array.isArray(res.data?.categories)
        ? res.data.categories
        : [];
      setTabs(cats);
      setActiveTab((prev) => {
        if (prev && cats.some((c) => c.id === prev)) return prev;
        return cats[0]?.id || null;
      });
    } catch (e: any) {
      setError(e.response?.data?.message || t('missions.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const active = tabs.find((c) => c.id === activeTab) || null;
  const claimableCount =
    active?.missions.filter((m) => m.completed && !m.claimed).length || 0;

  const claimOne = async (missionId: string) => {
    try {
      setClaimingId(missionId);
      const res = await api.post(`/missions/${missionId}/claim`);
      const cats: CategoryTab[] = Array.isArray(res.data?.categories)
        ? res.data.categories
        : [];
      setTabs(cats);
    } catch (e: any) {
      setError(e.response?.data?.message || t('missions.claimError'));
    } finally {
      setClaimingId(null);
    }
  };

  const claimAll = async () => {
    if (!active) return;
    try {
      setClaimingAll(true);
      const res = await api.post(`/missions/categories/${active.id}/claim-all`);
      const cats: CategoryTab[] = Array.isArray(res.data?.categories)
        ? res.data.categories
        : [];
      setTabs(cats);
    } catch (e: any) {
      setError(e.response?.data?.message || t('missions.claimError'));
    } finally {
      setClaimingAll(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="game-screen-hero mb-6"
      >
        <p className="game-screen-kicker">Desafios e conquistas</p>
        <h1 className="game-screen-heading"><span className="game-screen-icon"><GameIcon route="/missions" size={26} /></span>{t('missions.title')}</h1>
        <p className="game-screen-subtitle">{t('missions.subtitle')}</p>
      </motion.div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-900/30 px-4 py-3 text-red-200">
          {error}
          <button
            type="button"
            className="ml-3 underline text-sm"
            onClick={() => setError(null)}
          >
            OK
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">{t('common.loading')}</div>
      ) : tabs.length === 0 ? (
        <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-xl text-gray-300">{t('missions.empty')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-700 pb-3">
            {tabs.map((tab) => {
              const pending = tab.missions.filter(
                (m) => m.completed && !m.claimed,
              ).length;
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors ${
                    isActive
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.name}
                  {pending > 0 && (
                    <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs text-white">
                      {pending}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {active && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                {active.description && (
                  <p className="text-gray-400 text-sm">{active.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {resetLabel(active.resetType, t)}
                </p>
              </div>
              {claimableCount > 0 && (
                <button
                  type="button"
                  onClick={claimAll}
                  disabled={claimingAll}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm"
                >
                  {claimingAll
                    ? t('common.loading')
                    : `${t('missions.claimAll')} (${claimableCount})`}
                </button>
              )}
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={active?.id || 'none'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="grid gap-4"
            >
              {(active?.missions || []).map((mission) => {
                const progressPct =
                  mission.objectives.length === 0
                    ? 0
                    : Math.round(
                        (mission.objectives.filter((o) => o.done).length /
                          mission.objectives.length) *
                          100,
                      );
                return (
                  <div
                    key={mission.id}
                    className={`rounded-xl border p-5 bg-gray-800/80 ${
                      mission.claimed
                        ? 'border-emerald-700/40 opacity-75'
                        : mission.completed
                          ? 'border-amber-500/60'
                          : 'border-gray-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {mission.title}
                        </h3>
                        {mission.description && (
                          <p className="text-sm text-gray-400 mt-1">
                            {mission.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-amber-300 font-medium">
                          {formatReward(
                            mission.rewardType,
                            mission.rewardAmount,
                            mission.rewardCard,
                            t,
                          )}
                        </p>
                        {mission.rewardType === 'card' && mission.rewardCard && (
                          <div className="mt-1 inline-block w-12">
                            <CardImage
                              card={mission.rewardCard}
                              className="rounded"
                              singleLayerImage
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="h-2 rounded-full bg-gray-700 mb-4 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          mission.completed ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <ul className="space-y-2 mb-4">
                      {mission.objectives.map((obj) => (
                        <li
                          key={obj.id}
                          className="flex items-center justify-between text-sm gap-3"
                        >
                          <span
                            className={
                              obj.done ? 'text-emerald-300' : 'text-gray-300'
                            }
                          >
                            {obj.done ? '✓ ' : '○ '}
                            {obj.label}
                            {obj.type === 'ARENA_TOP_N' &&
                              ` (Top ${obj.meta?.maxPosition || 5})`}
                          </span>
                          <span className="text-gray-400 font-mono shrink-0">
                            {objectiveHint(obj)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex justify-end">
                      {mission.claimed ? (
                        <span className="text-sm text-emerald-400 font-semibold">
                          {t('missions.claimed')}
                        </span>
                      ) : mission.completed ? (
                        <button
                          type="button"
                          onClick={() => claimOne(mission.id)}
                          disabled={claimingId === mission.id}
                          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-sm"
                        >
                          {claimingId === mission.id
                            ? t('common.loading')
                            : t('missions.claim')}
                        </button>
                      ) : (
                        <span className="text-sm text-gray-500">
                          {t('missions.inProgress')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {active && active.missions.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  {t('missions.noMissionsInTab')}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
