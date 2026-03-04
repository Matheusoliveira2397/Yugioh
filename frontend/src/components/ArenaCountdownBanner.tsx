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
        if (response.data && response.data.arena && response.data.timeUntilStart != null) {
          const timeUntil = Number(response.data.timeUntilStart);
          // Mostrar o banner quando faltar 10 minutos ou menos para a arena
          const tenMinutesMs = 10 * 60 * 1000;
          if (timeUntil > 0 && timeUntil <= tenMinutesMs) {
            setUpcomingArena(response.data.arena);
            setTimeRemaining(timeUntil);
          } else {
            setUpcomingArena(null);
          }
        } else {
          // Só esconde se a API não retornar arena (ex.: já passou dos 10 min no servidor)
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

    // Verificar a cada 3 segundos para não perder a janela de "faltam 10 minutos"
    const interval = setInterval(checkUpcomingArena, 3000);

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
      const bannerHeight = '48px';
      const hasActiveDuel = activeDuelBanner !== null;
      
      if (nav) {
        if (hasActiveDuel) {
          // Se houver duelo ativo, 48px + 48px (total 96px)
          nav.style.marginTop = '96px';
        } else {
          nav.style.marginTop = bannerHeight;
        }
      }
      if (sidebar) {
        if (hasActiveDuel) {
          sidebar.style.marginTop = '96px';
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
          nav.style.marginTop = '48px';
        }
        if (sidebar) {
          sidebar.style.marginTop = '48px';
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
          <div className="container mx-auto px-3 py-1.5" style={{ margin: 0, padding: '6px 12px' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="animate-pulse flex-shrink-0">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-base leading-tight">⚔️ Arena de Duelo Começando em {formatTime(timeRemaining)}</p>
                  <p className="text-xs opacity-90 leading-tight">{upcomingArena.name}</p>
                </div>
              </div>
              <button
                onClick={handleGoToArena}
                className="flex-shrink-0 px-4 py-1.5 text-sm bg-white text-orange-600 font-bold rounded-md hover:bg-orange-50 transition-colors shadow hover:shadow-md"
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

