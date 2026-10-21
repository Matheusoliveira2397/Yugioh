import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import CardImage from '../components/CardImage';
import { getCardDescription } from '../utils/cardDescription';

interface InitialDeckCard {
  id: string;
  cardId: string;
  quantity: number;
  isExtraDeck?: boolean;
  card: {
    id: string;
    name: string;
    type: string;
    monsterType?: string;
    cardImage?: string;
    idCarta?: string;
  };
}

interface InitialDeck {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  cards: InitialDeckCard[];
  createdAt: string;
  updatedAt: string;
}

interface Card {
  id: string;
  name: string;
  type: string;
  monsterType?: string;
  attribute?: string;
  rarity?: string;
  description?: string;
  race?: string;
  spellType?: string;
  trapType?: string;
  archetype?: string;
  level?: number;
  rank?: number;
  atk?: number;
  def?: number;
  linkRating?: number;
  cardImage?: string;
  idCarta?: string;
  maxCopiesInDeck?: number;
  isActive?: boolean;
  isBanned?: boolean;
}

const PICKER_MONSTER_TYPES = [
  'Normal',
  'Effect',
  'Ritual',
  'Fusion',
  'Synchro',
  'Xyz',
  'Pendulum',
  'Link',
] as const;

const PICKER_ATTRIBUTES = [
  'DARK',
  'LIGHT',
  'WATER',
  'FIRE',
  'EARTH',
  'WIND',
  'DIVINE',
] as const;

/** Raças de monstro (alinhado ao cadastro de cartas) */
const PICKER_RACES = [
  'Warrior',
  'Spellcaster',
  'Dragon',
  'Zombie',
  'Fiend',
  'Machine',
  'Aqua',
  'Pyro',
  'Rock',
  'Winged Beast',
  'Plant',
  'Insect',
  'Thunder',
  'Beast',
  'Beast-Warrior',
  'Dinosaur',
  'Fish',
  'Sea Serpent',
  'Reptile',
  'Psychic',
  'Divine-Beast',
  'Creator God',
  'Wyrm',
  'Cyberse',
  'Fairy',
] as const;

const EXTRA_DECK_MONSTER_TYPES = ['Fusion', 'Synchro', 'Xyz', 'Link'];
function isExtraDeckCard(card: Card): boolean {
  return !!card.monsterType && EXTRA_DECK_MONSTER_TYPES.includes(card.monsterType);
}

export default function AdminInitialDecksPanel() {
  const [decks, setDecks] = useState<InitialDeck[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDeck, setEditingDeck] = useState<InitialDeck | null>(null);
  /** Filtro da lista de decks iniciais (fora do formulário) */
  const [deckListSearch, setDeckListSearch] = useState('');
  /** Busca e filtros só no seletor de cartas do formulário */
  const [cardPickerSearch, setCardPickerSearch] = useState('');
  const [pickerType, setPickerType] = useState('all');
  const [pickerRarity, setPickerRarity] = useState('all');
  const [pickerMonsterType, setPickerMonsterType] = useState('all');
  const [pickerAttribute, setPickerAttribute] = useState('all');
  const [pickerRace, setPickerRace] = useState('all');
  const [pickerAtkMin, setPickerAtkMin] = useState('');
  const [pickerAtkMax, setPickerAtkMax] = useState('');
  const [pickerSort, setPickerSort] = useState<
    'name_asc' | 'name_desc' | 'rarity_desc' | 'atk_asc' | 'atk_desc'
  >('name_asc');
  /** Cartas do deck em composição: miniaturas maiores */
  const [deckPreviewLarge, setDeckPreviewLarge] = useState(false);
  /** Modal: detalhes completos da carta (efeito, raça, etc.) */
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    cards: [] as Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }>,
  });

  useEffect(() => {
    loadDecks();
    loadAllCards();
  }, []);

  // Auto-dismiss mensagens de erro após 5 segundos
  useEffect(() => {
    if (message?.type === 'error') {
      const timer = setTimeout(() => {
        setMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const loadDecks = async () => {
    try {
      const response = await api.get('/initial-decks');
      setDecks(response.data);
    } catch (error) {
      console.error('Erro ao carregar decks iniciais:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar decks iniciais' });
    } finally {
      setLoading(false);
    }
  };

  const loadAllCards = async () => {
    try {
      const response = await api.get('/cards/admin/all');
      // Manter cartas ativas; se isActive não vier da API, manter a carta
      const list = Array.isArray(response.data) ? response.data : [];
      setAllCards(list.filter((card: Card) => card.isActive !== false));
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
      setAllCards([]);
    }
  };

  const getTotalCardsInDeck = () => {
    return formData.cards.reduce((sum, c) => sum + c.quantity, 0);
  };

  const getMainDeckCount = () => formData.cards.filter((c) => !c.isExtraDeck).reduce((sum, c) => sum + c.quantity, 0);
  const getExtraDeckCount = () => formData.cards.filter((c) => c.isExtraDeck).reduce((sum, c) => sum + c.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Nome do deck é obrigatório' });
      setLoading(false);
      return;
    }

    if (formData.cards.length === 0) {
      setMessage({ type: 'error', text: 'Adicione pelo menos uma carta ao deck' });
      setLoading(false);
      return;
    }

    const mainCount = getMainDeckCount();
    const extraCount = getExtraDeckCount();
    if (mainCount < 40) {
      setMessage({ type: 'error', text: `❌ O deck principal deve ter no mínimo 40 cartas! (Atual: ${mainCount})` });
      setLoading(false);
      return;
    }
    if (mainCount > 60) {
      setMessage({ type: 'error', text: `❌ O deck principal deve ter no máximo 60 cartas! (Atual: ${mainCount})` });
      setLoading(false);
      return;
    }
    if (extraCount > 15) {
      setMessage({ type: 'error', text: `❌ O deck adicional deve ter no máximo 15 cartas! (Atual: ${extraCount})` });
      setLoading(false);
      return;
    }

    // Validar se todas as cartas respeitam o limite de maxCopiesInDeck
    for (const deckCard of formData.cards) {
      const card = allCards.find((c) => c.id === deckCard.cardId);
      if (card) {
        const maxCopies = card.maxCopiesInDeck ?? 3;
        if (maxCopies === 0) {
          setMessage({ type: 'error', text: `❌ A carta "${card.name}" está banida e não pode estar no deck!` });
          setLoading(false);
          return;
        }
        if (deckCard.quantity > maxCopies) {
          setMessage({ type: 'error', text: `❌ A carta "${card.name}" pode ter no máximo ${maxCopies} cópia(s) no deck! (Atual: ${deckCard.quantity})` });
          setLoading(false);
          return;
        }
      }
    }

    try {
      if (editingDeck) {
        await api.put(`/initial-decks/${editingDeck.id}`, formData);
        setMessage({ type: 'success', text: 'Deck inicial atualizado com sucesso!' });
      } else {
        await api.post('/initial-decks', formData);
        setMessage({ type: 'success', text: 'Deck inicial criado com sucesso!' });
      }

      setShowForm(false);
      resetForm();
      loadDecks();
    } catch (error: any) {
      console.error('Erro ao salvar deck:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao salvar deck inicial',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (deck: InitialDeck) => {
    setEditingDeck(deck);
    setFormData({
      name: deck.name,
      description: deck.description || '',
      isActive: deck.isActive,
      cards: deck.cards.map((dc) => ({
        cardId: dc.cardId,
        quantity: dc.quantity,
        isExtraDeck: !!(dc as InitialDeckCard).isExtraDeck,
      })),
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este deck inicial?')) {
      return;
    }

    try {
      await api.delete(`/initial-decks/${id}`);
      setMessage({ type: 'success', text: 'Deck inicial removido com sucesso!' });
      loadDecks();
    } catch (error: any) {
      console.error('Erro ao remover deck:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao remover deck inicial',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      isActive: true,
      cards: [],
    });
    setEditingDeck(null);
    setCardPickerSearch('');
    setPickerType('all');
    setPickerRarity('all');
    setPickerMonsterType('all');
    setPickerAttribute('all');
    setPickerRace('all');
    setPickerAtkMin('');
    setPickerAtkMax('');
    setPickerSort('name_asc');
    setDeckPreviewLarge(false);
  };

  const addCardToDeck = (cardId: string) => {
    const idStr = String(cardId);
    const card = allCards.find((c) => String(c.id) === idStr);
    if (!card) return;

    const maxCopies = card.maxCopiesInDeck ?? 3;
    
    // Se maxCopies é 0, a carta está banida
    if (maxCopies === 0) {
      setMessage({ type: 'error', text: `❌ Esta carta está banida e não pode ser adicionada ao deck!` });
      return;
    }

    // Contar por nome da carta (considera todas as skins)
    const cardName = card.name;
    const cardsWithSameName = formData.cards.filter((c) => {
      const foundCard = allCards.find((ac) => ac.id === c.cardId);
      return foundCard && foundCard.name === cardName;
    });
    const currentQuantity = cardsWithSameName.reduce((sum, c) => sum + c.quantity, 0);

    // Verificar se já atingiu o limite máximo de cópias
    if (currentQuantity >= maxCopies) {
      setMessage({ 
        type: 'error', 
        text: `❌ Você já atingiu o limite máximo de ${maxCopies} cópia(s) desta carta no deck! (considerando todas as skins)` 
      });
      return;
    }

    const isExtra = isExtraDeckCard(card);
    if (isExtra) {
      if (getExtraDeckCount() >= 15) {
        setMessage({ type: 'error', text: '❌ O deck adicional já tem o máximo de 15 cartas!' });
        return;
      }
    } else {
      if (getMainDeckCount() >= 60) {
        setMessage({ type: 'error', text: '❌ O deck principal já tem o máximo de 60 cartas!' });
        return;
      }
    }

    const existingCard = formData.cards.find((c) => String(c.cardId) === idStr);
    if (existingCard) {
      setFormData({
        ...formData,
        cards: formData.cards.map((c) =>
          String(c.cardId) === idStr ? { ...c, quantity: c.quantity + 1 } : c
        ),
      });
    } else {
      setFormData({
        ...formData,
        cards: [...formData.cards, { cardId: card.id, quantity: 1, isExtraDeck: isExtra }],
      });
    }
    setMessage(null);
  };

  const removeCardFromDeck = (cardId: string) => {
    setFormData({
      ...formData,
      cards: formData.cards.filter((c) => c.cardId !== cardId),
    });
  };

  const updateCardQuantity = (cardId: string, quantity: number) => {
    if (quantity <= 0) {
      removeCardFromDeck(cardId);
      return;
    }

    const card = allCards.find((c) => c.id === cardId);
    if (!card) return;

    const maxCopies = card.maxCopiesInDeck ?? 3;
    
    // Verificar se a quantidade excede o limite máximo
    if (quantity > maxCopies) {
      setMessage({ 
        type: 'error', 
        text: `❌ Esta carta pode ter no máximo ${maxCopies} cópia(s) no deck!` 
      });
      return;
    }

    const existingCard = formData.cards.find((c) => c.cardId === cardId);
    const currentQuantity = existingCard ? existingCard.quantity : 0;
    const isExtra = existingCard?.isExtraDeck ?? false;
    if (isExtra) {
      const extraTotal = getExtraDeckCount() - currentQuantity + quantity;
      if (extraTotal > 15) {
        setMessage({ type: 'error', text: `❌ O deck adicional não pode ter mais de 15 cartas!` });
        return;
      }
    } else {
      const mainTotal = getMainDeckCount() - currentQuantity + quantity;
      if (mainTotal > 60) {
        setMessage({ type: 'error', text: `❌ O deck principal não pode ter mais de 60 cartas!` });
        return;
      }
    }

    setFormData({
      ...formData,
      cards: formData.cards.map((c) =>
        c.cardId === cardId ? { ...c, quantity } : c
      ),
    });
    setMessage(null);
  };

  const filteredDecks = useMemo(
    () =>
      decks.filter((deck) => {
        const q = deckListSearch.trim().toLowerCase();
        if (!q) return true;
        return (
          deck.name.toLowerCase().includes(q) ||
          (deck.description || '').toLowerCase().includes(q)
        );
      }),
    [decks, deckListSearch],
  );

  const filteredCardsForPicker = useMemo(() => {
    const q = cardPickerSearch.trim().toLowerCase();
    const rarityOrder: Record<string, number> = {
      Common: 0,
      Rare: 1,
      'Super Rare': 2,
      'Ultra Rare': 3,
      'Secret Rare': 4,
      Legendary: 5,
    };
    const list = allCards.filter((card) => {
      const desc = (card.description && String(card.description).toLowerCase()) || '';
      const nameOk =
        !q || card.name.toLowerCase().includes(q) || desc.includes(q);
      const typeOk =
        pickerType === 'all' ||
        (card.type && card.type.toLowerCase() === pickerType.toLowerCase());
      const rarityOk =
        pickerRarity === 'all' || (card.rarity || 'Common') === pickerRarity;
      const mtOk =
        pickerMonsterType === 'all' ||
        (card.type === 'Monster' &&
          (card.monsterType || '') === pickerMonsterType);
      const attrOk =
        pickerAttribute === 'all' ||
        (card.type === 'Monster' &&
          String(card.attribute || '')
            .toUpperCase()
            .trim() === pickerAttribute.toUpperCase());
      const raceOk =
        pickerRace === 'all' ||
        (card.type === 'Monster' &&
          String(card.race || '').trim().toLowerCase() ===
            pickerRace.trim().toLowerCase());
      const atkOn =
        (pickerAtkMin !== '' && pickerAtkMin != null) ||
        (pickerAtkMax !== '' && pickerAtkMax != null);
      let atkOk = true;
      if (atkOn) {
        if (card.type !== 'Monster') atkOk = true;
        else {
          const atk = Number(card.atk ?? 0);
          if (
            pickerAtkMin !== '' &&
            !Number.isNaN(Number(pickerAtkMin)) &&
            atk < Number(pickerAtkMin)
          )
            atkOk = false;
          if (
            pickerAtkMax !== '' &&
            !Number.isNaN(Number(pickerAtkMax)) &&
            atk > Number(pickerAtkMax)
          )
            atkOk = false;
        }
      }
      return nameOk && typeOk && rarityOk && mtOk && attrOk && raceOk && atkOk;
    });
    return [...list].sort((a, b) => {
      if (pickerSort === 'name_desc') {
        return (b.name || '').localeCompare(a.name || '', 'pt-BR');
      }
      if (pickerSort === 'rarity_desc') {
        return (
          (rarityOrder[b.rarity || 'Common'] ?? 0) -
          (rarityOrder[a.rarity || 'Common'] ?? 0)
        );
      }
      if (pickerSort === 'atk_asc' || pickerSort === 'atk_desc') {
        const dir = pickerSort === 'atk_asc' ? 'asc' : 'desc';
        const tier = (c: (typeof list)[0]) => (c.type === 'Monster' ? 0 : 1);
        const t = tier(a) - tier(b);
        if (t !== 0) return t;
        const atkA = a.type === 'Monster' ? Number(a.atk ?? 0) : 0;
        const atkB = b.type === 'Monster' ? Number(b.atk ?? 0) : 0;
        const byAtk = dir === 'asc' ? atkA - atkB : atkB - atkA;
        if (byAtk !== 0) return byAtk;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      }
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    });
  }, [
    allCards,
    cardPickerSearch,
    pickerType,
    pickerRarity,
    pickerMonsterType,
    pickerAttribute,
    pickerRace,
    pickerAtkMin,
    pickerAtkMax,
    pickerSort,
  ]);

  const getCardInDeck = (cardId: string) => {
    const idStr = String(cardId);
    return formData.cards.find((c) => String(c.cardId) === idStr);
  };

  if (loading && decks.length === 0) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="text-white text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                🎴 Gerenciar Decks Iniciais
              </h1>
              <p className="text-slate-400">
                Crie e gerencie decks iniciais que serão atribuídos aleatoriamente aos novos jogadores
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg font-bold text-white transition-all shadow-lg"
            >
              + Novo Deck
            </button>
          </div>
        </motion.div>

        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                : 'bg-red-500/20 border border-red-500/50 text-red-300'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        {/* Form */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700"
          >
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingDeck ? 'Editar Deck Inicial' : 'Novo Deck Inicial'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-white mb-2">Nome do Deck *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-white mb-2">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  className="w-5 h-5"
                />
                <label htmlFor="isActive" className="text-white">
                  Deck ativo (será considerado na seleção aleatória)
                </label>
              </div>

              {/* Cartas no Deck */}
              <div>
                <div className="flex flex-col gap-3 mb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-white font-medium">
                      Composição do deck ({formData.cards.length} tipos • {getTotalCardsInDeck()} cartas)
                    </label>
                    <div className="flex flex-wrap gap-3 text-sm font-bold">
                      <span className={getMainDeckCount() < 40 ? 'text-yellow-400' : getMainDeckCount() > 60 ? 'text-red-400' : 'text-green-400'}>
                        Principal: {getMainDeckCount()}/40–60
                      </span>
                      <span className={getExtraDeckCount() > 15 ? 'text-red-400' : 'text-emerald-400'}>
                        Adicional: {getExtraDeckCount()}/15
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-400 text-xs uppercase tracking-wide">Visualização</span>
                    <button
                      type="button"
                      onClick={() => setDeckPreviewLarge(false)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        !deckPreviewLarge
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      Compacta
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeckPreviewLarge(true)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        deckPreviewLarge
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      Cartas maiores
                    </button>
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 min-h-[200px] max-h-[min(560px,70vh)] overflow-y-auto space-y-4 border border-slate-700/80">
                  {formData.cards.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">
                      Nenhuma carta adicionada. Use a lista abaixo para adicionar cartas. Cartas Fusion, Synchro, Xyz e Link vão para o Deck Adicional.
                    </p>
                  ) : (
                    <>
                      <div>
                        <h4 className="text-sm font-bold text-blue-300 mb-2">Deck Principal ({getMainDeckCount()} cartas)</h4>
                        <div
                          className={
                            deckPreviewLarge
                              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
                              : 'grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3'
                          }
                        >
                      {formData.cards.filter((c) => !c.isExtraDeck).map((deckCard) => {
                        const card = allCards.find((c) => c.id === deckCard.cardId);
                        if (!card) return null;

                        const maxCopies = card.maxCopiesInDeck ?? 3;
                        const isAtMax = deckCard.quantity >= maxCopies;

                        return (
                          <div
                            key={deckCard.cardId}
                            className={`bg-slate-800 rounded-lg border border-slate-700 transition-all hover:border-blue-500 ${
                              deckPreviewLarge ? 'p-3' : 'p-2'
                            }`}
                          >
                            <div className={`relative mb-2 ${deckPreviewLarge ? 'max-w-[120px] mx-auto' : ''}`}>
                              <CardImage
                                card={card}
                                className="w-full aspect-[59/86] rounded"
                                fallback="/images/fundoCarta.webp"
                              />
                              {isAtMax && (
                                <div className="absolute top-1 right-1 bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">
                                  MAX
                                </div>
                              )}
                            </div>
                            <div className="text-white text-xs font-bold mb-1 truncate" title={card.name}>
                              {card.name}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCardQuantity(
                                    deckCard.cardId,
                                    deckCard.quantity - 1
                                  )
                                }
                                className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs"
                              >
                                -
                              </button>
                              <span className={`text-xs font-bold flex-1 text-center ${
                                isAtMax ? 'text-yellow-400' : 'text-white'
                              }`}>
                                {deckCard.quantity}/{maxCopies}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateCardQuantity(
                                    deckCard.cardId,
                                    deckCard.quantity + 1
                                  )
                                }
                                disabled={isAtMax}
                                className={`px-1.5 py-0.5 rounded text-white text-xs ${
                                  isAtMax 
                                    ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                                    : 'bg-green-600 hover:bg-green-500'
                                }`}
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPreviewCard(card)}
                              className="w-full mt-1 px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-white text-xs font-medium"
                            >
                              Ver carta
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCardFromDeck(deckCard.cardId)}
                              className="w-full mt-1 px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-white text-xs"
                            >
                              Remover
                            </button>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-purple-300 mb-2">Deck Adicional ({getExtraDeckCount()} cartas)</h4>
                        <div
                          className={
                            deckPreviewLarge
                              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
                              : 'grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3'
                          }
                        >
                      {formData.cards.filter((c) => c.isExtraDeck).map((deckCard) => {
                        const card = allCards.find((c) => c.id === deckCard.cardId);
                        if (!card) return null;
                        const maxCopies = card.maxCopiesInDeck ?? 3;
                        const isAtMax = deckCard.quantity >= maxCopies;
                        return (
                          <div
                            key={deckCard.cardId}
                            className={`bg-slate-800 rounded-lg border border-purple-700 transition-all hover:border-purple-500 ${
                              deckPreviewLarge ? 'p-3' : 'p-2'
                            }`}
                          >
                            <div className={`relative mb-2 ${deckPreviewLarge ? 'max-w-[120px] mx-auto' : ''}`}>
                              <CardImage card={card} className="w-full aspect-[59/86] rounded" fallback="/images/fundoCarta.webp" />
                              {isAtMax && <div className="absolute top-1 right-1 bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">MAX</div>}
                            </div>
                            <div className="text-white text-xs font-bold mb-1 truncate" title={card.name}>{card.name}</div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => updateCardQuantity(deckCard.cardId, deckCard.quantity - 1)} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs">-</button>
                              <span className={`text-xs font-bold flex-1 text-center ${isAtMax ? 'text-yellow-400' : 'text-white'}`}>{deckCard.quantity}/{maxCopies}</span>
                              <button type="button" onClick={() => updateCardQuantity(deckCard.cardId, deckCard.quantity + 1)} disabled={isAtMax} className={`px-1.5 py-0.5 rounded text-white text-xs ${isAtMax ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-green-600 hover:bg-green-500'}`}>+</button>
                            </div>
                            <button type="button" onClick={() => setPreviewCard(card)} className="w-full mt-1 px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-white text-xs font-medium">Ver carta</button>
                            <button type="button" onClick={() => removeCardFromDeck(deckCard.cardId)} className="w-full mt-1 px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-white text-xs">Remover</button>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Lista de Cartas Disponíveis */}
              <div>
                <label className="block text-white font-medium mb-2">
                  Adicionar cartas ao deck
                </label>
                <p className="text-slate-500 text-xs mb-3">
                  Busca por nome ou texto do efeito. Filtros de subtipo, atributo e raça valem para monstros; magias e armadilhas somem ao usar esses filtros.
                </p>
                <div className="space-y-3 mb-4 rounded-lg border border-amber-500/30 bg-slate-900/60 p-4">
                  <p className="text-sm font-semibold text-amber-200/90">
                    Filtrar e ordenar por ATK
                  </p>
                  <p className="text-xs text-slate-500 -mt-2 mb-2">
                    Só afeta monstros na filtragem; magias e armadilhas continuam no catálogo. Use a ordem para listar do ATK mais baixo ao mais alto ou o contrário.
                  </p>
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">ATK mínimo (≥)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Ex.: 1500"
                        value={pickerAtkMin}
                        onChange={(e) => setPickerAtkMin(e.target.value)}
                        className="w-36 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500/70 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">ATK máximo (≤)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Ex.: 3000"
                        value={pickerAtkMax}
                        onChange={(e) => setPickerAtkMax(e.target.value)}
                        className="w-36 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500/70 focus:outline-none"
                      />
                    </div>
                    <div className="min-w-[200px]">
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Ordem por ATK</label>
                      <select
                        value={
                          pickerSort === 'atk_asc' || pickerSort === 'atk_desc'
                            ? pickerSort
                            : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'atk_asc' || v === 'atk_desc') {
                            setPickerSort(v as typeof pickerSort);
                          } else if (
                            v === '' &&
                            (pickerSort === 'atk_asc' ||
                              pickerSort === 'atk_desc')
                          ) {
                            setPickerSort('name_asc');
                          }
                        }}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-amber-500/70 focus:outline-none"
                      >
                        <option value="">Nome / raridade (abaixo)</option>
                        <option value="atk_asc">Menor → maior</option>
                        <option value="atk_desc">Maior → menor</option>
                      </select>
                    </div>
                    {(pickerAtkMin || pickerAtkMax) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPickerAtkMin('');
                          setPickerAtkMax('');
                        }}
                        className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                      >
                        Limpar faixa ATK
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-3 mb-4 rounded-lg border border-slate-600 bg-slate-900/40 p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Buscar</label>
                      <input
                        type="text"
                        placeholder="Nome ou palavra no efeito..."
                        value={cardPickerSearch}
                        onChange={(e) => setCardPickerSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Tipo</label>
                      <select
                        value={pickerType}
                        onChange={(e) => setPickerType(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="all">Todos</option>
                        <option value="Monster">Monster</option>
                        <option value="Spell">Spell</option>
                        <option value="Trap">Trap</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Raridade</label>
                      <select
                        value={pickerRarity}
                        onChange={(e) => setPickerRarity(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="all">Todas</option>
                        {['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Legendary'].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Subtipo (monstro)</label>
                      <select
                        value={pickerMonsterType}
                        onChange={(e) => setPickerMonsterType(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="all">Qualquer</option>
                        {PICKER_MONSTER_TYPES.map((mt) => (
                          <option key={mt} value={mt}>
                            {mt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Atributo</label>
                      <select
                        value={pickerAttribute}
                        onChange={(e) => setPickerAttribute(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="all">Qualquer</option>
                        {PICKER_ATTRIBUTES.map((at) => (
                          <option key={at} value={at}>
                            {at}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Raça</label>
                      <select
                        value={pickerRace}
                        onChange={(e) => setPickerRace(e.target.value)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="all">Qualquer</option>
                        {PICKER_RACES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-400">Ordenar (nome / raridade)</label>
                      <select
                        value={
                          pickerSort === 'name_asc' ||
                          pickerSort === 'name_desc' ||
                          pickerSort === 'rarity_desc'
                            ? pickerSort
                            : '__atk__'
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '__atk__') return;
                          setPickerSort(
                            v as 'name_asc' | 'name_desc' | 'rarity_desc',
                          );
                        }}
                        className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      >
                        {(pickerSort === 'atk_asc' ||
                          pickerSort === 'atk_desc') && (
                          <option value="__atk__">
                            {pickerSort === 'atk_asc'
                              ? 'Ordem atual: ATK menor → maior'
                              : 'Ordem atual: ATK maior → menor'}
                          </option>
                        )}
                        <option value="name_asc">Nome A–Z</option>
                        <option value="name_desc">Nome Z–A</option>
                        <option value="rarity_desc">Raridade (maior)</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      {(cardPickerSearch ||
                        pickerType !== 'all' ||
                        pickerRarity !== 'all' ||
                        pickerMonsterType !== 'all' ||
                        pickerAttribute !== 'all' ||
                        pickerRace !== 'all' ||
                        pickerAtkMin !== '' ||
                        pickerAtkMax !== '' ||
                        pickerSort !== 'name_asc') && (
                        <button
                          type="button"
                          onClick={() => {
                            setCardPickerSearch('');
                            setPickerType('all');
                            setPickerRarity('all');
                            setPickerMonsterType('all');
                            setPickerAttribute('all');
                            setPickerRace('all');
                            setPickerAtkMin('');
                            setPickerAtkMax('');
                            setPickerSort('name_asc');
                          }}
                          className="w-full rounded-lg border border-slate-500 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                        >
                          Limpar filtros do catálogo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-slate-500 text-xs mb-2">
                  Mostrando {filteredCardsForPicker.length} de {allCards.length} carta(s) no catálogo
                </p>
                <div className="bg-slate-900/50 rounded-lg p-4 max-h-[min(520px,60vh)] overflow-y-auto border border-slate-700/80">
                  {filteredCardsForPicker.length === 0 ? (
                    <p className="py-12 text-center text-slate-400 text-sm">
                      Nenhuma carta com esses filtros. Ajuste a busca ou clique em &quot;Limpar filtros do catálogo&quot;.
                    </p>
                  ) : (
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-3">
                    {filteredCardsForPicker.map((card) => {
                      const inDeck = getCardInDeck(card.id);
                      const maxCopies = card.maxCopiesInDeck ?? 3;
                      const isBanned = maxCopies === 0;
                      const isAtMax = inDeck && inDeck.quantity >= maxCopies;

                      return (
                        <div
                          key={card.id}
                          className={`bg-slate-800 rounded-lg p-2 border ${
                            isBanned
                              ? 'border-red-500 opacity-50 cursor-not-allowed'
                              : inDeck
                                ? isAtMax
                                  ? 'border-yellow-500'
                                  : 'border-green-500'
                                : 'border-slate-700 hover:border-blue-500'
                          } transition-all ${
                            isBanned ? '' : 'cursor-pointer'
                          }`}
                          onClick={() => !isBanned && addCardToDeck(card.id)}
                          title={isBanned ? 'Carta banida' : card.name}
                        >
                          <div className="relative mb-1">
                            <CardImage
                              card={card}
                              className="w-full aspect-[59/86] rounded"
                              fallback="/images/fundoCarta.webp"
                            />
                            {isBanned && (
                              <div className="absolute inset-0 bg-red-900/50 rounded flex items-center justify-center">
                                <span className="text-red-400 text-xs font-bold">BANIDA</span>
                              </div>
                            )}
                            {inDeck && !isBanned && (
                              <div className={`absolute top-1 right-1 text-white text-xs font-bold px-1.5 py-0.5 rounded ${
                                isAtMax ? 'bg-yellow-500' : 'bg-green-500'
                              }`}>
                                {inDeck.quantity}/{maxCopies}
                              </div>
                            )}
                          </div>
                          <div className={`text-xs font-bold truncate ${
                            isBanned ? 'text-red-400' : 'text-white'
                          }`}>
                            {card.name}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewCard(card);
                            }}
                            className="mt-1.5 w-full rounded bg-slate-600 py-1 text-[10px] font-semibold text-slate-100 hover:bg-slate-500"
                          >
                            Ver detalhes
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg font-bold text-white transition-all disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : editingDeck ? 'Atualizar' : 'Criar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-white transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Lista de Decks */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-white">Decks cadastrados</h2>
          <input
            type="text"
            placeholder="Filtrar decks por nome ou descrição..."
            value={deckListSearch}
            onChange={(e) => setDeckListSearch(e.target.value)}
            className="w-full max-w-md rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDecks.map((deck) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 rounded-lg p-6 border border-slate-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    {deck.name}
                  </h3>
                  {deck.description && (
                    <p className="text-slate-400 text-sm">{deck.description}</p>
                  )}
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    deck.isActive
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {deck.isActive ? 'Ativo' : 'Inativo'}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-slate-400 text-sm">
                  {deck.cards.length} tipos de cartas •{' '}
                  {deck.cards.reduce((sum, c) => sum + c.quantity, 0)} cartas
                  totais
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(deck)}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white transition-all"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(deck.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold text-white transition-all"
                >
                  Remover
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredDecks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">
              Nenhum deck inicial cadastrado ainda.
            </p>
          </div>
        )}

        {previewCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="initial-deck-card-preview-title"
            onClick={() => setPreviewCard(null)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  id="initial-deck-card-preview-title"
                  className="text-xl font-bold text-white"
                >
                  {previewCard.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setPreviewCard(null)}
                  className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
              <div className="mb-4 flex justify-center">
                <div className="w-full max-w-[200px]">
                  <CardImage
                    card={previewCard}
                    className="w-full rounded-lg shadow-lg aspect-[59/86] object-cover"
                    fallback="/images/fundoCarta.webp"
                  />
                </div>
              </div>
              <dl className="mb-4 space-y-2 text-sm">
                <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                  <dt className="text-slate-500">Tipo</dt>
                  <dd className="font-medium text-slate-200">{previewCard.type}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                  <dt className="text-slate-500">Raridade</dt>
                  <dd className="font-medium text-slate-200">
                    {previewCard.rarity || 'Common'}
                  </dd>
                </div>
                {previewCard.idCarta ? (
                  <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                    <dt className="text-slate-500">idCarta</dt>
                    <dd className="break-all font-mono text-xs text-slate-300">
                      {previewCard.idCarta}
                    </dd>
                  </div>
                ) : null}
                {previewCard.type === 'Monster' ? (
                  <>
                    {previewCard.monsterType ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">Subtipo</dt>
                        <dd className="text-slate-200">{previewCard.monsterType}</dd>
                      </div>
                    ) : null}
                    {previewCard.attribute ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">Atributo</dt>
                        <dd className="text-slate-200">{previewCard.attribute}</dd>
                      </div>
                    ) : null}
                    {previewCard.race ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">Raça</dt>
                        <dd className="text-slate-200">{previewCard.race}</dd>
                      </div>
                    ) : null}
                    {previewCard.level != null ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">Nível</dt>
                        <dd className="text-slate-200">{previewCard.level}</dd>
                      </div>
                    ) : null}
                    {previewCard.rank != null ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">Rank</dt>
                        <dd className="text-slate-200">{previewCard.rank}</dd>
                      </div>
                    ) : null}
                    {previewCard.linkRating != null ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">Link</dt>
                        <dd className="text-slate-200">{previewCard.linkRating}</dd>
                      </div>
                    ) : null}
                    {(previewCard.atk != null || previewCard.def != null) ? (
                      <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                        <dt className="text-slate-500">ATK / DEF</dt>
                        <dd className="text-slate-200">
                          {previewCard.atk ?? '—'} / {previewCard.def ?? '—'}
                        </dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {previewCard.type === 'Spell' && previewCard.spellType ? (
                  <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                    <dt className="text-slate-500">Tipo de magia</dt>
                    <dd className="text-slate-200">{previewCard.spellType}</dd>
                  </div>
                ) : null}
                {previewCard.type === 'Trap' && previewCard.trapType ? (
                  <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                    <dt className="text-slate-500">Tipo de armadilha</dt>
                    <dd className="text-slate-200">{previewCard.trapType}</dd>
                  </div>
                ) : null}
                {previewCard.archetype ? (
                  <div className="flex flex-wrap gap-x-2 border-b border-slate-700 pb-2">
                    <dt className="text-slate-500">Arquétipo</dt>
                    <dd className="text-slate-200">{previewCard.archetype}</dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-x-2 pb-2">
                  <dt className="text-slate-500">Máx. no deck</dt>
                  <dd className="text-slate-200">
                    {(previewCard.maxCopiesInDeck ?? 3) === 0
                      ? 'Banida (0)'
                      : previewCard.maxCopiesInDeck ?? 3}
                  </dd>
                </div>
              </dl>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Descrição / efeito
                </h3>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-950/80 p-3 text-sm leading-relaxed text-slate-300">
                  {getCardDescription(previewCard)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewCard(null)}
                className="mt-5 w-full rounded-lg bg-slate-700 py-2.5 font-semibold text-white hover:bg-slate-600"
              >
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

