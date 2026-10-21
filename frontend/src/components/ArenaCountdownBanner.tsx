import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

const TEN_MINUTES_MS = 10 * 60 * 1000;

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Busca a próxima arena e agenda o popup pelo horário (quando faltar 10 min), sem polling
  useEffect(() => {
    if (!user) {
      setUpcomingArena(null);
      setLoading(false);
      return;
    }

    const fetchNextAndSchedule = async () => {
      try {
        const response = await api.get<{
          arena: UpcomingArena | null;
          timeUntilStart?: number;
          startsAt?: string;
        }>('/arena/next');
        const arena = response.data?.arena;
        const timeUntilStart = response.data?.timeUntilStart ?? null;
        const startsAt = response.data?.startsAt;

        if (!arena || timeUntilStart == null) {
          setUpcomingArena(null);
          return;
        }

        const timeUntil = Number(timeUntilStart);

        if (timeUntil <= 0) {
          setUpcomingArena(null);
          return;
        }

        // Já estamos na janela de 10 minutos: mostrar banner agora
        if (timeUntil <= TEN_MINUTES_MS) {
          setUpcomingArena(arena);
          setTimeRemaining(timeUntil);
          return;
        }

        // Faltam mais de 10 min: agendar um único timeout para quando faltar exatamente 10 min
        const msUntilShowBanner = timeUntil - TEN_MINUTES_MS;
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          setUpcomingArena(arena);
          const start = startsAt ? new Date(startsAt).getTime() : Date.now() + TEN_MINUTES_MS;
          setTimeRemaining(Math.max(0, start - Date.now()));
        }, msUntilShowBanner);
      } catch (error: any) {
        if (error?.response?.status !== 404) {
          console.error('Erro ao buscar próxima arena:', error);
        }
        setUpcomingArena(null);
      } finally {
        setLoading(false);
      }
    };

    fetchNextAndSchedule();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [user, scheduleRefresh]);

  // Atualizar contagem regressiva; quando chegar a 0, re-agendar para a próxima arena
  useEffect(() => {
    if (!upcomingArena || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          setUpcomingArena(null);
          setScheduleRefresh((r) => r + 1); // re-buscar e agendar próxima arena (ex.: amanhã)
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

  // Ajustar posição do nav quando a barra aparecer/desaparecer
  useEffect(() => {
    const nav = document.getElementById('main-nav');
    const activeDuelBanner = document.querySelector('[data-banner="active-duel"]');

    if (upcomingArena && !loading && timeRemaining > 0) {
      const hasActiveDuel = activeDuelBanner !== null;
      if (nav) nav.style.marginTop = hasActiveDuel ? '96px' : '48px';
    } else if (!activeDuelBanner) {
      if (nav) nav.style.marginTop = '0px';
    } else if (nav) {
      nav.style.marginTop = '48px';
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

