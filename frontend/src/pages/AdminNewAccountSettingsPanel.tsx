import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface NewAccountSettings {
  id: string;
  initialCredits: number;
  initialCash: number;
  availableInitialDeckIds: string[];
  defaultPlaymatId?: string | null;
  defaultSkinId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InitialDeck {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

interface Playmat {
  id: string;
  name: string;
  image: string;
  isActive?: boolean;
}

interface Sleeve {
  id: string;
  name: string;
  image: string;
  isActive?: boolean;
}

export default function AdminNewAccountSettingsPanel() {
  const { user } = useAuthStore();
  const [settings, setSettings] = useState<NewAccountSettings | null>(null);
  const [allDecks, setAllDecks] = useState<InitialDeck[]>([]);
  const [allPlaymats, setAllPlaymats] = useState<Playmat[]>([]);
  const [allSleeves, setAllSleeves] = useState<Sleeve[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    initialCredits: 50,
    initialCash: 50000,
    availableInitialDeckIds: [] as string[],
    defaultPlaymatId: null as string | null,
    defaultSkinId: null as string | null,
  });

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    loadSettings();
    loadAllDecks();
    loadPlaymatsAndSleeves();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/new-account-settings');
      setSettings(response.data);
      setFormData({
        initialCredits: response.data.initialCredits || 50,
        initialCash: response.data.initialCash || 50000,
        availableInitialDeckIds: response.data.availableInitialDeckIds || [],
        defaultPlaymatId: response.data.defaultPlaymatId ?? null,
        defaultSkinId: response.data.defaultSkinId ?? null,
      });
    } catch (error: any) {
      console.error('Erro ao carregar configurações:', error);
      setMessage({ type: 'error', text: '❌ Erro ao carregar configurações' });
    } finally {
      setLoading(false);
    }
  };

  const loadAllDecks = async () => {
    try {
      const response = await api.get('/initial-decks');
      setAllDecks(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar decks iniciais:', error);
    }
  };

  const loadPlaymatsAndSleeves = async () => {
    try {
      const [playmatsRes, sleevesRes] = await Promise.all([
        api.get('/cosmetics/admin/playmats'),
        api.get('/cosmetics/admin/sleeves'),
      ]);
      setAllPlaymats(playmatsRes.data || []);
      setAllSleeves(sleevesRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar playmats/skins:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await api.put('/admin/new-account-settings', formData);
      setMessage({ type: 'success', text: '✅ Configurações atualizadas com sucesso!' });
      loadSettings();
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      setMessage({ type: 'error', text: `❌ Erro: ${error.response?.data?.message || error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const toggleDeck = (deckId: string) => {
    setFormData(prev => {
      const isSelected = prev.availableInitialDeckIds.includes(deckId);
      return {
        ...prev,
        availableInitialDeckIds: isSelected
          ? prev.availableInitialDeckIds.filter(id => id !== deckId)
          : [...prev.availableInitialDeckIds, deckId],
      };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
            <span className="text-6xl">⚙️</span>
            Configurações de Contas Novas
          </h1>
          <p className="text-slate-400 text-lg">
            Configure quanto de cash e créditos as novas contas recebem, e quais decks iniciais podem ser sorteados
          </p>
        </motion.div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 rounded-xl p-8 border border-slate-700"
        >
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Recursos Iniciais */}
            <div className="border-b border-slate-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-4">💰 Recursos Iniciais</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-300 mb-2 font-semibold">
                    💎 Créditos Iniciais
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.initialCredits}
                    onChange={(e) => setFormData({ ...formData, initialCredits: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none"
                    required
                  />
                  <p className="text-slate-500 text-sm mt-1">
                    Quantidade de créditos que novas contas recebem ao se registrar
                  </p>
                </div>
                <div>
                  <label className="block text-slate-300 mb-2 font-semibold">
                    💵 Cash Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.initialCash}
                    onChange={(e) => setFormData({ ...formData, initialCash: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none"
                    required
                  />
                  <p className="text-slate-500 text-sm mt-1">
                    Quantidade de cash que novas contas recebem ao se registrar
                  </p>
                </div>
              </div>
            </div>

            {/* Playmat e Skin padrão */}
            <div className="border-b border-slate-700 pb-6">
              <h2 className="text-2xl font-bold text-white mb-4">🎨 Cosméticos Padrão</h2>
              <p className="text-slate-400 mb-4 text-sm">
                Playmat e skin de carta que novas contas receberão ao se registrar. Deixe em &quot;Nenhum&quot; para não equipar.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-slate-300 mb-2 font-semibold">Playmat padrão</label>
                  <select
                    value={formData.defaultPlaymatId ?? ''}
                    onChange={(e) => setFormData({ ...formData, defaultPlaymatId: e.target.value || null })}
                    className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">Nenhum</option>
                    {allPlaymats.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {formData.defaultPlaymatId && (() => {
                    const p = allPlaymats.find((x) => x.id === formData.defaultPlaymatId);
                    const src = p?.image ? (p.image.startsWith('http') ? p.image : `${import.meta.env.VITE_API_URL || ''}${p.image}`) : '';
                    return src ? (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={src} alt="Preview" className="w-16 h-10 object-cover rounded border border-slate-600" />
                        <span className="text-slate-400 text-sm">Preview</span>
                      </div>
                    ) : null;
                  })()}
                </div>
                <div>
                  <label className="block text-slate-300 mb-2 font-semibold">Skin de carta padrão</label>
                  <select
                    value={formData.defaultSkinId ?? ''}
                    onChange={(e) => setFormData({ ...formData, defaultSkinId: e.target.value || null })}
                    className="w-full px-4 py-3 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-teal-500 focus:outline-none"
                  >
                    <option value="">Nenhuma</option>
                    {allSleeves.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {formData.defaultSkinId && (() => {
                    const s = allSleeves.find((x) => x.id === formData.defaultSkinId);
                    const src = s?.image ? (s.image.startsWith('http') ? s.image : `${import.meta.env.VITE_API_URL || ''}${s.image}`) : '';
                    return src ? (
                      <div className="mt-2 flex items-center gap-2">
                        <img src={src} alt="Preview" className="w-12 h-16 object-cover rounded border border-slate-600" />
                        <span className="text-slate-400 text-sm">Preview</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>

            {/* Decks Iniciais Disponíveis */}
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">🎴 Decks Iniciais Disponíveis</h2>
              <p className="text-slate-400 mb-4 text-sm">
                Selecione quais decks iniciais podem ser sorteados aleatoriamente para novas contas.
                Se nenhum for selecionado, nenhum deck será atribuído automaticamente.
              </p>
              
              {allDecks.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>Nenhum deck inicial cadastrado.</p>
                  <p className="text-sm mt-2">
                    <a href="/admin/initial-decks" className="text-purple-400 hover:text-purple-300 underline">
                      Criar decks iniciais
                    </a>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allDecks.map((deck) => {
                    const isSelected = formData.availableInitialDeckIds.includes(deck.id);
                    return (
                      <motion.div
                        key={deck.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleDeck(deck.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/20'
                            : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected
                              ? 'border-purple-400 bg-purple-500'
                              : 'border-slate-500'
                          }`}>
                            {isSelected && (
                              <span className="text-white text-xs">✓</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-white font-bold">{deck.name}</h3>
                            {deck.description && (
                              <p className="text-slate-400 text-sm mt-1">{deck.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                deck.isActive
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {deck.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              
              {formData.availableInitialDeckIds.length > 0 && (
                <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <p className="text-purple-300 text-sm">
                    <strong>{formData.availableInitialDeckIds.length}</strong> deck(s) selecionado(s) para sorteio aleatório
                  </p>
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-4 pt-6 border-t border-slate-700">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all disabled:opacity-50"
              >
                {saving ? 'Salvando...' : '💾 Salvar Configurações'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

