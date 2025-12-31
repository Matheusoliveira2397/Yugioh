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
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
          onClick={handleCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900/30 backdrop-blur-xl rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-4 border-b-2 border-yellow-500/30 pb-3">
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                    🎴 Seleção de Tributos
                  </h2>
                  <p className="text-gray-300 mt-1 text-sm">
                    Selecione {tributeText} para invocar em {positionText}
                  </p>
                </div>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-red-400 text-2xl font-bold transition-colors hover:scale-110 transform"
                >
                  ✕
                </button>
              </div>

              {/* Monstros disponíveis */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white mb-3">
                  Selecione {requiredTributes} monstro(s) para tributar:
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {availableMonsters.length === 0 ? (
                    <div className="col-span-full text-center py-6 text-gray-400">
                      <p className="text-sm">Você não tem monstros no campo para tributar!</p>
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
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-yellow-400 ring-2 ring-yellow-400/50 shadow-md shadow-yellow-500/50'
                              : 'border-gray-600 hover:border-yellow-500/50'
                          }`}
                          style={{ width: '100px', height: '146px' }}
                        >
                          <CardImage
                            card={monster}
                            className="w-full h-full"
                            fallback="/images/fundoCarta.webp"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center">
                              <div className="bg-yellow-400/95 text-black px-2 py-1 rounded font-bold text-xs">
                                ✓
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0.5 left-0.5 right-0.5 text-center">
                            <p className="text-white text-[10px] font-semibold bg-black/70 px-1 py-0.5 rounded truncate">
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
              <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
                <p className="text-center text-white font-bold">
                  {selectedTributes.length} de {requiredTributes} tributo(s) selecionado(s)
                </p>
              </div>

              {/* Botões */}
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleCancel}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedTributes.length !== requiredTributes}
                  className={`px-6 py-2 rounded-lg font-bold transition-colors text-sm ${
                    selectedTributes.length === requiredTributes
                      ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 text-white cursor-pointer'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Confirmar
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
