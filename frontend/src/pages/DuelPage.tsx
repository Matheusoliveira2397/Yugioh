import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSocketStore } from '../stores/socketStore';
import { useAuthStore } from '../stores/authStore';
import CardImage from '../components/CardImage';
import { useCosmeticsStore } from '../stores/cosmeticsStore';
import Calculator from '../components/Calculator';

export default function DuelPage() {
  const { duelId } = useParams();
  const { user } = useAuthStore();
  const { emit, on, off } = useSocketStore();
  const { ownedSkins, equippedSkinId } = useCosmeticsStore();
  const [duelState, setDuelState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  useEffect(() => {
    if (!duelId || !user) {
      setError('Duelo ou usuário não encontrado');
      setLoading(false);
      return;
    }

    // Função para remover cardImage completamente dos campos de player (proteção no frontend)
    const removeBase64FromCards = (field: any) => {
      if (!field) return field;
      const clean = { ...field };
      
      const cleanCard = (card: any) => {
        if (!card) return card;
        const cleaned = { ...card };
        // Remover cardImage completamente - não precisa enviar para os campos do player
        if (cleaned.cardImage) {
          delete cleaned.cardImage;
        }
        return cleaned;
      };

      if (Array.isArray(clean.deck)) clean.deck = clean.deck.map(cleanCard);
      if (Array.isArray(clean.hand)) clean.hand = clean.hand.map(cleanCard);
      if (Array.isArray(clean.monsters)) clean.monsters = clean.monsters.map(cleanCard);
      if (Array.isArray(clean.spellTrap)) clean.spellTrap = clean.spellTrap.map(cleanCard);
      if (Array.isArray(clean.graveyard)) clean.graveyard = clean.graveyard.map(cleanCard);
      
      return clean;
    };

    // Handlers de eventos
    const handleDuelUpdate = (data: any) => {
      // Remover base64 antes de salvar no estado (proteção final)
      if (data.player1Field) {
        data.player1Field = removeBase64FromCards(data.player1Field);
      }
      if (data.player2Field) {
        data.player2Field = removeBase64FromCards(data.player2Field);
      }
      
      console.log('✅ Duelo atualizado');
      
      // Debug: verificar estrutura das cartas
      const isPlayer1 = data?.player1?.id === user?.id;
      const playerField = isPlayer1 ? data?.player1Field : data?.player2Field;
      const playerHand = playerField?.hand || [];
      if (playerHand.length > 0) {
        console.log(`🃏 [DuelPage] Mão tem ${playerHand.length} cartas`);
        console.log(`🃏 [DuelPage] Primeira carta:`, playerHand[0]);
        console.log(`🃏 [DuelPage] idCarta da primeira:`, playerHand[0]?.idCarta);
      } else {
        console.warn(`⚠️ [DuelPage] Mão vazia!`);
      }
      
      setDuelState(data);
      setLoading(false);
      setError(null);
    };

    const handleDuelError = (data: any) => {
      console.error('❌ Erro no duelo:', data);
      setError(data.message || 'Erro ao conectar ao duelo');
      setLoading(false);
    };

    const handleDuelLogs = (logs: any) => {
      console.log('📋 Logs do duelo recebidos:', logs);
    };

    const handlePhaseChanged = (data: any) => {
      console.log('🔄 Fase alterada:', data);
      // Atualizar o estado do duelo quando a fase mudar
      if (duelState) {
        setDuelState({ ...duelState, currentPhase: data.currentPhase, currentTurn: data.currentTurn });
      }
    };

    // Registrar listeners
    on('duelUpdate', handleDuelUpdate);
    on('duelError', handleDuelError);
    on('duelLogs', handleDuelLogs);
    on('phaseChanged', handlePhaseChanged);

    // Conectar ao WebSocket imediatamente (mais rápido que HTTP)
    console.log('🔌 Conectando ao duelo...');
    emit('joinDuelRoom', { duelId, userId: user.id });

    // Timeout de segurança (3 segundos - muito mais agressivo)
    const timeout = setTimeout(() => {
      if (loading) {
        setError('Timeout ao conectar ao duelo. Tente novamente.');
        setLoading(false);
      }
    }, 3000);

    // Cleanup
    return () => {
      clearTimeout(timeout);
      // Remover listeners específicos
      off('duelUpdate', handleDuelUpdate);
      off('duelError', handleDuelError);
      off('duelLogs', handleDuelLogs);
      off('phaseChanged', handlePhaseChanged);
    };
  }, [duelId, user, emit, on, off]);

  // Determinar qual campo é do jogador atual
  const isPlayer1 = duelState?.player1?.id === user?.id;
  const playerField = isPlayer1 ? duelState?.player1Field : duelState?.player2Field;
  const opponentField = isPlayer1 ? duelState?.player2Field : duelState?.player1Field;
  
  const playerDeck = playerField?.deck || [];
  const playerHand = playerField?.hand || [];
  const opponentDeck = opponentField?.deck || [];
  const opponentHand = opponentField?.hand || [];
  
  // Debug: verificar se as cartas estão presentes
  console.log(`[DuelPage Render] isPlayer1: ${isPlayer1}`);
  console.log(`[DuelPage Render] playerField:`, playerField);
  console.log(`[DuelPage Render] playerHand.length: ${playerHand.length}`);
  console.log(`[DuelPage Render] playerHand:`, playerHand);
  if (playerHand.length > 0) {
    console.log(`[DuelPage Render] Primeira carta da mão:`, playerHand[0]);
    console.log(`[DuelPage Render] Primeira carta tem idCarta?`, !!playerHand[0]?.idCarta);
    console.log(`[DuelPage Render] Primeira carta idCarta:`, playerHand[0]?.idCarta);
  }

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const equippedSkin = equippedSkinId
    ? ownedSkins.find((s) => s.id === equippedSkinId)
    : null;

  const cardBackImage = equippedSkin
    ? (equippedSkin.image.startsWith('http')
        ? equippedSkin.image
        : `${API_URL}${equippedSkin.image}`)
    : '/images/fundoCarta.webp';

  const handleEndTurn = () => {
    if (duelId && user) {
      emit('endTurn', { duelId, userId: user.id });
    }
  };

  const handleNextPhase = () => {
    if (duelId && user) {
      emit('nextPhase', { duelId, userId: user.id });
    }
  };

  // Função para obter o nome da fase em português
  const getPhaseName = (phase: string) => {
    const phases: { [key: string]: string } = {
      DRAW: 'Fase de Compras',
      STANDBY: 'Fase de Apoio',
      MAIN1: 'Fase Principal 1',
      BATTLE: 'Fase de Batalha',
      MAIN2: 'Fase Principal 2',
      END: 'Fase Final'
    };
    return phases[phase] || phase;
  };

  // Verificar se é o turno do jogador
  const isMyTurn = duelState?.currentTurn === (isPlayer1 ? 1 : 2);
  const currentPhase = duelState?.currentPhase || 'DRAW';

  const handleSurrender = () => {
    if (duelId && user) {
      emit('surrender', { duelId, userId: user.id });
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-xl">Conectando ao duelo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-xl text-red-400 mb-4">❌ {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!duelState) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-xl">Duelo não encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen p-4 relative z-10">
      {/* Botão da Calculadora - Canto Inferior Esquerdo */}
      <button
        onClick={() => setIsCalculatorOpen(true)}
        className="fixed bottom-6 left-6 z-40 bg-yellow-600 hover:bg-yellow-500 text-white rounded-full p-4 shadow-lg transition-all hover:scale-110 active:scale-95 border-2 border-yellow-400"
        title="Abrir Calculadora"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
      </button>

      {/* Componente da Calculadora */}
      <Calculator
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />

      <div className="max-w-7xl mx-auto h-full flex flex-col">
        {/* Oponente */}
        <div className="bg-gray-800 bg-opacity-50 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold">Oponente</h3>
              <p className="text-2xl text-red-400">
                ❤️ {duelState?.player2LifePoints || 8000} LP
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Cartas no deck: {opponentDeck.length}</p>
              <p className="text-sm text-gray-400">Cartas na mão: {opponentHand.length}</p>
            </div>
          </div>
        </div>

        {/* Campo de Duelo */}
        <div className="flex-1 grid grid-cols-5 gap-2 mb-4">
          {/* Zonas do oponente */}
          <div className="col-span-5 grid grid-cols-5 gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={`opp-${i}`} className="duel-field-zone">
                <p className="text-xs text-center text-gray-500">Zona {i + 1}</p>
              </div>
            ))}
          </div>

          {/* Zonas do jogador */}
          <div className="col-span-5 grid grid-cols-5 gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={`player-${i}`} className="duel-field-zone">
                <p className="text-xs text-center text-gray-500">Zona {i + 1}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Jogador */}
        <div className="bg-gray-800 bg-opacity-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-xl font-bold">
                {user?.clanTag ? `|${user.clanTag}| ${user.nickname || user.username}` : (user?.nickname || user?.username)}
              </h3>
              <p className="text-2xl text-green-400">
                ❤️ {duelState?.player1LifePoints || 8000} LP
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {/* Indicador de Fase */}
              <div className="bg-yellow-600 bg-opacity-80 rounded px-3 py-1 text-center">
                <p className="text-sm font-bold">
                  {isMyTurn ? 'Seu Turno' : 'Turno do Oponente'} - {getPhaseName(currentPhase)}
                </p>
              </div>
              
              <div className="flex gap-2">
                {isMyTurn && currentPhase !== 'END' && (
                  <button onClick={handleNextPhase} className="btn-primary">
                    Próxima Fase
                  </button>
                )}
                {isMyTurn && currentPhase === 'END' && (
                  <button onClick={handleEndTurn} className="btn-primary">
                    Finalizar Turno
                  </button>
                )}
                <button onClick={handleSurrender} className="btn-danger">
                  Desistir
                </button>
              </div>
            </div>
          </div>

          {/* Deck do jogador (virado) */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-bold text-gray-300">📚 Deck ({playerDeck.length})</h4>
            </div>
            <div className="flex gap-1">
              {playerDeck.slice(0, 10).map((card: any, i: number) => (
                <div
                  key={i}
                  className="w-12 h-16 bg-gradient-to-br from-blue-900 to-purple-900 border-2 border-yellow-500 rounded cursor-pointer hover:scale-110 transition-transform"
                  style={{
                    backgroundImage: `url(${cardBackImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                  title={`Carta ${i + 1} do deck`}
                />
              ))}
              {playerDeck.length > 10 && (
                <div className="w-12 h-16 bg-gray-800 border-2 border-gray-600 rounded flex items-center justify-center">
                  <span className="text-xs font-bold">+{playerDeck.length - 10}</span>
                </div>
              )}
            </div>
          </div>

          {/* Mão do jogador (cartas reais) */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-sm font-bold text-gray-300">🃏 Mão ({playerHand.length})</h4>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {playerHand.map((card: any, i: number) => (
                <div
                  key={i}
                  className="min-w-[100px] h-[140px] rounded-lg border-2 border-yellow-500 cursor-pointer hover:scale-110 transition-transform shadow-lg overflow-hidden"
                  title={card.name || `Carta ${i + 1}`}
                >
                  <CardImage
                    card={card}
                    className="w-full h-full"
                    fallback={cardBackImage}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
