import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import { ACTIVE_DUEL_REFRESH_EVENT } from '../utils/activeDuelRefresh';

interface ActiveDuel {
  id: string;
  status: string;
  player1Id: number;
  player2Id: number;
}

export default function ActiveDuelBanner() {
  const [activeDuel, setActiveDuel] = useState<ActiveDuel | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  const checkActiveDuel = useCallback(async () => {
    if (!user) {
      setActiveDuel(null);
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/duels/my-active-duel');
      if (
        response.data &&
        response.data !== null &&
        typeof response.data === 'object' &&
        response.data.id &&
        response.data.status === 'IN_PROGRESS'
      ) {
        setActiveDuel(response.data);
      } else {
        setActiveDuel(null);
      }
    } catch (error: any) {
      if (error?.response?.status === 404 || !error?.response?.data || error?.response?.status === 400) {
        setActiveDuel(null);
      } else {
        console.error('Erro ao verificar duelo ativo:', error);
        setActiveDuel(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setActiveDuel(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void checkActiveDuel();

    const onRefresh = () => {
      void checkActiveDuel();
    };
    window.addEventListener(ACTIVE_DUEL_REFRESH_EVENT, onRefresh);

    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (visibilityTimer) clearTimeout(visibilityTimer);
      visibilityTimer = setTimeout(() => {
        visibilityTimer = null;
        void checkActiveDuel();
      }, 400);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener(ACTIVE_DUEL_REFRESH_EVENT, onRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
      if (visibilityTimer) clearTimeout(visibilityTimer);
    };
  }, [user, checkActiveDuel]);

  // Ajustar posição do nav quando a barra aparecer/desaparecer
  // (perfil do usuário agora rola junto com o conteúdo — sem sidebar com scroll próprio)
  useEffect(() => {
    const nav = document.getElementById('main-nav');
    const arenaBanner = document.querySelector('[data-banner="arena-countdown"]');
    const hasArenaBanner = arenaBanner !== null;

    if (activeDuel && !loading) {
      const bannerHeight = hasArenaBanner ? '96px' : '48px';
      if (nav) nav.style.marginTop = bannerHeight;
    } else if (hasArenaBanner) {
      if (nav) nav.style.marginTop = '64px';
    } else if (nav) {
      nav.style.marginTop = '0px';
    }
  }, [activeDuel, loading]);

  const handleOpenDuel = () => {
    if (activeDuel) {
      // Abrir duelo em uma nova aba
      const duelUrl = `${window.location.origin}/duel/${activeDuel.id}`;
      window.open(duelUrl, '_blank');
    }
  };

  return (
    <AnimatePresence>
      {activeDuel && !loading && (
        <motion.div
          data-banner="active-duel"
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 w-full z-[60] text-white border-b border-champion-gold/40"
          style={{ 
            background: 'linear-gradient(90deg, #8f2a2a 0%, #c43c3c 45%, #a67c3d 100%)',
            boxShadow: '0 4px 20px rgba(196, 60, 60, 0.35)',
            margin: 0,
            padding: 0
          }}
        >
        <div className="container mx-auto px-3 py-1.5" style={{ margin: 0, padding: '6px 12px' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="animate-pulse flex-shrink-0 text-champion-gold">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-base leading-tight">⚔️ Duelo em Andamento</p>
                <p className="text-xs opacity-90 leading-tight">Você tem um duelo ativo. Clique para continuar!</p>
              </div>
            </div>
            <button
              onClick={handleOpenDuel}
              className="flex-shrink-0 px-4 py-1.5 text-sm bg-champion-gold text-arena-ink font-bold rounded-md hover:bg-[#f0d878] transition-colors shadow-gold-sm"
            >
              Clique para abrir o duelo
            </button>
          </div>
        </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

