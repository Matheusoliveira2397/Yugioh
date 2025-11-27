import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import CardImage from '../components/CardImage';

interface UserCard {
  id: string;
  cardId: string;
  quantity: number;
  card: {
    id: string;
    name: string;
    type: string;
    rarity: string;
    cardImage?: string;
    description?: string;
    atk?: number;
    def?: number;
    level?: number;
    maxCopiesInDeck?: number;
  };
}

const getRarityColor = (rarity: string | undefined | null) => {
  if (!rarity) {
    return 'from-gray-600 to-gray-700 border-gray-500';
  }
  const colors: Record<string, string> = {
    'Common': 'from-gray-600 to-gray-700 border-gray-500',
    'Rare': 'from-blue-600 to-blue-700 border-blue-500',
    'Super Rare': 'from-purple-600 to-purple-700 border-purple-500',
    'Ultra Rare': 'from-yellow-600 to-amber-600 border-yellow-500',
    'Secret Rare': 'from-pink-600 to-rose-600 border-pink-500',
    'Legendary': 'from-orange-600 to-red-600 border-orange-500',
  };
  return colors[rarity] || 'from-gray-600 to-gray-700 border-gray-500';
};

export default function DeckEditPage() {
  const { user } = useAuthStore();
  const [maleta, setMaleta] = useState<UserCard[]>([]);
  const [deck, setDeck] = useState<(UserCard | null)[]>(Array(60).fill(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [deckName, setDeckName] = useState('Meu Deck');
  const [deckLoaded, setDeckLoaded] = useState(false);

  const loadMaleta = useCallback(async () => {
    if (!user) {
      console.log('⚠️ Usuário não autenticado');
      return;
    }
    setLoading(true);
    try {
      console.log('🔄 Carregando maleta para usuário:', user.id);
      const res = await Promise.race([
        api.get('/shop/inventory', { timeout: 20000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
      ]) as any;
      console.log('📦 Resposta completa:', res);
      console.log('📦 Dados recebidos:', res.data);
      console.log('📦 Tipo dos dados:', Array.isArray(res.data) ? 'Array' : typeof res.data);
      console.log('📦 Quantidade de itens:', Array.isArray(res.data) ? res.data.length : 'N/A');
      
      if (Array.isArray(res.data)) {
        setMaleta(res.data);
        console.log('✅ Maleta carregada com sucesso:', res.data.length, 'cartas');
      } else {
        console.warn('⚠️ Dados não são um array:', res.data);
        setMaleta([]);
      }
    } catch (error: any) {
      console.error('❌ Erro ao carregar maleta:', error);
      console.error('❌ Detalhes do erro:', error.response?.data || error.message);
      setMaleta([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadDeck = useCallback(async () => {
    if (!user) return;
    try {
      console.log('🔄 [loadDeck] Carregando deck salvo...');
      const res = await Promise.race([
        api.get('/decks/current', { timeout: 20000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
      ]) as any;
      
      console.log('📦 [loadDeck] Resposta completa:', res.data);
      console.log('📦 [loadDeck] Tem cards?', !!res.data?.cards);
      console.log('📦 [loadDeck] Cards é array?', Array.isArray(res.data?.cards));
      console.log('📦 [loadDeck] Quantidade de cards:', res.data?.cards?.length || 0);
      
      if (res.data) {
        // Verificar se cards existe e é um array (pode ser vazio)
        const cards = res.data.cards || [];
        console.log('📦 [loadDeck] Cards processados:', cards.length);
        
        if (cards.length > 0) {
          console.log('📦 [loadDeck] Primeiras 3 cartas:', cards.slice(0, 3).map((dc: any) => ({
            deckCardId: dc.id,
            cardId: dc.cardId,
            hasCard: !!dc.card,
            cardName: dc.card?.name || 'N/A',
          })));
        }
        
        // Criar um mapa de cardId para UserCard da maleta
        const maletaMap = new Map<string, UserCard>();
        maleta.forEach(uc => {
          if (uc.cardId) {
            maletaMap.set(uc.cardId, uc);
          }
          // Também mapear por card.id se disponível
          if (uc.card?.id) {
            maletaMap.set(uc.card.id, uc);
          }
        });

        // Converter deck do backend para formato do frontend
        const loadedDeck: (UserCard | null)[] = Array(60).fill(null);
        cards.forEach((deckCard: any, index: number) => {
          if (index < 60) {
            // Tentar encontrar na maleta pelo cardId
            let userCard = maletaMap.get(deckCard.cardId);
            
            // Se não encontrou e tem card.id, tentar por card.id
            if (!userCard && deckCard.card?.id) {
              userCard = maletaMap.get(deckCard.card.id);
            }
            
            if (userCard) {
              loadedDeck[index] = userCard;
            } else if (deckCard.card) {
              // Se a carta não está na maleta, criar um UserCard básico
              loadedDeck[index] = {
                id: `${deckCard.cardId || deckCard.card.id}-${index}`,
                cardId: deckCard.cardId || deckCard.card.id,
                quantity: 1,
                card: deckCard.card,
              };
            }
          }
        });

        const cardsLoaded = loadedDeck.filter(slot => slot !== null).length;
        console.log('✅ [loadDeck] Deck carregado com', cardsLoaded, 'cartas');
        
        setDeck(loadedDeck);
        if (res.data.name) {
          setDeckName(res.data.name);
        }
      } else {
        console.warn('⚠️ [loadDeck] Resposta sem dados');
      }
    } catch (error: any) {
      console.error('❌ [loadDeck] Erro ao carregar deck:', error);
      console.error('❌ [loadDeck] Status:', error.response?.status);
      console.error('❌ [loadDeck] Dados:', error.response?.data);
      // Não é erro se não houver deck salvo
    }
  }, [user, maleta]);

  useEffect(() => {
    loadMaleta();
  }, [loadMaleta]);

  // Carregar deck após a maleta ser carregada (apenas uma vez)
  useEffect(() => {
    if (maleta.length > 0 && !deckLoaded && user) {
      loadDeck();
      setDeckLoaded(true);
    }
  }, [maleta.length, deckLoaded, user, loadDeck]);

  // Recarregar maleta quando a página receber foco (útil após comprar cartas)
  useEffect(() => {
    const handleFocus = () => {
      loadMaleta();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadMaleta]);

  const getCardCountInDeck = (cardId: string) => {
    return deck.filter(slot => slot && slot.cardId === cardId).length;
  };

  const getAvailableCount = (userCard: UserCard) => {
    const cardsInDeck = getCardCountInDeck(userCard.cardId);
    return userCard.quantity - cardsInDeck;
  };

  const addToDeck = (userCard: UserCard) => {
    // Verificar se a carta existe
    if (!userCard.card) {
      alert('❌ Erro: Carta inválida!');
      return;
    }
    
    // Verificar o limite máximo de cópias permitidas no deck
    const maxCopies = userCard.card?.maxCopiesInDeck ?? 3;
    
    // Se maxCopies é 0, a carta está banida
    if (maxCopies === 0) {
      alert(`❌ Esta carta está banida e não pode ser adicionada ao deck!`);
      return;
    }

    // Verificar quantas cartas já estão no deck
    const cardsInDeck = getCardCountInDeck(userCard.cardId);
    
    // Verificar se já atingiu o limite máximo de cópias
    if (cardsInDeck >= maxCopies) {
      alert(`❌ Você já atingiu o limite máximo de ${maxCopies} cópia(s) desta carta no deck!`);
      return;
    }
    
    // Verificar se tem cartas disponíveis na maleta
    const available = userCard.quantity - cardsInDeck;
    if (available <= 0) {
      alert(`❌ Você não tem mais cópias desta carta disponíveis na maleta!`);
      return;
    }

    // Verificar se o deck está cheio
    const emptySlot = deck.findIndex(slot => slot === null);
    if (emptySlot === -1) {
      alert('❌ Deck está cheio! Remova uma carta antes de adicionar outra.');
      return;
    }

    // Adicionar carta ao deck
    setDeck(prev => {
      const newDeck = [...prev];
      newDeck[emptySlot] = { ...userCard };
      return newDeck;
    });
  };

  const removeFromDeck = (idx: number) => {
    setDeck(prev => {
      const newDeck = [...prev];
      newDeck[idx] = null;
      return newDeck;
    });
  };

  const getDeckCount = () => {
    return deck.filter(slot => slot !== null).length;
  };

  const getTotalCardsInMaleta = () => {
    return maleta.reduce((total, userCard) => total + userCard.quantity, 0);
  };

  const saveDeck = async () => {
    if (!user) {
      alert('Você precisa estar logado para salvar o deck!');
      return;
    }

    // Converter deck para array de cardIds
    console.log('🔍 [saveDeck] ==========================================');
    console.log('🔍 [saveDeck] Iniciando salvamento do deck');
    console.log('🔍 [saveDeck] Total de slots no deck:', deck.length);
    console.log('🔍 [saveDeck] Slots preenchidos:', deck.filter(s => s !== null).length);
    
    const cardIds = deck
      .filter((slot, index) => {
        if (!slot) return false;
        
        // Log detalhado dos primeiros 3 slots
        if (index < 3) {
          console.log(`🔍 [saveDeck] Slot ${index}:`, {
            hasSlot: !!slot,
            hasCardId: !!slot.cardId,
            cardId: slot.cardId,
            hasCard: !!slot.card,
            cardIdFromCard: slot.card?.id,
            cardIdCarta: (slot.card as any)?.idCarta,
            cardName: slot.card?.name,
          });
        }
        
        if (slot.cardId) {
          return true;
        }
        if (slot.card && slot.card.id) {
          console.warn('⚠️ [saveDeck] Slot sem cardId, usando card.id como fallback:', slot.card.id);
          slot.cardId = slot.card.id;
          return true;
        }
        // Tentar também com idCarta se disponível
        if (slot.card && (slot.card as any).idCarta) {
          console.warn('⚠️ [saveDeck] Slot sem cardId, usando card.idCarta como fallback:', (slot.card as any).idCarta);
          slot.cardId = (slot.card as any).idCarta;
          return true;
        }
        console.warn('⚠️ [saveDeck] Slot sem cardId e sem card.id/idCarta:', slot);
        return false;
      })
      .map((slot, index) => {
        const cardId = slot!.cardId || slot!.card?.id || (slot!.card as any)?.idCarta;
        if (!cardId) {
          console.error('❌ [saveDeck] ERRO: Não foi possível extrair cardId do slot:', slot);
        }
        if (index < 3) {
          console.log('📝 [saveDeck] Extraindo cardId:', cardId, 'do slot:', {
            hasCardId: !!slot!.cardId,
            hasCard: !!slot!.card,
            cardId: slot!.cardId,
            cardIdFromCard: slot!.card?.id,
            cardIdCarta: (slot!.card as any)?.idCarta,
          });
        }
        return cardId;
      })
      .filter(cardId => cardId && cardId.trim() !== '');
    
    console.log('🔍 [saveDeck] Total de cardIds extraídos:', cardIds.length);
    console.log('🔍 [saveDeck] Primeiros 5 cardIds:', cardIds.slice(0, 5));
    console.log('🔍 [saveDeck] ==========================================');

    // Validar se há cardIds válidos
    if (cardIds.length === 0) {
      if (!confirm('Seu deck está vazio. Deseja salvar mesmo assim?')) {
        return;
      }
    }

    // Validar se algum cardId está vazio ou inválido
    const invalidCardIds = cardIds.filter(id => !id || id.trim() === '');
    if (invalidCardIds.length > 0) {
      console.error('❌ CardIds inválidos encontrados:', invalidCardIds);
      alert('❌ Erro: Algumas cartas têm IDs inválidos. Por favor, remova-as e tente novamente.');
      return;
    }

    setSaving(true);
    try {
      console.log('💾 Salvando deck:', { 
        name: deckName, 
        cardIdsCount: cardIds.length,
        userId: user.id,
        cardIds: cardIds.slice(0, 10) // Log apenas os primeiros 10 para não poluir
      });
      
      const payload = {
        name: deckName.trim() || 'Meu Deck',
        cardIds,
      };
      
      console.log('📤 Enviando payload:', { ...payload, cardIds: `[${cardIds.length} cards]` });
      
      const res = await api.put('/decks/current', payload);
      
      console.log('✅ Resposta do servidor:', res.data);
      console.log('✅ Deck salvo com sucesso!');
      alert(`✅ Deck "${deckName}" salvo com sucesso!`);
    } catch (error: any) {
      console.error('❌ Erro completo ao salvar deck:', error);
      console.error('❌ Status:', error.response?.status);
      console.error('❌ Dados do erro:', error.response?.data);
      console.error('❌ Mensagem:', error.message);
      
      let errorMessage = 'Erro desconhecido ao salvar o deck';
      
      if (error.response) {
        // Erro do servidor
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      `Erro ${error.response.status}: ${error.response.statusText}`;
      } else if (error.request) {
        // Requisição foi feita mas não houve resposta
        errorMessage = 'Não foi possível conectar ao servidor. Verifique se o backend está rodando.';
      } else {
        // Erro ao configurar a requisição
        errorMessage = error.message || 'Erro ao configurar a requisição';
      }
      
      alert(`❌ Erro ao salvar deck: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
            🃏 Editor de Deck
          </h1>
          <p className="text-gray-400">Monte seu deck com até 60 cartas</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="bg-purple-900/30 px-4 py-2 rounded-lg border border-purple-500/30">
              <span className="text-purple-300 font-semibold">
                Cartas no Deck: {getDeckCount()}/60
              </span>
            </div>
            <div className="bg-green-900/30 px-4 py-2 rounded-lg border border-green-500/30">
              <span className="text-green-300 font-semibold">
                Cartas na Maleta: {getTotalCardsInMaleta()} ({maleta.length} tipos)
              </span>
            </div>
          </div>
        </motion.div>

        {/* Deck Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-purple-300 flex items-center gap-2">
                <span>📦</span> Deck ({getDeckCount()}/60)
              </h2>
              <input
                type="text"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                className="bg-slate-700 text-white px-3 py-1 rounded-lg border border-purple-500/30 focus:border-purple-500 focus:outline-none text-sm"
                placeholder="Nome do deck"
                maxLength={50}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveDeck}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors text-sm flex items-center gap-2"
              >
                {saving ? (
                  <>⏳ Salvando...</>
                ) : (
                  <>💾 Salvar Deck</>
                )}
              </button>
              {getDeckCount() > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Tem certeza que deseja limpar todo o deck?')) {
                      setDeck(Array(60).fill(null));
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors text-sm"
                >
                  🗑️ Limpar
                </button>
              )}
            </div>
          </div>
          <div className="bg-transparent rounded-xl p-6 border-2 border-purple-500/30 shadow-2xl">
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
              {deck.map((slot, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className={`relative aspect-[2/3] rounded-lg border-2 transition-all duration-200 ${
                    slot && slot.card
                      ? `bg-gradient-to-br ${getRarityColor(slot.card?.rarity || 'Common')} cursor-pointer hover:scale-105 shadow-lg`
                      : 'bg-slate-700/50 border-slate-600 border-dashed hover:border-purple-500/50'
                  }`}
                  onClick={() => slot && slot.card && setSelectedCard(slot)}
                >
                  {slot && slot.card ? (
                    <>
                      {/* Card Image */}
                      <CardImage
                        card={slot.card}
                        className="w-full h-full object-cover rounded-lg"
                        fallback="/images/fundoCarta.webp"
                      />
                      
                      {/* Quantity Badge - Mostra quantas cópias estão no deck */}
                      {(() => {
                        const countInDeck = getCardCountInDeck(slot.cardId);
                        return countInDeck > 1 ? (
                          <div className="absolute top-1 left-1 bg-purple-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg">
                            x{countInDeck}
                          </div>
                        ) : null;
                      })()}
                      
                      {/* Card Name Tooltip */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {slot.card?.name || 'Carta sem nome'}
                      </div>
                      
                      {/* Remove Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromDeck(idx);
                        }}
                        className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                      >
                        ✖
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-gray-500 text-xs">Vazio</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Maleta Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-green-300 flex items-center gap-2">
              <span>💼</span> Maleta - Suas Cartas ({maleta.length})
            </h2>
            <button
              onClick={loadMaleta}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>⏳ Carregando...</>
              ) : (
                <>🔄 Atualizar</>
              )}
            </button>
          </div>
          {loading ? (
            <div className="text-center py-16 bg-slate-800 rounded-xl">
              <p className="text-gray-400 text-xl">⏳ Carregando cartas...</p>
            </div>
          ) : maleta.length === 0 ? (
            <div className="text-center py-16 bg-slate-800 rounded-xl border-2 border-slate-700">
              <p className="text-6xl mb-4">📭</p>
              <p className="text-gray-400 text-xl mb-2">Sua maleta está vazia</p>
              <p className="text-gray-500">Compre cartas na loja para adicioná-las aqui!</p>
            </div>
          ) : (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border-2 border-green-500/30 shadow-2xl">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
                {maleta.map((userCard) => {
                  // Verificar se card existe
                  if (!userCard.card) {
                    console.warn('⚠️ UserCard sem card:', userCard);
                    return null;
                  }

                  const card = userCard.card;
                  const rarity = card.rarity || 'Common';
                  const cardsInDeck = getCardCountInDeck(userCard.cardId);
                  const available = getAvailableCount(userCard);
                  const maxCopies = card.maxCopiesInDeck ?? 3;
                  
                  // Verificar se pode adicionar: tem cartas disponíveis E não atingiu o limite máximo
                  const canAdd = available > 0 && 
                                 maxCopies > 0 && 
                                 cardsInDeck < maxCopies;
                  
                  return (
                    <motion.div
                      key={userCard.id || `${userCard.cardId}-${Math.random()}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={canAdd ? { scale: 1.05 } : {}}
                      whileTap={canAdd ? { scale: 0.95 } : {}}
                      className={`relative aspect-[2/3] rounded-lg border-2 bg-gradient-to-br ${getRarityColor(rarity)} ${
                        canAdd 
                          ? 'cursor-pointer shadow-lg hover:shadow-xl transition-all duration-200' 
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => canAdd && addToDeck(userCard)}
                      title={`${card.name}\nDisponível: ${available}/${userCard.quantity}\nNo deck: ${cardsInDeck}/${maxCopies}\nLimite máximo: ${maxCopies === 0 ? 'Banida' : maxCopies}`}
                    >
                      {/* Card Image */}
                      <CardImage
                        card={card}
                        className="w-full h-full object-cover rounded-lg"
                        fallback="/images/fundoCarta.webp"
                      />
                      
                      {/* Quantity Badge - Total na maleta */}
                      <div className="absolute top-1 left-1 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg">
                        {userCard.quantity > 1 ? `x${userCard.quantity}` : '1'}
                      </div>
                      
                      {/* Available Badge - Quantas podem ser adicionadas */}
                      {available > 0 && (
                        <div className="absolute top-1 right-1 bg-green-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg">
                          +{available}
                        </div>
                      )}
                      
                      {/* Used Badge - Quantas já estão no deck */}
                      {cardsInDeck > 0 && (
                        <div className="absolute bottom-1 left-1 bg-purple-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg">
                          Deck: {cardsInDeck}
                        </div>
                      )}
                      
                      {/* Card Name */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {card.name}
                      </div>
                      
                      {/* Hover Overlay - Só aparece se pode adicionar */}
                      {canAdd && (
                        <div className="absolute inset-0 bg-green-500/0 hover:bg-green-500/20 rounded-lg transition-colors flex items-center justify-center">
                          <span className="opacity-0 hover:opacity-100 text-white font-bold text-sm">+</span>
                        </div>
                      )}
                      
                      {/* Overlay quando não pode adicionar mais */}
                      {!canAdd && (
                        <div className="absolute inset-0 bg-red-500/30 rounded-lg flex items-center justify-center">
                          {maxCopies === 0 ? (
                            <span className="text-red-300 text-[10px] font-bold text-center px-1">BANIDA</span>
                          ) : cardsInDeck >= maxCopies ? (
                            <span className="text-red-300 text-[10px] font-bold text-center px-1">LIMITE: {maxCopies}</span>
                          ) : (
                            <span className="text-red-300 text-[10px] font-bold text-center px-1">SEM CÓPIAS</span>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        {/* Card Details Modal */}
        {selectedCard && selectedCard.card && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`bg-gradient-to-br ${getRarityColor(selectedCard.card?.rarity || 'Common')} rounded-xl p-6 max-w-md w-full border-2 border-white/20`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full mb-4" style={{ maxHeight: '400px' }}>
                <CardImage
                  card={selectedCard.card}
                  className="w-full h-auto rounded-lg"
                  fallback="/images/fundoCarta.webp"
                />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{selectedCard.card?.name || 'Carta sem nome'}</h3>
              <p className="text-white/80 mb-4">{selectedCard.card?.description || 'Sem descrição'}</p>
              {selectedCard.card?.type === 'Monster' && (
                <div className="flex gap-4 mb-4">
                  {selectedCard.card?.atk !== undefined && selectedCard.card?.atk !== null && (
                    <div className="bg-red-900/50 px-3 py-2 rounded">
                      <span className="text-red-300 text-sm">ATK: {selectedCard.card.atk}</span>
                    </div>
                  )}
                  {selectedCard.card?.def !== undefined && selectedCard.card?.def !== null && (
                    <div className="bg-blue-900/50 px-3 py-2 rounded">
                      <span className="text-blue-300 text-sm">DEF: {selectedCard.card.def}</span>
                    </div>
                  )}
                  {selectedCard.card?.level !== undefined && selectedCard.card?.level !== null && (
                    <div className="bg-purple-900/50 px-3 py-2 rounded">
                      <span className="text-purple-300 text-sm">Nível: {selectedCard.card.level}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="mb-4">
                <div className="text-white/70 text-sm">
                  <p><strong>Tipo:</strong> {selectedCard.card?.type || 'N/A'}</p>
                  <p><strong>Raridade:</strong> {selectedCard.card?.rarity || 'Common'}</p>
                  {selectedCard.card?.maxCopiesInDeck !== undefined && (
                    <p><strong>Máximo no deck:</strong> {selectedCard.card.maxCopiesInDeck === 0 ? 'Banida' : selectedCard.card.maxCopiesInDeck}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedCard(null)}
                className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-2 rounded-lg transition-colors"
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
