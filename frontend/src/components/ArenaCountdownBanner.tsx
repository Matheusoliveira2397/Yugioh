import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

interface UpcomingArena {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export default function ArenaCountdownBanner() {
  const [upcomingArena, setUpcomingArena] = useState<UpcomingArena | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [topOffset, setTopOffset] = useState<number>(0);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      setUpcomingArena(null);
      setLoading(false);
      return;
    }

    const checkUpcomingArena = async () => {
      try {
        const response = await api.get('/arena/upcoming');
        if (response.data && response.data.arena && response.data.timeUntilStart) {
          const timeUntil = response.data.timeUntilStart;
          // Só mostrar se faltar 10 minutos ou menos
          if (timeUntil > 0 && timeUntil <= 10 * 60 * 1000) {
            setUpcomingArena(response.data.arena);
            setTimeRemaining(timeUntil);
          } else {
            setUpcomingArena(null);
          }
        } else {
          setUpcomingArena(null);
        }
      } catch (error: any) {
        if (error?.response?.status === 404 || !error?.response?.data) {
          setUpcomingArena(null);
        } else {
          console.error('Erro ao verificar arena próxima:', error);
          setUpcomingArena(null);
        }
      } finally {
        setLoading(false);
      }
    };

    // Verificar imediatamente
    checkUpcomingArena();

    // Verificar a cada 5 segundos
    const interval = setInterval(checkUpcomingArena, 5000);

    return () => clearInterval(interval);
  }, [user]);

  // Atualizar contagem regressiva
  useEffect(() => {
    if (!upcomingArena || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          setUpcomingArena(null);
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [upcomingArena, timeRemaining]);

  // Verificar se há duelo ativo para ajustar posição da barra de arena
  useEffect(() => {
    const checkActiveDuel = () => {
      const activeDuelBanner = document.querySelector('[data-banner="active-duel"]') as HTMLElement;
      if (activeDuelBanner) {
        // Usar getBoundingClientRect para pegar a posição exata
        // rect.bottom dá a posição absoluta do final da barra desde o topo da viewport
        const rect = activeDuelBanner.getBoundingClientRect();
        setTopOffset(rect.bottom);
      } else {
        setTopOffset(0);
      }
    };
    
    checkActiveDuel();
    // Verificar mais frequentemente para garantir que está sempre colado
    const interval = setInterval(checkActiveDuel, 50);
    
    // Também verificar quando a barra de duelo mudar de tamanho
    const observer = new ResizeObserver(() => {
      checkActiveDuel();
    });
    
    const activeDuelBanner = document.querySelector('[data-banner="active-duel"]');
    if (activeDuelBanner) {
      observer.observe(activeDuelBanner);
    }
    
    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  // Ajustar posição do nav e sidebar quando a barra aparecer/desaparecer
  useEffect(() => {
    const nav = document.getElementById('main-nav');
    const sidebar = document.getElementById('user-sidebar');
    const activeDuelBanner = document.querySelector('[data-banner="active-duel"]');
    
    if (upcomingArena && !loading && timeRemaining > 0) {
      const bannerHeight = '64px';
      const hasActiveDuel = activeDuelBanner !== null;
      
      if (nav) {
        if (hasActiveDuel) {
          // Se houver duelo ativo, adicionar mais 64px (total 128px)
          nav.style.marginTop = '128px';
        } else {
          nav.style.marginTop = bannerHeight;
        }
      }
      if (sidebar) {
        if (hasActiveDuel) {
          sidebar.style.marginTop = '128px';
        } else {
          sidebar.style.marginTop = bannerHeight;
        }
      }
    } else {
      // Só remover se não houver outra barra
      if (!activeDuelBanner) {
        if (nav) {
          nav.style.marginTop = '0px';
        }
        if (sidebar) {
          sidebar.style.marginTop = '0px';
        }
      } else {
        // Se ainda houver duelo ativo, manter apenas o margin do duelo
        if (nav) {
          nav.style.marginTop = '64px';
        }
        if (sidebar) {
          sidebar.style.marginTop = '64px';
        }
      }
    }
  }, [upcomingArena, loading, timeRemaining]);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleGoToArena = () => {
    navigate('/arena');
  };

  return (
    <AnimatePresence>
      {upcomingArena && !loading && timeRemaining > 0 && (
        <motion.div
          data-banner="arena-countdown"
          initial={{ top: topOffset > 0 ? `${topOffset}px` : '-100px', opacity: 0 }}
          animate={{ 
            top: `${topOffset}px`,
            opacity: 1
          }}
          exit={{ top: '-100px', opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed left-0 right-0 w-full z-[70] bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white"
          style={{
            margin: 0,
            padding: 0,
            boxShadow: 'none',
            borderTop: 'none'
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
                  <p className="font-bold text-lg">⚔️ Arena de Duelo Começando em {formatTime(timeRemaining)}</p>
                  <p className="text-sm opacity-90">{upcomingArena.name}</p>
                </div>
              </div>
              <button
                onClick={handleGoToArena}
                className="px-6 py-2 bg-white text-orange-600 font-bold rounded-lg hover:bg-orange-50 transition-colors shadow-md hover:shadow-lg transform hover:scale-105"
              >
                Ir para Arena
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

