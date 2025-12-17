import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface Playmat {
  id: string;
  name: string;
  description?: string;
  image: string;
  priceCredits?: number;
  priceCash?: number;
  isActive: boolean;
  isForSale: boolean;
  stock?: number;
  createdAt: string;
}

export default function AdminPlaymatsPanel() {
  const [playmats, setPlaymats] = useState<Playmat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlaymat, setEditingPlaymat] = useState<Playmat | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image: '',
    priceCredits: 0,
    priceCash: 0,
    isActive: true,
    isForSale: true,
    stock: undefined as number | undefined,
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadPlaymats();
  }, []);

  const loadPlaymats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cosmetics/admin/playmats', {
        timeout: 20000, // 20 segundos
      });
      setPlaymats(response.data || []);
    } catch (error: any) {
      console.error('Erro ao carregar playmats:', error);
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        console.error('Timeout ao carregar playmats');
      } else if (error.code === 'ERR_NETWORK' || !error.response) {
        console.error('Erro de conexão ao carregar playmats');
      }
      setPlaymats([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      let imagePath = formData.image;

      // Se houver uma nova imagem selecionada, fazer upload primeiro
      if (selectedImageFile) {
        try {
          const imageFormData = new FormData();
          imageFormData.append('cardImage', selectedImageFile);
          imageFormData.append('cardName', formData.name || 'playmat');

          const uploadResponse = await api.post('/cards/upload-image', imageFormData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            timeout: 30000, // 30 segundos para upload de imagem
          });
          
          imagePath = uploadResponse.data.imagePath;
        } catch (uploadError: any) {
          setMessage({ 
            type: 'error', 
            text: `❌ Erro ao fazer upload da imagem: ${uploadError.response?.data?.message || uploadError.message}` 
          });
          setLoading(false);
          return;
        }
      }

      const cleanedFormData: any = {
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        image: imagePath,
        priceCredits: formData.priceCredits || 0,
        priceCash: formData.priceCash || 0,
        isActive: formData.isActive,
        isForSale: formData.isForSale,
        stock: formData.stock || null,
      };

      if (editingPlaymat) {
        await api.put(`/cosmetics/admin/playmats/${editingPlaymat.id}`, cleanedFormData);
        setMessage({ type: 'success', text: '✅ Playmat atualizado com sucesso!' });
      } else {
        await api.post('/cosmetics/admin/playmats', cleanedFormData);
        setMessage({ type: 'success', text: '✅ Playmat criado com sucesso!' });
      }

      resetForm();
      loadPlaymats();
      setShowForm(false);
    } catch (error: any) {
      console.error('❌ Erro ao salvar playmat:', error);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (playmat: Playmat) => {
    setEditingPlaymat(playmat);
    setFormData({
      name: playmat.name || '',
      description: playmat.description || '',
      image: playmat.image || '',
      priceCredits: playmat.priceCredits || 0,
      priceCash: playmat.priceCash || 0,
      isActive: playmat.isActive,
      isForSale: playmat.isForSale,
      stock: playmat.stock,
    });
    setSelectedImageFile(null);
    setImagePreview('');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar este playmat?')) return;

    try {
      await api.delete(`/cosmetics/admin/playmats/${id}`);
      setMessage({ type: 'success', text: '✅ Playmat deletado com sucesso!' });
      loadPlaymats();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || '❌ Erro ao deletar playmat' });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      image: '',
      priceCredits: 0,
      priceCash: 0,
      isActive: true,
      isForSale: true,
      stock: undefined,
    });
    setEditingPlaymat(null);
    setSelectedImageFile(null);
    setImagePreview('');
  };

  const filteredPlaymats = playmats.filter(playmat => {
    const matchesSearch = playmat.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || 
      (filter === 'active' && playmat.isActive) ||
      (filter === 'inactive' && !playmat.isActive);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">🎨 Gerenciamento de Playmats</h1>
              <p className="text-gray-300">Crie e gerencie playmats para a loja</p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
            >
              {showForm ? '❌ Cancelar' : '➕ Novo Playmat'}
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

        {/* Formulário */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-lg p-6 mb-8"
          >
            <h2 className="text-2xl font-bold mb-6">
              {editingPlaymat ? '✏️ Editar Playmat' : '➕ Novo Playmat'}
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
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Descrição</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
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
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Preço Cash</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: parseInt(e.target.value) || 0 })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Estoque (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock || ''}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                    placeholder="Ilimitado se vazio"
                  />
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-700 rounded-lg p-4">
                <label className="block text-sm font-bold mb-3">🖼️ Imagem do Playmat</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedImageFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setImagePreview(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                      setFormData({ ...formData, image: '' });
                    }
                  }}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.image}
                  onChange={(e) => {
                    setFormData({ ...formData, image: e.target.value });
                    if (e.target.value) {
                      setSelectedImageFile(null);
                      setImagePreview('');
                    }
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 mt-2"
                  placeholder="URL da imagem ou /uploads/..."
                />
                {(imagePreview || formData.image) && (
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">Preview:</p>
                    <img 
                      src={imagePreview || formData.image} 
                      alt="Preview" 
                      className="w-32 h-20 object-cover rounded-lg border-2 border-purple-500"
                    />
                  </div>
                )}
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
                  <span>À venda</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-bold transition-all disabled:opacity-50"
              >
                {loading ? '⏳ Salvando...' : editingPlaymat ? '💾 Atualizar' : '➕ Criar'}
              </button>
            </form>
          </motion.div>
        )}

        {/* Filtros */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4">
          <input
            type="text"
            placeholder="🔍 Buscar playmat..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16">
            <p className="text-2xl">⏳ Carregando...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlaymats.map((playmat) => (
              <motion.div
                key={playmat.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-gray-800 rounded-lg overflow-hidden shadow-xl border-2 ${
                  playmat.isActive ? 'border-green-500/30' : 'border-red-500/30'
                }`}
              >
                <div className={`h-48 flex items-center justify-center ${
                  playmat.isActive ? 'bg-gradient-to-br from-blue-900 to-purple-900' : 'bg-gray-700'
                }`}>
                  {playmat.image ? (
                    <img 
                      src={playmat.image.startsWith('http') ? playmat.image : `http://localhost:3000${playmat.image}`}
                      alt={playmat.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="text-6xl">🎨</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold mb-2">{playmat.name}</h3>
                  {playmat.description && (
                    <p className="text-sm text-gray-400 mb-3">{playmat.description}</p>
                  )}
                  <div className="flex gap-2 mb-3">
                    {playmat.priceCredits && (
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                        💰 {playmat.priceCredits}
                      </span>
                    )}
                    {playmat.priceCash && (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                        💵 {playmat.priceCash}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(playmat)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-bold transition-all"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDelete(playmat.id)}
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

