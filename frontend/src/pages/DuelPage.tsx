import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useSocketStore } from '../stores/socketStore';
import { useAuthStore } from '../stores/authStore';

export default function DuelPage() {
  const { duelId } = useParams();
  const { user } = useAuthStore();
  const { emit, on } = useSocketStore();
  const [duelState, setDuelState] = useState<any>(null);

  useEffect(() => {
    if (duelId && user) {
      emit('joinDuel', { duelId, userId: user.id });

      on('duelUpdate', (data: any) => {
        setDuelState(data);
      });
    }
  }, [duelId, user]);

  const handleEndTurn = () => {
    if (duelId) {
      emit('endTurn', { duelId });
    }
  };

  const handleSurrender = () => {
    if (duelId && user) {
      emit('surrender', { duelId, userId: user.id });
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-blue-900 to-purple-900 p-4">
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
              <p className="text-sm text-gray-400">Cartas no deck: 40</p>
              <p className="text-sm text-gray-400">Cartas na mão: 5</p>
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
              <h3 className="text-xl font-bold">{user?.username}</h3>
              <p className="text-2xl text-green-400">
                ❤️ {duelState?.player1LifePoints || 8000} LP
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={handleEndTurn} className="btn-primary">
                Finalizar Turno
              </button>
              <button onClick={handleSurrender} className="btn-danger">
                Desistir
              </button>
            </div>
          </div>

          {/* Mão do jogador */}
          <div className="flex gap-2 overflow-x-auto">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="card-yugioh min-w-[100px] h-[140px] flex items-center justify-center cursor-pointer"
              >
                <p className="text-xs">Carta {i + 1}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
