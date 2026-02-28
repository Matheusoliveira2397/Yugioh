import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';
import CardImage from '../components/CardImage';

interface InitialDeckCard {
  id: string;
  cardId: string;
  quantity: number;
  card: {
    id: string;
    name: string;
    type: string;
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
  cardImage?: string;
  idCarta?: string;
  maxCopiesInDeck?: number;
}

export default function AdminInitialDecksPanel() {
  const [decks, setDecks] = useState<InitialDeck[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDeck, setEditingDeck] = useState<InitialDeck | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
    cards: [] as Array<{ cardId: string; quantity: number }>,
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
      setAllCards(response.data.filter((card: Card) => card.isActive));
    } catch (error) {
      console.error('Erro ao carregar cartas:', error);
    }
  };

  const getTotalCardsInDeck = () => {
    return formData.cards.reduce((sum, c) => sum + c.quantity, 0);
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

    // Validar tamanho do deck (40-60 cartas)
    const totalCards = getTotalCardsInDeck();
    if (totalCards < 40) {
      setMessage({ type: 'error', text: `❌ O deck deve ter no mínimo 40 cartas! (Atual: ${totalCards})` });
      setLoading(false);
      return;
    }

    if (totalCards > 60) {
      setMessage({ type: 'error', text: `❌ O deck deve ter no máximo 60 cartas! (Atual: ${totalCards})` });
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
  };

  const addCardToDeck = (cardId: string) => {
    const card = allCards.find((c) => c.id === cardId);
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

    // Verificar se adicionar mais uma carta ultrapassa o limite do deck (60)
    const totalCards = getTotalCardsInDeck();
    if (totalCards >= 60) {
      setMessage({ 
        type: 'error', 
        text: `❌ O deck já atingiu o limite máximo de 60 cartas!` 
      });
      return;
    }

    if (existingCard) {
      setFormData({
        ...formData,
        cards: formData.cards.map((c) =>
          c.cardId === cardId ? { ...c, quantity: c.quantity + 1 } : c
        ),
      });
    } else {
      setFormData({
        ...formData,
        cards: [...formData.cards, { cardId, quantity: 1 }],
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

    // Verificar se adicionar mais cartas ultrapassa o limite do deck (60)
    const currentTotal = getTotalCardsInDeck();
    const existingCard = formData.cards.find((c) => c.cardId === cardId);
    const currentQuantity = existingCard ? existingCard.quantity : 0;
    const newTotal = currentTotal - currentQuantity + quantity;

    if (newTotal > 60) {
      setMessage({ 
        type: 'error', 
        text: `❌ O deck não pode ter mais de 60 cartas! (Atual: ${currentTotal}, tentando adicionar até ${newTotal})` 
      });
      return;
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
    deck.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCards = allCards.filter((card) =>
    card.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCardInDeck = (cardId: string) => {
    return formData.cards.find((c) => c.cardId === cardId);
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-white">
                    Cartas no Deck ({formData.cards.length} tipos • {getTotalCardsInDeck()} cartas totais)
                  </label>
                  <div className={`text-sm font-bold ${
                    getTotalCardsInDeck() < 40 
                      ? 'text-yellow-400' 
                      : getTotalCardsInDeck() > 60 
                        ? 'text-red-400' 
                        : 'text-green-400'
                  }`}>
                    {getTotalCardsInDeck() < 40 
                      ? `⚠️ Mínimo: 40 cartas` 
                      : getTotalCardsInDeck() > 60 
                        ? `❌ Máximo: 60 cartas` 
                        : `✅ Válido (40-60)`}
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4 min-h-[200px] max-h-[500px] overflow-y-auto">
                  {formData.cards.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">
                      Nenhuma carta adicionada. Use a lista abaixo para adicionar cartas.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                      {formData.cards.map((deckCard) => {
                        const card = allCards.find((c) => c.id === deckCard.cardId);
                        if (!card) return null;

                        const maxCopies = card.maxCopiesInDeck ?? 3;
                        const isAtMax = deckCard.quantity >= maxCopies;

                        return (
                          <div
                            key={deckCard.cardId}
                            className="bg-slate-800 rounded-lg p-2 border border-slate-700 hover:border-blue-500 transition-all"
                          >
                            <div className="relative mb-2">
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
                              onClick={() => removeCardFromDeck(deckCard.cardId)}
                              className="w-full mt-1 px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-white text-xs"
                            >
                              Remover
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de Cartas Disponíveis */}
              <div>
                <label className="block text-white mb-2">
                  Adicionar Cartas ao Deck
                </label>
                <input
                  type="text"
                  placeholder="Buscar cartas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none mb-4"
                />
                <div className="bg-slate-900/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                  <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-3">
                    {filteredCards.map((card) => {
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
                        </div>
                      );
                    })}
                  </div>
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
      </div>
    </div>
  );
}

