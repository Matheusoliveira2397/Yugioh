import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import { CardType, CardAttribute, CardRarity, MonsterType } from './types';
import CardImage from '../components/CardImage';

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

    try {
      if (editingCard) {
        // EDITAR
        console.log('💾 Atualizando carta:', editingCard.id);
        
        // Limpar e validar dados antes de enviar
        const cleanedFormData: any = {};
        
        // Campos obrigatórios
        if (formData.idCarta) cleanedFormData.idCarta = String(formData.idCarta).trim();
        if (formData.name) cleanedFormData.name = String(formData.name).trim();
        if (formData.description !== undefined) cleanedFormData.description = String(formData.description || '').trim();
        if (formData.type) cleanedFormData.type = formData.type;
        if (formData.rarity) cleanedFormData.rarity = formData.rarity;
        
        // Campos opcionais - apenas se tiverem valor
        if (formData.cardImage) cleanedFormData.cardImage = formData.cardImage;
        
        // Campos específicos de Monster
        if (formData.type === 'Monster') {
          if (formData.monsterType) cleanedFormData.monsterType = formData.monsterType;
          if (formData.attribute) cleanedFormData.attribute = formData.attribute;
          if (formData.race) cleanedFormData.race = formData.race;
          if (formData.level !== undefined && formData.level !== null) {
            cleanedFormData.level = parseInt(String(formData.level)) || null;
          }
          if (formData.rank !== undefined && formData.rank !== null) {
            cleanedFormData.rank = parseInt(String(formData.rank)) || null;
          }
          if (formData.atk !== undefined && formData.atk !== null) {
            cleanedFormData.atk = parseInt(String(formData.atk)) || null;
          }
          if (formData.def !== undefined && formData.def !== null) {
            cleanedFormData.def = parseInt(String(formData.def)) || null;
          }
        }
        
        // Campos específicos de Spell
        if (formData.type === 'Spell' && formData.spellType) {
          cleanedFormData.spellType = formData.spellType;
        }
        
        // Campos específicos de Trap
        if (formData.type === 'Trap' && formData.trapType) {
          cleanedFormData.trapType = formData.trapType;
        }
        
        // Campos gerais opcionais
        if (formData.archetype) cleanedFormData.archetype = String(formData.archetype).trim();
        if (formData.isActive !== undefined) cleanedFormData.isActive = Boolean(formData.isActive);
        if (formData.isBanned !== undefined) cleanedFormData.isBanned = Boolean(formData.isBanned);
        if (formData.maxCopiesInDeck !== undefined && formData.maxCopiesInDeck !== null) {
          cleanedFormData.maxCopiesInDeck = parseInt(String(formData.maxCopiesInDeck)) || 3;
        }
        if (formData.priceCredits !== undefined && formData.priceCredits !== null) {
          cleanedFormData.priceCredits = parseInt(String(formData.priceCredits)) || null;
        }
        if (formData.priceCash !== undefined && formData.priceCash !== null) {
          cleanedFormData.priceCash = parseFloat(String(formData.priceCash)) || null;
        }
        if (formData.isForSale !== undefined) cleanedFormData.isForSale = Boolean(formData.isForSale);
        
        // Limpar campos vazios (mas manter description, cardImage e archetype mesmo se vazios)
        Object.keys(cleanedFormData).forEach(key => {
          const value = cleanedFormData[key];
          // Remover apenas se for undefined, null ou string vazia (exceto campos que podem ser vazios)
          if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            // Manter description, cardImage e archetype mesmo se vazios (podem ser atualizados para vazio)
            if (key !== 'description' && key !== 'cardImage' && key !== 'archetype') {
              delete cleanedFormData[key];
            } else if (value === '') {
              // Para campos que podem ser vazios, manter como string vazia ou null
              cleanedFormData[key] = key === 'description' ? '' : null;
            }
          }
        });
        
        console.log('📤 Dados enviados (limpos e validados):', cleanedFormData);
        const response = await api.put(`/cards/${editingCard.id}`, cleanedFormData);
        console.log('✅ Resposta do servidor:', response.data);
        setMessage({ type: 'success', text: '✅ Carta atualizada com sucesso!' });
      } else {
        // CRIAR
        console.log('➕ Criando nova carta');
        
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
        
        console.log('📤 Dados enviados (limpos):', cleanedFormData);
        const response = await api.post('/cards', cleanedFormData);
        console.log('✅ Resposta do servidor:', response.data);
        setMessage({ type: 'success', text: '✅ Carta criada com sucesso!' });
      }

      resetForm();
      loadCards();
      setShowForm(false);
    } catch (error: any) {
      console.error('❌ Erro ao salvar carta:', error);
      console.error('❌ Detalhes do erro:', error.response?.data);
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (card: Card) => {
    console.log('✏️ Editando carta:', card);
    setEditingCard(card);
    
    // Validar se idCarta existe, se não, gerar um baseado no nome
    let idCarta = (card as any).idCarta || '';
    if (!idCarta || idCarta.trim() === '') {
      // Gerar ID baseado no nome da carta (remover espaços e caracteres especiais)
      idCarta = card.name.replace(/[^a-zA-Z0-9]/g, '');
      console.log('⚠️ idCarta não encontrado, gerando automaticamente:', idCarta);
    }
    
    const formDataToSet = {
      name: card.name || '',
      idCarta: idCarta,
      description: card.description || '',
      type: card.type || 'Monster' as CardType,
      rarity: card.rarity || 'Common' as CardRarity,
      monsterType: card.monsterType || 'Normal' as MonsterType | undefined,
      attribute: card.attribute || 'DARK' as CardAttribute | undefined,
      race: (card as any).race || 'Warrior',
      level: card.level ?? 4,
      atk: card.atk ?? 0,
      def: card.def ?? 0,
      spellType: (card as any).spellType || 'Normal',
      trapType: (card as any).trapType || 'Normal',
      priceCredits: card.priceCredits ?? 0,
      priceCash: card.priceCash ?? 0,
      isForSale: card.isForSale ?? true,
      cardImage: card.cardImage || '',
      archetype: (card as any).archetype || '',
      isBanned: (card as any).isBanned ?? false,
      maxCopiesInDeck: (card as any).maxCopiesInDeck ?? 3,
    };
    console.log('📝 FormData preenchido:', formDataToSet);
    setFormData(formDataToSet);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente desativar esta carta?')) return;

    try {
      const response = await api.delete(`/cards/${id}`);
      setMessage({ type: 'success', text: response.data?.message || '✅ Carta desativada com sucesso!' });
      loadCards();
    } catch (error: any) {
      console.error('❌ Erro ao desativar carta:', error);
      const errorMessage = error.response?.data?.message || error.message || '❌ Erro ao desativar carta';
      setMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleHardDelete = async (id: string) => {
    if (!confirm('⚠️ ATENÇÃO! Isso vai DELETAR PERMANENTEMENTE a carta do banco de dados. Tem certeza?')) return;

    try {
      const response = await api.delete(`/cards/${id}/hard`);
      setMessage({ type: 'success', text: response.data?.message || '✅ Carta deletada permanentemente!' });
      loadCards();
    } catch (error: any) {
      console.error('❌ Erro ao deletar carta:', error);
      const errorMessage = error.response?.data?.message || error.message || '❌ Erro ao deletar carta';
      setMessage({ type: 'error', text: errorMessage });
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
      type: 'Monster' as CardType,
      rarity: 'Common' as CardRarity,
      monsterType: 'Normal' as MonsterType | undefined,
      attribute: 'DARK' as CardAttribute | undefined,
      race: 'Warrior',
      level: 4,
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
          className="bg-gray-800 rounded-lg p-6 mb-8 max-h-[85vh] overflow-y-auto"
        >
          <h2 className="text-2xl font-bold mb-6">
            {editingCard ? '✏️ Editar Carta' : '➕ Nova Carta'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informações Básicas */}
            <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-bold mb-4 text-purple-400">📝 Informações Básicas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-bold mb-2">Nome da Carta *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Ex: Mago Negro"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2">🆔 ID Carta *</label>
                  <input
                    type="text"
                    required
                    value={formData.idCarta}
                    onChange={(e) => setFormData({ ...formData, idCarta: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                    placeholder="Ex: DM-001, DM-002 (para diferenciar versões)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ID único para diferenciar cartas com mesmo nome mas imagens diferentes
                  </p>
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
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

                <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
              
              {/* Máximo de Cópias no Deck */}
              <div>
                <label className="block text-sm font-bold mb-2">
                  📊 Máximo de Cópias no Deck *
                </label>
                <select
                  value={formData.maxCopiesInDeck}
                  onChange={(e) => setFormData({ ...formData, maxCopiesInDeck: Number(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <option value="0">0 - Banida (não pode ter no deck)</option>
                  <option value="1">1 - Limitada a 1 cópia</option>
                  <option value="2">2 - Limitada a 2 cópias</option>
                  <option value="3">3 - Máximo padrão (3 cópias)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Define quantas cópias desta carta podem ser colocadas no deck. 0 = banida.
                </p>
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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-2xl text-gray-300">⏳ Carregando cartas...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredCards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className={`group relative bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl overflow-hidden shadow-2xl border-2 transition-all duration-300 ${
                card.isActive 
                  ? 'border-green-500/50 hover:border-green-400 hover:shadow-green-500/20' 
                  : 'border-red-500/50 hover:border-red-400 hover:shadow-red-500/20'
              }`}
            >
              {/* Badge de Status */}
              <div className={`absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-xs font-bold shadow-lg ${
                card.isActive 
                  ? 'bg-green-500 text-white' 
                  : 'bg-red-500 text-white'
              }`}>
                {card.isActive ? '✓ ATIVA' : '✗ INATIVA'}
              </div>

              {/* Preview da Carta */}
              <div className="relative flex items-center justify-center p-4">
                <div className="relative w-full aspect-[2/3] max-w-[180px] mx-auto">
                  <CardImage
                    card={card}
                    className="w-full h-full object-cover rounded-lg shadow-xl transition-transform duration-300 group-hover:scale-105"
                    fallback="/images/fundoCarta.webp"
                  />
                  {/* Efeito de brilho */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 rounded-lg"></div>
                </div>
              </div>

              {/* Info */}
              <div className="p-5 bg-slate-900/50 backdrop-blur-sm">
                {/* Nome e Raridade */}
                <div className="mb-3">
                  <h3 className="text-xl font-bold text-white mb-1 line-clamp-1 group-hover:text-purple-300 transition-colors">
                    {card.name}
                  </h3>
                  {(card as any).idCarta && (
                    <p className="text-xs text-gray-500 font-mono mb-1">ID: {(card as any).idCarta}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      card.rarity === 'Common' ? 'bg-gray-600 text-white' :
                      card.rarity === 'Rare' ? 'bg-blue-600 text-white' :
                      card.rarity === 'Super Rare' ? 'bg-purple-600 text-white' :
                      card.rarity === 'Ultra Rare' ? 'bg-yellow-600 text-white' :
                      card.rarity === 'Secret Rare' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {card.rarity}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(card.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Descrição */}
                <p className="text-gray-400 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
                  {card.description || 'Sem descrição'}
                </p>

                {/* Stats do Monstro */}
                {card.type === 'Monster' && (
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1 bg-gradient-to-br from-yellow-900/50 to-yellow-800/50 px-3 py-2 rounded-lg text-center border border-yellow-700/50">
                      <p className="text-xs text-yellow-300 mb-1">Nível</p>
                      <p className="text-lg font-bold text-yellow-400">⭐ {card.level || 0}</p>
                    </div>
                    <div className="flex-1 bg-gradient-to-br from-red-900/50 to-red-800/50 px-3 py-2 rounded-lg text-center border border-red-700/50">
                      <p className="text-xs text-red-300 mb-1">ATK</p>
                      <p className="text-lg font-bold text-red-400">⚔️ {card.atk || 0}</p>
                    </div>
                    <div className="flex-1 bg-gradient-to-br from-blue-900/50 to-blue-800/50 px-3 py-2 rounded-lg text-center border border-blue-700/50">
                      <p className="text-xs text-blue-300 mb-1">DEF</p>
                      <p className="text-lg font-bold text-blue-400">🛡️ {card.def || 0}</p>
                    </div>
                  </div>
                )}

                {/* Preços e Loja */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  {card.priceCredits && card.priceCredits > 0 && (
                    <span className="bg-gradient-to-r from-purple-600/30 to-purple-700/30 px-3 py-1.5 rounded-lg text-sm font-semibold border border-purple-500/30">
                      💎 {card.priceCredits.toLocaleString()}
                    </span>
                  )}
                  {card.priceCash && card.priceCash > 0 && (
                    <span className="bg-gradient-to-r from-green-600/30 to-green-700/30 px-3 py-1.5 rounded-lg text-sm font-semibold border border-green-500/30">
                      💵 R$ {card.priceCash.toLocaleString()}
                    </span>
                  )}
                  {card.isForSale && (
                    <span className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-lg">
                      🛒 NA LOJA
                    </span>
                  )}
                </div>

                {/* Ações */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(card)}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all duration-200 shadow-lg hover:shadow-blue-500/50"
                  >
                    ✏️ Editar
                  </button>
                  {card.isActive ? (
                    <button
                      onClick={() => handleDelete(card.id)}
                      className="flex-1 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 px-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all duration-200 shadow-lg hover:shadow-orange-500/50"
                    >
                      🔒 Desativar
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(card.id)}
                      className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 px-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all duration-200 shadow-lg hover:shadow-green-500/50"
                    >
                      ✅ Ativar
                    </button>
                  )}
                  <button
                    onClick={() => handleHardDelete(card.id)}
                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 px-3 py-2.5 rounded-lg text-sm font-bold text-white transition-all duration-200 shadow-lg hover:shadow-red-500/50"
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
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border-2 border-slate-700"
        >
          <div className="text-8xl mb-6 animate-bounce">📦</div>
          <p className="text-3xl font-bold text-gray-300 mb-3">Nenhuma carta encontrada</p>
          <p className="text-gray-400 mb-6">Crie sua primeira carta clicando no botão "Nova Carta" acima</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/50"
          >
            ➕ Criar Primeira Carta
          </button>
        </motion.div>
      )}
    </div>
  );
}
