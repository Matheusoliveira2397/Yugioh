import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api/axios';
import { useAuthStore } from '../stores/authStore';
import CardImage from '../components/CardImage';
import DeckCopyLimitBadge from '../components/DeckCopyLimitBadge';
import { CARD_IMAGE_GRID_PROPS } from '../utils/cardImage';
import { getCardDescription } from '../utils/cardDescription';

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
  /** Nome do deck ao carregar (para enviar no save e renomear em vez de criar outro) */
  const [originalDeckNameForSave, setOriginalDeckNameForSave] = useState<string | null>(null);
  const [deckLoaded, setDeckLoaded] = useState(false);
  const [maletaSearch, setMaletaSearch] = useState('');
  const [maletaFilterType, setMaletaFilterType] = useState<string>('all');
  const [maletaFilterRarity, setMaletaFilterRarity] = useState<string>('all');
  /** Imagem do deck: carta de capa (opcional) */
  const [coverCardId, setCoverCardId] = useState<string | null>(null);
  const [coverCard, setCoverCard] = useState<{
    id: string;
    name: string;
    cardImage?: string;
    idCarta?: string;
    maxCopiesInDeck?: number;
  } | null>(null);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  
  // Refs para armazenar os valores mais recentes do estado
  const deckRef = useRef(deck);
  const extraDeckRef = useRef(extraDeck);
  const deckNameRef = useRef(deckName);
  const originalDeckNameRef = useRef<string | null>(originalDeckNameForSave);
  const coverCardIdRef = useRef<string | null>(coverCardId);
  const loadMaletaRef = useRef<(() => Promise<void>) | null>(null);
  const loadDeckRef = useRef<((overrideAllUserCards?: UserCard[]) => Promise<void>) | null>(null);
  /** Nome do deck que estamos editando (vindo da navegação), para sempre carregar o deck certo */
  const deckNameFromNavigationRef = useRef<string | null>(null);
  /** Decks retornados pela API na última loadMaleta (para recalcular maleta com o deck atual) */
  const decksDataRef = useRef<any[]>([]);
  /** Para só chamar loadDeck a partir da maleta uma vez (carregamento inicial) */
  const initialDeckLoadDoneRef = useRef(false);

  // Guardar nome do deck vindo da navegação para não carregar o deck errado
  useEffect(() => {
    if (locationState?.deckName && typeof locationState.deckName === 'string') {
      deckNameFromNavigationRef.current = locationState.deckName.trim();
    }
  }, [locationState?.deckName]);

  useEffect(() => {
    originalDeckNameRef.current = originalDeckNameForSave;
  }, [originalDeckNameForSave]);
  useEffect(() => {
    coverCardIdRef.current = coverCardId;
  }, [coverCardId]);

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

        const payload: { name: string; cardIds: string[]; extraDeckCardIds?: string[]; coverCardId?: string; originalDeckName?: string } = {
          name: currentDeckName.trim() || 'Meu Deck',
          cardIds,
          extraDeckCardIds: extraDeckCardIds.length > 0 ? extraDeckCardIds : undefined,
          coverCardId: coverCardIdRef.current ?? undefined,
        };
        if (originalDeckNameRef.current) {
          payload.originalDeckName = originalDeckNameRef.current;
        }

        console.log('📤 [saveDeckImmediately] Enviando payload:', {
          name: payload.name,
          originalDeckName: payload.originalDeckName,
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
        setOriginalDeckNameForSave(currentDeckName.trim() || 'Meu Deck');
        // Não recarregar maleta aqui para não “atualizar” a tela ao colocar/remover cartas (já atualizamos a maleta em modo otimista)
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
      const decksPayload = decksRes?.data;
      // Garantir que usamos sempre um array de decks (API pode retornar array direto ou wrapped)
      const decksData = Array.isArray(decksPayload)
        ? decksPayload
        : (Array.isArray(decksPayload?.data) ? decksPayload.data : decksPayload?.decks ?? []);
      decksDataRef.current = decksData;

      // O endpoint retorna { cards: UserCard[], playmats: any[], skins: any[] }
      const inventoryData = inventoryResponse?.cards || (Array.isArray(inventoryResponse) ? inventoryResponse : []);

      console.log('📦 Inventário recebido:', {
        total: inventoryData.length,
        cards: inventoryData.length,
        response: inventoryResponse
      });
      console.log('📦 Decks recebidos:', Array.isArray(decksData) ? decksData.length : 'N/A', decksData);

      // Mapear quantas cópias de cada cardId estão sendo usadas em TODOS os decks (não só o atual)
      const usedInDecks = new Map<string, number>();
      if (Array.isArray(decksData) && decksData.length > 0) {
        decksData.forEach((deck: any) => {
          const deckCards = deck.cards ?? deck.deck_cards ?? [];
          if (Array.isArray(deckCards)) {
            deckCards.forEach((deckCard: any) => {
              const cid = deckCard.cardId ?? deckCard.card_id;
              if (!cid) return;
              usedInDecks.set(cid, (usedInDecks.get(cid) || 0) + 1);
            });
          }
        });
      }

      if (Array.isArray(inventoryData) && inventoryData.length > 0) {
        // IMPORTANTE: allUserCards deve manter a quantidade TOTAL que o usuário possui
        setAllUserCards(inventoryData);

        const hasDecksData = Array.isArray(decksData) && decksData.length > 0;
        if (hasDecksData) {
          const adjusted: UserCard[] = [];
          inventoryData.forEach((uc: UserCard) => {
            if (!uc || !uc.cardId) return;
            const ownedQty = uc.quantity || 0;
            const usedQty = usedInDecks.get(uc.cardId) || 0;
            const available = ownedQty - usedQty;

            if (available > 0) {
              adjusted.push({ ...uc, quantity: available });
            }
          });
          setMaleta(adjusted);
          console.log('✅ Maleta carregada:', {
            totalCartas: inventoryData.length,
            cartasDisponiveis: adjusted.length,
            cópiasDisponíveis: adjusted.reduce((sum, uc) => sum + (uc.quantity || 0), 0)
          });
        } else {
          // Sem decks (ou GET /decks vazio): toda a inventário está disponível na maleta
          setMaleta(inventoryData.map((uc: UserCard) => ({ ...uc })));
          console.log('✅ Maleta carregada (sem outros decks):', inventoryData.length, 'itens');
        }
        // Carregar deck após maleta (com dados corretos), mesmo quando hasDecksData é false (ex.: primeiro deck)
        if (!isNewDeck && !initialDeckLoadDoneRef.current && loadDeckRef.current) {
          initialDeckLoadDoneRef.current = true;
          loadDeckRef.current(inventoryData);
        }
        // Se não tiver decksData, não atualiza setMaleta (mantém estado anterior e evita mostrar 6 em vez de 3)
      } else {
        console.warn('⚠️ Dados de inventário vazios ou inválidos:', {
          inventoryData,
          isArray: Array.isArray(inventoryData),
          length: inventoryData?.length
        });
        setAllUserCards([]);
        if (!isNewDeck && !initialDeckLoadDoneRef.current && loadDeckRef.current) {
          initialDeckLoadDoneRef.current = true;
          loadDeckRef.current([]);
        }
      }
      } catch (error: any) {
      console.error('❌ Erro ao carregar maleta:', error);
      console.error('❌ Detalhes do erro:', error.response?.data || error.message);
      setAllUserCards([]);
    } finally {
      setLoading(false);
    }
  }, [user, isNewDeck]);

  // Atualizar ref quando loadMaleta for definido
  useEffect(() => {
    loadMaletaRef.current = loadMaleta;
  }, [loadMaleta]);

  // A maleta é calculada em loadMaleta baseada em allUserCards (total) - usedInDecks
  // Não precisa recalcular aqui, a maleta já é atualizada em loadMaleta

  const loadDeck = useCallback(async (overrideAllUserCards?: UserCard[]) => {
    if (!user) return;
    const allCards = overrideAllUserCards ?? allUserCards;
    try {
      // Prioridade: nome vindo da navegação (deck que o usuário clicou) > estado > initial > equipped
      const deckNameToLoad =
        deckNameFromNavigationRef.current?.trim() ||
        deckName?.trim() ||
        initialDeckName?.trim() ||
        (user as any)?.equippedDeckName?.trim() ||
        'Meu Deck';
      console.log('🔄 [loadDeck] Carregando deck salvo...');
      console.log('🔄 [loadDeck] deckNameFromNavigation:', deckNameFromNavigationRef.current);
      console.log('🔄 [loadDeck] deckName (estado):', deckName);
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
        allCards.forEach(uc => {
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
        const loadedName = res.data.name || deckNameToLoad;
        if (res.data.name) {
          setDeckName(res.data.name);
        }
        setOriginalDeckNameForSave(loadedName || null);
        setCoverCardId(res.data.coverCardId ?? null);
        setCoverCard(res.data.coverCard ?? null);

        // Recalcular maleta: uso nos OUTROS decks (API) + uso no deck atual (o que acabamos de carregar)
        // Assim a maleta nunca mostra como disponível carta que já está em algum deck
        const usedInDecks = new Map<string, number>();
        const currentNameNorm = (loadedName || '').trim().toLowerCase();
        (decksDataRef.current || []).forEach((d: any) => {
          const nameNorm = (d.name || '').trim().toLowerCase();
          if (nameNorm === currentNameNorm) return;
          const deckCards = d.cards ?? d.deck_cards ?? [];
          if (Array.isArray(deckCards)) {
            deckCards.forEach((dc: any) => {
              const cid = dc.cardId ?? dc.card_id;
              if (cid) usedInDecks.set(cid, (usedInDecks.get(cid) || 0) + 1);
            });
          }
        });
        [...loadedDeck, ...loadedExtraDeck].filter(Boolean).forEach((slot: any) => {
          const cid = slot?.cardId || slot?.card?.id;
          if (cid) usedInDecks.set(cid, (usedInDecks.get(cid) || 0) + 1);
        });
        const adjusted: UserCard[] = [];
        allCards.forEach((uc: UserCard) => {
          if (!uc || !uc.cardId) return;
          const ownedQty = uc.quantity || 0;
          const usedQty = usedInDecks.get(uc.cardId) || 0;
          const available = ownedQty - usedQty;
          if (available > 0) adjusted.push({ ...uc, quantity: available });
        });
        setMaleta(adjusted);
        setDeckLoaded(true);
      } else {
        console.warn('⚠️ [loadDeck] Resposta sem dados');
        setDeckLoaded(true);
      }
    } catch (error: any) {
      console.error('❌ [loadDeck] Erro ao carregar deck:', error);
      setDeckLoaded(true);
      console.error('❌ [loadDeck] Status:', error.response?.status);
      console.error('❌ [loadDeck] Dados:', error.response?.data);
      // Não é erro se não houver deck salvo
    }
  }, [user, allUserCards, deckName, initialDeckName]);

  useEffect(() => {
    loadDeckRef.current = loadDeck;
  }, [loadDeck]);

  useEffect(() => {
    loadMaleta();
  }, [loadMaleta]);

  // Novo deck: inicializar vazio. Deck existente é carregado por loadMaleta → loadDeck (com dados corretos).
  useEffect(() => {
    if (!deckLoaded && user && isNewDeck) {
      setDeck(Array(60).fill(null));
      setExtraDeck(Array(15).fill(null));
      setDeckName('Novo Deck');
      setOriginalDeckNameForSave(null);
      setCoverCardId(null);
      setCoverCard(null);
      setDeckLoaded(true);
    }
  }, [deckLoaded, user, isNewDeck]);

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

    // Verificar limite no DECK PRINCIPAL apenas (cada deck tem seu limite: main e extra separados)
    const cardName = userCard.card?.name;
    const cardsInMainDeckByName = getCardCountInDeck(userCard.cardId, cardName);
    if (cardsInMainDeckByName >= maxCopies) {
      alert(`❌ O deck principal já tem o limite máximo de ${maxCopies} cópia(s) desta carta!`);
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
      deckRef.current = newDeck;
      saveDeckImmediately();
      return newDeck;
    });

    // Atualização otimista da maleta (não refetch para não “atualizar” a tela)
    setMaleta(prev => prev.map(uc => {
      if (uc.cardId !== userCard.cardId && uc.card?.id !== userCard.card?.id) return uc;
      const newQty = Math.max(0, (uc.quantity || 0) - 1);
      return { ...uc, quantity: newQty };
    }).filter(uc => (uc.quantity || 0) > 0));
  };

  const removeFromDeck = (idx: number) => {
    setDeck(prev => {
      const cardToRemove = prev[idx];
      
      // Não exigir mínimo de 40 cartas ao editar: decks não equipados podem ter qualquer quantidade.
      // O mínimo de 40 no deck principal só é exigido ao equipar o deck (DeckBuilderPage + backend).

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
      
      saveDeckImmediately();

      // Atualização otimista da maleta ao remover carta (não refetch)
      if (cardToRemove) {
        setMaleta(prev => {
          const found = prev.find(uc => uc.cardId === cardToRemove.cardId || uc.card?.id === cardToRemove?.card?.id);
          if (found) return prev.map(uc => uc === found ? { ...uc, quantity: (uc.quantity || 0) + 1 } : uc);
          return [...prev, { ...cardToRemove, quantity: 1 }];
        });
      }

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

    // Verificar limite no EXTRA DECK apenas (cada deck tem seu limite: main e extra separados)
    const cardName = userCard.card?.name;
    const cardsInExtraDeckByName = getCardCountInExtraDeck(userCard.cardId, cardName);
    if (cardsInExtraDeckByName >= maxCopies) {
      alert(`❌ O extra deck já tem o limite máximo de ${maxCopies} cópia(s) desta carta!`);
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
      extraDeckRef.current = newExtraDeck;
      saveDeckImmediately();
      return newExtraDeck;
    });

    // Atualização otimista da maleta (não refetch)
    setMaleta(prev => prev.map(uc => {
      if (uc.cardId !== userCard.cardId && uc.card?.id !== userCard.card?.id) return uc;
      const newQty = Math.max(0, (uc.quantity || 0) - 1);
      return { ...uc, quantity: newQty };
    }).filter(uc => (uc.quantity || 0) > 0));
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
      
      saveDeckImmediately();

      // Atualização otimista da maleta ao remover do Extra Deck (não refetch)
      if (cardToRemove) {
        setMaleta(prev => {
          const found = prev.find(uc => uc.cardId === cardToRemove.cardId || uc.card?.id === cardToRemove?.card?.id);
          if (found) return prev.map(uc => uc === found ? { ...uc, quantity: (uc.quantity || 0) + 1 } : uc);
          return [...prev, { ...cardToRemove, quantity: 1 }];
        });
      }

      return newExtraDeck;
    });
  };

  const getTotalCardsInMaleta = () => {
    return maleta.reduce((total, userCard) => total + userCard.quantity, 0);
  };

  const filteredMaleta = useMemo(() => {
    const search = maletaSearch.trim().toLowerCase();
    return maleta.filter((uc) => {
      if (!uc.card) return false;
      const nameMatch = !search || uc.card.name.toLowerCase().includes(search);
      const typeMatch =
        maletaFilterType === 'all' ||
        (uc.card.type && uc.card.type.toLowerCase() === maletaFilterType.toLowerCase());
      const rarityMatch =
        maletaFilterRarity === 'all' ||
        (uc.card.rarity || 'Common') === maletaFilterRarity;
      return nameMatch && typeMatch && rarityMatch;
    });
  }, [maleta, maletaSearch, maletaFilterType, maletaFilterRarity]);

  const maletaTypes = useMemo(() => {
    const types = new Set<string>();
    maleta.forEach((uc) => {
      if (uc.card?.type) types.add(uc.card.type);
    });
    return ['all', ...Array.from(types).sort()];
  }, [maleta]);

  const maletaRarities = useMemo(() => {
    const rarities = new Set<string>();
    maleta.forEach((uc) => {
      rarities.add(uc.card?.rarity || 'Common');
    });
    return ['all', ...Array.from(rarities).sort()];
  }, [maleta]);

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

    const payload: Record<string, unknown> = {
        name: deckName.trim() || 'Meu Deck',
        cardIds,
        extraDeckCardIds: extraDeckCardIds.length > 0 ? extraDeckCardIds : undefined,
        coverCardId: coverCardId ?? undefined,
      };
      if (originalDeckNameForSave) {
        payload.originalDeckName = originalDeckNameForSave;
      }

      console.log('📤 Enviando payload:', { ...payload, cardIds: `[${cardIds.length} cards]` });

      const res = await api.put('/decks/current', payload);

      console.log('✅ Resposta do servidor:', res.data);
      console.log('✅ Deck salvo com sucesso!');
      setOriginalDeckNameForSave(deckName.trim() || 'Meu Deck');
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

        const payload: Record<string, unknown> = {
          name: currentDeckName.trim() || 'Meu Deck',
          cardIds,
          extraDeckCardIds: extraDeckCardIds.length > 0 ? extraDeckCardIds : undefined,
          coverCardId: coverCardIdRef.current ?? undefined,
        };
        if (originalDeckNameRef.current) {
          payload.originalDeckName = originalDeckNameRef.current;
        }

        setSaving(true);
        const res = await api.put('/decks/current', payload);
        console.log('✅ [autoSave] Deck salvo automaticamente com sucesso!', res.data);
        setOriginalDeckNameForSave(currentDeckName.trim() || 'Meu Deck');
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
            <div className="px-4 py-2 rounded-lg bg-gray-800/50 backdrop-blur-sm border-2 border-amber-500/50">
              <span className="text-amber-400 font-semibold">
                Maleta: {getTotalCardsInMaleta()} cartas ({maleta.length} tipos)
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
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-6">
            {/* Deck Principal Section */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-blue-400 flex items-center gap-2">
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
            <div className="flex gap-2 items-center flex-wrap">
              {saving && (
                <span className="text-purple-400 text-sm flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Salvando...
                </span>
              )}
              <button
                onClick={() => saveDeck(false)}
                disabled={saving}
                className="bg-green-500/30 backdrop-blur-sm border-2 border-green-500/70 hover:bg-green-500/40 text-green-200 px-4 py-2 rounded-lg font-semibold transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                title="Salvar o deck no servidor"
              >
                💾 Salvar deck
              </button>
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

          {/* Imagem do Deck (carta de capa) */}
          <div className="mb-4">
            <label className="block text-white/90 text-sm font-medium mb-2">Imagem do Deck (opcional)</label>
            <p className="text-gray-400 text-xs mb-2">Escolha uma carta do deck para ser a imagem exibida na lista de decks.</p>
            <div className="flex items-center gap-4 flex-wrap">
              {coverCard ? (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/50 border border-gray-600">
                  <div className="relative w-16 shrink-0 aspect-[59/86] rounded overflow-hidden">
                    <CardImage
                      {...CARD_IMAGE_GRID_PROPS}
                      card={coverCard}
                      className="w-full h-full object-cover"
                      fallback="/images/fundoCarta.webp"
                      loading="eager"
                      fetchPriority="high"
                    />
                    <DeckCopyLimitBadge maxCopiesInDeck={coverCard.maxCopiesInDeck} />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{coverCard.name}</p>
                    <button
                      type="button"
                      onClick={() => { setCoverCardId(null); setCoverCard(null); saveDeckImmediately(); }}
                      className="text-red-400 hover:text-red-300 text-xs mt-1"
                    >
                      Remover imagem
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setShowCoverPicker(!showCoverPicker)}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium"
              >
                {coverCardId ? 'Trocar carta' : 'Escolher carta'}
              </button>
            </div>
            {showCoverPicker && (() => {
              const slotsWithCards = [...deck, ...extraDeck].filter((s): s is UserCard => s !== null && !!s.card);
              const seen = new Set<string>();
              const uniqueCards = slotsWithCards.filter(s => {
                const id = s.card?.id || s.cardId;
                if (!id || seen.has(id)) return false;
                seen.add(id);
                return true;
              });
              return (
                <div className="mt-3 p-3 rounded-lg bg-gray-800/80 border border-gray-600 max-h-64 overflow-y-auto">
                  <p className="text-gray-400 text-sm mb-2">Clique em uma carta do deck para definir como imagem:</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {uniqueCards.length === 0 ? (
                      <p className="col-span-full text-gray-500 text-sm">Adicione cartas ao deck primeiro.</p>
                    ) : (
                      uniqueCards.map((uc) => (
                        <button
                          key={uc.card?.id || uc.cardId}
                          type="button"
                          onClick={() => {
                            const c = uc.card;
                            if (c) {
                              setCoverCardId(c.id);
                              setCoverCard({
                                id: c.id,
                                name: c.name,
                                cardImage: c.cardImage,
                                idCarta: (c as any).idCarta,
                                maxCopiesInDeck: c.maxCopiesInDeck,
                              });
                              setShowCoverPicker(false);
                              saveDeckImmediately();
                            }
                          }}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            coverCardId === (uc.card?.id || uc.cardId)
                              ? 'border-amber-400 ring-2 ring-amber-400/50'
                              : 'border-gray-600 hover:border-purple-500'
                          }`}
                        >
                          <CardImage
                            {...CARD_IMAGE_GRID_PROPS}
                            card={uc.card!}
                            className="w-full aspect-[59/86] object-cover"
                            fallback="/images/fundoCarta.webp"
                          />
                          <DeckCopyLimitBadge maxCopiesInDeck={uc.card!.maxCopiesInDeck} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="rounded-xl p-6 sm:p-8 bg-transparent backdrop-blur-sm border-2 border-blue-500/50 shadow-2xl overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 justify-items-center gap-6 content-start flex-1">
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
                      <CardImage
                        {...CARD_IMAGE_GRID_PROPS}
                        card={slot.card}
                        className="w-full h-full object-cover rounded-lg"
                        fallback="/images/fundoCarta.webp"
                        loading={idx < 40 ? 'eager' : 'lazy'}
                        fetchPriority={idx < 15 ? 'high' : 'auto'}
                      />
                      <DeckCopyLimitBadge maxCopiesInDeck={slot.card.maxCopiesInDeck} />
                      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {slot.card?.name || 'Carta sem nome'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromDeck(idx);
                        }}
                        className="absolute top-1 left-1 bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 hover:bg-red-500/40 text-red-200 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors z-30"
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
          <div className="flex flex-col min-w-0 w-full lg:w-[22rem] xl:w-96 2xl:w-[28rem] flex-shrink-0">
              <div className="flex items-center justify-between mb-4 min-h-[2.75rem]">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-semibold text-purple-400 flex items-center gap-2">
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
              <div className="text-xs text-gray-200 mb-2 min-h-[1.25rem]">Apenas monstros Fusion</div>
              <div className="rounded-xl p-6 sm:p-8 bg-transparent backdrop-blur-sm border-2 border-purple-500/50 shadow-2xl overflow-hidden flex-1 flex flex-col min-h-0">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 justify-items-center gap-6 content-start flex-1">
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
                        {...CARD_IMAGE_GRID_PROPS}
                        card={slot.card}
                        className="w-full h-full object-cover rounded-lg"
                        fallback="/images/fundoCarta.webp"
                        loading={idx < 20 ? 'eager' : 'lazy'}
                        fetchPriority={idx < 8 ? 'high' : 'auto'}
                      />
                      <DeckCopyLimitBadge maxCopiesInDeck={slot.card.maxCopiesInDeck} />
                      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm text-white text-[8px] px-1 py-0.5 rounded-b-lg line-clamp-1">
                        {slot.card?.name || 'Carta sem nome'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromExtraDeck(idx);
                        }}
                        className="absolute top-1 left-1 bg-red-500/30 backdrop-blur-sm border-2 border-red-500/70 hover:bg-red-500/40 text-red-200 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center transition-colors z-30"
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
          className="mt-10"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 p-4 rounded-xl bg-gray-900/40 backdrop-blur-sm border border-amber-500/30 shadow-inner">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/30 border border-amber-500/40 flex items-center justify-center text-2xl shadow-lg">
                📦
              </div>
              <div>
                <h2 className="text-xl font-bold text-amber-200 tracking-tight">
                  Maleta
                </h2>
                <p className="text-amber-400/90 text-sm">
                  {maleta.length} tipo(s) · {getTotalCardsInMaleta()} carta(s) disponível(is)
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-amber-500/20 bg-gray-900/30 backdrop-blur-sm overflow-hidden">
              <div className="py-20 px-6 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-amber-500/40 border-t-amber-400 animate-spin" />
                <p className="text-amber-300/90 font-medium">Carregando suas cartas...</p>
              </div>
            </div>
          ) : maleta.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-gray-900/50 to-gray-900/30 backdrop-blur-sm overflow-hidden">
              <div className="py-20 px-6 text-center">
                <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-5xl">
                  📭
                </div>
                <h3 className="text-lg font-bold text-amber-200 mb-2">Maleta vazia</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto mb-6">
                  Compre cartas na loja para adicioná-las à maleta e montar seus decks.
                </p>
                <a
                  href="/shop"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-amber-500/25 text-amber-200 border border-amber-500/40 hover:bg-amber-500/35 transition-colors"
                >
                  Ir para a Loja →
                </a>
              </div>
            </div>
          ) : (
            <div className="contents">
              <div className="mb-4 p-4 rounded-xl bg-gray-900/30 backdrop-blur-sm border border-amber-500/20 flex flex-col sm:flex-row gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-amber-400/90 text-xs font-medium mb-1.5">Buscar</label>
                  <input
                    type="text"
                    value={maletaSearch}
                    onChange={(e) => setMaletaSearch(e.target.value)}
                    placeholder="Nome da carta..."
                    className="w-full px-3 py-2 rounded-lg bg-gray-800/80 border border-amber-500/30 text-amber-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 text-sm"
                  />
                </div>
                <div className="flex gap-4 flex-wrap items-end">
                  <div>
                    <label className="block text-amber-400/90 text-xs font-medium mb-1.5">Tipo</label>
                    <select
                      value={maletaFilterType}
                      onChange={(e) => setMaletaFilterType(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-gray-800/80 border border-amber-500/30 text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm min-w-[120px]"
                    >
                      <option value="all">Todos</option>
                      {maletaTypes.filter((t) => t !== 'all').map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-amber-400/90 text-xs font-medium mb-1.5">Raridade</label>
                    <select
                      value={maletaFilterRarity}
                      onChange={(e) => setMaletaFilterRarity(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-gray-800/80 border border-amber-500/30 text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-sm min-w-[120px]"
                    >
                      <option value="all">Todas</option>
                      {maletaRarities.filter((r) => r !== 'all').map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  {(maletaSearch || maletaFilterType !== 'all' || maletaFilterRarity !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setMaletaSearch('');
                        setMaletaFilterType('all');
                        setMaletaFilterRarity('all');
                      }}
                      className="py-2 px-3 rounded-lg text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 text-sm font-medium transition-colors"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-gray-900/30 backdrop-blur-sm shadow-xl overflow-hidden">
                <div className="p-5 sm:p-6">
                  {filteredMaleta.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-amber-400/90 font-medium">Nenhuma carta encontrada com os filtros atuais.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setMaletaSearch('');
                          setMaletaFilterType('all');
                          setMaletaFilterRarity('all');
                        }}
                        className="mt-3 text-amber-300 hover:underline text-sm"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  ) : (
                    <div className="contents">
                      <p className="text-amber-400/80 text-sm mb-4">
                        Mostrando {filteredMaleta.length} de {maleta.length} tipo(s)
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4">
                  {filteredMaleta.map((userCard, maletaIdx) => {
                    if (!userCard.card) {
                      console.warn('⚠️ UserCard sem card:', userCard);
                      return null;
                    }

                    const card = userCard.card;
                    const rarity = card.rarity || 'Common';
                    const cardName = userCard.card?.name;
                    const cardsInMainDeck = getCardCountInDeck(userCard.cardId, cardName);
                    const cardsInExtraDeck = getCardCountInExtraDeck(userCard.cardId, cardName);
                    // Usar quantity do item da maleta (já é "disponível" considerando TODOS os decks), não getAvailableCount (que usa só o deck atual)
                    const qtyMaleta = userCard.quantity ?? 0;
                    const maxCopies = card.maxCopiesInDeck ?? 3;
                    const isFusion = isFusionMonster(card);
                    // Limite é por seção: main pode ter até maxCopies, extra pode ter até maxCopies
                    const canAdd = qtyMaleta > 0 && maxCopies > 0 && (isFusion ? cardsInExtraDeck < maxCopies : cardsInMainDeck < maxCopies);
                    
                    return (
                      <motion.div
                        key={userCard.id || `${userCard.cardId}-${Math.random()}`}
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={canAdd ? { scale: 1.06, y: -2 } : {}}
                        whileTap={canAdd ? { scale: 0.98 } : {}}
                        className={`group relative rounded-xl border-2 overflow-hidden w-[72px] h-[108px] flex-shrink-0 transition-all duration-200 bg-gradient-to-br ${getRarityColor(rarity)} ${
                          canAdd
                            ? 'cursor-pointer shadow-md hover:shadow-amber-500/20 hover:shadow-lg hover:border-amber-400/50'
                            : 'opacity-55 cursor-not-allowed border-gray-600/40'
                        }`}
                        onClick={() => canAdd && addToDeck(userCard)}
                        title={`${card.name}\nNa maleta: ${qtyMaleta}\nDeck principal: ${cardsInMainDeck}/${maxCopies}\nExtra deck: ${cardsInExtraDeck}/${maxCopies}\nLimite por seção: ${maxCopies}${isFusion ? '\n\n⭐ Clique para adicionar ao Extra Deck' : ''}`}
                      >
                        <CardImage
                          {...CARD_IMAGE_GRID_PROPS}
                          card={card}
                          className="w-full h-full object-cover"
                          fallback="/images/fundoCarta.webp"
                          loading={maletaIdx < 48 ? 'eager' : 'lazy'}
                          fetchPriority={maletaIdx < 16 ? 'high' : 'auto'}
                        />
                        <DeckCopyLimitBadge maxCopiesInDeck={card.maxCopiesInDeck} />
                        {qtyMaleta > 0 && (
                          <div className="absolute top-1 left-1 min-w-[20px] h-5 px-1.5 rounded-md bg-amber-900/90 border border-amber-500/50 flex items-center justify-center">
                            <span className="text-amber-200 text-xs font-bold">{qtyMaleta}</span>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-sm text-white text-[9px] leading-tight px-1.5 py-1 rounded-b-[10px] line-clamp-2 font-medium">
                          {card.name}
                        </div>
                        {canAdd && (
                          <div className="absolute inset-0 flex items-center justify-center bg-amber-400/0 group-hover:bg-amber-400/15 rounded-xl transition-colors pointer-events-none">
                            <span className="opacity-0 group-hover:opacity-100 text-amber-200 text-2xl font-black drop-shadow-lg transition-opacity">+</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                      </div>
                    </div>
                  )}
                </div>
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
          className="fixed inset-0 duel-modal-scrim flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCard(null)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className={`bg-gradient-to-br ${getRarityColor(selectedCard.card?.rarity || 'Common')} rounded-xl p-6 max-w-md w-full border-2 border-purple-500/50 shadow-2xl backdrop-blur-sm`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full mb-4" style={{ maxHeight: '400px' }}>
              <CardImage
                {...CARD_IMAGE_GRID_PROPS}
                card={selectedCard.card}
                className="w-full h-auto rounded-lg"
                fallback="/images/fundoCarta.webp"
                loading="eager"
                fetchPriority="high"
              />
              <DeckCopyLimitBadge maxCopiesInDeck={selectedCard.card?.maxCopiesInDeck} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{selectedCard.card?.name || 'Carta sem nome'}</h3>
            <div className="flex flex-wrap gap-2 mb-3 tabular-nums">
              <span className="bg-purple-900/60 px-2.5 py-1 rounded-md text-sm font-semibold border border-purple-500/40 text-purple-100">
                💎{' '}
                {Math.max(
                  0,
                  parseInt(String((selectedCard.card as any).priceCredits ?? 0), 10) || 0,
                ).toLocaleString('pt-BR')}{' '}
                créd.
              </span>
              <span className="bg-emerald-900/60 px-2.5 py-1 rounded-md text-sm font-semibold border border-emerald-500/40 text-emerald-100">
                💵 R${' '}
                {Math.max(0, Math.round(Number((selectedCard.card as any).priceCash ?? 0)) || 0).toLocaleString('pt-BR')}
              </span>
            </div>
            <p className="text-white/80 mb-4">{getCardDescription(selectedCard?.card)}</p>
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
