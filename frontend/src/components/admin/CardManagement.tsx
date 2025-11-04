import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../../stores/authStore';

interface Card {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  cardImage: string;
  type: 'Monster' | 'Spell' | 'Trap';
  monsterType?: string;
  attribute?: string;
  race?: string;
  level?: number;
  atk?: number;
  def?: number;
  rarity: string;
  isActive: boolean;
}

export default function CardManagement() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [formData, setFormData] = useState<Partial<Card>>({
    type: 'Monster',
    rarity: 'Common',
    isActive: true,
  });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const { token } = useAuthStore();

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      const response = await axios.get('http://localhost:3000/cards/admin/all', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCards(response.data);
    } catch (error) {
      console.error('Erro ao buscar cartas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let imagePath = formData.cardImage;

      // Se houver uma nova imagem selecionada, faz upload primeiro
      if (selectedImage) {
        const imageFormData = new FormData();
        imageFormData.append('cardImage', selectedImage);
        imageFormData.append('cardName', formData.name || 'card');

        const uploadResponse = await axios.post(
          'http://localhost:3000/cards/upload-image',
          imageFormData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        imagePath = uploadResponse.data.imagePath;
      }

      // Salva a carta com o caminho da imagem
      const cardDataToSave = { ...formData, cardImage: imagePath };

      if (editingCard) {
        await axios.put(
          `http://localhost:3000/cards/${editingCard.id}`,
          cardDataToSave,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post('http://localhost:3000/cards', cardDataToSave, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      
      setShowModal(false);
      setEditingCard(null);
      setFormData({ type: 'Monster', rarity: 'Common', isActive: true });
      setSelectedImage(null);
      setImagePreview('');
      fetchCards();
    } catch (error: any) {
      console.error('Erro completo:', error);
      console.error('Response:', error.response?.data);
      const errorMessage = error.response?.data?.message || error.message || 'Erro desconhecido';
      alert(`Erro ao salvar carta: ${errorMessage}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja desativar esta carta?')) return;
    try {
      await axios.delete(`http://localhost:3000/cards/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchCards();
    } catch (error) {
      console.error('Erro ao deletar carta:', error);
    }
  };

  const openEditModal = (card: Card) => {
    setEditingCard(card);
    setFormData(card);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingCard(null);
    setFormData({ type: 'Monster', rarity: 'Common', isActive: true });
    setShowModal(true);
  };

  if (loading) {
    return <div className="text-center text-white text-xl">Carregando...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Gerenciamento de Cartas</h2>
          <p className="text-slate-400">{cards.length} cartas no total</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-green-500/50 transition-all"
        >
          ➕ Nova Carta
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <motion.div
            key={card.id}
            layout
            className={`
              bg-slate-900/50 border rounded-lg p-4 hover:shadow-xl transition-all
              ${card.isActive ? 'border-slate-700' : 'border-red-500/50 opacity-50'}
            `}
          >
            {card.cardImage && (
              <img
                src={`http://localhost:3000${card.cardImage}`}
                alt={card.name}
                className="w-full h-48 object-contain mb-3 bg-slate-800 rounded"
              />
            )}
            <h3 className="text-white font-bold text-lg mb-1">{card.name}</h3>
            <p className="text-slate-400 text-sm mb-2">{card.nameEn}</p>
            <div className="flex gap-2 mb-3 flex-wrap">
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                {card.type}
              </span>
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                {card.rarity}
              </span>
              {card.level && (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                  ⭐ {card.level}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => openEditModal(card)}
                className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
              >
                ✏️ Editar
              </button>
              <button
                onClick={() => handleDelete(card.id)}
                className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition"
              >
                🗑️ Deletar
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-6">
                {editingCard ? '✏️ Editar Carta' : '➕ Nova Carta'}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 mb-2">Nome (PT) <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-2">Nome (EN) <span className="text-slate-500 text-xs">(opcional)</span></label>
                    <input
                      type="text"
                      value={formData.nameEn || ''}
                      onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                      className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-2">Descrição <span className="text-slate-500 text-xs">(opcional)</span></label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 mb-2">Tipo</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                    >
                      <option value="Monster">Monster</option>
                      <option value="Spell">Spell</option>
                      <option value="Trap">Trap</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-2">Raridade</label>
                    <select
                      value={formData.rarity}
                      onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                      className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                    >
                      <option value="Common">Common</option>
                      <option value="Rare">Rare</option>
                      <option value="Super Rare">Super Rare</option>
                      <option value="Ultra Rare">Ultra Rare</option>
                      <option value="Secret Rare">Secret Rare</option>
                      <option value="Legendary">Legendary</option>
                    </select>
                  </div>
                </div>

                {formData.type === 'Monster' && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-2">Level</label>
                      <input
                        type="number"
                        value={formData.level || ''}
                        onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) })}
                        className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-2">ATK</label>
                      <input
                        type="number"
                        value={formData.atk || ''}
                        onChange={(e) => setFormData({ ...formData, atk: parseInt(e.target.value) })}
                        className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-2">DEF</label>
                      <input
                        type="number"
                        value={formData.def || ''}
                        onChange={(e) => setFormData({ ...formData, def: parseInt(e.target.value) })}
                        className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 mb-2">📸 Imagem da Carta</label>
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full bg-slate-900 text-white px-4 py-2 rounded border border-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer"
                    />
                    {imagePreview && (
                      <div className="relative w-full h-48 bg-slate-800 rounded border border-slate-700">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    {!imagePreview && formData.cardImage && (
                      <div className="relative w-full h-48 bg-slate-800 rounded border border-slate-700">
                        <img
                          src={`http://localhost:3000${formData.cardImage}`}
                          alt="Current"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-6 py-3 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-600 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition"
                  >
                    {editingCard ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
