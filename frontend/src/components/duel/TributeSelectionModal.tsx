import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CardImage from '../CardImage';

interface TributeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedTributes: number[]) => void;
  monsters: (any | null)[];
  requiredTributes: number; // 1 ou 2
  summoningCard: any; // Carta que está sendo invocada
  position: 'attack' | 'defense' | 'set';
}

const TributeSelectionModal: React.FC<TributeSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  monsters,
  requiredTributes,
  summoningCard,
  position,
}) => {
  const [selectedTributes, setSelectedTributes] = useState<number[]>([]);

  const availableMonsters = monsters
    .map((monster, index) => ({ monster, index }))
    .filter(({ monster }) => monster !== null && monster !== undefined);

  const handleMonsterClick = (index: number) => {
    if (selectedTributes.includes(index)) {
      // Deselecionar
      setSelectedTributes(selectedTributes.filter(i => i !== index));
    } else {
      // Selecionar (mas não pode exceder o número necessário)
      if (selectedTributes.length < requiredTributes) {
        setSelectedTributes([...selectedTributes, index]);
      } else {
        // Substituir o primeiro selecionado
        setSelectedTributes([...selectedTributes.slice(1), index]);
      }
    }
  };

  const handleConfirm = () => {
    if (selectedTributes.length === requiredTributes) {
      onConfirm(selectedTributes);
      setSelectedTributes([]);
    }
  };

  const handleCancel = () => {
    setSelectedTributes([]);
    onClose();
  };

  const positionText = position === 'attack' ? 'Ataque' : position === 'set' ? 'Set (face-down)' : 'Defesa';
  const tributeText = requiredTributes === 1 ? '1 tributo' : '2 tributos';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-[10000] flex items-center justify-center p-4"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900/30 backdrop-blur-xl rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-8">
              {/* Header */}
              <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                <div>
                  <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                    🎴 Seleção de Tributos
                  </h2>
                  <p className="text-gray-300 mt-2">
                    Selecione {tributeText} para invocar <span className="font-bold text-yellow-400">{summoningCard?.name || 'este monstro'}</span> em {positionText}
                  </p>
                </div>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                >
                  ✕
                </button>
              </div>

              {/* Carta sendo invocada */}
              <div className="mb-6 flex justify-center">
                <div className="w-[200px] h-[290px] rounded-xl shadow-2xl border-2 border-yellow-500/30 overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
                  <CardImage
                    card={summoningCard}
                    className="w-full h-full"
                    fallback="/images/fundoCarta.webp"
                  />
                </div>
              </div>

              {/* Monstros disponíveis */}
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white mb-4">
                  Selecione {requiredTributes} monstro(s) para tributar:
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {availableMonsters.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-gray-400">
                      <p className="text-lg">Você não tem monstros no campo para tributar!</p>
                    </div>
                  ) : (
                    availableMonsters.map(({ monster, index }) => {
                      const isSelected = selectedTributes.includes(index);
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleMonsterClick(index)}
                          className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                              : 'border-gray-600 hover:border-yellow-500/50'
                          }`}
                          style={{ width: '120px', height: '175px' }}
                        >
                          <CardImage
                            card={monster}
                            className="w-full h-full"
                            fallback="/images/fundoCarta.webp"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center">
                              <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                Selecionado
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 right-1 text-center">
                            <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                              {monster.name || 'Monstro'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Contador de seleção */}
              <div className="mb-6 p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                <p className="text-center text-white font-bold text-lg">
                  {selectedTributes.length} de {requiredTributes} tributo(s) selecionado(s)
                </p>
              </div>

              {/* Botões */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={handleCancel}
                  className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedTributes.length !== requiredTributes}
                  className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                    selectedTributes.length === requiredTributes
                      ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-white cursor-pointer'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Confirmar Invocação
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TributeSelectionModal;
