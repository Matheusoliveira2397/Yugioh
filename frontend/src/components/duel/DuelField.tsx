import React from 'react';
import { motion } from 'framer-motion';
import { getCardImage } from '../../utils/cardImage';

interface DuelFieldProps {
  isOpponent: boolean;
  deckCount?: number;
  handCount?: number;
  monsters?: (any | null)[]; // Array de 5 posições para os monstros no campo
  spellTraps?: (any | null)[]; // Array de 5 posições para spell/trap no campo
}

const DuelField: React.FC<DuelFieldProps> = ({ isOpponent, deckCount = 40, monsters = Array(5).fill(null), spellTraps = Array(5).fill(null) }) => {
  // 5 Zones para monstros e spell/trap
  const monsterZones = Array(5).fill(null);
  const spellTrapZones = Array(5).fill(null);

  // Cada jogador tem sua imagem de campo
  const fieldImage = isOpponent 
    ? '/images/CampoDeDuelo01.jpg' 
    : '/images/CampoDeDuelo02.jpg';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={`relative rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-2xl max-w-5xl mx-auto backdrop-blur-sm ${isOpponent ? 'transform rotate-180' : ''}`}
    >
      {/* Imagem de Fundo do Campo - Modernizada */}
      <motion.div 
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${fieldImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.8,
          filter: 'brightness(0.75) saturate(1.3)',
        }}
        animate={{
          scale: [1, 1.02, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Overlay com gradiente moderno */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-purple-900/20 to-black/60" />

      {/* Zonas do Campo (por cima da imagem) - Modernizado */}
      <div className="relative space-y-4 p-6">
      {/* Linha 1 (Topo): Field Zone | 5 Monster Zones | Graveyard */}
      <div className="grid grid-cols-7 gap-3">
        {/* Field Zone / Graveyard - Modernizado */}
        <motion.div 
          whileHover={{ scale: 1.1, y: -3 }}
          className="zone-card border-2 border-yellow-400/60 rounded-xl aspect-[59/86] hover:border-yellow-300 hover:shadow-lg hover:shadow-yellow-500/40 transition-all cursor-pointer flex items-center justify-center backdrop-blur-md bg-yellow-900/20 scale-75">
          <div>
            <div className="text-yellow-300 text-sm font-bold drop-shadow-lg">
              {isOpponent ? 'FIELD' : 'FIELD'}
            </div>
          </div>
        </motion.div>

        {/* 5 Monster Zones - Modernizado */}
        {monsterZones.map((_, index) => {
          const monster = monsters[index];
          return (
            <motion.div
              key={`monster-${index}`}
              whileHover={{ scale: 1.1, y: -3 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="zone-card border-2 border-red-400/50 rounded-xl aspect-[59/86] hover:border-red-300/70 hover:shadow-lg hover:shadow-red-500/40 transition-all cursor-pointer backdrop-blur-md bg-red-900/10 scale-75 relative overflow-hidden"
              title={monster ? monster.name : "Monster Zone"}
            >
              {monster ? (() => {
                // Buscar imagem local usando o ID da carta
                const cardImageUrl = getCardImage(monster);
                const fallbackGradient = 'linear-gradient(to bottom, #1e3a8a, #7c3aed, #dc2626)';
                const fallbackCard = '/images/fundoCarta.webp';
                
                return (
                  <>
                    {monster.position === 'attack' ? (
                      // Ataque: carta face para cima - sem bordas, apenas a imagem
                      <div
                        className="absolute inset-0 w-full h-full"
                        style={{
                          backgroundImage: cardImageUrl 
                            ? `url(${cardImageUrl})` 
                            : fallbackGradient,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          zIndex: 5,
                        }}
                        onError={(e) => {
                          // Se a imagem não carregar, usar fallback
                          (e.target as HTMLDivElement).style.backgroundImage = fallbackGradient;
                        }}
                      />
                    ) : (
                      // Defesa: carta completa deitada (rotacionada 90 graus) - sem bordas
                      <div
                        className="absolute inset-0"
                        style={{
                          width: '100%',
                          height: '100%',
                          zIndex: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            backgroundImage: cardImageUrl 
                              ? `url(${cardImageUrl})` 
                              : `url(${fallbackCard})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            transform: 'rotate(90deg)',
                            transformOrigin: 'center center',
                          }}
                        />
                      </div>
                    )}
                  </>
                );
              })() : null}
            </motion.div>
          );
        })}

        {/* Graveyard / Field Zone - Modernizado */}
        <motion.div 
          whileHover={{ scale: 1.1, y: -3 }}
          className="zone-card border-2 border-gray-400/60 rounded-xl aspect-[59/86] flex items-center justify-center hover:border-gray-300 hover:shadow-lg hover:shadow-gray-500/40 transition-all cursor-pointer backdrop-blur-md bg-gray-900/20 scale-75">
          <div>
            <div className="text-gray-300 text-sm font-bold drop-shadow-lg">
              {isOpponent ? 'GY' : 'GY'}
            </div>
            <div className="text-gray-200 text-base font-bold drop-shadow-lg">0</div>
          </div>
        </motion.div>
      </div>

      {/* Linha 2 (Baixo): Extra Deck | 5 Spell/Trap Zones | Deck */}
      <div className="grid grid-cols-7 gap-3">
        {/* Extra Deck / Deck - Modernizado */}
        <motion.div 
          whileHover={{ scale: 1.1, y: -3 }}
          className="zone-card border-2 border-purple-400/60 rounded-xl aspect-[59/86] flex items-center justify-center backdrop-blur-md bg-purple-900/20 hover:border-purple-300 hover:shadow-lg hover:shadow-purple-500/40 transition-all cursor-pointer scale-75">
          <div>
            <div className="text-purple-300 text-sm font-bold drop-shadow-lg">
              {isOpponent ? 'EXTRA' : 'EXTRA'}
            </div>
            <div className="text-purple-200 text-base font-bold drop-shadow-lg">
              {isOpponent ? '0' : '0'}
            </div>
          </div>
        </motion.div>

        {/* 5 Spell/Trap Zones - Modernizado */}
        {spellTrapZones.map((_, index) => {
          const spellTrap = spellTraps[index];
          return (
            <motion.div
              key={`spell-${index}`}
              whileHover={{ scale: 1.1, y: -3 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="zone-card border-2 border-green-400/50 rounded-xl aspect-[59/86] hover:border-green-300/70 hover:shadow-lg hover:shadow-green-500/40 transition-all cursor-pointer backdrop-blur-md bg-green-900/10 scale-75 relative overflow-hidden"
              title={spellTrap ? spellTrap.name : "Spell/Trap Zone"}
            >
              {spellTrap ? (() => {
                const cardImageUrl = getCardImage(spellTrap);
                const fallbackCard = '/images/fundoCarta.webp';
                
                return (
                  <>
                    {spellTrap.position === 'face-up' ? (
                      // Face-up: carta virada para cima - sem bordas, apenas a imagem
                      <div
                        className="absolute inset-0 w-full h-full"
                        style={{
                          backgroundImage: cardImageUrl 
                            ? `url(${cardImageUrl})` 
                            : `url(${fallbackCard})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          zIndex: 5,
                        }}
                      />
                    ) : (
                      // Set: carta virada para baixo (fundo de carta) - sem bordas
                      <div
                        className="absolute inset-0 w-full h-full"
                        style={{
                          backgroundImage: `url(${fallbackCard})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          zIndex: 5,
                        }}
                      />
                    )}
                  </>
                );
              })() : null}
            </motion.div>
          );
        })}

        {/* Deck / Extra Deck - Modernizado */}
        <motion.div 
          whileHover={{ scale: 1.1, y: -3 }}
          className="zone-card border-2 border-blue-400/60 rounded-xl aspect-[59/86] relative overflow-hidden hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/40 transition-all cursor-pointer scale-75 backdrop-blur-sm">
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
              {/* Contador de cartas POR CIMA - Modernizado */}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <motion.div 
                  whileHover={{ scale: 1.1 }}
                  className="text-center bg-gradient-to-br from-black/80 to-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/20 shadow-xl">
                  <div className="text-blue-300 text-xs font-bold drop-shadow-lg tracking-wider">
                    DECK
                  </div>
                  <motion.div 
                    key={deckCount}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="text-blue-200 text-2xl font-bold drop-shadow-lg">
                    {deckCount}
                  </motion.div>
                </motion.div>
              </div>
            </>
          ) : (
            /* Deck vazio - Modernizado */
            <div className="absolute inset-0 flex items-center justify-center backdrop-blur-md bg-slate-800/60 rounded-xl">
              <div className="text-center">
                <div className="text-slate-400 text-xs font-bold">
                  DECK
                </div>
                <div className="text-slate-500 text-sm">
                  VAZIO
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      </div>
    </motion.div>
  );
};

export default DuelField;
