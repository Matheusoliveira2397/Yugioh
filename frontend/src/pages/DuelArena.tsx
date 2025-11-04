import React, { useState, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import DuelChat from '../components/duel/DuelChat';
import DuelLogs from '../components/duel/DuelLogs';
import DuelField from '../components/duel/DuelField';

interface DuelData {
  id: string;
  player1: any;
  player2: any;
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  status: string;
}

const DuelArena: React.FC = () => {
  const { duelId } = useParams();
  const { user, token } = useAuthStore();
  const { duelFound, chatMessages, duelLogs, currentTurn, sendChatMessage, joinDuelRoom, endTurn } = useSocket();
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [myLifePoints, setMyLifePoints] = useState(8000);
  const [opponentLifePoints, setOpponentLifePoints] = useState(8000);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState(90); // Timer de 90 segundos
  const [turnTimer, setTurnTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Sistema de mão - cada jogador começa com 5 cartas
  const [myHand, setMyHand] = useState<number[]>([1, 2, 3, 4, 5]); // 5 cartas iniciais
  const [opponentHandCount] = useState(5); // Oponente também tem 5

  // Carregar dados do duelo ao abrir a página
  useEffect(() => {
    const loadDuelData = async () => {
      if (!duelId) {
        console.error('DuelId não encontrado na URL');
        setLoading(false);
        return;
      }
      
      try {
        console.log('=== DEBUG DUEL ARENA ===');
        console.log('DuelId:', duelId);
        console.log('Token existe?', !!token);
        console.log('Token (primeiros 20 chars):', token?.substring(0, 20) + '...');
        console.log('User ID:', user?.id);
        console.log('User:', user);
        
        if (!token) {
          throw new Error('Token não encontrado. Faça login novamente.');
        }
        
        // Garantir que o axios tenha o token configurado
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        console.log('Fazendo requisição GET /duels/' + duelId);
        const response = await axios.get(`http://localhost:3000/duels/${duelId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('✅ Dados do duelo carregados:', response.data);
        console.log('Player1:', response.data.player1);
        console.log('Player2:', response.data.player2);
        console.log('Player1 profileImage:', response.data.player1.profileImage);
        console.log('Player2 profileImage:', response.data.player2.profileImage);
        
        setDuelData(response.data);
        
        // Configurar life points e turno
        if (user?.id === response.data.player1.id) {
          setMyLifePoints(response.data.player1LifePoints);
          setOpponentLifePoints(response.data.player2LifePoints);
          setIsMyTurn(response.data.currentTurn === 1);
        } else {
          setMyLifePoints(response.data.player2LifePoints);
          setOpponentLifePoints(response.data.player1LifePoints);
          setIsMyTurn(response.data.currentTurn === 2);
        }
        
        setLoading(false);
      } catch (error: any) {
        console.error('❌ ERRO ao carregar duelo:', error);
        console.error('Error response:', error.response);
        console.error('Error status:', error.response?.status);
        console.error('Error data:', error.response?.data);
        console.error('Error message:', error.message);
        
        const errorMsg = error.response?.data?.message || error.message || 'Erro desconhecido ao carregar duelo';
        setError(errorMsg);
        setLoading(false);
      }
    };

    loadDuelData();
  }, [duelId, user?.id]);

  // Entrar na sala do duelo quando a página carregar
  useEffect(() => {
    if (duelId) {
      console.log('Entrando na sala do duelo:', duelId);
      joinDuelRoom(duelId);
    }
  }, [duelId, joinDuelRoom]);

  // Atualizar dados do duelFound se vier do WebSocket
  useEffect(() => {
    if (duelFound) {
      setMyLifePoints(duelFound.lifePoints);
      setOpponentLifePoints(duelFound.opponentLifePoints);
      setIsMyTurn(duelFound.yourTurn);
    }
  }, [duelFound]);

  // Escutar mudanças de turno via WebSocket
  useEffect(() => {
    if (currentTurn !== null && duelData && user) {
      const isPlayer1 = user.id === duelData.player1.id;
      const myTurnNumber = isPlayer1 ? 1 : 2;
      setIsMyTurn(currentTurn === myTurnNumber);
      console.log(`🔄 Turno atualizado: ${currentTurn}, meu turno: ${currentTurn === myTurnNumber}`);
    }
  }, [currentTurn, duelData, user]);

  // Timer do Turno - Inicia quando for a vez do jogador
  useEffect(() => {
    // Limpar timer anterior se existir
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }

    if (isMyTurn) {
      // Resetar timer para 90 segundos
      setTurnTimeLeft(90);
      
      // Criar novo timer
      const timer = setInterval(() => {
        setTurnTimeLeft((prev) => {
          if (prev <= 1) {
            // Tempo acabou! Passar turno automaticamente
            clearInterval(timer);
            handleEndTurn();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      setTurnTimer(timer);
    } else {
      // Não é meu turno, resetar timer
      setTurnTimeLeft(90);
    }

    // Cleanup ao desmontar ou mudar turno
    return () => {
      if (turnTimer) {
        clearInterval(turnTimer);
      }
    };
  }, [isMyTurn]);

  // Função para finalizar turno
  const handleEndTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    console.log('🔄 Finalizando turno...', { duelId, userId: user.id });
    endTurn(duelId, user.id);
    
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }
  };

  if (!user) {
    return <Navigate to="/" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-white text-2xl">Carregando duelo...</div>
      </div>
    );
  }

  if (error || !duelData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="max-w-md w-full bg-slate-800/50 rounded-xl border border-red-500/30 p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-3xl font-bold text-red-400 mb-4">Erro ao Carregar Duelo</h2>
          <p className="text-slate-300 mb-6">
            {error || 'Não foi possível carregar os dados do duelo.'}
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Duelo ID: <span className="font-mono text-purple-400">{duelId}</span>
          </p>
          <button
            onClick={() => window.location.href = '/random-duel'}
            className="gradient blue-purple px-8 py-3 rounded-lg font-bold"
          >
            Voltar para Random Duel
          </button>
        </div>
      </div>
    );
  }

  // Determinar quem é o oponente
  const isPlayer1 = user.id === duelData.player1.id;
  const opponent = isPlayer1 ? duelData.player2 : duelData.player1;
  const myClanTag = user?.clanTag || '';
  const opponentClanTag = (opponent as any).clanTag || '';

  return (
    <div className="min-h-screen relative p-2">
      {/* Background Image */}
      <div 
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: 'url(/images/background.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
      />
      {/* Dark Overlay */}
      <div className="fixed inset-0 -z-10 bg-black/50" />
      
      <div className="max-w-[1800px] mx-auto">
        {/* Header: Informações dos Duelistas */}
        <div className="flex items-center justify-center gap-12 mb-3 px-6 py-3 bg-gradient-to-r from-slate-900/80 via-slate-800/80 to-slate-900/80 rounded-xl border-2 border-purple-500/50 shadow-lg shadow-purple-500/20">
          {/* MEU DUELISTA (Esquerda) */}
          <div className="flex items-center gap-3 bg-slate-800/30 px-4 py-2 rounded-lg border border-blue-500/30">
            {/* Level */}
            <div className="flex flex-col items-center bg-slate-900/50 px-2 py-1 rounded border border-yellow-500/30">
              <div className="text-yellow-400 text-[10px] font-bold">LV</div>
              <div className="text-yellow-300 text-lg font-bold">{user.level || 1}</div>
            </div>
            
            {/* Avatar Quadrado */}
            <img 
              src={
                user.profileImage 
                  ? `http://localhost:3000${user.profileImage}` 
                  : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username) + '&background=3b82f6&color=fff&size=128'
              } 
              alt={user.username}
              className="w-14 h-14 rounded border-2 border-blue-500 object-cover shadow-md"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username) + '&background=3b82f6&color=fff&size=128';
              }}
            />
            
            {/* Info: Clan + Nick + LP */}
            <div>
              <div className="text-sm font-bold text-blue-400">
                {myClanTag && <span className="text-purple-400">[{myClanTag}] </span>}
                {user.nickname || user.username}
              </div>
              <div className="text-blue-300 font-bold text-base">LP: {myLifePoints}</div>
            </div>
          </div>

          {/* TIMER (Centro) */}
          <div className="flex items-center">
            <motion.div 
              className={`px-5 py-2 rounded-lg border-2 shadow-lg ${
                isMyTurn 
                  ? turnTimeLeft <= 10 
                    ? 'bg-gradient-to-br from-red-900/40 to-red-800/40 border-red-500 shadow-red-500/30 animate-pulse' 
                    : 'bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-blue-500 shadow-blue-500/30'
                  : 'bg-gradient-to-br from-slate-800/40 to-slate-700/40 border-slate-600 shadow-slate-600/20'
              }`}
              animate={isMyTurn && turnTimeLeft <= 10 ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              <div className="text-[10px] text-slate-400 mb-0.5 text-center font-bold tracking-wider">
                {isMyTurn ? 'SEU TURNO' : 'TURNO OPONENTE'}
              </div>
              <div className={`text-2xl font-bold font-mono text-center ${
                isMyTurn 
                  ? turnTimeLeft <= 10 
                    ? 'text-red-400' 
                    : 'text-blue-400'
                  : 'text-slate-400'
              }`}>
                {turnTimeLeft}s
              </div>
            </motion.div>
          </div>

          {/* OPONENTE (Direita) */}
          <div className="flex items-center gap-3 bg-slate-800/30 px-4 py-2 rounded-lg border border-red-500/30">
            {/* Info: Clan + Nick + LP */}
            <div className="text-right">
              <div className="text-sm font-bold text-red-400">
                {opponentClanTag && <span className="text-purple-400">[{opponentClanTag}] </span>}
                {opponent.nickname || opponent.username}
              </div>
              <div className="text-red-300 font-bold text-base">LP: {opponentLifePoints}</div>
            </div>
            
            {/* Avatar Quadrado */}
            <img 
              src={
                opponent.profileImage 
                  ? `http://localhost:3000${opponent.profileImage}` 
                  : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(opponent.username) + '&background=ef4444&color=fff&size=128'
              } 
              alt={opponent.username}
              className="w-14 h-14 rounded border-2 border-red-500 object-cover shadow-md"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(opponent.username) + '&background=ef4444&color=fff&size=128';
              }}
            />
            
            {/* Level */}
            <div className="flex flex-col items-center bg-slate-900/50 px-2 py-1 rounded border border-yellow-500/30">
              <div className="text-yellow-400 text-[10px] font-bold">LV</div>
              <div className="text-yellow-300 text-lg font-bold">{(opponent as any).level || 1}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[280px_1fr] gap-4">
          {/* Painel Esquerdo: Chat e Logs */}
          <div className="space-y-3">
            <DuelChat
              messages={chatMessages}
              onSendMessage={(message) => {
                if (duelId && user?.id) {
                  console.log('Enviando mensagem:', { duelId, userId: user.id, message });
                  sendChatMessage(duelId, user.id, message);
                }
              }}
            />
            <DuelLogs logs={duelLogs} />
          </div>

          {/* Arena Principal - LAYOUT YUGIOH PRO */}
          <div className="space-y-0">
            {/* Mão do Oponente (cartas viradas) - TOPO */}
            <div className="flex justify-center gap-0.5 py-1 bg-slate-900/30">
              {Array(opponentHandCount).fill(0).map((_, index) => (
                <div 
                  key={`opp-hand-${index}`}
                  className="w-8 h-12 rounded border border-purple-500/50 transform -rotate-180"
                  style={{
                    backgroundImage: `url(/images/fundoCarta.webp)`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                  }}
                />
              ))}
            </div>

            {/* Campo do Oponente */}
            <DuelField 
              isOpponent={true} 
              deckCount={40 - opponentHandCount} 
              handCount={opponentHandCount}
            />

            {/* Meu Campo */}
            <DuelField 
              isOpponent={false} 
              deckCount={40 - myHand.length} 
              handCount={myHand.length}
            />

            {/* Minha Mão (cartas visíveis) - BAIXO */}
            <div className="flex justify-center gap-0.5 py-1.5 bg-slate-900/50">
              {myHand.map((cardId, index) => (
                <motion.div
                  key={`my-hand-${cardId}`}
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -10, scale: 1.15 }}
                  className="w-11 h-16 bg-gradient-to-br from-yellow-900 via-orange-800 to-red-900 rounded border border-yellow-500/50 cursor-pointer hover:border-yellow-400 transition-all flex items-center justify-center shadow-lg"
                >
                  <div className="text-white text-[9px] font-bold">
                    CARTA {cardId}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Ações */}
            {isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 justify-center mt-2"
              >
                <button 
                  onClick={() => {
                    if (myHand.length < 40) {
                      const newCardId = Math.max(...myHand, 0) + 1;
                      setMyHand([...myHand, newCardId]);
                    }
                  }}
                  disabled={myHand.length >= 40}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2 rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:from-blue-500 hover:to-purple-500 transition-all border-2 border-blue-400/30 shadow-lg shadow-blue-500/20"
                >
                  COMPRAR CARTA
                </button>
                <button 
                  onClick={handleEndTurn}
                  className="bg-gradient-to-r from-red-600 to-orange-600 px-6 py-2 rounded-lg font-bold text-sm hover:from-red-500 hover:to-orange-500 transition-all border-2 border-red-400/30 shadow-lg shadow-red-500/20"
                >
                  FINALIZAR TURNO ({turnTimeLeft}s)
                </button>
              </motion.div>
            )}
            
            {/* Mensagem quando não é seu turno */}
            {!isMyTurn && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-3 mt-2"
              >
                <div className="inline-block bg-gradient-to-br from-slate-800/60 to-slate-900/60 px-6 py-3 rounded-lg border-2 border-slate-600/50 shadow-lg">
                  <p className="text-slate-300 text-sm font-bold tracking-wide">
                    AGUARDANDO OPONENTE
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    Tempo: <span className="text-blue-400 font-mono font-bold">{turnTimeLeft}s</span>
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuelArena;
