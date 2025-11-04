import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { CardType, CardAttribute, CardRarity, MonsterType } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Card {
  id: string;
  name: string;
  description: string;
  type: CardType;
  rarity: CardRarity;
  monsterType?: MonsterType;
  attribute?: CardAttribute;
  level?: number;
  atk?: number;
  def?: number;
  priceCoins?: number;
  priceCredits?: number;
  priceCash?: number;
  isForSale: boolean;
  isActive: boolean;
  cardImage?: string;
  effect?: any;
  createdAt: string;
}

export default function AdminCardsPanel() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'Monster' as CardType,
    rarity: 'Common' as CardRarity,
    monsterType: 'Normal' as MonsterType | undefined,
    attribute: 'DARK' as CardAttribute | undefined,
    level: 4,
    atk: 0,
    def: 0,
    priceCoins: 0,
    priceCredits: 0,
    priceCash: 0,
    isForSale: true,
    cardImage: '',
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/cards/admin/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCards(response.data);
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      
      if (editingCard) {
        // EDITAR
        await axios.put(
          `${API_URL}/api/cards/${editingCard.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessage({ type: 'success', text: '✅ Carta atualizada com sucesso!' });
      } else {
        // CRIAR
        await axios.post(
          `${API_URL}/api/cards`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessage({ type: 'success', text: '✅ Carta criada com sucesso!' });
      }

      resetForm();
      loadCards();
      setShowForm(false);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (card: Card) => {
    setEditingCard(card);
    setFormData({
      name: card.name,
      description: card.description,
      type: card.type,
      rarity: card.rarity,
      monsterType: card.monsterType,
      attribute: card.attribute,
      level: card.level || 4,
      atk: card.atk || 0,
      def: card.def || 0,
      priceCoins: card.priceCoins || 0,
      priceCredits: card.priceCredits || 0,
      priceCash: card.priceCash || 0,
      isForSale: card.isForSale,
      cardImage: card.cardImage || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente desativar esta carta?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/cards/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: '✅ Carta desativada com sucesso!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao desativar carta' });
    }
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm('⚠️ ATENÇÃO! Isso vai DELETAR PERMANENTEMENTE a carta do banco de dados. Tem certeza?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/cards/${id}/hard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: '✅ Carta deletada permanentemente!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao deletar carta' });
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/cards/${id}/activate`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: '✅ Carta reativada com sucesso!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao reativar carta' });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'Monster',
      rarity: 'Common',
      monsterType: 'Normal',
      attribute: 'DARK',
      level: 4,
      atk: 0,
      def: 0,
      priceCoins: 0,
      priceCredits: 0,
      priceCash: 0,
      isForSale: true,
      cardImage: '',
    });
    setEditingCard(null);
  };

  const filteredCards = cards
    .filter(card => {
      if (filter === 'active') return card.isActive;
      if (filter === 'inactive') return !card.isActive;
      return true;
    })
    .filter(card => 
      card.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">🎴 Painel de Cartas</h1>
            <p className="text-gray-300">Gerenciar todas as cartas do jogo</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
          >
            {showForm ? '❌ Cancelar' : '➕ Nova Carta'}
          </button>
        </div>
      </div>

      {/* Mensagem */}
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
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-gray-800 rounded-lg p-6 mb-8"
        >
          <h2 className="text-2xl font-bold mb-6">
            {editingCard ? '✏️ Editar Carta' : '➕ Nova Carta'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome e Descrição */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">Nome da Carta *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  placeholder="Ex: Dark Magician"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">URL da Imagem</label>
                <input
                  type="text"
                  value={formData.cardImage}
                  onChange={(e) => setFormData({ ...formData, cardImage: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                  placeholder="/images/cards/dark-magician.webp"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Descrição *</label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 h-24"
                placeholder="Ex: The ultimate wizard in terms of attack and defense."
              />
            </div>

            {/* Tipo e Raridade */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">Tipo *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as CardType })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                >
                  <option value="Monster">Monster</option>
                  <option value="Spell">Spell</option>
                  <option value="Trap">Trap</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Raridade *</label>
                <select
                  value={formData.rarity}
                  onChange={(e) => setFormData({ ...formData, rarity: e.target.value as CardRarity })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
                >
                  <option value="Common">Common</option>
                  <option value="Rare">Rare</option>
                  <option value="Super Rare">Super Rare</option>
                  <option value="Ultra Rare">Ultra Rare</option>
                  <option value="Secret Rare">Secret Rare</option>
                  <option value="Legendary">Legendary</option>
                </select>
              </div>
              {formData.type === 'Monster' && (
                <>
                  <div>
                    <label className="block text-sm font-bold mb-2">Tipo de Monstro</label>
                    <select
                      value={formData.monsterType || ''}
                      onChange={(e) => setFormData({ ...formData, monsterType: e.target.value as MonsterType })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Effect">Effect</option>
                      <option value="Fusion">Fusion</option>
                      <option value="Synchro">Synchro</option>
                      <option value="Xyz">Xyz</option>
                      <option value="Link">Link</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold mb-2">Atributo</label>
                    <select
                      value={formData.attribute || ''}
                      onChange={(e) => setFormData({ ...formData, attribute: e.target.value as CardAttribute })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="DARK">DARK</option>
                      <option value="LIGHT">LIGHT</option>
                      <option value="WATER">WATER</option>
                      <option value="FIRE">FIRE</option>
                      <option value="EARTH">EARTH</option>
                      <option value="WIND">WIND</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Stats de Monstro */}
            {formData.type === 'Monster' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Level</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">ATK</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.atk}
                    onChange={(e) => setFormData({ ...formData, atk: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">DEF</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.def}
                    onChange={(e) => setFormData({ ...formData, def: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  />
                </div>
              </div>
            )}

            {/* Preços */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-xl font-bold mb-4">💰 Preços</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">🪙 Moedas</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCoins}
                    onChange={(e) => setFormData({ ...formData, priceCoins: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="5000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">💎 Créditos</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCredits}
                    onChange={(e) => setFormData({ ...formData, priceCredits: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">💵 Cash (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="4.99"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isForSale}
                    onChange={(e) => setFormData({ ...formData, isForSale: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="font-bold">Disponível na Loja</span>
                </label>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
              >
                {loading ? 'Salvando...' : editingCard ? '💾 Atualizar Carta' : '✨ Criar Carta'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Filtros */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4">
        <input
          type="text"
          placeholder="🔍 Buscar carta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500"
        >
          <option value="all">Todas ({cards.length})</option>
          <option value="active">Ativas ({cards.filter(c => c.isActive).length})</option>
          <option value="inactive">Inativas ({cards.filter(c => !c.isActive).length})</option>
        </select>
      </div>

      {/* Listagem de Cartas */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-2xl">⏳ Carregando...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map((card) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`bg-gray-800 rounded-lg overflow-hidden shadow-xl border-2 ${
                card.isActive ? 'border-green-500/30' : 'border-red-500/30'
              }`}
            >
              {/* Preview da Carta */}
              <div className={`h-48 flex items-center justify-center ${
                card.isActive ? 'bg-gradient-to-br from-purple-900 to-blue-900' : 'bg-gray-700'
              }`}>
                {card.cardImage ? (
                  <img 
                    src={card.cardImage} 
                    alt={card.name}
                    className="h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '';
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <p className="text-6xl">
                    {card.type === 'Monster' ? '👹' : card.type === 'Spell' ? '📜' : '🪤'}
                  </p>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-xl font-bold">{card.name}</h3>
                    <p className="text-sm text-yellow-400 font-bold">{card.rarity}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    card.isActive ? 'bg-green-600' : 'bg-red-600'
                  }`}>
                    {card.isActive ? 'ATIVA' : 'INATIVA'}
                  </span>
                </div>

                <p className="text-gray-400 text-sm mb-3 line-clamp-2">{card.description}</p>

                {/* Stats */}
                {card.type === 'Monster' && (
                  <div className="flex gap-2 mb-3 text-sm">
                    <span className="bg-gray-700 px-2 py-1 rounded">⭐ {card.level}</span>
                    <span className="bg-red-900 px-2 py-1 rounded">⚔️ {card.atk}</span>
                    <span className="bg-blue-900 px-2 py-1 rounded">🛡️ {card.def}</span>
                  </div>
                )}

                {/* Preços */}
                <div className="flex gap-2 mb-3 text-sm flex-wrap">
                  {card.priceCoins && card.priceCoins > 0 && (
                    <span className="bg-yellow-900/30 px-2 py-1 rounded">🪙 {card.priceCoins}</span>
                  )}
                  {card.priceCredits && card.priceCredits > 0 && (
                    <span className="bg-purple-900/30 px-2 py-1 rounded">💎 {card.priceCredits}</span>
                  )}
                  {card.priceCash && card.priceCash > 0 && (
                    <span className="bg-green-900/30 px-2 py-1 rounded">💵 R$ {card.priceCash}</span>
                  )}
                  {card.isForSale && (
                    <span className="bg-green-600 px-2 py-1 rounded text-xs">🛒 NA LOJA</span>
                  )}
                </div>

                {/* Ações */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(card)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm font-bold"
                  >
                    ✏️ Editar
                  </button>
                  {card.isActive ? (
                    <button
                      onClick={() => handleDelete(card.id)}
                      className="flex-1 bg-orange-600 hover:bg-orange-700 px-3 py-2 rounded-lg text-sm font-bold"
                    >
                      🔒 Desativar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(card.id)}
                      className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg text-sm font-bold"
                    >
                      ✅ Ativar
                    </button>
                  )}
                  <button
                    onClick={() => handleHardDelete(card.id)}
                    className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg text-sm font-bold"
                    title="Deletar permanentemente"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {filteredCards.length === 0 && !loading && (
        <div className="text-center py-16 bg-gray-800 rounded-lg">
          <p className="text-6xl mb-4">📦</p>
          <p className="text-2xl text-gray-400 mb-2">Nenhuma carta encontrada</p>
          <p className="text-gray-500">Crie sua primeira carta clicando em "Nova Carta"</p>
        </div>
      )}
    </div>
  );
}
