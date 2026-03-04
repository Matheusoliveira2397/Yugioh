import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ResetAllAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const RESET_OPTIONS = [
  { key: 'resetScoreSeason', label: 'Score da temporada (usuários)', description: 'Zera wins/losses da season e ranking da temporada' },
  { key: 'resetScoreGeral', label: 'Score geral (usuários)', description: 'Zera total score, vitórias/derrotas gerais, level, experiência, rating e divisão' },
  { key: 'resetCartas', label: 'Cartas e deck', description: 'Remove todas as cartas, decks e volta ao deck inicial (aplica cash/créditos iniciais)' },
  { key: 'resetCreditsCash', label: 'Créditos e cash', description: 'Volta créditos e cash de todos para o valor inicial (configuração de nova conta)' },
  { key: 'resetConquistas', label: 'Conquistas', description: 'Remove todas as conquistas dos usuários' },
  { key: 'resetScoreGeralGrupo', label: 'Score geral do grupo', description: 'Zera total score, vitórias e derrotas dos clãs e membros' },
  { key: 'resetScoreSeasonGrupo', label: 'Score da temporada do grupo', description: 'Zera score da season dos clãs e membros' },
] as const;

export default function ResetAllAccountsModal({ isOpen, onClose, onSuccess }: ResetAllAccountsModalProps) {
  const { token } = useAuthStore();
  const [step, setStep] = useState(1);
  const [confirmationText, setConfirmationText] = useState('');
  const [resetOptions, setResetOptions] = useState<Record<string, boolean>>({
    resetScoreSeason: false,
    resetScoreGeral: false,
    resetCartas: false,
    resetCreditsCash: false,
    resetConquistas: false,
    resetScoreGeralGrupo: false,
    resetScoreSeasonGrupo: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const requiredText = 'RESETAR TODAS AS CONTAS';
  const requiredCode = 'RESET_ALL_ACCOUNTS_CONFIRM';

  const toggleOption = (key: string) => {
    setResetOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasAnyOption = Object.values(resetOptions).some(Boolean);

  const handleReset = async () => {
    if (step !== 3) return;
    if (confirmationText !== requiredText) {
      setError('Texto de confirmação incorreto');
      return;
    }
    if (!hasAnyOption) {
      setError('Selecione pelo menos uma opção de reset');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(
        `${API_URL}/admin/reset-all-accounts`,
        {
          confirmationCode: requiredCode,
          ...resetOptions,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setResult(response.data);
      setStep(4);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao resetar contas');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setStep(1);
    setConfirmationText('');
    setResetOptions({
      resetScoreSeason: false,
      resetScoreGeral: false,
      resetCartas: false,
      resetCreditsCash: false,
      resetConquistas: false,
      resetScoreGeralGrupo: false,
      resetScoreSeasonGrupo: false,
    });
    setError(null);
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-gray-900 border-4 border-red-600 rounded-xl p-6 md:p-8 max-w-2xl w-full mx-4 shadow-2xl"
        >
          {/* Header com ícone de perigo */}
          <div className="flex items-center gap-4 mb-6">
            <div className="text-6xl">⚠️</div>
            <div>
              <h2 className="text-3xl font-bold text-red-500 mb-2">
                RESET COMPLETO DO SISTEMA
              </h2>
              <p className="text-red-300 text-sm">
                Esta ação é IRREVERSÍVEL e afetará TODAS as contas
              </p>
            </div>
          </div>

          {/* Conteúdo baseado no step */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="bg-red-950/50 border-2 border-red-800 rounded-lg p-4">
                <h3 className="text-xl font-bold text-red-400 mb-3">
                  Selecione o que deseja resetar (todas as contas: Player, Admin e Master):
                </h3>
                <div className="space-y-3">
                  {RESET_OPTIONS.map(({ key, label, description }) => (
                    <label
                      key={key}
                      className="flex items-start gap-3 p-3 rounded-lg border border-red-800/50 hover:bg-red-900/20 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={!!resetOptions[key]}
                        onChange={() => toggleOption(key)}
                        className="mt-1 w-5 h-5 rounded border-red-600 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <span className="text-red-200 font-semibold block">{label}</span>
                        <span className="text-red-300/90 text-xs block mt-0.5">{description}</span>
                      </div>
                    </label>
                  ))}
                </div>
                {!hasAnyOption && (
                  <p className="text-yellow-400 text-sm mt-2 font-medium">
                    Selecione pelo menos uma opção para continuar.
                  </p>
                )}
              </div>

              <div className="bg-yellow-950/50 border-2 border-yellow-800 rounded-lg p-4">
                <p className="text-yellow-200 text-sm font-bold">
                  ⚠️ Esta ação afetará TODAS as contas (Player, Admin e Master) e não pode ser desfeita!
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-gradient-to-r from-gray-700/90 to-gray-800/90 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg font-bold transition-all duration-200 border border-gray-600/50 hover:border-gray-500/70 shadow-md hover:shadow-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => hasAnyOption && setStep(2)}
                  disabled={!hasAnyOption}
                  className="px-6 py-2 bg-gradient-to-r from-red-700/90 to-red-800/90 hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all duration-200 border border-red-600/50 hover:border-red-500/70 shadow-md hover:shadow-lg"
                >
                  Continuar
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="bg-red-950/50 border-2 border-red-800 rounded-lg p-4">
                <p className="text-red-200 mb-4">
                  Para confirmar, digite exatamente o texto abaixo:
                </p>
                <div className="bg-black/50 p-3 rounded border border-red-600 mb-4">
                  <code className="text-red-400 font-bold text-lg">
                    {requiredText}
                  </code>
                </div>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  placeholder="Digite o texto acima"
                  className="w-full px-4 py-2 bg-gray-800 border-2 border-red-600 rounded-lg text-white focus:outline-none focus:border-red-400"
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-2 bg-gradient-to-r from-gray-700/90 to-gray-800/90 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg font-bold transition-all duration-200 border border-gray-600/50 hover:border-gray-500/70 shadow-md hover:shadow-lg"
                >
                  Voltar
                </button>
                <button
                  onClick={() => {
                    if (confirmationText === requiredText) {
                      setStep(3);
                    } else {
                      setError('Texto de confirmação incorreto');
                    }
                  }}
                  disabled={confirmationText !== requiredText}
                  className="px-6 py-2 bg-gradient-to-r from-red-700/90 to-red-800/90 hover:from-red-600 hover:to-red-700 disabled:from-gray-700/50 disabled:to-gray-800/50 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all duration-200 border border-red-600/50 hover:border-red-500/70 disabled:border-gray-600/30 shadow-md hover:shadow-lg disabled:shadow-none"
                >
                  Continuar
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="bg-red-950/50 border-2 border-red-800 rounded-lg p-4">
                <p className="text-red-200 mb-4 font-bold text-lg">
                  ÚLTIMA CONFIRMAÇÃO
                </p>
                <p className="text-red-300 text-sm mb-4">
                  Você está prestes a resetar TODAS as contas do sistema (incluindo Admin e Master). Esta é a última chance de cancelar.
                </p>
                <div className="bg-black/50 p-3 rounded border border-red-600">
                  <p className="text-red-400 font-bold">
                    Tem certeza absoluta que deseja continuar?
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-600 rounded p-3 text-red-200 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handleReset}
                  disabled={loading}
                  className="px-6 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg font-bold transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Resetando...</span>
                    </>
                  ) : (
                    <>
                      <span>⚠️</span>
                      <span>CONFIRMAR RESET</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="bg-green-950/50 border-2 border-green-800 rounded-lg p-4">
                <h3 className="text-xl font-bold text-green-400 mb-3">
                  ✅ Reset Completo Realizado!
                </h3>
                <div className="space-y-2 text-green-200 text-sm">
                  <p>Usuários afetados: <strong>{result.usersReset}</strong></p>
                  {result.cardsDeleted != null && <p>Cartas removidas: <strong>{result.cardsDeleted}</strong></p>}
                  {result.decksDeleted != null && <p>Decks removidos: <strong>{result.decksDeleted}</strong></p>}
                  {result.achievementsDeleted != null && <p>Conquistas removidas: <strong>{result.achievementsDeleted}</strong></p>}
                  {result.groupsUpdated != null && result.groupsUpdated > 0 && <p>Clãs atualizados (scores): <strong>{result.groupsUpdated}</strong></p>}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

