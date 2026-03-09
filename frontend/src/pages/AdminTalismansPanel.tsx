import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface TalismanTemplate {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  bonusScorePct: number;
  bonusCashPct: number;
  bonusArenaPointsPct: number;
  priceCredits: number | null;
  priceCash: number | null;
  initialCharges?: number;
  isActive: boolean;
  isForSale: boolean;
  createdAt: string;
}

export default function AdminTalismansPanel() {
  const [talismans, setTalismans] = useState<TalismanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTalisman, setEditingTalisman] = useState<TalismanTemplate | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    bonusScorePct: 0,
    bonusCashPct: 0,
    bonusArenaPointsPct: 0,
    priceCredits: 0,
    priceCash: 0,
    initialCharges: 10,
    isActive: true,
    isForSale: true,
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => {
    loadTalismans();
  }, []);

  const loadTalismans = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/talismans', { timeout: 10000 });
      setTalismans(response.data || []);
    } catch (error: any) {
      console.error('Erro ao carregar talismãs:', error);
      setTalismans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      let imagePath = formData.image?.trim() || null;

      if (selectedImageFile) {
        const formDataUpload = new FormData();
        formDataUpload.append('image', selectedImageFile);
        formDataUpload.append('name', formData.name.trim() || 'talisman');
        const uploadResponse = await api.post('/cosmetics/admin/upload-talisman', formDataUpload, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30000,
        });
        imagePath = uploadResponse.data?.imageUrl ?? imagePath;
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        image: imagePath,
        bonusScorePct: formData.bonusScorePct,
        bonusCashPct: formData.bonusCashPct,
        bonusArenaPointsPct: formData.bonusArenaPointsPct,
        priceCredits: formData.priceCredits || null,
        priceCash: formData.priceCash || null,
        initialCharges: formData.initialCharges ?? 10,
        isActive: formData.isActive,
        isForSale: formData.isForSale,
      };

      if (editingTalisman) {
        await api.put(`/admin/talismans/${editingTalisman.id}`, payload);
        setMessage({ type: 'success', text: '✅ Talismã atualizado com sucesso!' });
      } else {
        await api.post('/admin/talismans', payload);
        setMessage({ type: 'success', text: '✅ Talismã criado com sucesso!' });
      }

      resetForm();
      loadTalismans();
      setShowForm(false);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (t: TalismanTemplate) => {
    setEditingTalisman(t);
    setFormData({
      name: t.name || '',
      description: t.description || '',
      image: t.image || '',
      bonusScorePct: t.bonusScorePct ?? 0,
      bonusCashPct: t.bonusCashPct ?? 0,
      bonusArenaPointsPct: t.bonusArenaPointsPct ?? 0,
      priceCredits: t.priceCredits ?? 0,
      priceCash: t.priceCash ?? 0,
      initialCharges: t.initialCharges ?? 10,
      isActive: t.isActive,
      isForSale: t.isForSale,
    });
    setSelectedImageFile(null);
    setImagePreview('');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar este talismã? Usuários que o possuem perderão o item.')) return;

    try {
      await api.delete(`/admin/talismans/${id}`);
      setMessage({ type: 'success', text: '✅ Talismã deletado com sucesso!' });
      loadTalismans();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || '❌ Erro ao deletar talismã' });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      image: '',
      bonusScorePct: 0,
      bonusCashPct: 0,
      bonusArenaPointsPct: 0,
      priceCredits: 0,
      priceCash: 0,
      initialCharges: 10,
      isActive: true,
      isForSale: true,
    });
    setEditingTalisman(null);
    setSelectedImageFile(null);
    setImagePreview('');
  };

  const filteredTalismans = talismans.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filter === 'all' || (filter === 'active' && t.isActive) || (filter === 'inactive' && !t.isActive);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-amber-900/10 to-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">✨ Gerenciamento de Talismãs</h1>
              <p className="text-gray-300">Crie e gerencie talismãs que aparecem na loja e dão bônus na Arena</p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
              className="bg-amber-600 hover:bg-amber-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              {showForm ? '❌ Cancelar' : '➕ Novo Talismã'}
            </button>
          </div>
        </div>

        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-900/50 border border-green-500'
                : 'bg-red-900/50 border border-red-500'
            }`}
          >
            <p className="text-white font-semibold">{message.text}</p>
          </motion.div>
        )}

        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-lg p-6 mb-8"
          >
            <h2 className="text-2xl font-bold mb-6">
              {editingTalisman ? '✏️ Editar Talismã' : '➕ Novo Talismã'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Nome *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Descrição</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                    placeholder="Ex: Bônus modestos na Arena"
                  />
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-700 rounded-lg p-4">
                <label className="block text-sm font-bold mb-3">🖼️ Imagem do talismã</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedImageFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => setImagePreview(reader.result as string);
                      reader.readAsDataURL(file);
                      setFormData((prev) => ({ ...prev, image: '' }));
                    }
                  }}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-amber-600 file:text-white hover:file:bg-amber-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.image}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, image: e.target.value }));
                    if (e.target.value) {
                      setSelectedImageFile(null);
                      setImagePreview('');
                    }
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500 mt-2"
                  placeholder="Ou cole a URL da imagem"
                />
                {(imagePreview || formData.image) && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">Preview:</p>
                    <img
                      src={imagePreview || (formData.image?.startsWith('http') ? formData.image : formData.image ? `${API_URL}${formData.image}` : '')}
                      alt="Preview"
                      className="w-24 h-24 object-cover rounded-lg border-2 border-amber-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Bônus Score (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.bonusScorePct}
                    onChange={(e) => setFormData({ ...formData, bonusScorePct: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Bônus Cash (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.bonusCashPct}
                    onChange={(e) => setFormData({ ...formData, bonusCashPct: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Bônus Arena Points (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.bonusArenaPointsPct}
                    onChange={(e) => setFormData({ ...formData, bonusArenaPointsPct: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Preço Créditos</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCredits}
                    onChange={(e) => setFormData({ ...formData, priceCredits: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Preço Cash</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Cargas iniciais</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.initialCharges}
                    onChange={(e) => setFormData({ ...formData, initialCharges: parseInt(e.target.value) || 10 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
                    title="Cargas que o duelista ganha ao comprar (1 consumida por duelo na arena)"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>Ativo</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isForSale}
                    onChange={(e) => setFormData({ ...formData, isForSale: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>À venda na loja</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-700 px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50"
              >
                {loading ? '⏳ Salvando...' : editingTalisman ? '💾 Atualizar' : '➕ Criar'}
              </button>
            </form>
          </motion.div>
        )}

        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4">
          <input
            type="text"
            placeholder="🔍 Buscar talismã..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-amber-500"
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <p className="text-2xl">⏳ Carregando...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTalismans.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-gray-800 rounded-lg overflow-hidden shadow-xl border-2 ${
                  t.isActive ? 'border-amber-500/30' : 'border-red-500/30'
                }`}
              >
                <div
                  className={`h-32 flex items-center justify-center ${
                    t.isActive ? 'bg-gradient-to-br from-amber-900 to-yellow-900' : 'bg-gray-700'
                  }`}
                >
                  {t.image ? (
                    <img
                      src={t.image.startsWith('http') ? t.image : `${API_URL}${t.image}`}
                      alt={t.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-5xl">✨</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold mb-2">{t.name}</h3>
                  {t.description && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">{t.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mb-2 text-xs text-amber-200/90">
                    {t.bonusScorePct > 0 && <span>Score +{t.bonusScorePct}%</span>}
                    {t.bonusCashPct > 0 && <span>• Cash +{t.bonusCashPct}%</span>}
                    {t.bonusArenaPointsPct > 0 && <span>• Arena +{t.bonusArenaPointsPct}%</span>}
                    <span>• ⚡ {t.initialCharges ?? 10} cargas</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {(t.priceCredits ?? 0) > 0 && (
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                        💰 {t.priceCredits}
                      </span>
                    )}
                    {(t.priceCash ?? 0) > 0 && (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                        💵 {t.priceCash}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(t)}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded font-bold transition-all"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-bold transition-all"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
