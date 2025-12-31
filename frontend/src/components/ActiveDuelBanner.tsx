import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';

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

  useEffect(() => {
    if (!user) {
      setActiveDuel(null);
      setLoading(false);
      return;
    }

    const checkActiveDuel = async () => {
      try {
        const response = await api.get('/duels/my-active-duel');
        // Verificar se realmente há um duelo ativo com status IN_PROGRESS
        // O endpoint retorna null quando não há duelo ativo
        if (response.data && response.data !== null && typeof response.data === 'object' && response.data.id && response.data.status === 'IN_PROGRESS') {
          setActiveDuel(response.data);
        } else {
          setActiveDuel(null);
        }
      } catch (error: any) {
        // Se o erro for 404 ou não houver dados, não há duelo ativo
        if (error?.response?.status === 404 || !error?.response?.data || error?.response?.status === 400) {
          setActiveDuel(null);
        } else {
          console.error('Erro ao verificar duelo ativo:', error);
          setActiveDuel(null);
        }
      } finally {
        setLoading(false);
      }
    };

    // Verificar imediatamente
    checkActiveDuel();

    // Verificar a cada 5 segundos
    const interval = setInterval(checkActiveDuel, 5000);

    return () => clearInterval(interval);
  }, [user]);

  // Ajustar posição do nav e sidebar quando a barra aparecer/desaparecer
  useEffect(() => {
    const nav = document.getElementById('main-nav');
    const sidebar = document.getElementById('user-sidebar');
    const arenaBanner = document.querySelector('[data-banner="arena-countdown"]');
    const hasArenaBanner = arenaBanner !== null;
    
    if (activeDuel && !loading) {
      // Se houver barra de arena também, adicionar mais 64px (total 128px)
      const bannerHeight = hasArenaBanner ? '128px' : '64px';
      if (nav) {
        nav.style.marginTop = bannerHeight;
      }
      if (sidebar) {
        sidebar.style.marginTop = bannerHeight;
      }
    } else {
      // Se não houver duelo ativo, verificar se há barra de arena
      if (hasArenaBanner) {
        if (nav) {
          nav.style.marginTop = '64px';
        }
        if (sidebar) {
          sidebar.style.marginTop = '64px';
        }
      } else {
        if (nav) {
          nav.style.marginTop = '0px';
        }
        if (sidebar) {
          sidebar.style.marginTop = '0px';
        }
      }
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
          className="fixed top-0 left-0 right-0 w-full z-[60] bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 text-white"
          style={{ 
            boxShadow: 'none',
            margin: 0,
            padding: 0
          }}
        >
        <div className="container mx-auto px-4 py-3" style={{ margin: 0, padding: '12px 16px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="animate-pulse">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-lg">⚔️ Duelo em Andamento</p>
                <p className="text-sm opacity-90">Você tem um duelo ativo. Clique para continuar!</p>
              </div>
            </div>
            <button
              onClick={handleOpenDuel}
              className="px-6 py-2 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition-colors shadow-md hover:shadow-lg transform hover:scale-105"
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

