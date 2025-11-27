import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../api/axios';
import { CardType, CardAttribute, CardRarity, MonsterType } from '../../pages/types';
import CardImage from '../CardImage';

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
    idCarta: '',
    description: '',
    type: 'Monster' as CardType,
    rarity: 'Common' as CardRarity,
    monsterType: 'Normal' as MonsterType | undefined,
    attribute: 'DARK' as CardAttribute | undefined,
    race: 'Warrior' as string | undefined,
    level: 4,
    rank: undefined as number | undefined,
    atk: 0,
    def: 0,
    spellType: 'Normal' as string | undefined,
    trapType: 'Normal' as string | undefined,
    priceCredits: 0,
    priceCash: 0,
    isForSale: true,
    cardImage: '',
    archetype: '',
    isBanned: false,
    maxCopiesInDeck: 3,
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      const response = await api.get('/cards/admin/all');
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

    // Validação do idCarta
    if (!formData.idCarta || formData.idCarta.trim() === '') {
      setMessage({ 
        type: 'error', 
        text: '❌ ID da carta (idCarta) é obrigatório!' 
      });
      setLoading(false);
      return;
    }

    // Limpar dados removendo campos que não existem mais
    const cleanedFormData: any = {};
    const allowedFields = [
      'idCarta', 'name', 'description', 'cardImage', 'type', 'monsterType',
      'attribute', 'race', 'spellType', 'trapType', 'archetype', 'level',
      'rank', 'atk', 'def', 'rarity', 'isActive', 'isBanned', 'maxCopiesInDeck',
      'priceCredits', 'priceCash', 'isForSale'
    ];
    
    for (const key of allowedFields) {
      if (formData[key as keyof typeof formData] !== undefined && formData[key as keyof typeof formData] !== null) {
        cleanedFormData[key] = formData[key as keyof typeof formData];
      }
    }

    try {
      if (editingCard) {
        // EDITAR
        console.log('📤 [CardManagement] Dados enviados (limpos):', cleanedFormData);
        await api.put(`/cards/${editingCard.id}`, cleanedFormData);
        setMessage({ type: 'success', text: '✅ Carta atualizada com sucesso!' });
      } else {
        // CRIAR
        console.log('📤 [CardManagement] Dados enviados (limpos):', cleanedFormData);
        await api.post('/cards', cleanedFormData);
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
    
    // Validar se idCarta existe, se não, gerar um baseado no nome
    let idCarta = (card as any).idCarta || '';
    if (!idCarta || idCarta.trim() === '') {
      idCarta = card.name.replace(/[^a-zA-Z0-9]/g, '');
    }
    
    setFormData({
      name: card.name,
      idCarta: idCarta,
      description: card.description || '',
      type: card.type,
      rarity: card.rarity,
      monsterType: card.monsterType,
      attribute: card.attribute,
      race: (card as any).race || 'Warrior',
      level: card.level || 4,
      rank: (card as any).rank,
      atk: card.atk || 0,
      def: card.def || 0,
      spellType: (card as any).spellType || 'Normal',
      trapType: (card as any).trapType || 'Normal',
      priceCredits: card.priceCredits || 0,
      priceCash: card.priceCash || 0,
      isForSale: card.isForSale ?? true,
      cardImage: card.cardImage || '',
      archetype: (card as any).archetype || '',
      isBanned: (card as any).isBanned || false,
      maxCopiesInDeck: (card as any).maxCopiesInDeck || 3,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente desativar esta carta?')) return;

    try {
      await api.delete(`/cards/${id}`);
      setMessage({ type: 'success', text: '✅ Carta desativada com sucesso!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao desativar carta' });
    }
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm('⚠️ ATENÇÃO! Isso vai DELETAR PERMANENTEMENTE a carta do banco de dados. Tem certeza?')) return;

    try {
      await api.delete(`/cards/${id}/hard`);
      setMessage({ type: 'success', text: '✅ Carta deletada permanentemente!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao deletar carta' });
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/cards/${id}/activate`, {});
      setMessage({ type: 'success', text: '✅ Carta reativada com sucesso!' });
      loadCards();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao reativar carta' });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      idCarta: '',
      description: '',
      type: 'Monster',
      rarity: 'Common',
      monsterType: 'Normal',
      attribute: 'DARK',
      race: 'Warrior',
      level: 4,
      rank: undefined,
      atk: 0,
      def: 0,
      spellType: 'Normal',
      trapType: 'Normal',
      priceCredits: 0,
      priceCash: 0,
      isForSale: true,
      cardImage: '',
      archetype: '',
      isBanned: false,
      maxCopiesInDeck: 3,
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
            <h1 className="text-4xl font-bold mb-2">🎴 Gerenciamento de Cartas</h1>
            <p className="text-gray-300">Crie e gerencie todas as cartas do jogo</p>
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
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-lg p-6 mb-8 max-h-[90vh] overflow-y-auto relative"
        >
          <div className="sticky top-0 bg-gray-800 z-10 pb-4 mb-2 border-b-2 border-purple-500 shadow-lg">
            <h2 className="text-2xl font-bold">
              {editingCard ? '✏️ Editar Carta' : '➕ Nova Carta'}
            </h2>
            <div className="mt-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-l-4 border-yellow-500 p-3 rounded flex items-center justify-between">
              <p className="text-sm font-bold text-yellow-300 animate-pulse">
                ⬇️⬇️⬇️ IMPORTANTE: ROLE PARA BAIXO para adicionar PREÇOS (Moedas, Créditos, Cash) ⬇️⬇️⬇️
              </p>
              <button
                type="button"
                onClick={(e) => {
                  const formElement = (e.target as HTMLElement).closest('form');
                  if (formElement) {
                    formElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }
                }}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-bold text-xs whitespace-nowrap ml-4"
              >
                ⬇️ IR PARA PREÇOS
              </button>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informações Básicas */}
            <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-purple-400">📝 Informações Básicas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Nome da Carta (PT) *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Ex: Mago Negro"
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-bold mb-2">Descrição *</label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 h-24 transition-colors"
                  placeholder="Ex: The ultimate wizard in terms of attack and defense."
                />
              </div>

              {/* Upload de Imagem */}
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-4 hover:border-purple-500 transition-colors">
                <label className="block text-sm font-bold mb-3">🖼️ Imagem da Carta</label>
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setFormData({ ...formData, cardImage: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="block w-full text-sm text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-bold
                        file:bg-purple-600 file:text-white
                        hover:file:bg-purple-700 cursor-pointer"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      ou cole uma URL de imagem no campo abaixo
                    </p>
                    <input
                      type="text"
                      value={formData.cardImage}
                      onChange={(e) => setFormData({ ...formData, cardImage: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 mt-2"
                      placeholder="https://exemplo.com/carta.jpg"
                    />
                  </div>
                  {formData.cardImage && (
                    <div className="flex-shrink-0">
                      <p className="text-xs text-gray-500 mb-2">Preview:</p>
                      <img 
                        src={formData.cardImage} 
                        alt="Preview" 
                        className="w-32 h-44 object-contain rounded-lg border-2 border-purple-500"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tipo e Raridade */}
            <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-purple-400">🎯 Tipo e Classificação</h3>
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
            </div>

            {/* Stats de Monstro */}
            {formData.type === 'Monster' && (
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">⚔️ Atributos de Monstro</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-bold mb-2">Raça/Race *</label>
                    <select
                      value={formData.race || ''}
                      onChange={(e) => setFormData({ ...formData, race: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    >
                      <option value="Warrior">Warrior (Guerreiro)</option>
                      <option value="Spellcaster">Spellcaster (Mago)</option>
                      <option value="Dragon">Dragon (Dragão)</option>
                      <option value="Zombie">Zombie (Zumbi)</option>
                      <option value="Fiend">Fiend (Demônio)</option>
                      <option value="Machine">Machine (Máquina)</option>
                      <option value="Aqua">Aqua (Aquático)</option>
                      <option value="Pyro">Pyro (Piro)</option>
                      <option value="Rock">Rock (Rocha)</option>
                      <option value="Winged Beast">Winged Beast (Besta Alada)</option>
                      <option value="Plant">Plant (Planta)</option>
                      <option value="Insect">Insect (Inseto)</option>
                      <option value="Thunder">Thunder (Trovão)</option>
                      <option value="Beast">Beast (Besta)</option>
                      <option value="Beast-Warrior">Beast-Warrior (Besta-Guerreiro)</option>
                      <option value="Dinosaur">Dinosaur (Dinossauro)</option>
                      <option value="Fish">Fish (Peixe)</option>
                      <option value="Sea Serpent">Sea Serpent (Serpente Marinha)</option>
                      <option value="Reptile">Reptile (Réptil)</option>
                      <option value="Psychic">Psychic (Psíquico)</option>
                      <option value="Divine-Beast">Divine-Beast (Besta Divina)</option>
                      <option value="Creator God">Creator God (Deus Criador)</option>
                      <option value="Wyrm">Wyrm (Wyrm)</option>
                      <option value="Cyberse">Cyberse (Ciberse)</option>
                      <option value="Fairy">Fairy (Fada)</option>
                    </select>
                  </div>
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
                    <label className="block text-sm font-bold mb-2">Rank (Xyz)</label>
                    <input
                      type="number"
                      min="1"
                      max="13"
                      value={formData.rank || ''}
                      onChange={(e) => setFormData({ ...formData, rank: Number(e.target.value) || undefined })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                      placeholder="Apenas para Xyz"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  <div>
                    <label className="block text-sm font-bold mb-2">Arquétipo</label>
                    <input
                      type="text"
                      value={formData.archetype}
                      onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                      placeholder="Ex: Blue-Eyes"
                    />
                  </div>
                </div>

              </div>
            )}

            {/* Campos de Spell */}
            {formData.type === 'Spell' && (
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">✨ Atributos de Magia</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Tipo de Magia</label>
                  <select
                    value={formData.spellType || 'Normal'}
                    onChange={(e) => setFormData({ ...formData, spellType: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Quick-Play">Quick-Play (Jogo Rápido)</option>
                    <option value="Continuous">Continuous (Contínua)</option>
                    <option value="Equip">Equip (Equipamento)</option>
                    <option value="Field">Field (Campo)</option>
                    <option value="Ritual">Ritual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Arquétipo</label>
                  <input
                    type="text"
                    value={formData.archetype}
                    onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="Ex: Dark Magician"
                  />
                </div>
              </div>
              </div>
            )}

            {/* Campos de Trap */}
            {formData.type === 'Trap' && (
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 text-purple-400">🪤 Atributos de Armadilha</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Tipo de Armadilha</label>
                  <select
                    value={formData.trapType || 'Normal'}
                    onChange={(e) => setFormData({ ...formData, trapType: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Continuous">Continuous (Contínua)</option>
                    <option value="Counter">Counter (Contra-Armadilha)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">Arquétipo</label>
                  <input
                    type="text"
                    value={formData.archetype}
                    onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
                    placeholder="Ex: Solemn"
                  />
                </div>
              </div>
              </div>
            )}

            {/* Preços e Configurações */}
            <div className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-lg p-6 border border-purple-500/50">
              <h3 className="text-xl font-bold mb-6 text-purple-300">💰 Preços e Disponibilidade</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Card Moedas */}
                {/* Card Créditos */}
                <div className="bg-gray-800/50 rounded-lg p-4 border-2 border-purple-500/30 hover:border-purple-500 transition-colors">
                  <label className="flex items-center gap-2 text-sm font-bold mb-2 text-purple-400">
                    <span className="text-xl">💎</span> Créditos
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceCredits}
                    onChange={(e) => setFormData({ ...formData, priceCredits: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Ex: 100"
                  />
                  <p className="text-xs text-gray-500 mt-2">Moeda premium</p>
                </div>

                {/* Card Cash */}
                <div className="bg-gray-800/50 rounded-lg p-4 border-2 border-green-500/30 hover:border-green-500 transition-colors">
                  <label className="flex items-center gap-2 text-sm font-bold mb-2 text-green-400">
                    <span className="text-xl">💵</span> Cash (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.priceCash}
                    onChange={(e) => setFormData({ ...formData, priceCash: Number(e.target.value) })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500 transition-colors"
                    placeholder="Ex: 4.99"
                  />
                  <p className="text-xs text-gray-500 mt-2">Dinheiro real</p>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-3 bg-gray-800/50 px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors border border-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isForSale}
                    onChange={(e) => setFormData({ ...formData, isForSale: e.target.checked })}
                    className="w-5 h-5 accent-green-500"
                  />
                  <span className="font-bold text-green-400">🛒 Disponível na Loja</span>
                </label>
                <label className="flex items-center gap-3 bg-gray-800/50 px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors border border-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isBanned}
                    onChange={(e) => setFormData({ ...formData, isBanned: e.target.checked })}
                    className="w-5 h-5 accent-red-500"
                  />
                  <span className="font-bold text-red-400">🚫 Carta Banida</span>
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
                <CardImage
                  card={card}
                  className="h-full object-contain"
                  fallback="linear-gradient(to bottom, #1e3a8a, #7c3aed, #dc2626)"
                />
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
