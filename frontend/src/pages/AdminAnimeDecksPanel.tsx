import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import CardImage from '../components/CardImage';

/** Grade do editor: uma camada de img, menos URLs por carta, `sizes` para o browser pedir resolução adequada */
const deckEditorCardImageProps = {
  singleLayerImage: true,
  omitNameBasedPaths: true,
  pathExtensions: ['.webp', '.jpg', '.jpeg', '.png'] as const,
  loading: 'lazy' as const,
  sizes: '(max-width: 640px) 33vw, 110px',
} as const;

interface AnimeDeckCard {
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

interface AnimeDeck {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  coverCardId?: string | null;
  coverCard?: { id: string; name: string; cardImage?: string; idCarta?: string } | null;
  cards: AnimeDeckCard[];
  createdAt: string;
  updatedAt: string;
}

interface Card {
  id: string;
  name: string;
  type: string;
  monsterType?: string;
  cardImage?: string;
  idCarta?: string;
  maxCopiesInDeck?: number;
  isActive?: boolean;
}

const EXTRA_DECK_MONSTER_TYPES = ['Fusion', 'Synchro', 'Xyz', 'Link'];
function isExtraDeckCard(card: Card): boolean {
  return !!card.monsterType && EXTRA_DECK_MONSTER_TYPES.includes(card.monsterType);
}

function cardIsInactive(card: Card): boolean {
  return card.isActive === false;
}

export default function AdminAnimeDecksPanel() {
  const [decks, setDecks] = useState<AnimeDeck[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDeck, setEditingDeck] = useState<AnimeDeck | null>(null);
  /** Busca na grade de decks (lista abaixo) */
  const [deckListSearch, setDeckListSearch] = useState('');
  /** Busca apenas no seletor de cartas do formulário */
  const [cardPickerSearch, setCardPickerSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    coverCardId: null as string | null,
    cards: [] as Array<{ cardId: string; quantity: number; isExtraDeck?: boolean }>,
  });
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [coverPickerSearch, setCoverPickerSearch] = useState('');

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
      const response = await api.get('/anime-decks');
      setDecks(response.data);
    } catch (error) {
      console.error('Erro ao carregar decks anime:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar decks anime' });
    } finally {
      setLoading(false);
    }
  };

  const loadAllCards = async () => {
    try {
      const response = await api.get('/cards/admin/all');
      const list = Array.isArray(response.data) ? response.data : [];
      // Todas as cartas (ativas e inativas) — decks anime podem usar cartas fora da loja
      setAllCards(list);
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

  /** Resolve carta na lista admin ou no deck em edição (fallback) */
  const resolveCard = (cardId: string): Card | undefined => {
    const idStr = String(cardId);
    const fromList = allCards.find((c) => String(c.id) === idStr);
    if (fromList) return fromList;
    if (editingDeck) {
      const dc = editingDeck.cards.find((c) => String(c.cardId) === idStr);
      if (dc?.card) {
        return {
          id: dc.card.id,
          name: dc.card.name,
          type: dc.card.type,
          monsterType: dc.card.monsterType,
          cardImage: dc.card.cardImage,
          idCarta: dc.card.idCarta,
          maxCopiesInDeck: (dc.card as Card).maxCopiesInDeck,
          isActive: (dc.card as Card).isActive,
        };
      }
    }
    return undefined;
  };

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
      const card = resolveCard(deckCard.cardId);
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
      const payload = { ...formData, coverCardId: formData.coverCardId || null };
      if (editingDeck) {
        await api.put(`/anime-decks/${editingDeck.id}`, payload);
        setMessage({ type: 'success', text: 'Deck anime atualizado com sucesso!' });
      } else {
        await api.post('/anime-decks', payload);
        setMessage({ type: 'success', text: 'Deck anime criado com sucesso!' });
      }

      setShowForm(false);
      resetForm();
      loadDecks();
    } catch (error: any) {
      console.error('Erro ao salvar deck:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao salvar deck anime',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (deck: AnimeDeck) => {
    setEditingDeck(deck);
    setFormData({
      name: deck.name,
      description: deck.description || '',
      isActive: deck.isActive,
      coverCardId: deck.coverCardId ?? null,
      cards: deck.cards.map((dc) => ({
        cardId: dc.cardId,
        quantity: dc.quantity,
        isExtraDeck: !!(dc as AnimeDeckCard).isExtraDeck,
      })),
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este deck anime?')) {
      return;
    }

    try {
      await api.delete(`/anime-decks/${id}`);
      setMessage({ type: 'success', text: 'Deck anime removido com sucesso!' });
      loadDecks();
    } catch (error: any) {
      console.error('Erro ao remover deck:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Erro ao remover deck anime',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      isActive: true,
      coverCardId: null,
      cards: [],
    });
    setEditingDeck(null);
    setShowCoverPicker(false);
    setCardPickerSearch('');
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
      const foundCard = resolveCard(c.cardId);
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

    const card = resolveCard(cardId);
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

  const filteredDecks = decks.filter((deck) =>
    deck.name.toLowerCase().includes(deckListSearch.toLowerCase())
  );

  const filteredPickerCards = allCards.filter((card) =>
    card.name.toLowerCase().includes(cardPickerSearch.toLowerCase())
  );

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
    <div className="min-h-screen p-4 sm:p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                🎬 Decks Anime (Random Duel: Animes Deck)
              </h1>
              <p className="text-slate-400">
                Crie decks pré-definidos para o modo &quot;Random Duel: Animes Deck&quot;. Os duelistas escolhem um deles para duelar.
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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-10 rounded-2xl border border-violet-500/25 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 overflow-hidden"
          >
            <div className="border-b border-white/10 bg-gradient-to-r from-violet-950/50 to-indigo-950/40 px-5 sm:px-8 py-5">
              <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                <span aria-hidden>🎬</span>
                {editingDeck ? 'Editar deck anime' : 'Novo deck anime'}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                Principal 40–60 cartas · Extra até 15 · Cartas <span className="text-amber-300/90">inativas</span> podem ser usadas no deck (não aparecem na loja, mas duelam normalmente).
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-8">
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-200 text-sm font-semibold mb-1.5">Nome do deck *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-800/80 text-white rounded-xl border border-slate-600/80 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-200 text-sm font-semibold mb-1.5">Descrição</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2.5 bg-slate-800/80 text-white rounded-xl border border-slate-600/80 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 focus:outline-none resize-y min-h-[88px]"
                      rows={3}
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer select-none rounded-xl border border-slate-600/60 bg-slate-800/40 px-4 py-3">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-500 text-violet-600 focus:ring-violet-500"
                    />
                    <div>
                      <span className="text-white font-medium">Deck ativo na fila</span>
                      <p className="text-slate-500 text-xs">Desative para rascunhos; só decks ativos aparecem no Random Duel Anime.</p>
                    </div>
                  </label>
                </div>

                <div className="rounded-xl border border-slate-600/40 bg-slate-800/25 p-4 space-y-2 lg:sticky lg:top-4 self-start">
              {/* Imagem do Deck */}
              <div>
                <label className="block text-slate-200 text-sm font-semibold mb-1">Capa do deck (opcional)</label>
                <p className="text-slate-500 text-xs mb-2">Carta exibida na seleção do Random Duel Anime.</p>
                <div className="flex items-center gap-4 flex-wrap">
                  {formData.coverCardId ? (
                    (() => {
                      const coverCard = allCards.find((c) => c.id === formData.coverCardId) ?? (editingDeck?.coverCard as Card | undefined);
                      return coverCard ? (
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/50 border border-slate-600">
                          <CardImage
                            {...deckEditorCardImageProps}
                            sizes="64px"
                            card={coverCard}
                            className="w-16 aspect-[59/86] rounded object-cover"
                            fallback="/images/fundoCarta.webp"
                          />
                          <div>
                            <p className="text-white font-medium text-sm">{coverCard.name}</p>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, coverCardId: null })}
                              className="text-red-400 hover:text-red-300 text-xs mt-1"
                            >
                              Remover imagem
                            </button>
                          </div>
                        </div>
                      ) : null;
                    })()
                  ) : (
                    <span className="text-slate-500 text-sm">Nenhuma imagem selecionada</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCoverPicker(!showCoverPicker)}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium"
                  >
                    {formData.coverCardId ? 'Trocar carta' : 'Escolher carta'}
                  </button>
                </div>
                {showCoverPicker && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-800/80 border border-slate-600 max-h-64 overflow-y-auto">
                    <p className="text-slate-400 text-sm mb-2">Clique em uma carta para definir como imagem do deck:</p>
                    <input
                      type="text"
                      placeholder="Buscar carta..."
                      className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 mb-2 text-sm"
                      value={coverPickerSearch}
                      onChange={(e) => setCoverPickerSearch(e.target.value)}
                    />
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                      {allCards
                        .filter((c) => !coverPickerSearch.trim() || c.name.toLowerCase().includes(coverPickerSearch.toLowerCase()))
                        .slice(0, 48)
                        .map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, coverCardId: card.id });
                            setShowCoverPicker(false);
                          }}
                          className={`rounded-lg border-2 overflow-hidden transition-all ${
                            formData.coverCardId === card.id
                              ? 'border-amber-400 ring-2 ring-amber-400/50'
                              : cardIsInactive(card)
                                ? 'border-amber-700/50 hover:border-amber-500'
                                : 'border-slate-600 hover:border-purple-500'
                          }`}
                        >
                          <CardImage
                            {...deckEditorCardImageProps}
                            card={card}
                            className={`w-full aspect-[59/86] object-cover ${cardIsInactive(card) ? 'opacity-80' : ''}`}
                            fallback="/images/fundoCarta.webp"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
              {/* Cartas no Deck */}
              <div className="rounded-xl border border-slate-600/50 bg-slate-800/20 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 bg-slate-800/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <label className="text-white font-semibold text-sm">
                    Composição do deck <span className="text-slate-400 font-normal">({formData.cards.length} tipos · {getTotalCardsInDeck()} cartas)</span>
                  </label>
                  <div className="flex flex-wrap gap-3 text-xs sm:text-sm font-bold tabular-nums">
                    <span className={getMainDeckCount() < 40 ? 'text-amber-300' : getMainDeckCount() > 60 ? 'text-red-400' : 'text-emerald-400'}>
                      Principal {getMainDeckCount()}/40–60
                    </span>
                    <span className={getExtraDeckCount() > 15 ? 'text-red-400' : 'text-violet-300'}>
                      Extra {getExtraDeckCount()}/15
                    </span>
                  </div>
                </div>
                <div className="p-4 min-h-[220px] max-h-[min(60vh,560px)] overflow-y-auto custom-scrollbar space-y-4">
                  {formData.cards.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">
                      Nenhuma carta adicionada. Use a lista abaixo para adicionar cartas. Cartas Fusion, Synchro, Xyz e Link vão para o Deck Adicional.
                    </p>
                  ) : (
                    <>
                      <div>
                        <h4 className="text-sm font-bold text-blue-300 mb-2">Deck Principal ({getMainDeckCount()} cartas)</h4>
                        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                      {formData.cards.filter((c) => !c.isExtraDeck).map((deckCard) => {
                        const card = resolveCard(deckCard.cardId);
                        if (!card) return null;

                        const maxCopies = card.maxCopiesInDeck ?? 3;
                        const isAtMax = deckCard.quantity >= maxCopies;
                        const inactive = cardIsInactive(card);

                        return (
                          <div
                            key={deckCard.cardId}
                            className={`bg-slate-800 rounded-lg p-2 border transition-all ${
                              inactive ? 'border-amber-600/50 hover:border-amber-500/80' : 'border-slate-700 hover:border-blue-500'
                            }`}
                          >
                            <div className="relative mb-2">
                              <CardImage
                                {...deckEditorCardImageProps}
                                card={card}
                                className={`w-full aspect-[59/86] rounded ${inactive ? 'opacity-85' : ''}`}
                                fallback="/images/fundoCarta.webp"
                              />
                              {inactive && (
                                <div className="absolute bottom-1 left-1 right-1 text-center text-[9px] font-bold uppercase tracking-wide bg-amber-900/90 text-amber-200 rounded px-0.5 py-0.5">
                                  Inativa
                                </div>
                              )}
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
                        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                      {formData.cards.filter((c) => c.isExtraDeck).map((deckCard) => {
                        const card = resolveCard(deckCard.cardId);
                        if (!card) return null;
                        const maxCopies = card.maxCopiesInDeck ?? 3;
                        const isAtMax = deckCard.quantity >= maxCopies;
                        const inactive = cardIsInactive(card);
                        return (
                          <div key={deckCard.cardId} className={`bg-slate-800 rounded-lg p-2 border transition-all ${inactive ? 'border-amber-600/50 hover:border-amber-500' : 'border-purple-700 hover:border-purple-500'}`}>
                            <div className="relative mb-2">
                              <CardImage {...deckEditorCardImageProps} card={card} className={`w-full aspect-[59/86] rounded ${inactive ? 'opacity-85' : ''}`} fallback="/images/fundoCarta.webp" />
                              {inactive && (
                                <div className="absolute bottom-1 left-1 right-1 text-center text-[9px] font-bold uppercase tracking-wide bg-amber-900/90 text-amber-200 rounded px-0.5 py-0.5">Inativa</div>
                              )}
                              {isAtMax && <div className="absolute top-1 right-1 bg-yellow-500 text-black text-xs font-bold px-1.5 py-0.5 rounded">MAX</div>}
                            </div>
                            <div className="text-white text-xs font-bold mb-1 truncate" title={card.name}>{card.name}</div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => updateCardQuantity(deckCard.cardId, deckCard.quantity - 1)} className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 rounded text-white text-xs">-</button>
                              <span className={`text-xs font-bold flex-1 text-center ${isAtMax ? 'text-yellow-400' : 'text-white'}`}>{deckCard.quantity}/{maxCopies}</span>
                              <button type="button" onClick={() => updateCardQuantity(deckCard.cardId, deckCard.quantity + 1)} disabled={isAtMax} className={`px-1.5 py-0.5 rounded text-white text-xs ${isAtMax ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-green-600 hover:bg-green-500'}`}>+</button>
                            </div>
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

              {/* Catálogo para adicionar */}
              <div className="rounded-xl border border-violet-500/20 bg-slate-800/25 xl:sticky xl:top-4 xl:self-start">
                <div className="px-4 py-3 border-b border-white/10 bg-slate-800/60">
                  <label className="block text-white font-semibold text-sm">Catálogo de cartas</label>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {allCards.length} cartas no sistema · <span className="text-amber-300/90">inativas</span> com tarja âmbar
                  </p>
                  <input
                    type="search"
                    placeholder="Buscar por nome..."
                    value={cardPickerSearch}
                    onChange={(e) => setCardPickerSearch(e.target.value)}
                    className="mt-2 w-full px-3 py-2 bg-slate-900/80 text-white rounded-lg border border-slate-600 focus:border-violet-500 focus:outline-none text-sm"
                  />
                </div>
                <div className="p-3 max-h-[min(65vh,640px)] overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
                    {filteredPickerCards.length === 0 ? (
                      <p className="col-span-full text-center text-slate-500 text-sm py-10">
                        Nenhuma carta com esse nome. Ajuste a busca ou cadastre a carta no painel de cartas.
                      </p>
                    ) : null}
                    {filteredPickerCards.map((card) => {
                      const inDeck = getCardInDeck(card.id);
                      const maxCopies = card.maxCopiesInDeck ?? 3;
                      const isBanned = maxCopies === 0;
                      const isAtMax = inDeck && inDeck.quantity >= maxCopies;
                      const inactive = cardIsInactive(card);

                      return (
                        <button
                          key={card.id}
                          type="button"
                          disabled={isBanned}
                          className={`text-left bg-slate-800/90 rounded-lg p-1.5 border transition-all ${
                            isBanned
                              ? 'border-red-500/60 opacity-45 cursor-not-allowed'
                              : inDeck
                                ? isAtMax
                                  ? 'border-yellow-500 ring-1 ring-yellow-500/30'
                                  : 'border-emerald-500/60 ring-1 ring-emerald-500/20'
                                : inactive
                                  ? 'border-amber-600/40 hover:border-amber-400'
                                  : 'border-slate-600 hover:border-violet-500'
                          } ${isBanned ? '' : 'cursor-pointer active:scale-[0.98]'}`}
                          onClick={() => !isBanned && addCardToDeck(card.id)}
                          title={isBanned ? 'Carta banida' : `${card.name}${inactive ? ' (inativa na loja)' : ''}`}
                        >
                          <div className="relative mb-1">
                            <CardImage
                              {...deckEditorCardImageProps}
                              card={card}
                              className={`w-full aspect-[59/86] rounded ${inactive ? 'opacity-80' : ''}`}
                              fallback="/images/fundoCarta.webp"
                            />
                            {inactive && !isBanned && (
                              <span className="absolute bottom-0.5 left-0.5 right-0.5 text-center text-[8px] font-bold uppercase bg-amber-950/95 text-amber-200 rounded px-0.5">
                                Inativa
                              </span>
                            )}
                            {isBanned && (
                              <div className="absolute inset-0 bg-red-950/55 rounded flex items-center justify-center">
                                <span className="text-red-300 text-[10px] font-bold">Banida</span>
                              </div>
                            )}
                            {inDeck && !isBanned && (
                              <div
                                className={`absolute top-0.5 right-0.5 text-white text-[10px] font-bold px-1 py-px rounded ${
                                  isAtMax ? 'bg-yellow-500 text-black' : 'bg-emerald-600'
                                }`}
                              >
                                {inDeck.quantity}/{maxCopies}
                              </div>
                            )}
                          </div>
                          <div className={`text-[10px] sm:text-xs font-bold truncate leading-tight ${isBanned ? 'text-red-400' : inactive ? 'text-amber-100/90' : 'text-slate-100'}`}>
                            {card.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 transition-all disabled:opacity-50 shadow-lg shadow-violet-900/30"
                >
                  {loading ? 'Salvando...' : editingDeck ? 'Atualizar deck' : 'Criar deck'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="px-8 py-3 rounded-xl font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 transition-all border border-slate-600"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Lista de Decks */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Decks cadastrados</h2>
          <input
            type="search"
            placeholder="Filtrar decks por nome..."
            value={deckListSearch}
            onChange={(e) => setDeckListSearch(e.target.value)}
            className="w-full sm:max-w-xs px-3 py-2 rounded-xl bg-slate-800 border border-slate-600 text-white text-sm focus:border-violet-500 focus:outline-none"
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
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {deck.coverCard ? (
                    <div className="flex-shrink-0 w-14 aspect-[59/86] rounded-lg overflow-hidden border border-slate-600">
                      <CardImage
                        {...deckEditorCardImageProps}
                        sizes="56px"
                        card={deck.coverCard}
                        className="w-full h-full object-cover"
                        fallback="/images/fundoCarta.webp"
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-white mb-1">
                      {deck.name}
                    </h3>
                    {deck.description && (
                      <p className="text-slate-400 text-sm">{deck.description}</p>
                    )}
                  </div>
                </div>
                <div
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold ${
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
              Nenhum deck anime cadastrado ainda.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

