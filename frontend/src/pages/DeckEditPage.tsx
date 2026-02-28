import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  const location = useLocation();
  const locationState = location.state as any;
  const isNewDeck = locationState?.newDeck === true;
  // Usar equippedDeckName do usuário se disponível, senão usar o nome do location.state, senão 'Meu Deck'
  const initialDeckName = locationState?.deckName || (user as any)?.equippedDeckName || 'Meu Deck';
  const [maleta, setMaleta] = useState<UserCard[]>([]);
  const [allUserCards, setAllUserCards] = useState<UserCard[]>([]); // Todas as cartas do usuário (sem filtro)
  const [deck, setDeck] = useState<(UserCard | null)[]>(Array(60).fill(null));
  const [extraDeck, setExtraDeck] = useState<(UserCard | null)[]>(Array(15).fill(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [deckName, setDeckName] = useState(initialDeckName);
  const [deckLoaded, setDeckLoaded] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deckNameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  
  // Refs para armazenar os valores mais recentes do estado
  const deckRef = useRef(deck);
  const extraDeckRef = useRef(extraDeck);
  const deckNameRef = useRef(deckName);
  const loadMaletaRef = useRef<(() => Promise<void>) | null>(null);
  
  // Atualizar refs quando o estado mudar
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);
  
  useEffect(() => {
    extraDeckRef.current = extraDeck;
  }, [extraDeck]);
  
  useEffect(() => {
    deckNameRef.current = deckName;
  }, [deckName]);

  // Função para salvar o deck imediatamente (usa refs para pegar valores mais recentes)
  const saveDeckImmediately = useCallback(async () => {
    if (!deckLoaded || !user) {
      console.log('⏸️ [saveDeckImmediately] Salvamento pausado:', { deckLoaded, hasUser: !!user });
      return;
    }

    // Evitar múltiplos salvamentos simultâneos usando ref
    if (savingRef.current) {
      console.log('⏸️ [saveDeckImmediately] Já está salvando, ignorando...');
      return;
    }

    // Usar um pequeno delay para garantir que o estado foi atualizado
    setTimeout(async () => {
      // Verificar novamente se já está salvando (pode ter mudado durante o delay)
      if (savingRef.current) {
        console.log('⏸️ [saveDeckImmediately] Salvamento cancelado (já está salvando)');
        return;
      }
      
      // Marcar como salvando
      savingRef.current = true;
      setSaving(true);
      try {
        // Usar as refs que são atualizadas imediatamente
        const currentDeck = deckRef.current;
        const currentExtraDeck = extraDeckRef.current;
        const currentDeckName = deckNameRef.current;

        console.log('💾 [saveDeckImmediately] Iniciando salvamento imediato...', {
          deckCount: currentDeck.filter(s => s !== null && s !== undefined).length,
          extraDeckCount: currentExtraDeck.filter(s => s !== null && s !== undefined).length,
          deckName: currentDeckName,
          deckArrayLength: currentDeck.length,
          extraDeckArrayLength: currentExtraDeck.length
        });

        const cardIds = currentDeck
          .filter(slot => slot !== null && slot !== undefined)
          .map(slot => {
            if (!slot) return null;
            const cardId = slot.cardId || slot.card?.id || (slot.card as any)?.idCarta;
            if (!cardId) {
              console.warn('⚠️ [saveDeckImmediately] Slot sem cardId válido:', slot);
              return null;
            }
            return cardId;
          })
          .filter((cardId): cardId is string => cardId !== null && cardId !== undefined && cardId.trim() !== '');

        const extraDeckCardIds = currentExtraDeck
          .filter(slot => slot !== null && slot !== undefined)
          .map(slot => {
            if (!slot) return null;
            const cardId = slot.cardId || slot.card?.id || (slot.card as any)?.idCarta;
            if (!cardId) {
              console.warn('⚠️ [saveDeckImmediately] Slot Extra Deck sem cardId válido:', slot);
              return null;
            }
            return cardId;
          })
          .filter((cardId): cardId is string => cardId !== null && cardId !== undefined && cardId.trim() !== '');

        const payload = {
          name: currentDeckName.trim() || 'Meu Deck',
          cardIds,
          extraDeckCardIds: extraDeckCardIds.length > 0 ? extraDeckCardIds : undefined,
        };

        console.log('📤 [saveDeckImmediately] Enviando payload:', {
          name: payload.name,
          cardIdsCount: payload.cardIds.length,
          extraDeckCardIdsCount: payload.extraDeckCardIds?.length || 0,
          first5CardIds: payload.cardIds.slice(0, 5)
        });

        const res = await api.put('/decks/current', payload);
        console.log('✅ [saveDeckImmediately] Deck salvo com sucesso!', {
          deckId: res.data?.id,
          deckName: res.data?.name,
          cardsCount: res.data?.cards?.length || 0
        });
        
        // Recarregar a maleta após salvar para garantir sincronização com todos os decks
        // Isso garante que a maleta mostre apenas cartas que não estão em nenhum deck
        // Usar uma ref para evitar dependência circular
        setTimeout(() => {
          if (loadMaletaRef.current) {
            loadMaletaRef.current();
          }
        }, 300);
      } catch (error: any) {
        console.error('❌ [saveDeckImmediately] Erro ao salvar deck:', error);
        console.error('❌ [saveDeckImmediately] Status:', error.response?.status);
        console.error('❌ [saveDeckImmediately] Detalhes:', error.response?.data || error.message);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }, 200); // Pequeno delay para garantir que o estado foi atualizado
  }, [deckLoaded, user]);

  // Atualizar initialDeckName quando user.equippedDeckName mudar
  useEffect(() => {
    const equippedDeckName = (user as any)?.equippedDeckName;
    if (equippedDeckName && !locationState?.deckName) {
      console.log('🔄 [DeckEditPage] Atualizando deckName para equippedDeckName:', equippedDeckName);
      setDeckName(equippedDeckName);
    }
  }, [(user as any)?.equippedDeckName, locationState?.deckName]);

  const loadMaleta = useCallback(async () => {
    if (!user) {
      console.log('⚠️ Usuário não autenticado');
      return;
    }
    setLoading(true);
    try {
      console.log('🔄 Carregando maleta para usuário:', user.id);

      const [inventoryRes, decksRes] = (await Promise.race([
        Promise.all([
          api.get('/shop/inventory', { timeout: 20000 }),
          api.get('/decks', { timeout: 20000 }),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 20000),
        ),
      ])) as any;

      const inventoryResponse = inventoryRes?.data;
      const decksData = decksRes?.data;

      // O endpoint retorna { cards: UserCard[], playmats: any[], skins: any[] }
      const inventoryData = inventoryResponse?.cards || (Array.isArray(inventoryResponse) ? inventoryResponse : []);

      console.log('📦 Inventário recebido:', {
        total: inventoryData.length,
        cards: inventoryData.length,
        response: inventoryResponse
      });
      console.log('📦 Decks recebidos:', Array.isArray(decksData) ? decksData.length : 'N/A');

      // Mapear quantas cópias de cada cardId estão sendo usadas em TODOS os decks
      const usedInDecks = new Map<string, number>();
      if (Array.isArray(decksData)) {
        decksData.forEach((deck: any) => {
          if (Array.isArray(deck.cards)) {
            deck.cards.forEach((deckCard: any) => {
              const cid = deckCard.cardId;
              if (!cid) return;
              usedInDecks.set(cid, (usedInDecks.get(cid) || 0) + 1);
            });
          }
        });
      }

      if (Array.isArray(inventoryData) && inventoryData.length > 0) {
        // IMPORTANTE: allUserCards deve manter a quantidade TOTAL que o usuário possui
        // A quantidade disponível será calculada dinamicamente baseada nos decks
        setAllUserCards(inventoryData);
        
        // Para a maleta, calcular quantas cópias ainda estão disponíveis (total - usadas em decks)
        const adjusted: UserCard[] = [];

        inventoryData.forEach((uc: UserCard) => {
          if (!uc || !uc.cardId) return;
          const ownedQty = uc.quantity || 0; // Quantidade total que o usuário possui
          const usedQty = usedInDecks.get(uc.cardId) || 0; // Quantidade usada em todos os decks
          const available = ownedQty - usedQty; // Quantidade disponível na maleta

          console.log('📦 [Maleta] Card', {
            cardId: uc.cardId,
            name: uc.card?.name,
            ownedQty, // Total que possui
            usedQty, // Usadas em decks
            available, // Disponível na maleta
          });

          // Mostrar na maleta apenas cartas com cópias disponíveis
          if (available > 0) {
            adjusted.push({
              ...uc,
              quantity: available, // Mostrar quantidade disponível na maleta
            });
          }
        });

        setMaleta(adjusted); // Maleta mostra apenas cartas disponíveis
        console.log('✅ Maleta carregada:', {
          totalCartas: inventoryData.length,
          cartasDisponiveis: adjusted.length,
          totalCópias: inventoryData.reduce((sum, uc) => sum + (uc.quantity || 0), 0),
          cópiasDisponíveis: adjusted.reduce((sum, uc) => sum + (uc.quantity || 0), 0)
        });
      } else {
        console.warn('⚠️ Dados de inventário vazios ou inválidos:', {
          inventoryData,
          isArray: Array.isArray(inventoryData),
          length: inventoryData?.length
        });
        setAllUserCards([]);
      }
      } catch (error: any) {
      console.error('❌ Erro ao carregar maleta:', error);
      console.error('❌ Detalhes do erro:', error.response?.data || error.message);
      setAllUserCards([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Atualizar ref quando loadMaleta for definido
  useEffect(() => {
    loadMaletaRef.current = loadMaleta;
  }, [loadMaleta]);

  // A maleta é calculada em loadMaleta baseada em allUserCards (total) - usedInDecks
  // Não precisa recalcular aqui, a maleta já é atualizada em loadMaleta

  const loadDeck = useCallback(async () => {
    if (!user) return;
    try {
      // Usar deckName do estado (que pode ter sido atualizado) ou initialDeckName
      const deckNameToLoad = deckName || initialDeckName || (user as any)?.equippedDeckName || 'Meu Deck';
      console.log('🔄 [loadDeck] Carregando deck salvo...');
      console.log('🔄 [loadDeck] deckName (estado):', deckName);
      console.log('🔄 [loadDeck] initialDeckName:', initialDeckName);
      console.log('🔄 [loadDeck] user.equippedDeckName:', (user as any)?.equippedDeckName);
      console.log('🔄 [loadDeck] Usando deckNameToLoad:', deckNameToLoad);
      const res = await Promise.race([
        api.get(`/decks/current?name=${encodeURIComponent(deckNameToLoad)}`, { timeout: 20000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
      ]) as any;
      
      console.log('📦 [loadDeck] Resposta completa:', res.data);
      console.log('📦 [loadDeck] Deck ID:', res.data?.id);
      console.log('📦 [loadDeck] Deck Name:', res.data?.name);
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
        
        // Criar um mapa de cardId para UserCard de todas as cartas do usuário
        const allCardsMap = new Map<string, UserCard>();
        allUserCards.forEach(uc => {
          if (uc.cardId) {
            allCardsMap.set(uc.cardId, uc);
          }
          // Também mapear por card.id se disponível
          if (uc.card?.id) {
            allCardsMap.set(uc.card.id, uc);
          }
        });

        // Separar cartas do deck principal e do extra deck
        const mainDeckCards = cards.filter((dc: any) => !dc.isExtraDeck);
        const extraDeckCards = cards.filter((dc: any) => dc.isExtraDeck === true);

        // Converter deck principal do backend para formato do frontend
        const loadedDeck: (UserCard | null)[] = Array(60).fill(null);
        mainDeckCards.forEach((deckCard: any, index: number) => {
          if (index < 60) {
            // Tentar encontrar nas cartas do usuário pelo cardId
            let userCard = allCardsMap.get(deckCard.cardId);
            
            // Se não encontrou e tem card.id, tentar por card.id
            if (!userCard && deckCard.card?.id) {
              userCard = allCardsMap.get(deckCard.card.id);
            }
            
            if (userCard) {
              loadedDeck[index] = userCard;
            } else if (deckCard.card) {
              // Se a carta não está na maleta, criar um UserCard básico
              const cardIdToUse = deckCard.cardId || deckCard.card.id;
              loadedDeck[index] = {
                id: `${cardIdToUse}-${index}-${Date.now()}`,
                cardId: cardIdToUse,
                quantity: 1,
                card: deckCard.card,
                acquiredBy: 'GIFT' as any,
              } as UserCard;
            }
          }
        });

        // Converter extra deck do backend para formato do frontend
        const loadedExtraDeck: (UserCard | null)[] = Array(15).fill(null);
        extraDeckCards.forEach((deckCard: any, index: number) => {
          if (index < 15) {
            let userCard = allCardsMap.get(deckCard.cardId);
            if (!userCard && deckCard.card?.id) {
              userCard = allCardsMap.get(deckCard.card.id);
            }
            
            if (userCard) {
              loadedExtraDeck[index] = userCard;
            } else if (deckCard.card) {
              const cardIdToUse = deckCard.cardId || deckCard.card.id;
              loadedExtraDeck[index] = {
                id: `${cardIdToUse}-extra-${index}-${Date.now()}`,
                cardId: cardIdToUse,
                quantity: 1,
                card: deckCard.card,
                acquiredBy: 'GIFT' as any,
              } as UserCard;
            }
          }
        });

        const cardsLoaded = loadedDeck.filter(slot => slot !== null).length;
        const extraDeckCardsLoaded = loadedExtraDeck.filter(slot => slot !== null).length;
        console.log('✅ [loadDeck] Deck carregado com', cardsLoaded, 'cartas no deck principal e', extraDeckCardsLoaded, 'no Extra Deck');
        
        setDeck(loadedDeck);
        setExtraDeck(loadedExtraDeck);
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
  }, [user, allUserCards, deckName, initialDeckName]);

  useEffect(() => {
    loadMaleta();
  }, [loadMaleta]);

  // Carregar deck após a maleta ser carregada (apenas uma vez)
  useEffect(() => {
    if (!deckLoaded && user) {
      // Aguardar maleta carregar OU se for novo deck, não precisa esperar
      if (isNewDeck) {
        // Novo deck: começar vazio e não carregar do backend
        setDeck(Array(60).fill(null));
        setDeckName('Novo Deck');
        setDeckLoaded(true);
      } else if (allUserCards.length >= 0) {
        // Carregar deck mesmo se maleta estiver vazia (pode ter cartas no deck que não estão na maleta)
        // Usar um pequeno delay para garantir que o deckName foi atualizado
        const timer = setTimeout(() => {
          console.log('🔄 [useEffect] Carregando deck, deckName:', deckName);
          loadDeck();
          setDeckLoaded(true);
        }, 100);
        return () => clearTimeout(timer);
      }
      
      // Inicializar Extra Deck vazio se for novo deck
      if (isNewDeck) {
        setExtraDeck(Array(15).fill(null));
      }
    }
  }, [allUserCards.length, deckLoaded, user, loadDeck, isNewDeck, deckName]);

  // Recarregar maleta quando a página receber foco (útil após comprar cartas)
  useEffect(() => {
    const handleFocus = () => {
      loadMaleta();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadMaleta]);

  // Contar cartas por nome (para considerar diferentes skins da mesma carta)
  const getCardCountInDeck = (cardId: string, cardName?: string) => {
    if (cardName) {
      // Se temos o nome, contar por nome (considera todas as skins)
      return deck.filter(slot => slot && slot.card && slot.card.name === cardName).length;
    }
    // Fallback: contar por cardId (compatibilidade)
    return deck.filter(slot => slot && slot.cardId === cardId).length;
  };

  const getCardCountInExtraDeck = (cardId: string, cardName?: string) => {
    if (cardName) {
      // Se temos o nome, contar por nome (considera todas as skins)
      return extraDeck.filter(slot => slot && slot.card && slot.card.name === cardName).length;
    }
    // Fallback: contar por cardId (compatibilidade)
    return extraDeck.filter(slot => slot && slot.cardId === cardId).length;
  };

  const getAvailableCount = (userCard: UserCard) => {
    // IMPORTANTE: Disponibilidade é por SKIN (cardId), não por nome
    // Cada skin é independente na maleta, mas o limite de deck é por nome
    const cardsInMainDeck = deck.filter(slot => slot && slot.cardId === userCard.cardId).length;
    const cardsInExtra = extraDeck.filter(slot => slot && slot.cardId === userCard.cardId).length;
    const totalInDecks = cardsInMainDeck + cardsInExtra; // Quantidade desta SKIN específica no deck
    
    // Buscar quantidade total desta SKIN específica (de allUserCards)
    const totalOwned = allUserCards.find(uc => uc.cardId === userCard.cardId)?.quantity || userCard.quantity;
    return totalOwned - totalInDecks; // Disponibilidade desta SKIN específica
  };

  const addToDeck = (userCard: UserCard) => {
    // Verificar se a carta existe
    if (!userCard.card) {
      alert('❌ Erro: Carta inválida!');
      return;
    }
    
    // IMPORTANTE: Cartas do tipo Fusion devem ir automaticamente para o Extra Deck
    if (isFusionMonster(userCard.card)) {
      addToExtraDeck(userCard);
      return;
    }
    
    // Verificar o limite máximo de cópias permitidas no deck
    const maxCopies = userCard.card?.maxCopiesInDeck ?? 3;
    
    // Se maxCopies é 0, a carta está banida
    if (maxCopies === 0) {
      alert(`❌ Esta carta está banida e não pode ser adicionada ao deck!`);
      return;
    }

    // Verificar limite de deck: contar por NOME (todas as skins contam juntas)
    const cardName = userCard.card?.name;
    const cardsInMainDeckByName = getCardCountInDeck(userCard.cardId, cardName);
    const cardsInExtraByName = getCardCountInExtraDeck(userCard.cardId, cardName);
    const totalInDecksByName = cardsInMainDeckByName + cardsInExtraByName;
    
    // Verificar se já atingiu o limite máximo de cópias (por nome - todas as skins)
    if (totalInDecksByName >= maxCopies) {
      alert(`❌ Você já atingiu o limite máximo de ${maxCopies} cópia(s) desta carta no deck! (considerando todas as skins)`);
      return;
    }
    
    // Verificar disponibilidade: contar por SKIN (cardId) - cada skin é independente
    const cardsInMainDeckBySkin = deck.filter(slot => slot && slot.cardId === userCard.cardId).length;
    const cardsInExtraBySkin = extraDeck.filter(slot => slot && slot.cardId === userCard.cardId).length;
    const totalInDecksBySkin = cardsInMainDeckBySkin + cardsInExtraBySkin; // Quantidade desta SKIN específica
    
    // Buscar quantidade total desta SKIN específica
    const totalOwned = allUserCards.find(uc => uc.cardId === userCard.cardId)?.quantity || userCard.quantity;
    const available = totalOwned - totalInDecksBySkin; // Disponibilidade desta SKIN específica
    
    if (available <= 0) {
      alert(`❌ Você não tem mais cópias desta skin disponíveis!`);
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
      // Atualizar ref imediatamente
      deckRef.current = newDeck;
      // Salvar imediatamente
      saveDeckImmediately();
      return newDeck;
    });

    // Recarregar maleta após salvar o deck para recalcular quantidades disponíveis
    // A maleta será recalculada automaticamente quando o deck for salvo
    setTimeout(() => {
      if (loadMaletaRef.current) {
        loadMaletaRef.current();
      }
    }, 500);
  };

  const removeFromDeck = (idx: number) => {
    setDeck(prev => {
      const cardToRemove = prev[idx];
      
      // Verificar se o deck tem 40 cartas (mínimo permitido)
      const currentDeckCount = prev.filter(slot => slot !== null).length;
      if (currentDeckCount <= 40) {
        alert('❌ O deck principal não pode ter menos de 40 cartas!');
        return prev; // Não remover a carta
      }
      
      // Remover a carta e reorganizar o array para não deixar espaços vazios
      const cardsWithoutNull = prev.filter((slot, index) => index !== idx);
      // Preencher o array até 60 slots com null no final
      const newDeck = [...cardsWithoutNull, ...Array(60 - cardsWithoutNull.length).fill(null)];
      
      // Atualizar ref imediatamente
      deckRef.current = newDeck;
      
      // Log para debug
      console.log('🗑️ [removeFromDeck] Removendo carta do índice', idx, {
        cardId: cardToRemove?.cardId,
        cardName: cardToRemove?.card?.name,
        newDeckLength: newDeck.filter(s => s !== null).length
      });
      
      // Salvar imediatamente
      saveDeckImmediately();
      
      // Recarregar maleta após salvar o deck para recalcular quantidades disponíveis
      setTimeout(() => {
        if (loadMaletaRef.current) {
          loadMaletaRef.current();
        }
      }, 500);
      
      return newDeck;
    });
  };

  const getDeckCount = () => {
    return deck.filter(slot => slot !== null).length;
  };

  const getExtraDeckCount = () => {
    return extraDeck.filter(slot => slot !== null).length;
  };

  const isFusionMonster = (card: any): boolean => {
    return card?.type === 'Monster' && card?.monsterType === 'Fusion';
  };

  const addToExtraDeck = (userCard: UserCard) => {
    // Verificar se é um monstro Fusion
    if (!isFusionMonster(userCard.card)) {
      alert('❌ Apenas monstros do tipo Fusion podem ser adicionados ao Extra Deck!');
      return;
    }

    // Verificar se o Extra Deck está cheio
    const emptySlot = extraDeck.findIndex(slot => slot === null);
    if (emptySlot === -1) {
      alert('❌ Extra Deck está cheio! Remova uma carta antes de adicionar outra.');
      return;
    }

    // Verificar limite de cópias (mesma lógica do deck principal)
    const maxCopies = userCard.card?.maxCopiesInDeck ?? 3;
    if (maxCopies === 0) {
      alert(`❌ Esta carta está banida e não pode ser adicionada ao Extra Deck!`);
      return;
    }

    // Verificar limite de deck: contar por NOME (todas as skins contam juntas)
    const cardName = userCard.card?.name;
    const cardsInMainDeckByName = getCardCountInDeck(userCard.cardId, cardName);
    const cardsInExtraDeckByName = getCardCountInExtraDeck(userCard.cardId, cardName);
    const totalInDecksByName = cardsInMainDeckByName + cardsInExtraDeckByName;
    
    // Verificar se já atingiu o limite máximo de cópias (por nome - todas as skins)
    if (totalInDecksByName >= maxCopies) {
      alert(`❌ Você já atingiu o limite máximo de ${maxCopies} cópia(s) desta carta no deck! (considerando todas as skins)`);
      return;
    }
    
    // Verificar disponibilidade: contar por SKIN (cardId) - cada skin é independente
    const cardsInMainDeckBySkin = deck.filter(slot => slot && slot.cardId === userCard.cardId).length;
    const cardsInExtraDeckBySkin = extraDeck.filter(slot => slot && slot.cardId === userCard.cardId).length;
    const totalInDecksBySkin = cardsInMainDeckBySkin + cardsInExtraDeckBySkin; // Quantidade desta SKIN específica
    
    // Buscar quantidade total desta SKIN específica
    const totalOwned = allUserCards.find(uc => uc.cardId === userCard.cardId)?.quantity || userCard.quantity;
    const available = totalOwned - totalInDecksBySkin; // Disponibilidade desta SKIN específica
    
    if (available <= 0) {
      alert(`❌ Você não tem mais cópias desta skin disponíveis!`);
      return;
    }

    // Adicionar carta ao Extra Deck
    setExtraDeck(prev => {
      const newExtraDeck = [...prev];
      newExtraDeck[emptySlot] = { ...userCard };
      // Atualizar ref imediatamente
      extraDeckRef.current = newExtraDeck;
      // Salvar imediatamente
      saveDeckImmediately();
      return newExtraDeck;
    });

    // Recarregar maleta após salvar o deck para recalcular quantidades disponíveis
    setTimeout(() => {
      if (loadMaletaRef.current) {
        loadMaletaRef.current();
      }
    }, 500);
  };

  const removeFromExtraDeck = (idx: number) => {
    setExtraDeck(prev => {
      const cardToRemove = prev[idx];
      
      // Remover a carta e reorganizar o array para não deixar espaços vazios
      const cardsWithoutNull = prev.filter((slot, index) => index !== idx);
      // Preencher o array até 15 slots com null no final
      const newExtraDeck = [...cardsWithoutNull, ...Array(15 - cardsWithoutNull.length).fill(null)];
      
      // Atualizar ref imediatamente
      extraDeckRef.current = newExtraDeck;
      
      // Log para debug
      console.log('🗑️ [removeFromExtraDeck] Removendo carta do Extra Deck índice', idx, {
        cardId: cardToRemove?.cardId,
        cardName: cardToRemove?.card?.name,
        newExtraDeckLength: newExtraDeck.filter(s => s !== null).length
      });
      
      // Salvar imediatamente
      saveDeckImmediately();
      
      // Recarregar maleta após salvar o deck para recalcular quantidades disponíveis
      setTimeout(() => {
        if (loadMaletaRef.current) {
          loadMaletaRef.current();
        }
      }, 500);
      
      return newExtraDeck;
    });
  };

  const getTotalCardsInMaleta = () => {
    return maleta.reduce((total, userCard) => total + userCard.quantity, 0);
  };

  const saveDeck = async (silent: boolean = false) => {
    if (!user) {
      if (!silent) {
        alert('Você precisa estar logado para salvar o deck!');
      }
      return;
    }

    // Remover validação de 40-60 cartas para permitir salvar automaticamente
    // O usuário pode ter menos de 40 cartas enquanto está montando o deck

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

    // Validar se há cardIds válidos (apenas se não for salvamento silencioso)
    if (cardIds.length === 0 && !silent) {
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
      
      // Extrair cardIds do Extra Deck
    const extraDeckCardIds = extraDeck
      .filter((slot) => slot !== null)
      .map((slot) => {
        const cardId = slot!.cardId || slot!.card?.id || (slot!.card as any)?.idCarta;
        return cardId;
      })
      .filter((cardId) => cardId && cardId.trim() !== '');

    const payload = {
        name: deckName.trim() || 'Meu Deck',
        cardIds,
        extraDeckCardIds: extraDeckCardIds.length > 0 ? extraDeckCardIds : undefined,
      };
      
      console.log('📤 Enviando payload:', { ...payload, cardIds: `[${cardIds.length} cards]` });
      
      const res = await api.put('/decks/current', payload);
      
      console.log('✅ Resposta do servidor:', res.data);
      console.log('✅ Deck salvo com sucesso!');
      if (!silent) {
        alert(`✅ Deck "${deckName}" salvo com sucesso!`);
      }
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
      
      if (!silent) {
        alert(`❌ Erro ao salvar deck: ${errorMessage}`);
      }
    } finally {
      setSaving(false);
    }
  };

  // Função para salvar automaticamente (sem validações e sem alertas)
  const autoSaveDeck = useCallback(() => {
    if (!user || saving) return; // Não salvar se já estiver salvando
    
    // Usar um debounce para evitar muitas requisições
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        // Usar os valores mais recentes das refs
        const currentDeck = deckRef.current;
        const currentExtraDeck = extraDeckRef.current;
        const currentDeckName = deckNameRef.current;

        console.log('💾 [autoSave] Iniciando salvamento automático...', {
          deckCount: currentDeck.filter(s => s !== null).length,
          extraDeckCount: currentExtraDeck.filter(s => s !== null).length,
          deckName: currentDeckName
        });

        const cardIds = currentDeck
          .filter(slot => slot !== null)
          .map(slot => slot!.cardId || slot!.card?.id || (slot!.card as any)?.idCarta)
          .filter(cardId => cardId && cardId.trim() !== '');

        const extraDeckCardIds = currentExtraDeck
          .filter(slot => slot !== null)
          .map(slot => slot!.cardId || slot!.card?.id || (slot!.card as any)?.idCarta)
          .filter(cardId => cardId && cardId.trim() !== '');

        const payload = {
          name: currentDeckName.trim() || 'Meu Deck',
          cardIds,
          extraDeckCardIds: extraDeckCardIds.length > 0 ? extraDeckCardIds : undefined,
        };

        setSaving(true);
        const res = await api.put('/decks/current', payload);
        console.log('✅ [autoSave] Deck salvo automaticamente com sucesso!', res.data);
      } catch (error: any) {
        console.error('❌ [autoSave] Erro ao salvar deck automaticamente:', error);
        console.error('❌ [autoSave] Detalhes:', error.response?.data || error.message);
      } finally {
        setSaving(false);
      }
    }, 1000); // Aguardar 1 segundo após a última alteração
  }, [user, saving]);

  return (
    <div className="min-h-screen py-8 px-4 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-2xl">
            Editor de Deck
          </h1>
          <p className="text-gray-200 font-medium">Monte seu deck com até 60 cartas</p>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <div className="px-4 py-2 rounded-lg bg-gray-800/50 backdrop-blur-sm border-2 border-blue-500/50">
              <span className="text-blue-400 font-semibold">
                Deck Principal: {getDeckCount()}/60
              </span>
            </div>
            <div className="px-4 py-2 rounded-lg bg-gray-800/50 backdrop-blur-sm border-2 border-purple-500/50">
              <span className="text-purple-400 font-semibold">
                Extra Deck: {getExtraDeckCount()}/15
              </span>
            </div>
            <div className="px-4 py-2 rounded-lg bg-gray-800/50 backdrop-blur-sm border-2 border-pink-500/50">
              <span className="text-pink-400 font-semibold">
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
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Deck Principal Section */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold text-blue-400 flex items-center gap-2">
                Deck Principal ({getDeckCount()}/60)
              </h2>
              <input
                type="text"
                value={deckName}
                onChange={(e) => {
                  setDeckName(e.target.value);
                }}
                className="text-white bg-gray-800/50 backdrop-blur-sm px-3 py-1 rounded-lg border-2 border-gray-600/70 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none text-sm transition-all"
                placeholder="Nome do deck"
                maxLength={50}
              />
            </div>
            <div className="flex gap-2 items-center">
              {saving && (
                <span className="text-purple-400 text-sm flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Salvando...
                </span>
              )}
              {getDeckCount() > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Tem certeza que deseja limpar todo o deck?')) {
                      setDeck(Array(60).fill(null));
                      autoSaveDeck(); // Salvar após limpar
                    }
                  }}
                  className="bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 hover:bg-red-500/40 text-red-200 px-4 py-2 rounded-lg font-semibold transition-colors text-sm"
                >
                  🗑️ Limpar
                </button>
              )}
            </div>
          </div>
          <div className="rounded-xl px-8 py-12 bg-transparent backdrop-blur-sm border-2 border-blue-500/50 shadow-2xl overflow-hidden">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 justify-items-center" style={{ gap: '24px' }}>
              {deck.map((slot, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className={`relative rounded-lg border-2 transition-all duration-200 w-[70px] h-[105px] flex-shrink-0 ${
                    slot && slot.card
                      ? `bg-gradient-to-br ${getRarityColor(slot.card?.rarity || 'Common')} cursor-pointer hover:scale-105 shadow-lg`
                      : 'border-gray-600/50 border-dashed hover:border-purple-500/50 bg-transparent'
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
                      
                      
                      {/* Card Name Tooltip */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {slot.card?.name || 'Carta sem nome'}
                      </div>
                      
                      {/* Remove Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromDeck(idx);
                        }}
                        className="absolute top-1 right-1 bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 hover:bg-red-500/40 text-red-200 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                      >
                        ✖
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-gray-400 text-xs">Vazio</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
          </div>

          {/* Extra Deck Section */}
          <div className="lg:w-96 xl:w-[28rem] 2xl:w-[32rem] flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-purple-400 flex items-center gap-2">
                    ⭐ Extra Deck ({getExtraDeckCount()}/15)
                  </h2>
                </div>
                {getExtraDeckCount() > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Tem certeza que deseja limpar o Extra Deck?')) {
                        setExtraDeck(Array(15).fill(null));
                      }
                    }}
                    className="bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 hover:bg-red-500/40 text-red-200 px-2 py-1 rounded-lg font-semibold transition-colors text-xs"
                    title="Limpar Extra Deck"
                  >
                    🗑️
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-200 mb-2">Apenas monstros Fusion</div>
              <div className="rounded-xl p-16 bg-transparent backdrop-blur-sm border-2 border-purple-500/50 shadow-2xl overflow-hidden">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6 justify-items-start" style={{ gap: '36px' }}>
              {extraDeck.map((slot, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className={`relative rounded-lg border-2 transition-all duration-200 w-[70px] h-[105px] flex-shrink-0 ${
                    slot && slot.card
                      ? `bg-gradient-to-br ${getRarityColor(slot.card?.rarity || 'Common')} cursor-pointer hover:scale-105 shadow-lg`
                      : 'border-gray-600/50 border-dashed hover:border-purple-500/50 bg-transparent'
                  }`}
                  onClick={() => slot && slot.card && setSelectedCard(slot)}
                >
                  {slot && slot.card ? (
                    <>
                      <CardImage
                        card={slot.card}
                        className="w-full h-full object-cover rounded-lg"
                        fallback="/images/fundoCarta.webp"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {slot.card?.name || 'Carta sem nome'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromExtraDeck(idx);
                        }}
                        className="absolute top-1 right-1 bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 hover:bg-red-500/40 text-red-200 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                      >
                        ✖
                      </button>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-gray-400 text-xs">Vazio</span>
                    </div>
                  )}
                </motion.div>
              ))}
                </div>
              </div>
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
            <h2 className="text-2xl font-semibold text-pink-400 flex items-center gap-2">
              Maleta - Suas Cartas ({maleta.length})
            </h2>
            <button
              onClick={loadMaleta}
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold transition-all transform hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] shadow-md flex items-center gap-2"
            >
              {loading ? (
                <>⏳ Carregando...</>
              ) : (
                <>🔄 Atualizar</>
              )}
            </button>
          </div>
          {loading ? (
            <div className="text-center py-16 rounded-xl border-2 border-blue-500/50 bg-transparent backdrop-blur-sm">
              <p className="text-blue-400 text-xl">⏳ Carregando cartas...</p>
            </div>
          ) : maleta.length === 0 ? (
            <div className="text-center py-16 bg-transparent backdrop-blur-sm rounded-xl border-2 border-pink-500/50 shadow-2xl">
              <p className="text-6xl mb-4">📭</p>
              <p className="text-pink-400 text-xl mb-2">Sua maleta está vazia</p>
              <p className="text-gray-200">Compre cartas na loja para adicioná-las aqui!</p>
            </div>
          ) : (
            <div className="rounded-xl p-6 bg-transparent backdrop-blur-sm border-2 border-pink-500/50 shadow-2xl">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-10" style={{ gap: '20px' }}>
                {maleta.map((userCard) => {
                  // Verificar se card existe
                  if (!userCard.card) {
                    console.warn('⚠️ UserCard sem card:', userCard);
                    return null;
                  }

                  const card = userCard.card;
                  const rarity = card.rarity || 'Common';
                  const cardName = userCard.card?.name;
                  const cardsInMainDeck = getCardCountInDeck(userCard.cardId, cardName);
                  const cardsInExtraDeck = getCardCountInExtraDeck(userCard.cardId, cardName);
                  const totalInDecks = cardsInMainDeck + cardsInExtraDeck;
                  const available = getAvailableCount(userCard);
                  const maxCopies = card.maxCopiesInDeck ?? 3;
                  const isFusion = isFusionMonster(card);
                  const totalOwned = allUserCards.find(uc => uc.cardId === userCard.cardId)?.quantity || userCard.quantity;
                  const availableInExtraDeck = totalOwned - totalInDecks;
                  
                  // Verificar se pode adicionar: tem cartas disponíveis E não atingiu o limite máximo
                  const canAdd = available > 0 && 
                                 maxCopies > 0 && 
                                 totalInDecks < maxCopies;
                  
                  return (
                    <motion.div
                      key={userCard.id || `${userCard.cardId}-${Math.random()}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={canAdd ? { scale: 1.05 } : {}}
                      whileTap={canAdd ? { scale: 0.95 } : {}}
                      className={`relative rounded-lg border-2 bg-gradient-to-br ${getRarityColor(rarity)} w-[70px] h-[105px] flex-shrink-0 m-1 ${
                        canAdd 
                          ? 'cursor-pointer shadow-lg hover:shadow-xl transition-all duration-200' 
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                      onClick={() => canAdd && addToDeck(userCard)}
                      title={`${card.name}\nDisponível: ${available}/${totalOwned}\nNo deck principal: ${cardsInMainDeck}${isFusion ? `\nNo Extra Deck: ${cardsInExtraDeck}` : ''}\nTotal no deck: ${totalInDecks}/${maxCopies}\nLimite máximo: ${maxCopies === 0 ? 'Banida' : maxCopies}${isFusion ? '\n\n⭐ Clique para adicionar ao Extra Deck' : ''}`}
                    >
                      {/* Card Image */}
                      <CardImage
                        card={card}
                        className="w-full h-full object-cover rounded-lg"
                        fallback="/images/fundoCarta.webp"
                      />
                      
                      {/* Available Badge - Cópias disponíveis para adicionar */}
                      {available > 0 && (
                        <div className="absolute top-1 left-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg backdrop-blur-sm">
                          {available}
                        </div>
                      )}
                      
                      {/* Used Badge - Quantas já estão no deck */}
                      {totalInDecks > 0 && (
                        <div className="absolute bottom-1 left-1 bg-gray-800/90 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg border border-gray-600/50">
                          Deck: {totalInDecks}
                        </div>
                      )}

                      {/* Extra Deck Badge - Quantas já estão no Extra Deck (se for Fusion) */}
                      {isFusion && cardsInExtraDeck > 0 && (
                        <div className="absolute bottom-1 right-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10 shadow-lg backdrop-blur-sm">
                          Extra: {cardsInExtraDeck}
                        </div>
                      )}
                      
                      {/* Card Name */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {card.name}
                      </div>
                      
                      {/* Hover Overlay - Só aparece se pode adicionar */}
                      {canAdd && (
                        <div className="absolute inset-0 bg-purple-500/0 hover:bg-purple-500/20 rounded-lg transition-colors flex items-center justify-center">
                          <span className="opacity-0 hover:opacity-100 text-white font-bold text-sm">+</span>
                        </div>
                      )}
                      
                      {/* Overlay quando não pode adicionar mais */}
                      {!canAdd && (
                        <div className="absolute inset-0 bg-red-500/30 backdrop-blur-sm rounded-lg flex items-center justify-center border-2 border-red-500/50">
                          {maxCopies === 0 ? (
                            <span className="text-red-200 text-[10px] font-bold text-center px-1">BANIDA</span>
                          ) : totalInDecks >= maxCopies ? (
                            <span className="text-red-200 text-[10px] font-bold text-center px-1">LIMITE: {maxCopies}</span>
                          ) : (
                            <span className="text-red-200 text-[10px] font-bold text-center px-1">SEM CÓPIAS</span>
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
        </div>

        {/* Card Details Modal */}
        {selectedCard && selectedCard.card && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCard(null)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className={`bg-gradient-to-br ${getRarityColor(selectedCard.card?.rarity || 'Common')} rounded-xl p-6 max-w-md w-full border-2 border-purple-500/50 shadow-2xl backdrop-blur-sm`}
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
              className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white font-bold py-2 rounded-lg transition-all transform hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] shadow-md"
            >
              Fechar
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
