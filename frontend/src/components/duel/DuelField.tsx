import React from 'react';

interface DuelFieldProps {
  isOpponent: boolean;
  deckCount?: number;
  handCount?: number;
}

const DuelField: React.FC<DuelFieldProps> = ({ isOpponent, deckCount = 40 }) => {
  // 5 Zones para monstros e spell/trap
  const monsterZones = Array(5).fill(null);
  const spellTrapZones = Array(5).fill(null);

  // Cada jogador tem sua imagem de campo
  const fieldImage = isOpponent 
    ? '/images/CampoDeDuelo01.jpg' 
    : '/images/CampoDeDuelo02.jpg';

  return (
    <div className={`relative rounded-lg overflow-hidden border-2 border-slate-700 shadow-xl ${isOpponent ? 'transform rotate-180' : ''}`}>
      {/* Imagem de Fundo do Campo */}
      <div 
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${fieldImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.75,
          filter: 'brightness(0.7) saturate(1.2)',
        }}
      />
      
      {/* Overlay com gradiente */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/50" />

      {/* Zonas do Campo (por cima da imagem) */}
      <div className="relative space-y-4 p-6">
      {/* Linha 1 (Topo): Field Zone | 5 Monster Zones | Graveyard */}
      <div className="grid grid-cols-7 gap-4">
        {/* Field Zone / Graveyard (trocados para oponente) */}
        <div className="zone-card border-2 border-yellow-500/50 rounded aspect-[59/86] hover:border-yellow-400 hover:scale-105 transition-all cursor-pointer flex items-center justify-center backdrop-blur-sm scale-75">
          <div>
            <div className="text-yellow-400 text-sm font-bold drop-shadow-md">
              {isOpponent ? 'FIELD' : 'FIELD'}
            </div>
          </div>
        </div>

        {/* 5 Monster Zones */}
        {monsterZones.map((_, index) => (
          <div
            key={`monster-${index}`}
            className="zone-card border-2 border-red-500/50 rounded aspect-[59/86] hover:border-red-400 hover:scale-105 transition-all cursor-pointer backdrop-blur-sm scale-75"
            title="Monster Zone"
          >
            {/* Carta aqui */}
          </div>
        ))}

        {/* Graveyard / Field Zone (trocados para oponente) */}
        <div className="zone-card border-2 border-gray-500/50 rounded aspect-[59/86] flex items-center justify-center hover:border-gray-400 hover:scale-105 transition-all cursor-pointer backdrop-blur-sm scale-75">
          <div>
            <div className="text-gray-400 text-sm font-bold drop-shadow-md">
              {isOpponent ? 'GY' : 'GY'}
            </div>
            <div className="text-gray-300 text-base font-bold drop-shadow-md">0</div>
          </div>
        </div>
      </div>

      {/* Linha 2 (Baixo): Extra Deck | 5 Spell/Trap Zones | Deck */}
      <div className="grid grid-cols-7 gap-4">
        {/* Extra Deck / Deck (trocados para oponente) */}
        <div className="zone-card border-2 border-purple-500/50 rounded aspect-[59/86] flex items-center justify-center backdrop-blur-sm hover:border-purple-400 hover:scale-105 transition-all cursor-pointer scale-75">
          <div>
            <div className="text-purple-400 text-sm font-bold drop-shadow-md">
              {isOpponent ? 'EXTRA' : 'EXTRA'}
            </div>
            <div className="text-purple-300 text-base font-bold drop-shadow-md">
              {isOpponent ? '0' : '0'}
            </div>
          </div>
        </div>

        {/* 5 Spell/Trap Zones */}
        {spellTrapZones.map((_, index) => (
          <div
            key={`spell-${index}`}
            className="zone-card border-2 border-green-500/50 rounded aspect-[59/86] hover:border-green-400 hover:scale-105 transition-all cursor-pointer backdrop-blur-sm scale-75"
            title="Spell/Trap Zone"
          >
            {/* Carta aqui */}
          </div>
        ))}

        {/* Deck / Extra Deck (trocados para oponente) */}
        <div className="zone-card border-2 border-blue-500/50 rounded aspect-[59/86] relative overflow-hidden hover:border-blue-400 hover:scale-105 transition-all cursor-pointer scale-75">
          {deckCount > 0 ? (
            <>
              {/* Imagem de verso de carta (fundoCarta.webp) */}
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(/images/fundoCarta.webp)`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              {/* Contador de cartas POR CIMA */}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="text-center bg-black/70 px-3 py-2 rounded">
                  <div className="text-white text-xs font-bold drop-shadow-md">
                    DECK
                  </div>
                  <div className="text-white text-xl font-bold drop-shadow-md">
                    {deckCount}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Deck vazio */
            <div className="absolute inset-0 flex items-center justify-center backdrop-blur-sm bg-slate-800/50">
              <div className="text-center">
                <div className="text-slate-500 text-xs font-bold">
                  DECK
                </div>
                <div className="text-slate-500 text-sm">
                  VAZIO
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default DuelField;
