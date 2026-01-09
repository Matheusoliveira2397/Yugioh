import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { useSocket } from '../hooks/useSocket';
import DuelChat from '../components/duel/DuelChat';
import DuelLogs from '../components/duel/DuelLogs';
import DuelField from '../components/duel/DuelField';
import CardImage from '../components/CardImage';
import { getCardImage } from '../utils/cardImage';
import TributeSelectionModal from '../components/duel/TributeSelectionModal';

interface DuelData {
  id: string;
  player1: any;
  player2: any;
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  currentPhase?: string;
  status: string;
  turnTime?: number; // Tempo do turno em segundos (limite)
  turnTimeRemaining?: number; // Tempo restante calculado pelo backend
  turnStartedAt?: string | Date; // Timestamp de quando o turno começou
  player1Field?: {
    deck: any[];
    hand: any[];
    graveyard: any[];
  };
  player2Field?: {
    deck: any[];
    hand: any[];
    graveyard: any[];
  };
}

const DuelArena: React.FC = () => {
  const { duelId } = useParams();
  const { user, token } = useAuthStore();
  const { duelFound, chatMessages, duelLogs, currentTurn, duelUpdate, sendChatMessage, joinDuelRoom, endTurn, performAction, getSocket } = useSocket();
  
  // Log inicial removido para evitar spam no console
  const [duelData, setDuelData] = useState<DuelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [myLifePoints, setMyLifePoints] = useState(8000);
  const [opponentLifePoints, setOpponentLifePoints] = useState(8000);
  
  // Estados para animação de dano
  const [myDamage, setMyDamage] = useState<number | null>(null);
  const [opponentDamage, setOpponentDamage] = useState<number | null>(null);
  const previousMyLifePoints = useRef(8000);
  const previousOpponentLifePoints = useRef(8000);
  
  // Estados para animação de ataque
  const [attackAnimation, setAttackAnimation] = useState<{
    attackerCard: any;
    targetCard: any | null; // null se for ataque direto
    damage: number;
    isDirectAttack: boolean;
    isMyAttack: boolean; // true se eu estou atacando, false se estou recebendo
    targetProfileImage?: string; // Imagem de perfil do duelista alvo (para ataque direto)
  } | null>(null);

  // Estado para animação de carta saindo da mão para o campo
  const [cardPlacementAnimation, setCardPlacementAnimation] = useState<{
    card: any;
    fromPosition: { x: number; y: number; width: number; height: number };
    toPosition: { x: number; y: number; width: number; height: number };
  } | null>(null);
  
  // Refs para rastrear cartas antes do ataque
  const previousMyMonsters = useRef<any[]>(Array(5).fill(null));
  const previousOpponentMonstersRef = useRef<any[]>(Array(5).fill(null));
  
  // Função para acionar animação de ataque imediatamente
  const triggerAttackAnimation = (attackerZoneIndex: number, targetZoneIndex: number | null) => {
    const attackerCard = myMonsters[attackerZoneIndex];
    if (!attackerCard) return;
    
    const isDirectAttack = targetZoneIndex === null || targetZoneIndex === -1;
    let targetCard = null;
    
    if (!isDirectAttack && targetZoneIndex !== null && targetZoneIndex >= 0) {
      targetCard = opponentMonsters[targetZoneIndex];
    }
    
    // Calcular dano estimado (ATK do atacante)
    const attackerAtk = attackerCard.atk || 0;
    const attackerEquipmentBonus = attackerCard.equipmentBonusAtk || 0;
    const attackerSpellCounterBonus = attackerCard.spellCounterBonusAtk || 0;
    const estimatedDamage = attackerAtk + attackerEquipmentBonus + attackerSpellCounterBonus;
    
    // Se for ataque a monstro, calcular dano baseado na diferença de ATK
    if (!isDirectAttack && targetCard) {
      const targetAtk = targetCard.atk || 0;
      const targetEquipmentBonus = targetCard.equipmentBonusAtk || 0;
      const targetSpellCounterBonus = targetCard.spellCounterBonusAtk || 0;
      const targetTotalAtk = targetAtk + targetEquipmentBonus + targetSpellCounterBonus;
      
      // Se o atacante tem mais ATK, causará dano de batalha
      if (estimatedDamage > targetTotalAtk) {
        const battleDamage = estimatedDamage - targetTotalAtk;
        // Se o alvo está em defesa, não causa dano de batalha
        if (targetCard.position === 'attack') {
          setAttackAnimation({
            attackerCard,
            targetCard,
            damage: battleDamage,
            isDirectAttack: false,
            isMyAttack: true
          });
        } else {
          // Ataque a monstro em defesa - não causa dano de batalha
          setAttackAnimation({
            attackerCard,
            targetCard,
            damage: 0,
            isDirectAttack: false,
            isMyAttack: true
          });
        }
      } else {
        // O atacante pode receber dano
        setAttackAnimation({
          attackerCard,
          targetCard,
          damage: 0,
          isDirectAttack: false,
          isMyAttack: true
        });
      }
    } else {
      // Ataque direto - mostrar carta atacante x perfil do duelista alvo
      const targetProfileImage = opponent?.profileImage 
        ? (opponent.profileImage.startsWith('http') ? opponent.profileImage : `${API_URL}${opponent.profileImage}`)
        : '/images/default.png';
      
      setAttackAnimation({
        attackerCard,
        targetCard: null,
        damage: estimatedDamage,
        isDirectAttack: true,
        isMyAttack: true,
        targetProfileImage
      });
      
      // Notificar o oponente via WebSocket sobre o ataque direto
      try {
        const socket = getSocket();
        if (socket) {
          socket.emit('directAttackAnimation', {
            duelId: duelId,
            attackerCard: attackerCard, // Enviar dados da carta para o oponente poder exibir
            targetProfileImage,
            damage: estimatedDamage
          });
        }
      } catch (error) {
        console.error('Erro ao notificar ataque direto:', error);
      }
    }
    
    setTimeout(() => setAttackAnimation(null), 3000);
  };
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string>('DRAW');
  const [turnTimeLeft, setTurnTimeLeft] = useState(90); // Timer do turno
  const [turnTimer, setTurnTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeExpired, setTimeExpired] = useState(false); // Indica se o tempo do oponente expirou
  const [turnTimeLimit, setTurnTimeLimit] = useState(90); // Limite de tempo do turno (vem do banco)
  const [turnTimeRemainingFromServer, setTurnTimeRemainingFromServer] = useState<number | null>(null); // Tempo restante do servidor (fonte da verdade)
  const [turnStartedAt, setTurnStartedAt] = useState<Date | null>(null); // Timestamp de quando o turno começou
  const [duelTime, setDuelTime] = useState(0); // Tempo total do duelo em segundos
  const [duelStartTime, setDuelStartTime] = useState<number | null>(null); // Timestamp de quando o duelo começou
  
  // Refs para valores que precisamos no interval sem causar re-renders
  const isMyTurnRef = useRef(false);
  const duelIdRef = useRef<string | undefined>(duelId);
  const userIdRef = useRef<number | undefined>(user?.id);
  const turnStartedAtRef = useRef<Date | null>(null);
  const turnTimeLimitRef = useRef<number>(90);
  const duelDataRef = useRef<DuelData | null>(null);
  
  // Refs para estados dos modais (para acessar valores mais recentes nos listeners)
  const showOpponentHandRevealedRef = useRef(false);
  const showGracefulCharityModalRef = useRef(false);
  const cardEffectTypeRef = useRef<'forcefulSentry' | 'confiscation' | null>(null);
  
  // Sistema de mão e deck - carregados do backend
  const [myHand, setMyHand] = useState<any[]>([]);
  const [myDeck, setMyDeck] = useState<any[]>([]);
  const [myGraveyard, setMyGraveyard] = useState<any[]>([]);
  const [myExtraDeck, setMyExtraDeck] = useState<any[]>([]);
  const [myBanished, setMyBanished] = useState<any[]>([]);
  const [opponentHand, setOpponentHand] = useState<any[]>([]);
  
  // Estado para controle de ataque
  const [attackingMonsterIndex, setAttackingMonsterIndex] = useState<number | null>(null);
  const [opponentDeck, setOpponentDeck] = useState<any[]>([]);
  const [opponentGraveyard, setOpponentGraveyard] = useState<any[]>([]);
  const [opponentExtraDeck, setOpponentExtraDeck] = useState<any[]>([]);
  const [opponentBanished, setOpponentBanished] = useState<any[]>([]);
  
  // Estado para descarte de cartas
  const [selectedCardsToDiscard, setSelectedCardsToDiscard] = useState<string[]>([]);
  const [isDiscarding, setIsDiscarding] = useState(false); // Evitar múltiplos cliques ao descartar
  
  // Estado para modal do cemitério
  const [showGraveyardModal, setShowGraveyardModal] = useState(false);
  const [showExtraDeckModal, setShowExtraDeckModal] = useState(false);
  const [showOpponentGraveyardModal, setShowOpponentGraveyardModal] = useState(false);
  const [showOpponentExtraDeckModal, setShowOpponentExtraDeckModal] = useState(false);
  
  // Estado para mostrar mão do oponente virada (The Forceful Sentry ou Confiscation)
  const [showOpponentHandRevealed, setShowOpponentHandRevealed] = useState(false);
  const [opponentHandRevealed, setOpponentHandRevealed] = useState<any[]>([]);
  const [cardEffectType, setCardEffectType] = useState<'forcefulSentry' | 'confiscation' | null>(null);
  
  // Estado para carta selecionada no modal do Confiscation
  const [selectedConfiscationCard, setSelectedConfiscationCard] = useState<any | null>(null);
  
  // Estado para GracefulCharity
  const [showGracefulCharityModal, setShowGracefulCharityModal] = useState(false);
  const [gracefulCharityHand, setGracefulCharityHand] = useState<any[]>([]);
  const [selectedGracefulCharityCards, setSelectedGracefulCharityCards] = useState<string[]>([]);

  // Estado para MonsterReborn
  const [showMonsterRebornModal, setShowMonsterRebornModal] = useState(false);
  const [monsterRebornData, setMonsterRebornData] = useState<{
    playerGraveyard: any[];
    opponentGraveyard: any[];
  } | null>(null);
  // Usar identificadores únicos para MonsterReborn
  const [selectedMonsterReborn, setSelectedMonsterReborn] = useState<{ 
    graveyard: 'player' | 'opponent'; 
    index: number;
    instanceId?: string;
    graveyardIndex?: number;
  } | null>(null);
  
  // Estado para ChaosSorcerer Special Summon
  const [showChaosSorcererModal, setShowChaosSorcererModal] = useState(false);
  const [chaosSorcererData, setChaosSorcererData] = useState<{
    cardName?: string;
    lightMonsters: any[];
    darkMonsters: any[];
  } | null>(null);
  // Usar identificadores únicos (instanceId ou graveyardIndex) ao invés de apenas índice
  const [selectedLightMonster, setSelectedLightMonster] = useState<{ instanceId?: string; graveyardIndex?: number; arrayIndex: number } | null>(null);
  const [selectedDarkMonster, setSelectedDarkMonster] = useState<{ instanceId?: string; graveyardIndex?: number; arrayIndex: number } | null>(null);
  
  // Estado para efeito do ChaosSorcerer (banir monstro do oponente)
  const [isSelectingChaosSorcererTarget, setIsSelectingChaosSorcererTarget] = useState(false);
  const [chaosSorcererMonsterZoneIndex, setChaosSorcererMonsterZoneIndex] = useState<number | null>(null);
  
  // Debug: Monitorar quando o modal deveria abrir
  useEffect(() => {
    if (showChaosSorcererModal) {
      console.log(`🎯 [useEffect] Modal ChaosSorcerer ABERTO!`, {
        showChaosSorcererModal,
        chaosSorcererData,
        lightMonstersCount: chaosSorcererData?.lightMonsters?.length || 0,
        darkMonstersCount: chaosSorcererData?.darkMonsters?.length || 0,
      });
    }
  }, [showChaosSorcererModal, chaosSorcererData]);
  
  // Estado para Red-Eyes Darkness Metal Dragon Special Summon
  const [showRedEyesDarknessMetalDragonModal, setShowRedEyesDarknessMetalDragonModal] = useState(false);
  const [redEyesDarknessMetalDragonData, setRedEyesDarknessMetalDragonData] = useState<{
    cardId?: string;
    dragonMonsters: any[];
  } | null>(null);
  const [selectedDragonToBanish, setSelectedDragonToBanish] = useState<number | null>(null);
  
  // Estado para efeito do Red-Eyes Darkness Metal Dragon (invocar dragão da mão/cemitério)
  const [showRedEyesDarknessMetalDragonEffectModal, setShowRedEyesDarknessMetalDragonEffectModal] = useState(false);
  const [redEyesDarknessMetalDragonEffectData, setRedEyesDarknessMetalDragonEffectData] = useState<{
    monsterZoneIndex: number;
    dragonsInHand: any[];
    dragonsInGraveyard: any[];
  } | null>(null);
  const [selectedDragonSource, setSelectedDragonSource] = useState<'hand' | 'graveyard' | null>(null);
  const [selectedDragonIndex, setSelectedDragonIndex] = useState<number | null>(null);
  const [selectedDragonId, setSelectedDragonId] = useState<string | null>(null); // Para rastrear qual dragão foi selecionado (com source e index)
  
  // Estado para Cyber-Stein
  const [showCyberSteinModal, setShowCyberSteinModal] = useState(false);
  const [cyberSteinData, setCyberSteinData] = useState<{
    monsterZoneIndex: number;
    extraDeckMonsters: any[];
  } | null>(null);
  const [selectedCyberSteinMonster, setSelectedCyberSteinMonster] = useState<number | null>(null);
  
  // Estado para Dark Armed Dragon
  const [showDarkArmedDragonEffectModal, setShowDarkArmedDragonEffectModal] = useState(false);
  const [darkArmedDragonEffectData, setDarkArmedDragonEffectData] = useState<{
    monsterZoneIndex: number;
    darkMonsters: any[];
  } | null>(null);
  const [selectedDarkMonsterToBanish, setSelectedDarkMonsterToBanish] = useState<number | null>(null);
  const [selectedCardToDestroy, setSelectedCardToDestroy] = useState<{
    player: 'player' | 'opponent';
    type: 'monster' | 'spellTrap';
    zoneIndex: number;
  } | null>(null);
  
  // Estado para ChangeOfHeart
  const [showChangeOfHeartModal, setShowChangeOfHeartModal] = useState(false);
  const [changeOfHeartData, setChangeOfHeartData] = useState<{
    opponentMonsters: any[];
  } | null>(null);
  const [selectedChangeOfHeartMonster, setSelectedChangeOfHeartMonster] = useState<number | null>(null);
  
  // Estado para BrainControl
  const [showBrainControlModal, setShowBrainControlModal] = useState(false);
  const [brainControlData, setBrainControlData] = useState<{
    opponentMonsters: any[];
  } | null>(null);
  const [selectedBrainControlMonster, setSelectedBrainControlMonster] = useState<number | null>(null);
  
  // Estado para SoulTaker
  const [showSoulTakerModal, setShowSoulTakerModal] = useState(false);
  const [soulTakerData, setSoulTakerData] = useState<{
    opponentMonsters: any[];
  } | null>(null);
  const [selectedSoulTakerMonster, setSelectedSoulTakerMonster] = useState<number | null>(null);
  
  // Estado para Exiled Force
  const [showExiledForceModal, setShowExiledForceModal] = useState(false);
  const [exiledForceData, setExiledForceData] = useState<{
    availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>;
    monsterZoneIndex?: number;
  } | null>(null);
  const [selectedExiledForceMonster, setSelectedExiledForceMonster] = useState<{ zoneIndex: number; player: 'player' | 'opponent' } | null>(null);
  
  // Estado para UnitedWeStand
  const [showUnitedWeStandModal, setShowUnitedWeStandModal] = useState(false);
  const [unitedWeStandData, setUnitedWeStandData] = useState<{
    availableMonsters: any[];
  } | null>(null);
  const [selectedUnitedWeStandMonster, setSelectedUnitedWeStandMonster] = useState<number | null>(null);
  
  // Estado para MagePower
  const [showMagePowerModal, setShowMagePowerModal] = useState(false);
  const [magePowerData, setMagePowerData] = useState<{
    availableMonsters: any[];
  } | null>(null);
  const [selectedMagePowerMonster, setSelectedMagePowerMonster] = useState<number | null>(null);

  // Estado para Reinforcement Of The Army
  const [showReinforcementOfTheArmyModal, setShowReinforcementOfTheArmyModal] = useState(false);
  const [reinforcementOfTheArmyData, setReinforcementOfTheArmyData] = useState<{
    warriorMonsters: any[];
  } | null>(null);
  const [selectedReinforcementOfTheArmyMonster, setSelectedReinforcementOfTheArmyMonster] = useState<number | null>(null);
  
  // Estado para Last Will
  const [showLastWillModal, setShowLastWillModal] = useState(false);
  const [lastWillData, setLastWillData] = useState<{
    eligibleMonsters: any[];
  } | null>(null);
  const [selectedLastWillMonster, setSelectedLastWillMonster] = useState<number | null>(null);
  
  // Estado para Mystical Space Typhoon
  const [isSelectingMSTTarget, setIsSelectingMSTTarget] = useState(false);
  const [isSelectingSnowmanEaterTarget, setIsSelectingSnowmanEaterTarget] = useState(false);
  
  // Estado para Breaker The Magical Warrior
  const [isSelectingBreakerTarget, setIsSelectingBreakerTarget] = useState(false);
  const [breakerMonsterZoneIndex, setBreakerMonsterZoneIndex] = useState<number | null>(null);
  
  // Estado para rastrear pendingChoice
  const [currentPendingChoice, setCurrentPendingChoice] = useState<any | null>(null);
  
  // Estado para popup de duelo encerrado
  const [duelEndedData, setDuelEndedData] = useState<{ 
    status: string; 
    result?: string; 
    winnerId?: number | null; 
    message: string;
    player1LifePoints?: number;
    player2LifePoints?: number;
    player1?: any;
    player2?: any;
    player1Id?: number;
    player2Id?: number;
    turnCounter?: number;
    currentTurn?: number;
    duelTime?: number;
  } | null>(null);
  
  // Estado para controlar qual carta está selecionada para colocar no campo
  const [selectedCardForField, setSelectedCardForField] = useState<any | null>(null);
  
  // Estado para controlar seleção de slot de spell/trap
  const [selectingSpellTrapSlot, setSelectingSpellTrapSlot] = useState<{ card: any; position: 'set' | 'face-up' } | null>(null);
  
  // Estado para controlar qual carta está com zoom
  const [zoomedCard, setZoomedCard] = useState<any | null>(null);
  
  // Estado para modal de informações da carta
  const [selectedCardInfo, setSelectedCardInfo] = useState<any | null>(null);
  
  // Estado para armazenar as cartas no campo (monstros)
  const [myMonsters, setMyMonsters] = useState<(any | null)[]>(Array(5).fill(null));
  const [opponentMonsters, setOpponentMonsters] = useState<(any | null)[]>(Array(5).fill(null));
  
  // Estado para armazenar as cartas no campo (spell/trap)
  const [mySpellTraps, setMySpellTraps] = useState<(any | null)[]>(Array(5).fill(null));
  const [opponentSpellTraps, setOpponentSpellTraps] = useState<(any | null)[]>(Array(5).fill(null));
  
  // Estado para Last Will - indica se um monstro foi destruído no campo do jogador neste turno
  const [monsterDestroyedThisTurn, setMonsterDestroyedThisTurn] = useState<boolean>(false);
  
  // Estado para rastrear se já fez invocação normal neste turno
  const [normalSummonUsed, setNormalSummonUsed] = useState(false);
  const [positionChangedThisTurn, setPositionChangedThisTurn] = useState(false);
  
  // Estado para modal de seleção de tributos
  const [showTributeModal, setShowTributeModal] = useState(false);
  const [tributeModalData, setTributeModalData] = useState<{
    card: any;
    position: 'attack' | 'defense' | 'set';
    requiredTributes: number;
  } | null>(null);

  // Estado para overlay de fase
  const [showPhaseOverlay, setShowPhaseOverlay] = useState(false);
  const [phaseOverlayText, setPhaseOverlayText] = useState('');
  const [phaseOverlaySubtext, setPhaseOverlaySubtext] = useState('');
  const previousPhaseRef = useRef<string>('');
  
  // Estado para overlay de invocação
  const [showSummonOverlay, setShowSummonOverlay] = useState(false);
  const [summonCardName, setSummonCardName] = useState('');
  const previousMonstersRef = useRef<(any | null)[]>(Array(5).fill(null));
  
  // Estado para rastrear se já houve mudança de turno (para identificar primeiro turno)
  const [hasTurnChanged, setHasTurnChanged] = useState(false);
  const previousTurnRef = useRef<number | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Carregar dados do duelo via WebSocket (INSTANTÂNEO - sem requisições HTTP pesadas)
  // Usar useRef para evitar múltiplas execuções
  const hasInitializedRef = useRef(false);
  const initializedDuelIdRef = useRef<string | undefined>(undefined);
  const initializedUserIdRef = useRef<number | string | undefined>(undefined);
  
  useEffect(() => {
    if (!duelId || !user || !user.id) {
      setLoading(false);
      return;
    }
    
    const currentDuelId = duelId;
    const currentUserId = user?.id;
    
    // Verificar se é a primeira vez (refs ainda não foram setados)
    const isFirstTime = initializedDuelIdRef.current === undefined && initializedUserIdRef.current === undefined;
    
    // Se é a primeira vez, sempre permitir inicialização
    if (isFirstTime) {
      console.log('🆕 [DuelArena] Primeira inicialização do duelo');
      hasInitializedRef.current = false;
    } else {
      // Verificar se precisa reinicializar (duelo ou usuário mudaram)
      const needsReinit = 
        initializedDuelIdRef.current !== currentDuelId ||
        initializedUserIdRef.current !== currentUserId;
      
      if (needsReinit) {
        console.log('🔄 [DuelArena] Duelo ou usuário mudaram, permitindo inicialização');
        hasInitializedRef.current = false;
      } else if (
        hasInitializedRef.current &&
        initializedDuelIdRef.current === currentDuelId &&
        initializedUserIdRef.current === currentUserId
      ) {
        // Verificar se o socket ainda está conectado e se os listeners estão registrados
        const currentSocket = getSocket();
        if (currentSocket && currentSocket.connected) {
          // Verificar se os listeners ainda estão registrados
          const hasListeners = currentSocket.listeners('duelUpdate').length > 0;
          if (hasListeners) {
            console.log('🔄 [DuelArena] Já inicializado para este duelo e usuário, pulando reinicialização');
            return;
          } else {
            // Listeners foram removidos, permitir reinicialização
            console.log('⚠️ [DuelArena] Listeners removidos, permitindo reinicialização');
            hasInitializedRef.current = false;
          }
        } else {
          // Socket desconectado, permitir reinicialização
          console.log('⚠️ [DuelArena] Socket desconectado, permitindo reinicialização');
          hasInitializedRef.current = false;
        }
      }
    }

    // Handler para receber dados do duelo via WebSocket
    const handleDuelUpdate = (data: any) => {
      console.log('📥 [handleDuelUpdate] ========== RECEBIDO DUEL UPDATE ==========');
      console.log('📥 [handleDuelUpdate] Dados básicos:', {
        id: data?.id,
        hasPlayer1Field: !!data?.player1Field,
        hasPlayer2Field: !!data?.player2Field,
        pendingChoice: data?.pendingChoice,
        pendingChoiceType: data?.pendingChoice?.type,
        pendingChoiceUserId: data?.pendingChoice?.userId,
        pendingChoiceData: data?.pendingChoice?.data,
      });
      
      // Log completo do pendingChoice se existir
      if (data?.pendingChoice) {
        console.log('📥 [handleDuelUpdate] pendingChoice COMPLETO:', JSON.stringify(data.pendingChoice, null, 2));
      }
      console.log('📥 [handleDuelUpdate] ===========================================');
      
      // Garantir que loading seja false imediatamente ao receber qualquer update válido
      if (data && data.id) {
        setLoading(false);
      }
      
      if (!data || !data.id) {
        console.error('❌ [DuelArena] Dados inválidos recebidos!');
        setError('Dados do duelo inválidos');
        setLoading(false);
        return;
      }
      
      // Verificar se o duelo terminou (LP chegou a 0)
      if (data.status === 'FINISHED' && !duelEndedData) {
        const winnerId = data.winnerId;
        const result = data.result;
        const winnerName = winnerId === data.player1Id 
          ? (data.player1?.nickname || data.player1?.username || 'Jogador 1')
          : (data.player2?.nickname || data.player2?.username || 'Jogador 2');
        
        setDuelEndedData({
          status: 'FINISHED',
          result: result,
          winnerId: winnerId,
          message: winnerId 
            ? `Duelo encerrado! ${winnerName} venceu!`
            : 'Duelo encerrado em empate!',
          player1LifePoints: data.player1LifePoints,
          player2LifePoints: data.player2LifePoints,
          player1: data.player1,
          player2: data.player2,
          player1Id: data.player1Id,
          player2Id: data.player2Id,
          turnCounter: data.turnCounter || 0,
          currentTurn: data.currentTurn,
          duelTime: data.duelTime || 0,
        });
        setLoading(false);
        return;
      }
      
      setDuelData(data);
      duelDataRef.current = data;
      
      // Configurar life points, turno, fase e campos
      // Garantir que a comparação funcione corretamente convertendo ambos para número
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const player1Id = typeof data.player1Id === 'string' ? parseInt(data.player1Id, 10) : Number(data.player1Id);
      const player2Id = typeof data.player2Id === 'string' ? parseInt(data.player2Id, 10) : Number(data.player2Id);
      const isPlayer1 = userId === player1Id;
      
      console.log(`🔍 [handleDuelUpdate] userId: ${userId}, player1Id: ${player1Id}, player2Id: ${player2Id}, isPlayer1: ${isPlayer1}`);
      console.log(`🔍 [handleDuelUpdate] player1Field:`, data.player1Field ? `${data.player1Field.deck?.length || 0} cartas no deck, ${data.player1Field.hand?.length || 0} na mão` : 'não existe');
      console.log(`🔍 [handleDuelUpdate] player2Field:`, data.player2Field ? `${data.player2Field.deck?.length || 0} cartas no deck, ${data.player2Field.hand?.length || 0} na mão` : 'não existe');
      
      setMyLifePoints(isPlayer1 ? data.player1LifePoints : data.player2LifePoints);
      setOpponentLifePoints(isPlayer1 ? data.player2LifePoints : data.player1LifePoints);
      setIsMyTurn(isPlayer1 ? data.currentTurn === 1 : data.currentTurn === 2);
      if (data.currentPhase) {
        setCurrentPhase(data.currentPhase);
      }
      
      // Rastrear mudanças de turno para identificar primeiro turno
      if (previousTurnRef.current !== null && previousTurnRef.current !== data.currentTurn) {
        setHasTurnChanged(true);
      }
      previousTurnRef.current = data.currentTurn;
      
      // Carregar tempo do duelo
      if (data.duelTime !== undefined) {
        setDuelTime(data.duelTime);
      } else if (data.createdAt) {
        // Calcular tempo baseado no createdAt se duelTime não estiver disponível
        const createdAt = new Date(data.createdAt);
        const now = new Date();
        const elapsedSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);
        setDuelTime(elapsedSeconds);
        setDuelStartTime(createdAt.getTime());
      }
      
      // Carregar tempo do turno do banco de dados
      if (data.turnTime !== undefined && data.turnTime > 0) {
        setTurnTimeLimit(data.turnTime);
      } else {
        // Se não tiver no banco, usar 90 como padrão
        setTurnTimeLimit(90);
      }
      
      // Usar tempo restante calculado pelo backend se disponível
      if (data.turnTimeRemaining !== undefined) {
        setTurnTimeLeft(data.turnTimeRemaining);
        setTurnTimeRemainingFromServer(data.turnTimeRemaining); // Armazenar tempo do servidor
      } else if (data.turnTime !== undefined && data.turnTime > 0) {
        setTurnTimeLeft(data.turnTime);
        setTurnTimeRemainingFromServer(null); // Resetar se não veio do servidor
      } else {
        setTurnTimeLeft(90);
        setTurnTimeRemainingFromServer(null); // Resetar se não veio do servidor
      }
      
      // Salvar timestamp de quando o turno começou
      if (data.turnStartedAt) {
        const startedAt = typeof data.turnStartedAt === 'string' 
          ? new Date(data.turnStartedAt) 
          : data.turnStartedAt;
        setTurnStartedAt(startedAt);
      } else {
        setTurnStartedAt(null);
      }
      
      // Carregar deck, mão, monstros, spell/trap e cemitério - SEMPRE processar ambos os campos
      // player1Field sempre é do player1, player2Field sempre é do player2
      if (data.player1Field && data.player2Field) {
        const player1Deck = data.player1Field.deck || [];
        const player1Hand = data.player1Field.hand || [];
        const player1Graveyard = data.player1Field.graveyard || [];
        const player1ExtraDeck = data.player1Field.extraDeck || [];
        const player1Banished = data.player1Field.banished || [];
        // Garantir que monsters e spellTraps sejam arrays de 5 elementos
        const player1MonstersRaw = data.player1Field.monsters || [];
        const player1Monsters = Array.isArray(player1MonstersRaw)
          ? [...player1MonstersRaw, ...Array(5 - player1MonstersRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        const player1SpellTrapsRaw = data.player1Field.spellTrap || data.player1Field.spellTraps || [];
        const player1SpellTraps = Array.isArray(player1SpellTrapsRaw)
          ? [...player1SpellTrapsRaw, ...Array(5 - player1SpellTrapsRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        
        const player2Deck = data.player2Field.deck || [];
        const player2Hand = data.player2Field.hand || [];
        const player2Graveyard = data.player2Field.graveyard || [];
        const player2ExtraDeck = data.player2Field.extraDeck || [];
        const player2Banished = data.player2Field.banished || [];
        // Garantir que monsters e spellTraps sejam arrays de 5 elementos
        const player2MonstersRaw = data.player2Field.monsters || [];
        const player2Monsters = Array.isArray(player2MonstersRaw)
          ? [...player2MonstersRaw, ...Array(5 - player2MonstersRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        const player2SpellTrapsRaw = data.player2Field.spellTrap || data.player2Field.spellTraps || [];
        const player2SpellTraps = Array.isArray(player2SpellTrapsRaw)
          ? [...player2SpellTrapsRaw, ...Array(5 - player2SpellTrapsRaw.length).fill(null)].slice(0, 5)
          : [null, null, null, null, null];
        
        if (isPlayer1) {
          // É player1 - meu campo é player1Field, oponente é player2Field
          setMyDeck(player1Deck);
          setMyHand(player1Hand);
          setMyGraveyard(player1Graveyard);
          setMyExtraDeck(player1ExtraDeck);
          setMyBanished(player1Banished);
          setMyMonsters(player1Monsters);
          setMySpellTraps(player1SpellTraps);
          
          // Armazenar flag monsterDestroyedThisTurn para Last Will
          const monsterDestroyedFlag = data.player1Field?.monsterDestroyedThisTurn || false;
          console.log(`🔍 [handleDuelUpdate] Player1 - monsterDestroyedThisTurn: ${monsterDestroyedFlag}`);
          setMonsterDestroyedThisTurn(monsterDestroyedFlag);
          setOpponentDeck(player2Deck);
          setOpponentHand(player2Hand);
          setOpponentGraveyard(player2Graveyard);
          setOpponentExtraDeck(player2ExtraDeck);
          setOpponentBanished(player2Banished);
          setOpponentMonsters(player2Monsters);
          setOpponentSpellTraps(player2SpellTraps);
          console.log(`✅ [handleDuelUpdate] Player1 - Meu deck: ${player1Deck.length}, Cemitério: ${player1Graveyard.length}, Extra Deck: ${player1ExtraDeck.length}, Banidas: ${player1Banished.length}, Oponente deck: ${player2Deck.length}`);
        } else {
          // É player2 - meu campo é player2Field, oponente é player1Field
          setMyDeck(player2Deck);
          setMyHand(player2Hand);
          setMyGraveyard(player2Graveyard);
          setMyExtraDeck(player2ExtraDeck);
          setMyBanished(player2Banished);
          setMyMonsters(player2Monsters);
          setMySpellTraps(player2SpellTraps);
          
          // Armazenar flag monsterDestroyedThisTurn para Last Will
          const monsterDestroyedFlag = data.player2Field?.monsterDestroyedThisTurn || false;
          console.log(`🔍 [handleDuelUpdate] Player2 - monsterDestroyedThisTurn: ${monsterDestroyedFlag}`);
          setMonsterDestroyedThisTurn(monsterDestroyedFlag);
          
          setOpponentDeck(player1Deck);
          setOpponentHand(player1Hand);
          setOpponentGraveyard(player1Graveyard);
          setOpponentExtraDeck(player1ExtraDeck);
          setOpponentBanished(player1Banished);
          setOpponentMonsters(player1Monsters);
          setOpponentSpellTraps(player1SpellTraps);
          console.log(`✅ [handleDuelUpdate] Player2 - Meu deck: ${player2Deck.length}, Cemitério: ${player2Graveyard.length}, Extra Deck: ${player2ExtraDeck.length}, Oponente deck: ${player1Deck.length}`);
        }
      } else {
        console.warn(`⚠️ [handleDuelUpdate] Dados incompletos - player1Field: ${!!data.player1Field}, player2Field: ${!!data.player2Field}`);
      }
      
      // Atualizar estado do pendingChoice
      const pendingChoice = (data as any).pendingChoice;
      const previousPendingChoice = currentPendingChoice;
      
      // Log para debug
      console.log(`🔍 [handleDuelUpdate] pendingChoice atualizado:`, {
        previous: previousPendingChoice?.type || 'null',
        current: pendingChoice?.type || 'null',
        showGracefulCharityModal,
        showOpponentHandRevealed,
        cardEffectType
      });
      
      // Verificar se pendingChoice mudou de não-null para null
      const wasGracefulCharity = previousPendingChoice && previousPendingChoice.type === 'GRACEFUL_CHARITY';
      const wasConfiscation = previousPendingChoice && previousPendingChoice.type === 'CONFISCATION';
      const wasForcefulSentry = previousPendingChoice && previousPendingChoice.type === 'FORCEFUL_SENTRY';
      const isNowNull = !pendingChoice || pendingChoice === null || pendingChoice === undefined;
      
      // Se pendingChoice mudou de não-null para null, fechar os modais ANTES de atualizar o estado
      if (previousPendingChoice && isNowNull) {
        console.log(`✅ [handleDuelUpdate] Escolha confirmada pelo backend - fechando modais`);
        console.log(`🔍 [handleDuelUpdate] previousPendingChoice:`, previousPendingChoice?.type, 'pendingChoice:', pendingChoice, 'wasGracefulCharity:', wasGracefulCharity);
        
        // Fechar modais de Confiscation/ForcefulSentry APENAS se pendingChoice realmente mudou de não-null para null
        // Não fechar se ainda há pendingChoice (pode ser um update intermediário)
        if ((wasConfiscation || wasForcefulSentry || showOpponentHandRevealed) && 
            (cardEffectType === 'confiscation' || cardEffectType === 'forcefulSentry') &&
            isNowNull && previousPendingChoice) {
          console.log(`✅ [handleDuelUpdate] Fechando modal ${cardEffectType} - wasConfiscation: ${wasConfiscation}, wasForcefulSentry: ${wasForcefulSentry}, showOpponentHandRevealed: ${showOpponentHandRevealed}, isNowNull: ${isNowNull}, previousPendingChoice: ${!!previousPendingChoice}`);
          setShowOpponentHandRevealed(false);
          setOpponentHandRevealed([]);
          setCardEffectType(null);
        }
        
        // Fechar modal de GracefulCharity (verificar tanto pelo tipo quanto pelo estado do modal)
        if (wasGracefulCharity || showGracefulCharityModal) {
          console.log(`✅ [handleDuelUpdate] Fechando modal GracefulCharity - wasGracefulCharity: ${wasGracefulCharity}, showGracefulCharityModal: ${showGracefulCharityModal}`);
          setShowGracefulCharityModal(false);
          setGracefulCharityHand([]);
          setSelectedGracefulCharityCards([]);
        }
      }
      
      // Atualizar estado do pendingChoice DEPOIS de fechar modais
      // Isso garante que o useEffect também seja acionado
      setCurrentPendingChoice(pendingChoice || null);
      
      // Verificação adicional: Se pendingChoice é null e o modal ainda está aberto, forçar fechamento
      // Isso garante que o modal feche mesmo se a verificação anterior não funcionou
      // Verificar também se não há pendingChoice no updatedDuel
      if (isNowNull && showGracefulCharityModal) {
        console.log(`⚠️ [handleDuelUpdate] pendingChoice é null mas modal ainda está aberto - forçando fechamento`);
        console.log(`🔍 [handleDuelUpdate] Detalhes - isNowNull: ${isNowNull}, showGracefulCharityModal: ${showGracefulCharityModal}, pendingChoice:`, pendingChoice);
        setShowGracefulCharityModal(false);
        setGracefulCharityHand([]);
        setSelectedGracefulCharityCards([]);
      }
      
      // Verificação final: Se não há pendingChoice e o modal está aberto, sempre fechar
      // Isso é uma verificação de segurança adicional
      if ((!pendingChoice || pendingChoice === null || pendingChoice === undefined) && showGracefulCharityModal) {
        console.log(`🔒 [handleDuelUpdate] Verificação final - fechando modal GracefulCharity (pendingChoice ausente)`);
        setShowGracefulCharityModal(false);
        setGracefulCharityHand([]);
        setSelectedGracefulCharityCards([]);
      }
      
      // Verificação para modais de Confiscation/ForcefulSentry também
      // IMPORTANTE: Só fechar se realmente mudou de não-null para null (não fechar em updates intermediários)
      if ((!pendingChoice || pendingChoice === null || pendingChoice === undefined) && 
          showOpponentHandRevealed && 
          isNowNull && 
          previousPendingChoice) {
        console.log(`🔒 [handleDuelUpdate] Verificação final - fechando modal Confiscation/ForcefulSentry (pendingChoice mudou de não-null para null)`);
        setShowOpponentHandRevealed(false);
        setOpponentHandRevealed([]);
        setCardEffectType(null);
      }
      
      // Verificar se há escolha pendente e restaurar modal IMEDIATAMENTE
      // Isso garante que o modal abra mesmo no primeiro carregamento
      if (pendingChoice) {
        console.log(`🔍 [handleDuelUpdate] Escolha pendente encontrada:`, {
          type: pendingChoice.type,
          userId: pendingChoice.userId,
          myUserId: user?.id,
          hasData: !!pendingChoice.data,
          opponentHandLength: pendingChoice.data?.opponentHand?.length,
          playerHandLength: pendingChoice.data?.playerHand?.length,
          isFirstLoad: !previousPendingChoice // Indica se é o primeiro carregamento
        });
        
        // Comparar IDs convertendo ambos para número para garantir compatibilidade
        const pendingUserId = typeof pendingChoice.userId === 'string' ? parseInt(pendingChoice.userId, 10) : Number(pendingChoice.userId);
        const myUserId = typeof user?.id === 'string' ? parseInt(user.id, 10) : Number(user?.id);
        const isMyChoice = pendingUserId === myUserId;
        
        console.log(`🔍 [handleDuelUpdate] ========== VERIFICANDO PENDING CHOICE ==========`);
        console.log(`🔍 [handleDuelUpdate] Tipo: ${pendingChoice.type}`);
        console.log(`🔍 [handleDuelUpdate] É minha escolha? ${isMyChoice}`);
        console.log(`🔍 [handleDuelUpdate] pendingChoice.userId: ${pendingChoice.userId} (${typeof pendingChoice.userId}) -> ${pendingUserId} (number)`);
        console.log(`🔍 [handleDuelUpdate] user?.id: ${user?.id} (${typeof user?.id}) -> ${myUserId} (number)`);
        console.log(`🔍 [handleDuelUpdate] Comparação: ${pendingUserId} === ${myUserId} = ${pendingUserId === myUserId}`);
        console.log(`🔍 [handleDuelUpdate] ===========================================`);
        
        if (isMyChoice) {
          console.log(`✅ [handleDuelUpdate] É MINHA ESCOLHA! Restaurando modal para:`, pendingChoice.type);
          
          // Abrir modal IMEDIATAMENTE quando há pendingChoice
          if (pendingChoice.type === 'CONFISCATION' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelUpdate] Abrindo modal Confiscation com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('confiscation');
          } else if (pendingChoice.type === 'GRACEFUL_CHARITY' && pendingChoice.data?.playerHand) {
            console.log(`✅ [handleDuelUpdate] Abrindo modal GracefulCharity com ${pendingChoice.data.playerHand.length} cartas`);
            setGracefulCharityHand(pendingChoice.data.playerHand);
            setShowGracefulCharityModal(true);
            setSelectedGracefulCharityCards([]);
          } else if (pendingChoice.type === 'FORCEFUL_SENTRY' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelUpdate] Abrindo modal ForcefulSentry com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('forcefulSentry');
          } else {
            console.warn(`⚠️ [handleDuelUpdate] Tipo de escolha pendente desconhecido ou dados faltando:`, pendingChoice);
          }
        } else {
          // Escolha pendente não é minha - fechar modais se estiverem abertos
          // Mas só fechar se realmente não for minha escolha (não fechar durante abertura)
          console.log(`ℹ️ [handleDuelUpdate] Escolha pendente não é minha - verificando se preciso fechar modais`);
          // Não fechar aqui - deixar o listener closePendingChoiceModal fazer isso
        }
      } else {
        // Não há escolha pendente - mas não fechar aqui
        // O fechamento já foi tratado acima quando pendingChoice mudou de não-null para null
        // Isso evita fechar modais durante o carregamento inicial quando não há pendingChoice
        // NOTA: Modais não-persistentes (Monster Reborn, Change of Heart, etc.) são fechados via closePendingChoiceModal
        // ou quando o usuário cancela/atualiza a página, não aqui
        console.log(`ℹ️ [handleDuelUpdate] Nenhuma escolha pendente encontrada`);
      }
      
      setLoading(false);
      setError(null);
    };

    const handleDuelError = (data: any) => {
      const errorMessage = data.message || 'Erro ao carregar duelo';
      console.error('❌ [DuelArena] Erro recebido do backend:', errorMessage);
      
      // Se o erro menciona "escolha pendente" e há pendingChoice no erro, abrir o modal
      if (errorMessage.includes('escolha pendente') || errorMessage.includes('completar a escolha')) {
        const pendingChoice = data.pendingChoice;
        if (pendingChoice && pendingChoice.userId === user?.id) {
          console.log('🔍 [handleDuelError] Erro de escolha pendente detectado - abrindo modal:', pendingChoice.type);
          
          // Abrir modal baseado no tipo de pendingChoice
          if (pendingChoice.type === 'CONFISCATION' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelError] Abrindo modal Confiscation com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('confiscation');
            setCurrentPendingChoice(pendingChoice);
          } else if (pendingChoice.type === 'GRACEFUL_CHARITY' && pendingChoice.data?.playerHand) {
            console.log(`✅ [handleDuelError] Abrindo modal GracefulCharity com ${pendingChoice.data.playerHand.length} cartas`);
            setGracefulCharityHand(pendingChoice.data.playerHand);
            setShowGracefulCharityModal(true);
            setSelectedGracefulCharityCards([]);
            setCurrentPendingChoice(pendingChoice);
          } else if (pendingChoice.type === 'FORCEFUL_SENTRY' && pendingChoice.data?.opponentHand) {
            console.log(`✅ [handleDuelError] Abrindo modal ForcefulSentry com ${pendingChoice.data.opponentHand.length} cartas`);
            setOpponentHandRevealed(pendingChoice.data.opponentHand);
            setShowOpponentHandRevealed(true);
            setCardEffectType('forcefulSentry');
            setCurrentPendingChoice(pendingChoice);
          }
          
          // Não mostrar erro se conseguimos abrir o modal
          return;
        }
      }
      
      // Se o erro for "Duelo não encontrado" mas já temos duelData, não fechar o duelo
      // Pode ser um erro temporário ou de sincronização
      if (errorMessage.includes('não encontrado') || errorMessage.includes('not found')) {
        // Sempre ignorar se já temos duelData carregado
        if (duelData && duelData.id) {
          console.warn('⚠️ [DuelArena] Erro de "duelo não encontrado" ignorado - duelo já está carregado');
          return; // Não definir erro se o duelo já está carregado
        }
        // Se não temos duelData mas já foi inicializado, também ignorar (pode ser erro temporário)
        if (hasInitializedRef.current && initializedDuelIdRef.current === duelId) {
          console.warn('⚠️ [DuelArena] Erro de "duelo não encontrado" ignorado - duelo já foi inicializado');
          return;
        }
      }
      
      // Só definir erro se realmente não temos o duelo carregado
      if (!duelData || !duelData.id) {
        setError(errorMessage);
        setLoading(false);
      } else {
        console.warn('⚠️ [DuelArena] Erro ignorado - duelo já está carregado e funcionando');
      }
    };

    // Obter socket do hook useSocket
    // CRÍTICO: A nova aba precisa criar seu próprio socket independente
    let socket = getSocket();
    
    // Se não há socket ou não está conectado, aguardar a conexão
    // O useSocket já cria o socket automaticamente, mas pode levar alguns milissegundos
    const setupSocket = () => {
      // Obter socket novamente (pode ter sido criado enquanto aguardávamos)
      socket = getSocket();
      
      if (!socket || !socket.connected) {
        return false;
      }

      // Registrar listeners
      socket.on('duelUpdate', handleDuelUpdate);
      socket.on('duelError', handleDuelError);
      
      // Listener para animação de ataque direto do oponente
      socket.on('directAttackAnimation', (data: {
        attackerCard?: any;
        targetProfileImage: string;
        damage: number;
      }) => {
        // O oponente está atacando, então eu sou o alvo
        const myProfileImage = user?.profileImage 
          ? (user.profileImage.startsWith('http') ? user.profileImage : `${API_URL}${user.profileImage}`)
          : '/images/default.png';
        
        setAttackAnimation({
          attackerCard: data.attackerCard || null,
          targetCard: null,
          damage: data.damage,
          isDirectAttack: true,
          isMyAttack: false, // Eu estou recebendo o ataque
          targetProfileImage: myProfileImage // Minha imagem de perfil como alvo
        });
        
        setTimeout(() => setAttackAnimation(null), 3000);
      });
      
      // Listener para quando o duelo é encerrado
      const duelEndedListener = (data: any) => {
        console.log('🔴 [DuelArena] Duelo encerrado:', data);
        // Buscar dados completos do duelo se disponíveis
        const currentDuelData = duelDataRef.current;
        setDuelEndedData({
          status: data.status,
          result: data.result,
          winnerId: data.winnerId,
          message: data.message || 'Este duelo foi encerrado',
          player1LifePoints: data.player1LifePoints || currentDuelData?.player1LifePoints,
          player2LifePoints: data.player2LifePoints || currentDuelData?.player2LifePoints,
          player1: data.player1 || currentDuelData?.player1,
          player2: data.player2 || currentDuelData?.player2,
          player1Id: data.player1Id || currentDuelData?.player1Id,
          player2Id: data.player2Id || currentDuelData?.player2Id,
          turnCounter: data.turnCounter || currentDuelData?.turnCounter || 0,
          currentTurn: data.currentTurn || currentDuelData?.currentTurn,
          duelTime: data.duelTime || currentDuelData?.duelTime || duelTime,
        });
        setLoading(false);
      };
      socket.on('duelEnded', duelEndedListener);
      
      // Listener para quando o tempo do oponente expira (recebido do backend)
      const timeExpiredListener = (data: any) => {
        if (!isMyTurn) {
          setTimeExpired(true);
        }
      };
      socket.on('timeExpired', timeExpiredListener);
      
      // Listener para quando precisa descartar cartas (não usado mais, mas mantido para compatibilidade)
      const needsDiscardListener = (data: any) => {
        // Não fazer nada - o descarte agora é feito diretamente clicando nas cartas
      };
      socket.on('needsDiscard', needsDiscardListener);
      
      // Listener para The Forceful Sentry
      const forcefulSentryListener = (data: { opponentHand: any[]; duelId: string | number }) => {
        console.log('✨ The Forceful Sentry ativada - mostrando mão do oponente:', data.opponentHand);
        setOpponentHandRevealed(data.opponentHand);
        setShowOpponentHandRevealed(true);
        setCardEffectType('forcefulSentry');
      };
      
      // Listener para Confiscation
      const confiscationListener = (data: { opponentHand: any[]; duelId: string | number }) => {
        console.log('✨ [Confiscation Listener] ==========================================');
        console.log('✨ [Confiscation Listener] Evento recebido!', data);
        console.log('✨ [Confiscation Listener] Mão do oponente:', data.opponentHand);
        console.log('✨ [Confiscation Listener] Número de cartas:', data.opponentHand?.length || 0);
        console.log('✨ [Confiscation Listener] DuelId recebido:', data.duelId, 'DuelId atual:', duelId);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [Confiscation Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        // Atualizar estados
        const handArray = data.opponentHand || [];
        console.log('✨ [Confiscation Listener] Abrindo modal com', handArray.length, 'cartas');
        setOpponentHandRevealed(handArray);
        setShowOpponentHandRevealed(true);
        setCardEffectType('confiscation');
        
        console.log('✅ [Confiscation Listener] Estados atualizados:', {
          showOpponentHandRevealed: true,
          opponentHandRevealed: handArray.length,
          cardEffectType: 'confiscation',
          handArray: handArray
        });
        console.log('✨ [Confiscation Listener] ==========================================');
        
        // Forçar re-render verificando estados após um pequeno delay
        setTimeout(() => {
          console.log('🔍 [Confiscation Listener] Verificação pós-update - showOpponentHandRevealed deve ser true');
        }, 100);
      };
      
      socket.on('forcefulSentryShowHand', forcefulSentryListener);
      socket.on('confiscationShowHand', confiscationListener);

      // Listener para GracefulCharity
      const gracefulCharityListener = (data: { playerHand: any[]; duelId: string | number }) => {
        console.log('✨ [GracefulCharity Listener] ==========================================');
        console.log('✨ [GracefulCharity Listener] Evento recebido!', data);
        console.log('✨ [GracefulCharity Listener] Dados recebidos:', {
          playerHandLength: data.playerHand?.length || 0,
          playerHand: data.playerHand,
          duelId: data.duelId
        });
        console.log('✨ [GracefulCharity Listener] DuelId recebido:', data.duelId, 'DuelId atual:', duelId);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [GracefulCharity Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        const handArray = data.playerHand || [];
        console.log('✨ [GracefulCharity Listener] Abrindo modal com', handArray.length, 'cartas');
        setGracefulCharityHand(handArray);
        setShowGracefulCharityModal(true);
        setSelectedGracefulCharityCards([]);
        console.log('✅ [GracefulCharity Listener] Estados atualizados - showGracefulCharityModal: true, handLength:', handArray.length);
        console.log('✨ [GracefulCharity Listener] ==========================================');
      };
      socket.on('gracefulCharityShowHand', gracefulCharityListener);
      console.log('✅ [DuelArena] Listener gracefulCharityShowHand registrado');

      // Listener para MonsterReborn
      const monsterRebornListener = (data: { playerGraveyard: any[]; opponentGraveyard: any[]; duelId: string | number }) => {
        console.log('✨ [MonsterReborn Listener] Evento recebido!', data);
        
        // Verificar se é para este duelo
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MonsterReborn Listener] Evento não é para este duelo - ignorando');
          return;
        }
        
        console.log('✨ [MonsterReborn Listener] Abrindo modal');
        setMonsterRebornData({
          playerGraveyard: data.playerGraveyard || [],
          opponentGraveyard: data.opponentGraveyard || [],
        });
        setShowMonsterRebornModal(true);
        setSelectedMonsterReborn(null);
      };
      socket.on('monsterRebornShowGraveyards', monsterRebornListener);
      console.log('✅ [DuelArena] Listener monsterRebornShowGraveyards registrado');
      
      // Listener para ChangeOfHeart
      const changeOfHeartListener = (data: { opponentMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [ChangeOfHeart Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ChangeOfHeart Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ChangeOfHeart Listener] Abrindo modal');
        setChangeOfHeartData({
          opponentMonsters: data.opponentMonsters || [],
        });
        setShowChangeOfHeartModal(true);
        setSelectedChangeOfHeartMonster(null);
      };
      socket.on('changeOfHeartShowOpponentMonsters', changeOfHeartListener);
      console.log('✅ [DuelArena] Listener changeOfHeartShowOpponentMonsters registrado');
      
      // Listener para BrainControl
      const brainControlListener = (data: { opponentMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [BrainControl Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [BrainControl Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [BrainControl Listener] Abrindo modal');
        setBrainControlData({
          opponentMonsters: data.opponentMonsters || [],
        });
        setShowBrainControlModal(true);
        setSelectedBrainControlMonster(null);
      };
      socket.on('brainControlShowOpponentMonsters', brainControlListener);
      console.log('✅ [DuelArena] Listener brainControlShowOpponentMonsters registrado');
      
      // Listener para SoulTaker
      const soulTakerListener = (data: { opponentMonsters: any[]; duelId: string | number }) => {
        console.log('🔍 [DuelArena] soulTakerShowOpponentMonsters recebido:', data);
        if (data.duelId === duelId) {
          setSoulTakerData({ opponentMonsters: data.opponentMonsters });
          setShowSoulTakerModal(true);
          setSelectedSoulTakerMonster(null);
        }
      };
      socket.on('soulTakerShowOpponentMonsters', soulTakerListener);
      console.log('✅ [DuelArena] Listener soulTakerShowOpponentMonsters registrado');

      // Listener para Exiled Force
      const exiledForceListener = (data: { availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }>; duelId: string | number; monsterZoneIndex?: number }) => {
        console.log('🔍 [DuelArena] exiledForceShowTargets recebido:', data);
        if (data.duelId === duelId) {
          setExiledForceData({ 
            availableMonsters: data.availableMonsters,
            monsterZoneIndex: data.monsterZoneIndex
          });
          setShowExiledForceModal(true);
          setSelectedExiledForceMonster(null);
        }
      };
      socket.on('exiledForceShowTargets', exiledForceListener);
      console.log('✅ [DuelArena] Listener exiledForceShowTargets registrado');

      // Listener para UnitedWeStand
      const unitedWeStandListener = (data: { availableMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [UnitedWeStand Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [UnitedWeStand Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [UnitedWeStand Listener] Abrindo modal');
        setUnitedWeStandData({
          availableMonsters: data.availableMonsters || [],
        });
        setShowUnitedWeStandModal(true);
        setSelectedUnitedWeStandMonster(null);
      };

      socket.on('unitedWeStandShowMonsters', unitedWeStandListener);
      console.log('✅ [DuelArena] Listener unitedWeStandShowMonsters registrado');

      // Listener para MagePower
      const magePowerListener = (data: { availableMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [MagePower Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MagePower Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [MagePower Listener] Abrindo modal');
        setMagePowerData({
          availableMonsters: data.availableMonsters || [],
        });
        setShowMagePowerModal(true);
        setSelectedMagePowerMonster(null);
      };

      socket.on('magePowerShowMonsters', magePowerListener);
      console.log('✅ [DuelArena] Listener magePowerShowMonsters registrado');
      
      // Listener para Reinforcement Of The Army
      const reinforcementOfTheArmyListener = (data: { warriorMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [ReinforcementOfTheArmy Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ReinforcementOfTheArmy Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ReinforcementOfTheArmy Listener] Abrindo modal');
        setReinforcementOfTheArmyData({
          warriorMonsters: data.warriorMonsters || [],
        });
        setShowReinforcementOfTheArmyModal(true);
        setSelectedReinforcementOfTheArmyMonster(null);
      };
      socket.on('reinforcementOfTheArmyShowDeck', reinforcementOfTheArmyListener);
      console.log('✅ [DuelArena] Listener reinforcementOfTheArmyShowDeck registrado');

      // Listener para Last Will
      const lastWillListener = (data: { eligibleMonsters: any[]; duelId: string | number }) => {
        console.log('✨ [LastWill Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [LastWill Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [LastWill Listener] Abrindo modal');
        setLastWillData({
          eligibleMonsters: data.eligibleMonsters || [],
        });
        setShowLastWillModal(true);
        setSelectedLastWillMonster(null);
      };
      socket.on('lastWillShowDeck', lastWillListener);
      console.log('✅ [DuelArena] Listener lastWillShowDeck registrado');

      // Listener para Chaos Sorcerer Summon
      const chaosSorcererSummonListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [ChaosSorcererSummon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ChaosSorcererSummon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ChaosSorcererSummon Listener] Abrindo modal');
        if (data.data) {
          setChaosSorcererData({
            cardName: data.data.cardName || 'Carta Chaos',
            lightMonsters: data.data.lightMonsters || [],
            darkMonsters: data.data.darkMonsters || [],
          });
          setShowChaosSorcererModal(true);
          setSelectedLightMonster(null);
          setSelectedDarkMonster(null);
        }
      };
      socket.on('chaosSorcererSummonShowMonsters', chaosSorcererSummonListener);
      console.log('✅ [DuelArena] Listener chaosSorcererSummonShowMonsters registrado');

      // Listener para Chaos Sorcerer Effect
      const chaosSorcererEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [ChaosSorcererEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [ChaosSorcererEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [ChaosSorcererEffect Listener] Iniciando seleção de alvo');
        setIsSelectingChaosSorcererTarget(true);
        if (data.data?.monsterZoneIndex !== undefined) {
          setChaosSorcererMonsterZoneIndex(data.data.monsterZoneIndex);
        }
      };
      socket.on('chaosSorcererEffectShowTargets', chaosSorcererEffectListener);
      console.log('✅ [DuelArena] Listener chaosSorcererEffectShowTargets registrado');

      // Listener para Dark Armed Dragon Summon
      const darkArmedDragonSummonListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [DarkArmedDragonSummon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [DarkArmedDragonSummon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [DarkArmedDragonSummon Listener] Mostrando zonas disponíveis');
        // Dark Armed Dragon invoca diretamente sem modal (sempre em ataque)
        // O backend já valida que há exatamente 3 Dark no cemitério
        if (data.data && duelId && user?.id) {
          // Usar duelDataRef para obter o estado mais recente do duelo
          const currentDuelData = duelDataRef.current;
          if (currentDuelData) {
            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
            const player1Id = typeof currentDuelData.player1Id === 'string' ? parseInt(currentDuelData.player1Id, 10) : Number(currentDuelData.player1Id);
            const isPlayer1 = userId === player1Id;
            const field = isPlayer1 ? currentDuelData.player1Field : currentDuelData.player2Field;
            const monsters = field?.monsters || [];
            const emptyZoneIndex = monsters.findIndex((m: any) => m === null || m === undefined);
            if (emptyZoneIndex !== -1) {
              const cardId = data.data.cardId;
              performAction(duelId, user.id, 'DARK_ARMED_DRAGON_SUMMON_CHOICE', {
                cardId: cardId,
                zoneIndex: emptyZoneIndex,
              });
            }
          }
        }
      };
      socket.on('darkArmedDragonSummonShowZones', darkArmedDragonSummonListener);
      console.log('✅ [DuelArena] Listener darkArmedDragonSummonShowZones registrado');

      // Listener para Dark Armed Dragon Effect
      const darkArmedDragonEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [DarkArmedDragonEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [DarkArmedDragonEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [DarkArmedDragonEffect Listener] Abrindo modal');
        if (data.data) {
          setDarkArmedDragonEffectData({
            monsterZoneIndex: data.data.monsterZoneIndex,
            darkMonsters: data.data.darkMonsters || [],
          });
          setShowDarkArmedDragonEffectModal(true);
          setSelectedDarkMonsterToBanish(null);
        }
      };
      socket.on('darkArmedDragonEffectShowModal', darkArmedDragonEffectListener);
      console.log('✅ [DuelArena] Listener darkArmedDragonEffectShowModal registrado');

      // Listener para Red-Eyes Darkness Metal Dragon Summon
      const redEyesDarknessMetalDragonSummonListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [RedEyesDarknessMetalDragonSummon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [RedEyesDarknessMetalDragonSummon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [RedEyesDarknessMetalDragonSummon Listener] Abrindo modal');
        if (data.data) {
          setRedEyesDarknessMetalDragonData({
            cardId: data.data.cardId || '',
            dragonMonsters: data.data.dragonMonsters || [],
          });
          setShowRedEyesDarknessMetalDragonModal(true);
          setSelectedDragonToBanish(null);
        }
      };
      socket.on('redEyesDarknessMetalDragonSummonShowDragons', redEyesDarknessMetalDragonSummonListener);
      console.log('✅ [DuelArena] Listener redEyesDarknessMetalDragonSummonShowDragons registrado');

      // Listener para Red-Eyes Darkness Metal Dragon Effect
      const redEyesDarknessMetalDragonEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [RedEyesDarknessMetalDragonEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [RedEyesDarknessMetalDragonEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [RedEyesDarknessMetalDragonEffect Listener] Abrindo modal');
        if (data.data) {
          setRedEyesDarknessMetalDragonEffectData({
            monsterZoneIndex: data.data.monsterZoneIndex,
            dragonsInHand: data.data.dragonsInHand || [],
            dragonsInGraveyard: data.data.dragonsInGraveyard || [],
          });
          setShowRedEyesDarknessMetalDragonEffectModal(true);
          setSelectedDragonSource(null);
          setSelectedDragonIndex(null);
          setSelectedDragonId(null);
        }
      };
      socket.on('redEyesDarknessMetalDragonEffectShowDragons', redEyesDarknessMetalDragonEffectListener);
      console.log('✅ [DuelArena] Listener redEyesDarknessMetalDragonEffectShowDragons registrado');

      // Listener para Cyber-Stein Effect
      const cyberSteinEffectListener = (data: { duelId: string | number; data: any }) => {
        console.log('✨ [CyberSteinEffect Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [CyberSteinEffect Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [CyberSteinEffect Listener] Abrindo modal');
        if (data.data) {
          setCyberSteinData({
            monsterZoneIndex: data.data.monsterZoneIndex,
            extraDeckMonsters: data.data.extraDeckMonsters || [],
          });
          setShowCyberSteinModal(true);
          setSelectedCyberSteinMonster(null);
        }
      };
      socket.on('cyberSteinEffectShowExtraDeck', cyberSteinEffectListener);
      console.log('✅ [DuelArena] Listener cyberSteinEffectShowExtraDeck registrado');

      // Listener para Mystical Space Typhoon
      const mysticalSpaceTyphoonListener = (data: { duelId: string | number; playerSpellTraps: any[]; opponentSpellTraps: any[]; spellTrapZoneIndex: number }) => {
        console.log('✨ [MysticalSpaceTyphoon Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [MysticalSpaceTyphoon Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [MysticalSpaceTyphoon Listener] Iniciando seleção de alvo');
        setIsSelectingMSTTarget(true);
        // Os dados necessários já estão disponíveis no estado do componente
      };
      socket.on('mysticalSpaceTyphoonShowTargets', mysticalSpaceTyphoonListener);
      console.log('✅ [DuelArena] Listener mysticalSpaceTyphoonShowTargets registrado');

      // Listener para Snowman Eater
      const snowmanEaterListener = (data: { duelId: string | number; faceUpMonsters: any[]; monsterZoneIndex: number }) => {
        console.log('✨ [SnowmanEater Listener] Evento recebido!', data);
        if (data.duelId !== duelId && String(data.duelId) !== String(duelId)) {
          console.warn('⚠️ [SnowmanEater Listener] Evento não é para este duelo - ignorando');
          return;
        }
        console.log('✨ [SnowmanEater Listener] Iniciando seleção de alvo');
        setIsSelectingSnowmanEaterTarget(true);
        // Os dados necessários já estão disponíveis no estado do componente
      };
      socket.on('snowmanEaterShowTargets', snowmanEaterListener);
      console.log('✅ [DuelArena] Listener snowmanEaterShowTargets registrado');

      // Listener para fechar modal quando turno é roubado ou muda
      // IMPORTANTE: Se o motivo for 'turn_stolen', fechar TODOS os modais (escolha automática será feita)
      const closePendingChoiceModalListener = (data: { duelId: string | number; userId?: number; reason: string }) => {
        console.log('🔒 [closePendingChoiceModal] Evento recebido para fechar modal:', data);
        console.log('🔒 [closePendingChoiceModal] Verificando condições - duelId:', data.duelId, '===', duelId, 'userId:', data.userId, '===', user?.id);
        
        // Verificar se é para este duelo
        const isForThisDuel = data.duelId === duelId || String(data.duelId) === String(duelId);
        
        // Se o turno foi roubado, fechar TODOS os modais (escolha automática será feita pelo backend)
        // O evento é emitido para todos na sala, mas só fecha o modal se for para este duelo E se o userId corresponder ao usuário atual
        if (isForThisDuel && data.reason === 'turn_stolen') {
          // Converter ambos os IDs para número para comparação
          const eventUserId = typeof data.userId === 'string' ? parseInt(data.userId, 10) : Number(data.userId);
          const currentUserId = typeof user?.id === 'string' ? parseInt(user.id, 10) : Number(user?.id);
          
          // Verificar se o evento é para este usuário OU se não há userId especificado (fechar para todos)
          const userIdMatch = !data.userId || eventUserId === currentUserId;
          
          if (userIdMatch) {
            console.log('🔒 [closePendingChoiceModal] Turno foi roubado - fechando TODOS os modais imediatamente');
            console.log('🔒 [closePendingChoiceModal] userId do evento:', data.userId, '->', eventUserId, 'userId atual:', user?.id, '->', currentUserId, 'match:', userIdMatch);
            
            // Usar refs para acessar valores mais recentes dos modais
            const isOpponentHandRevealedOpen = showOpponentHandRevealedRef.current;
            const isGracefulCharityOpen = showGracefulCharityModalRef.current;
            const currentCardEffectType = cardEffectTypeRef.current;
            
            console.log('🔒 [closePendingChoiceModal] Estados atuais dos modais (via refs):', {
              isOpponentHandRevealedOpen,
              isGracefulCharityOpen,
              currentCardEffectType
            });
            
            // Fechar todos os modais quando o turno é roubado
            if (isOpponentHandRevealedOpen) {
              console.log('🔒 [closePendingChoiceModal] Fechando modal Confiscation/ForcefulSentry (turno roubado)');
              setShowOpponentHandRevealed(false);
              setOpponentHandRevealed([]);
              setCardEffectType(null);
            }
            if (isGracefulCharityOpen) {
              console.log('🔒 [closePendingChoiceModal] Fechando modal GracefulCharity (turno roubado)');
              setShowGracefulCharityModal(false);
              setGracefulCharityHand([]);
              setSelectedGracefulCharityCards([]);
            }
            return; // Não processar mais nada, já fechou os modais
          } else {
            console.log('🔒 [closePendingChoiceModal] Evento de turno roubado recebido, mas não é para este usuário');
            console.log('🔒 [closePendingChoiceModal] eventUserId:', eventUserId, 'currentUserId:', currentUserId);
          }
        }
        
        // Verificar se é para este usuário (para outros casos)
        const eventUserId = typeof data.userId === 'string' ? parseInt(data.userId, 10) : Number(data.userId);
        const currentUserId = typeof user?.id === 'string' ? parseInt(user.id, 10) : Number(user?.id);
        const isForThisUser = !data.userId || eventUserId === currentUserId;
        
        if (isForThisDuel && isForThisUser) {
          console.log('🔒 [closePendingChoiceModal] ✅ Condições atendidas - fechando modais - motivo:', data.reason);
          
          // Se o motivo for 'choice_completed', fechar modais de Confiscation/ForcefulSentry/GracefulCharity
          if (data.reason === 'choice_completed') {
            const cardEffectTypeFromData = (data as any).cardEffectType;
            if (cardEffectTypeFromData === 'confiscation' || cardEffectType === 'confiscation') {
              console.log('🔒 [closePendingChoiceModal] Fechando modal Confiscation (choice_completed)');
              setShowOpponentHandRevealed(false);
              setOpponentHandRevealed([]);
              setCardEffectType(null);
            }
            if (cardEffectTypeFromData === 'forcefulSentry' || cardEffectType === 'forcefulSentry') {
              console.log('🔒 [closePendingChoiceModal] Fechando modal ForcefulSentry (choice_completed)');
              setShowOpponentHandRevealed(false);
              setOpponentHandRevealed([]);
              setCardEffectType(null);
            }
            if (cardEffectTypeFromData === 'gracefulCharity' || showGracefulCharityModal) {
              console.log('🔒 [closePendingChoiceModal] Fechando modal GracefulCharity (choice_completed)');
              setShowGracefulCharityModal(false);
              setGracefulCharityHand([]);
              setSelectedGracefulCharityCards([]);
            }
          }
          
          // NÃO fechar modais de Confiscation, GracefulCharity e ForcefulSentry em outros casos (exceto choice_completed)
          // Esses modais só fecham quando pendingChoice vira null (escolha confirmada) ou quando reason é choice_completed
          // Fechar apenas outros modais que não são de seleção obrigatória
          if (showMonsterRebornModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal MonsterReborn');
            setShowMonsterRebornModal(false);
            setMonsterRebornData(null);
            setSelectedMonsterReborn(null);
          }
          if (showChaosSorcererModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal ChaosSorcerer');
            setShowChaosSorcererModal(false);
            setChaosSorcererData(null);
            setSelectedLightMonster(null);
            setSelectedDarkMonster(null);
          }
          if (showRedEyesDarknessMetalDragonModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Red-Eyes Darkness Metal Dragon');
            setShowRedEyesDarknessMetalDragonModal(false);
            setRedEyesDarknessMetalDragonData(null);
            setSelectedDragonToBanish(null);
          }
          if (showRedEyesDarknessMetalDragonEffectModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal de efeito do Red-Eyes Darkness Metal Dragon');
            setShowRedEyesDarknessMetalDragonEffectModal(false);
            setRedEyesDarknessMetalDragonEffectData(null);
            setSelectedDragonSource(null);
            setSelectedDragonIndex(null);
            setSelectedDragonId(null);
          }
          if (showCyberSteinModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Cyber-Stein');
            setShowCyberSteinModal(false);
            setCyberSteinData(null);
            setSelectedCyberSteinMonster(null);
          }
          if (showDarkArmedDragonEffectModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Dark Armed Dragon');
            setShowDarkArmedDragonEffectModal(false);
            setDarkArmedDragonEffectData(null);
            setSelectedDarkMonsterToBanish(null);
            setSelectedCardToDestroy(null);
          }
          if (showChangeOfHeartModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal ChangeOfHeart');
            setShowChangeOfHeartModal(false);
            setChangeOfHeartData(null);
            setSelectedChangeOfHeartMonster(null);
          }
          if (showBrainControlModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal BrainControl');
            setShowBrainControlModal(false);
            setBrainControlData(null);
            setSelectedBrainControlMonster(null);
          }
          if (showSoulTakerModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal SoulTaker');
            setShowSoulTakerModal(false);
            setSoulTakerData(null);
            setSelectedSoulTakerMonster(null);
          }
          if (showExiledForceModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal Exiled Force');
            setShowExiledForceModal(false);
            setExiledForceData(null);
            setSelectedExiledForceMonster(null);
          }
          if (showUnitedWeStandModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal UnitedWeStand');
            setShowUnitedWeStandModal(false);
            setUnitedWeStandData(null);
            setSelectedUnitedWeStandMonster(null);
          }
          if (showMagePowerModal) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal MagePower');
            setShowMagePowerModal(false);
            setMagePowerData(null);
            setSelectedMagePowerMonster(null);
          }
          
          // Fechar modal de informações da carta quando o turno é roubado
          if (selectedCardInfo) {
            console.log('🔒 [closePendingChoiceModal] Fechando modal de informações da carta');
            setSelectedCardInfo(null);
          }
          
          // NÃO limpar pendingChoice se for Confiscation, GracefulCharity ou ForcefulSentry
          // Esses modais devem permanecer abertos até que a escolha seja feita
          const isSelectionRequired = currentPendingChoice && (
            currentPendingChoice.type === 'CONFISCATION' ||
            currentPendingChoice.type === 'GRACEFUL_CHARITY' ||
            currentPendingChoice.type === 'FORCEFUL_SENTRY'
          );
          
          if (!isSelectionRequired) {
            // Limpar pendingChoice apenas se não for um modal de seleção obrigatória
            setCurrentPendingChoice(null);
          } else {
            console.log('⚠️ [closePendingChoiceModal] Mantendo pendingChoice ativo para modal de seleção obrigatória:', currentPendingChoice.type);
          }
        } else {
          console.log('🔒 [closePendingChoiceModal] ⚠️ Condições NÃO atendidas - NÃO fechando modais');
          console.log('🔒 [closePendingChoiceModal] isForThisDuel:', isForThisDuel, 'isForThisUser:', isForThisUser);
        }
      };
      socket.on('closePendingChoiceModal', closePendingChoiceModalListener);
      console.log('✅ [DuelArena] Listener closePendingChoiceModal registrado');
      
      // Verificar se o listener foi registrado corretamente
      if (typeof socket.hasListeners === 'function') {
        const hasListener = socket.hasListeners('gracefulCharityShowHand');
        console.log('🔍 [DuelArena] Listener gracefulCharityShowHand está registrado?', hasListener);
      }

      console.log('✅ [DuelArena] Listeners registrados: forcefulSentryShowHand, confiscationShowHand, gracefulCharityShowHand e closePendingChoiceModal');
      
      // Teste: verificar se o socket está ouvindo o evento (se o método existir)
      if (typeof socket.hasListeners === 'function') {
        console.log('🔍 [DuelArena] Socket listeners ativos:', {
          hasForcefulSentry: socket.hasListeners('forcefulSentryShowHand'),
          hasConfiscation: socket.hasListeners('confiscationShowHand'),
          socketId: socket.id,
          connected: socket.connected
        });
      } else {
        console.log('🔍 [DuelArena] Socket info:', {
          socketId: socket.id,
          connected: socket.connected,
          listenersRegistered: 'forcefulSentryShowHand e confiscationShowHand'
        });
      }
      
      // Cleanup será feito no return do useEffect
      
      // Entrar na room do duelo via WebSocket (carregamento instantâneo)
      const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
      const numericUserId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      
      joinDuelRoom(duelIdStr, numericUserId);
      
      return true;
    };

    // Aguardar um pouco para o useSocket inicializar o socket
    // Isso é especialmente importante quando a página abre em uma nova aba
    let retryInterval: NodeJS.Timeout | null = null;
    let connectListener: (() => void) | null = null;
    
    const markAsInitialized = () => {
      hasInitializedRef.current = true;
      initializedDuelIdRef.current = duelId;
      initializedUserIdRef.current = user?.id;
      console.log('✅ [DuelArena] Marcado como inicializado');
    };
    
    const initTimeout = setTimeout(() => {
      // Tentar configurar imediatamente
      if (setupSocket()) {
        markAsInitialized();
        return;
      }
      
      // Se o socket existe mas não está conectado, aguardar evento de conexão
      const currentSocket = getSocket();
      if (currentSocket && !currentSocket.connected) {
        connectListener = () => {
          if (setupSocket() && currentSocket && connectListener) {
            markAsInitialized();
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
        };
        currentSocket.on('connect', connectListener);
      }
      
      // Também iniciar retry como fallback
      let attempts = 0;
      const maxAttempts = 20;
      
      retryInterval = setInterval(() => {
        attempts++;
        
        if (setupSocket()) {
          markAsInitialized();
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          const currentSocket = getSocket();
          if (currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
        } else if (attempts >= maxAttempts) {
          if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
          }
          const currentSocket = getSocket();
          if (currentSocket && connectListener) {
            currentSocket.off('connect', connectListener);
            connectListener = null;
          }
          setError('WebSocket não conectado. Aguarde alguns segundos e recarregue a página.');
          setLoading(false);
        }
      }, 500);
    }, 100);
    
    // Cleanup
    return () => {
      // NÃO resetar os refs no cleanup - eles devem persistir entre re-renders
      // Só limpar os listeners e timers
      clearTimeout(initTimeout);
      if (retryInterval) {
        clearInterval(retryInterval);
      }
      const currentSocket = getSocket();
      if (currentSocket) {
        currentSocket.off('duelUpdate', handleDuelUpdate);
        currentSocket.off('duelError', handleDuelError);
        currentSocket.off('duelEnded');
        currentSocket.off('timeExpired');
        currentSocket.off('needsDiscard');
        currentSocket.off('forcefulSentryShowHand', forcefulSentryListener);
        currentSocket.off('confiscationShowHand', confiscationListener);
        currentSocket.off('gracefulCharityShowHand', gracefulCharityListener);
        currentSocket.off('closePendingChoiceModal', closePendingChoiceModalListener);
        currentSocket.off('chaosSorcererSummonShowMonsters', chaosSorcererSummonListener);
        currentSocket.off('chaosSorcererEffectShowTargets', chaosSorcererEffectListener);
        currentSocket.off('darkArmedDragonSummonShowZones', darkArmedDragonSummonListener);
        currentSocket.off('darkArmedDragonEffectShowModal', darkArmedDragonEffectListener);
        currentSocket.off('redEyesDarknessMetalDragonSummonShowDragons', redEyesDarknessMetalDragonSummonListener);
        currentSocket.off('redEyesDarknessMetalDragonEffectShowDragons', redEyesDarknessMetalDragonEffectListener);
        currentSocket.off('cyberSteinEffectShowExtraDeck', cyberSteinEffectListener);
        currentSocket.off('mysticalSpaceTyphoonShowTargets', mysticalSpaceTyphoonListener);
        currentSocket.off('snowmanEaterShowTargets', snowmanEaterListener);
        currentSocket.off('soulTakerShowOpponentMonsters', soulTakerListener);
        currentSocket.off('exiledForceShowTargets', exiledForceListener);
        // Remover listener de conexão se ainda estiver ativo
        if (connectListener) {
          currentSocket.off('connect', connectListener);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId, user?.id]);

  // NOTA: Removido useEffect que fechava modais automaticamente
  // O fechamento dos modais agora é feito apenas via:
  // 1. Listener closePendingChoiceModal (quando turno é roubado/muda)
  // 2. handleDuelUpdate (quando pendingChoice é null ou não é do usuário)
  // Isso evita interferir na abertura dos modais

  // Verificar e restaurar modais quando currentPendingChoice mudar ou quando o componente montar
  useEffect(() => {
    if (!currentPendingChoice || !user?.id) {
      return;
    }

    // Comparar IDs convertendo ambos para número para garantir compatibilidade
    const pendingUserId = typeof currentPendingChoice.userId === 'string' ? parseInt(currentPendingChoice.userId, 10) : Number(currentPendingChoice.userId);
    const myUserId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    const isMyChoice = pendingUserId === myUserId;
    
    if (!isMyChoice) {
      console.log(`⚠️ [useEffect pendingChoice] Não é minha escolha - pendingUserId: ${pendingUserId}, myUserId: ${myUserId}`);
      return;
    }

    console.log(`🔍 [useEffect pendingChoice] Verificando se precisa restaurar modal:`, currentPendingChoice.type, {
      hasData: !!currentPendingChoice.data,
      opponentHandLength: currentPendingChoice.data?.opponentHand?.length,
      playerHandLength: currentPendingChoice.data?.playerHand?.length
    });

    // Restaurar modais baseado no tipo de pendingChoice
    if (currentPendingChoice.type === 'CONFISCATION' && currentPendingChoice.data?.opponentHand) {
      console.log(`✅ [useEffect pendingChoice] Restaurando modal Confiscation com ${currentPendingChoice.data.opponentHand.length} cartas`);
      setOpponentHandRevealed(currentPendingChoice.data.opponentHand);
      setShowOpponentHandRevealed(true);
      setCardEffectType('confiscation');
    } else if (currentPendingChoice.type === 'GRACEFUL_CHARITY' && currentPendingChoice.data?.playerHand) {
      console.log(`✅ [useEffect pendingChoice] Restaurando modal GracefulCharity com ${currentPendingChoice.data.playerHand.length} cartas`);
      setGracefulCharityHand(currentPendingChoice.data.playerHand);
      setShowGracefulCharityModal(true);
      setSelectedGracefulCharityCards([]);
    } else if (currentPendingChoice.type === 'FORCEFUL_SENTRY' && currentPendingChoice.data?.opponentHand) {
      console.log(`✅ [useEffect pendingChoice] Restaurando modal ForcefulSentry com ${currentPendingChoice.data.opponentHand.length} cartas`);
      setOpponentHandRevealed(currentPendingChoice.data.opponentHand);
      setShowOpponentHandRevealed(true);
      setCardEffectType('forcefulSentry');
    } else {
      console.warn(`⚠️ [useEffect pendingChoice] Tipo de pendingChoice desconhecido ou dados faltando:`, currentPendingChoice);
    }
  }, [currentPendingChoice, user?.id]);

  // Debug: verificar estados do Confiscation
  useEffect(() => {
    if (showOpponentHandRevealed || cardEffectType === 'confiscation' || opponentHandRevealed.length > 0) {
      console.log('🔍 [Debug Confiscation] Estados atuais:', {
        showOpponentHandRevealed,
        cardEffectType,
        opponentHandRevealedLength: opponentHandRevealed.length,
        opponentHandRevealed: opponentHandRevealed,
        shouldShowModal: showOpponentHandRevealed && cardEffectType === 'confiscation',
        selectedConfiscationCard: !!selectedConfiscationCard,
        selectedCardName: selectedConfiscationCard?.card?.name
      });
    }
  }, [showOpponentHandRevealed, cardEffectType, opponentHandRevealed, selectedConfiscationCard]);

  // Atualizar dados do duelFound se vier do WebSocket
  useEffect(() => {
    if (duelFound) {
      setMyLifePoints(duelFound.lifePoints);
      setOpponentLifePoints(duelFound.opponentLifePoints);
      previousMyLifePoints.current = duelFound.lifePoints;
      previousOpponentLifePoints.current = duelFound.opponentLifePoints;
      setIsMyTurn(duelFound.yourTurn);
      
      // Atualizar deck e mão se vierem no duelFound
      const userId = typeof user?.id === 'string' ? parseInt(user?.id, 10) : Number(user?.id);
      
      // Usar player1Id e player2Id do duelFound se disponíveis, senão do duelData
      const player1Id = duelFound.player1Id 
        ? (typeof duelFound.player1Id === 'string' ? parseInt(duelFound.player1Id, 10) : Number(duelFound.player1Id))
        : (duelData?.player1?.id ? (typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id)) : null);
      const player2Id = duelFound.player2Id 
        ? (typeof duelFound.player2Id === 'string' ? parseInt(duelFound.player2Id, 10) : Number(duelFound.player2Id))
        : (duelData?.player2?.id ? (typeof duelData.player2.id === 'string' ? parseInt(duelData.player2.id, 10) : Number(duelData.player2.id)) : null);
      
      console.log(`🔍 [DuelArena] Processando duelFound - userId: ${userId}, player1Id: ${player1Id}, player2Id: ${player2Id}`);
      console.log(`🔍 [DuelArena] duelFound.player1Field:`, duelFound.player1Field ? `${duelFound.player1Field.deck?.length || 0} cartas no deck, ${duelFound.player1Field.hand?.length || 0} na mão` : 'não existe');
      console.log(`🔍 [DuelArena] duelFound.player2Field:`, duelFound.player2Field ? `${duelFound.player2Field.deck?.length || 0} cartas no deck, ${duelFound.player2Field.hand?.length || 0} na mão` : 'não existe');
      
      // Sempre processar ambos os campos se disponíveis
      if (duelFound.player1Field && duelFound.player2Field) {
        if (userId === player1Id) {
          // É player1
          setMyDeck(duelFound.player1Field.deck || []);
          setMyHand(duelFound.player1Field.hand || []);
          setMyExtraDeck(duelFound.player1Field.extraDeck || []);
          setOpponentDeck(duelFound.player2Field.deck || []);
          setOpponentHand(duelFound.player2Field.hand || []);
          setOpponentExtraDeck(duelFound.player2Field.extraDeck || []);
          console.log(`✅ [DuelArena] Player1 - Meu deck: ${duelFound.player1Field.deck?.length || 0}, Extra Deck: ${duelFound.player1Field.extraDeck?.length || 0}, Oponente deck: ${duelFound.player2Field.deck?.length || 0}`);
        } else if (userId === player2Id) {
          // É player2
          setMyDeck(duelFound.player2Field.deck || []);
          setMyHand(duelFound.player2Field.hand || []);
          setMyExtraDeck(duelFound.player2Field.extraDeck || []);
          setOpponentDeck(duelFound.player1Field.deck || []);
          setOpponentHand(duelFound.player1Field.hand || []);
          setOpponentExtraDeck(duelFound.player1Field.extraDeck || []);
          console.log(`✅ [DuelArena] Player2 - Meu deck: ${duelFound.player2Field.deck?.length || 0}, Extra Deck: ${duelFound.player2Field.extraDeck?.length || 0}, Oponente deck: ${duelFound.player1Field.deck?.length || 0}`);
        } else {
          console.warn(`⚠️ [DuelArena] userId (${userId}) não corresponde a player1Id (${player1Id}) nem player2Id (${player2Id})`);
        }
      } else {
        console.warn(`⚠️ [DuelArena] duelFound não tem player1Field ou player2Field completo`);
      }
    }
  }, [duelFound, duelData, user?.id]);

  // Escutar mudanças de turno via WebSocket
  useEffect(() => {
    if (currentTurn !== null && user) {
      // Tentar usar duelData primeiro, depois duelUpdate
      let player1Id: number | null = null;
      if (duelData?.player1?.id) {
        player1Id = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
      }
      
      if (player1Id) {
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
        const isPlayer1 = userId === player1Id;
        const myTurnNumber = isPlayer1 ? 1 : 2;
        setIsMyTurn(currentTurn === myTurnNumber);
      }
    }
  }, [currentTurn, duelData, user?.id]);

  // Escutar atualizações do duelo (quando comprar carta, etc)
  // Usar useRef para evitar loops de renderização
  const lastDuelUpdateTimestampRef = useRef<number>(0);
  const lastDuelUpdateIdRef = useRef<string | null>(null);
  const processedUpdatesRef = useRef<Set<string>>(new Set());
  const processedLogsRef = useRef<Set<string>>(new Set());
  
  // Removido: detecção automática de ataques via logs - animação só aparece quando o jogador ataca diretamente
  
  useEffect(() => {
    if (!duelUpdate || !user?.id) {
      return;
    }
    
    // Verificar se os campos estão presentes - se não estiverem, ignorar
    // Mas permitir processar se pelo menos um campo estiver presente (pode ser update parcial)
    if (!duelUpdate.player1Field && !duelUpdate.player2Field) {
      console.warn(`⚠️ [handleDuelUpdate] Update sem campos - ignorando`);
      return; // Ignorar updates sem campos
    }
    
    // Log para debug
    console.log(`📥 [handleDuelUpdate] Recebido update - player1Field: ${!!duelUpdate.player1Field}, player2Field: ${!!duelUpdate.player2Field}`);
    
    // Criar um ID único baseado em dados relevantes do update
    const updateId = `${duelUpdate.id || 'no-id'}-${duelUpdate.currentTurn || 0}-${duelUpdate.currentPhase || 'no-phase'}-${duelUpdate.player1LifePoints || 0}-${duelUpdate.player2LifePoints || 0}`;
    
    // Se já processamos este update exato, ignorar
    if (processedUpdatesRef.current.has(updateId)) {
      return;
    }
    
    // Usar timestamp para evitar processar atualizações muito próximas
    const now = Date.now();
    if (now - lastDuelUpdateTimestampRef.current < 50) {
      return; // Ignorar atualizações muito próximas (menos de 50ms)
    }
    
    lastDuelUpdateTimestampRef.current = now;
    processedUpdatesRef.current.add(updateId);
    
    // Limpar updates antigos (manter apenas os últimos 100)
    if (processedUpdatesRef.current.size > 100) {
      const firstKey = processedUpdatesRef.current.values().next().value;
      processedUpdatesRef.current.delete(firstKey);
    }
    
    // Atualizar life points
    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      
    // Usar player1Id e player2Id do próprio duelUpdate (sempre presentes)
    const player1Id = duelUpdate.player1Id 
      ? (typeof duelUpdate.player1Id === 'string' ? parseInt(duelUpdate.player1Id, 10) : Number(duelUpdate.player1Id))
      : (duelUpdate.player1?.id ? (typeof duelUpdate.player1.id === 'string' ? parseInt(duelUpdate.player1.id, 10) : Number(duelUpdate.player1.id)) : null);
    
    const player2Id = duelUpdate.player2Id 
      ? (typeof duelUpdate.player2Id === 'string' ? parseInt(duelUpdate.player2Id, 10) : Number(duelUpdate.player2Id))
      : (duelUpdate.player2?.id ? (typeof duelUpdate.player2.id === 'string' ? parseInt(duelUpdate.player2.id, 10) : Number(duelUpdate.player2.id)) : null);
    
    const isPlayer1 = player1Id ? userId === player1Id : false;
    
    console.log(`🔍 [handleDuelUpdate] userId: ${userId}, player1Id: ${player1Id}, player2Id: ${player2Id}, isPlayer1: ${isPlayer1}`);
    console.log(`🔍 [handleDuelUpdate] player1Field:`, duelUpdate.player1Field ? `${duelUpdate.player1Field.deck?.length || 0} cartas no deck, ${duelUpdate.player1Field.hand?.length || 0} na mão` : 'não existe');
    console.log(`🔍 [handleDuelUpdate] player2Field:`, duelUpdate.player2Field ? `${duelUpdate.player2Field.deck?.length || 0} cartas no deck, ${duelUpdate.player2Field.hand?.length || 0} na mão` : 'não existe');
    
    // SEMPRE processar ambos os campos se disponíveis
    if (duelUpdate.player1Field && duelUpdate.player2Field) {
      const player1Deck = duelUpdate.player1Field.deck || [];
      const player1Hand = duelUpdate.player1Field.hand || [];
      // Garantir que monsters e spellTraps sejam arrays de 5 elementos
      const player1MonstersRaw = duelUpdate.player1Field.monsters || [];
      const player1Monsters = Array.isArray(player1MonstersRaw) 
        ? [...player1MonstersRaw, ...Array(5 - player1MonstersRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      const player1SpellTrapsRaw = duelUpdate.player1Field.spellTrap || duelUpdate.player1Field.spellTraps || [];
      const player1SpellTraps = Array.isArray(player1SpellTrapsRaw)
        ? [...player1SpellTrapsRaw, ...Array(5 - player1SpellTrapsRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      
      const player2Deck = duelUpdate.player2Field.deck || [];
      const player2Hand = duelUpdate.player2Field.hand || [];
      // Garantir que monsters e spellTraps sejam arrays de 5 elementos
      const player2MonstersRaw = duelUpdate.player2Field.monsters || [];
      const player2Monsters = Array.isArray(player2MonstersRaw)
        ? [...player2MonstersRaw, ...Array(5 - player2MonstersRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      const player2SpellTrapsRaw = duelUpdate.player2Field.spellTrap || duelUpdate.player2Field.spellTraps || [];
      const player2SpellTraps = Array.isArray(player2SpellTrapsRaw)
        ? [...player2SpellTrapsRaw, ...Array(5 - player2SpellTrapsRaw.length).fill(null)].slice(0, 5)
        : [null, null, null, null, null];
      
      if (isPlayer1) {
        // É player1 - meu campo é player1Field, oponente é player2Field
        // Detectar dano recebido
        const newMyLP = duelUpdate.player1LifePoints;
        const newOpponentLP = duelUpdate.player2LifePoints;
        const myLPChange = previousMyLifePoints.current - newMyLP;
        const opponentLPChange = previousOpponentLifePoints.current - newOpponentLP;
        
        // Detectar apenas mudanças de life points para mostrar dano (sem animação de ataque)
        if (opponentLPChange > 0) {
          setOpponentDamage(opponentLPChange);
          setTimeout(() => setOpponentDamage(null), 2000);
        }
        
        if (myLPChange > 0) {
          setMyDamage(myLPChange);
          setTimeout(() => setMyDamage(null), 2000);
        }
        
        previousMyLifePoints.current = newMyLP;
        previousOpponentLifePoints.current = newOpponentLP;
        
        setMyLifePoints(newMyLP);
        setOpponentLifePoints(newOpponentLP);
        setMyDeck(player1Deck);
        setMyHand(player1Hand);
        
        // Detectar invocação (nova carta no campo)
        const newMonsters = player1Monsters;
        for (let i = 0; i < newMonsters.length; i++) {
          if (newMonsters[i] && !previousMonstersRef.current[i]) {
            // Nova carta invocada
            setSummonCardName(newMonsters[i].name || 'Monstro');
            setShowSummonOverlay(true);
            setTimeout(() => {
              setShowSummonOverlay(false);
            }, 1000);
            break;
          }
        }
        setMyMonsters(newMonsters);
        previousMonstersRef.current = newMonsters;
        previousOpponentMonstersRef.current = player2Monsters;
        
        setMySpellTraps(player1SpellTraps);
        setOpponentDeck(player2Deck);
        setOpponentHand(player2Hand);
        setOpponentMonsters(player2Monsters);
        setOpponentSpellTraps(player2SpellTraps);
        // Atualizar flag de invocação normal
        const newNormalSummonUsed = duelUpdate.player1Field?.normalSummonUsed === true;
        setNormalSummonUsed(newNormalSummonUsed);
        console.log(`✅ [handleDuelUpdate] Player1 - normalSummonUsed: ${newNormalSummonUsed}, Meu deck: ${player1Deck.length}, Oponente deck: ${player2Deck.length}`);
      } else {
        // É player2 - meu campo é player2Field, oponente é player1Field
        // Detectar dano recebido
        const newMyLP = duelUpdate.player2LifePoints;
        const newOpponentLP = duelUpdate.player1LifePoints;
        const myLPChange = previousMyLifePoints.current - newMyLP;
        const opponentLPChange = previousOpponentLifePoints.current - newOpponentLP;
        
        // Detectar apenas mudanças de life points para mostrar dano (sem animação de ataque)
        if (opponentLPChange > 0) {
          setOpponentDamage(opponentLPChange);
          setTimeout(() => setOpponentDamage(null), 2000);
        }
        
        if (myLPChange > 0) {
          setMyDamage(myLPChange);
          setTimeout(() => setMyDamage(null), 2000);
        }
        
        previousMyLifePoints.current = newMyLP;
        previousOpponentLifePoints.current = newOpponentLP;
        
        setMyLifePoints(newMyLP);
        setOpponentLifePoints(newOpponentLP);
        setMyDeck(player2Deck);
        setMyHand(player2Hand);
        
        // Detectar invocação (nova carta no campo)
        const newMonsters = player2Monsters;
        for (let i = 0; i < newMonsters.length; i++) {
          if (newMonsters[i] && !previousMonstersRef.current[i]) {
            // Nova carta invocada
            setSummonCardName(newMonsters[i].name || 'Monstro');
            setShowSummonOverlay(true);
            setTimeout(() => {
              setShowSummonOverlay(false);
            }, 1000);
            break;
          }
        }
        setMyMonsters(newMonsters);
        previousMonstersRef.current = newMonsters;
        previousOpponentMonstersRef.current = player1Monsters;
        
        setMySpellTraps(player2SpellTraps);
        setOpponentDeck(player1Deck);
        setOpponentHand(player1Hand);
        setOpponentMonsters(player1Monsters);
        setOpponentSpellTraps(player1SpellTraps);
        // Atualizar flag de invocação normal
        const newNormalSummonUsed = duelUpdate.player2Field?.normalSummonUsed === true;
        setNormalSummonUsed(newNormalSummonUsed);
        console.log(`✅ [handleDuelUpdate] Player2 - normalSummonUsed: ${newNormalSummonUsed}, Meu deck: ${player2Deck.length}, Oponente deck: ${player1Deck.length}`);
      }
    } else {
      console.warn(`⚠️ [handleDuelUpdate] Dados incompletos - player1Field: ${!!duelUpdate.player1Field}, player2Field: ${!!duelUpdate.player2Field}`);
    }
    
    // Atualizar fase
    if (duelUpdate.currentPhase) {
      const newPhase = duelUpdate.currentPhase;
      if (newPhase !== previousPhaseRef.current) {
        setCurrentPhase(newPhase);
        previousPhaseRef.current = newPhase;
        
        // Mostrar overlay de fase
        const phaseNames: { [key: string]: { main: string; sub: string } } = {
          DRAW: { main: 'DRAW PHASE', sub: 'Fase de Compras' },
          STANDBY: { main: 'STANDBY PHASE', sub: 'Fase de Apoio' },
          MAIN1: { main: 'MAIN PHASE 1', sub: 'Fase Principal 1' },
          BATTLE: { main: 'BATTLE PHASE', sub: 'Fase de Batalha' },
          MAIN2: { main: 'MAIN PHASE 2', sub: 'Fase Principal 2' },
          END: { main: 'END PHASE', sub: 'Fase Final' }
        };
        
        const phaseInfo = phaseNames[newPhase] || { main: newPhase, sub: '' };
        setPhaseOverlayText(phaseInfo.main);
        setPhaseOverlaySubtext(phaseInfo.sub);
        setShowPhaseOverlay(true);
        
        // Esconder após 1 segundo
        setTimeout(() => {
          setShowPhaseOverlay(false);
        }, 1000);
      }
    }
    
    // Atualizar tempo do duelo se vier na atualização
    if (duelUpdate.duelTime !== undefined) {
      setDuelTime(duelUpdate.duelTime);
      // Se temos createdAt mas não temos duelStartTime, calcular
      if (!duelStartTime && duelUpdate.createdAt) {
        const createdAt = new Date(duelUpdate.createdAt);
        setDuelStartTime(createdAt.getTime());
      }
    }
    
    // Atualizar tempo do turno se vier na atualização (sincronizar com o banco)
    if (duelUpdate.turnTime !== undefined && duelUpdate.turnTime > 0) {
      setTurnTimeLimit(duelUpdate.turnTime);
    }
    
    // Usar tempo restante calculado pelo backend se disponível
    if (duelUpdate.turnTimeRemaining !== undefined) {
      setTurnTimeLeft(duelUpdate.turnTimeRemaining);
      setTurnTimeRemainingFromServer(duelUpdate.turnTimeRemaining); // Armazenar tempo do servidor
    } else if (duelUpdate.turnTime !== undefined && duelUpdate.turnTime > 0) {
      // Se o turno mudou, resetar o timer para o novo valor
      if (duelUpdate.currentTurn && duelUpdate.currentTurn !== currentTurn) {
        setTurnTimeLeft(duelUpdate.turnTime);
        // NÃO resetar turnTimeRemainingFromServer aqui - aguardar atualização do servidor
        // O servidor sempre envia turnTimeRemaining quando disponível
      }
    }
    
    // Atualizar timestamp de quando o turno começou
    if (duelUpdate.turnStartedAt) {
      const startedAt = typeof duelUpdate.turnStartedAt === 'string' 
        ? new Date(duelUpdate.turnStartedAt) 
        : duelUpdate.turnStartedAt;
      setTurnStartedAt(startedAt);
    }
    
    // Atualizar turno
    if (duelUpdate.currentTurn && duelData?.player1) {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const player1Id = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
      const isPlayer1 = userId === player1Id;
      const myTurnNumber = isPlayer1 ? 1 : 2;
      setIsMyTurn(duelUpdate.currentTurn === myTurnNumber);
    } else if (duelUpdate.currentTurn && duelUpdate.player1) {
      // Usar player1 do duelUpdate se duelData não estiver disponível
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
      const player1Id = typeof duelUpdate.player1.id === 'string' ? parseInt(duelUpdate.player1.id, 10) : Number(duelUpdate.player1.id);
      const isPlayer1 = userId === player1Id;
      const myTurnNumber = isPlayer1 ? 1 : 2;
      setIsMyTurn(duelUpdate.currentTurn === myTurnNumber);
    }

    // Atualizar duelData para garantir que o componente renderize
    // Sempre atualizar duelData quando receber um update válido
    if (duelUpdate.id && duelUpdate.player1Field && duelUpdate.player2Field) {
      // Atualizar tempo restante se veio do backend (fonte da verdade)
      if (duelUpdate.turnTimeRemaining !== undefined) {
        console.log(`⏰ [handleDuelUpdate] Sincronizando tempo do banco: ${duelUpdate.turnTimeRemaining}s`);
        setTurnTimeLeft(duelUpdate.turnTimeRemaining);
        
        // Verificar se é o turno do jogador atual
        const isCurrentlyMyTurn = (isPlayer1 && duelUpdate.currentTurn === 1) || (!isPlayer1 && duelUpdate.currentTurn === 2);
        
        // O turnTimeRemaining sempre reflete o tempo do jogador que está jogando (currentTurn)
        // Se não é meu turno, então o turnTimeRemaining é do oponente
        // Armazenar o tempo restante do servidor (fonte da verdade para mostrar botão)
        setTurnTimeRemainingFromServer(duelUpdate.turnTimeRemaining);
        
        // Se o tempo expirou e não é meu turno, marcar para mostrar botão
        if (duelUpdate.turnTimeRemaining <= 0 && !isCurrentlyMyTurn) {
          setTimeExpired(true);
          console.log(`⏰ [handleDuelUpdate] Tempo do oponente expirou no banco: ${duelUpdate.turnTimeRemaining}s`);
        } else {
          setTimeExpired(false);
        }
      }
      
      // Atualizar turnStartedAt se veio
      if (duelUpdate.turnStartedAt) {
        const startTime = new Date(duelUpdate.turnStartedAt);
        setTurnStartedAt(startTime);
        turnStartedAtRef.current = startTime;
      }

      const newDuelData = {
        id: duelUpdate.id,
        player1Id: duelUpdate.player1Id,
        player2Id: duelUpdate.player2Id,
        player1: duelUpdate.player1,
        player2: duelUpdate.player2,
        player1LifePoints: duelUpdate.player1LifePoints,
        player2LifePoints: duelUpdate.player2LifePoints,
        currentTurn: duelUpdate.currentTurn,
        currentPhase: duelUpdate.currentPhase,
        status: duelUpdate.status,
        createdAt: duelUpdate.createdAt,
        updatedAt: duelUpdate.updatedAt,
        player1Field: duelUpdate.player1Field,
        player2Field: duelUpdate.player2Field,
      };
      setDuelData(newDuelData);
      duelDataRef.current = newDuelData;
      
      // Garantir que loading seja false quando receber dados válidos
      setLoading(false);
      setError(null);
    } else if (duelUpdate.id) {
      // Mesmo que não tenha todos os campos, se tiver id, garantir que loading seja false
      // Isso evita que o loading fique infinito quando o duelUpdate não tem todos os campos
      console.log(`⚠️ [useEffect duelUpdate] DuelUpdate recebido mas campos incompletos - id: ${duelUpdate.id}, player1Field: ${!!duelUpdate.player1Field}, player2Field: ${!!duelUpdate.player2Field}`);
      setLoading(false);
    }
  }, [duelUpdate, duelData, user?.id, duelStartTime, currentTurn]);


  // Timer do Duelo - Atualiza o tempo total do duelo
  useEffect(() => {
    if (!duelData || loading) return;

    // Se não temos duelStartTime, calcular baseado no createdAt
    if (!duelStartTime && duelData.createdAt) {
      const createdAt = new Date(duelData.createdAt);
      setDuelStartTime(createdAt.getTime());
    }

    // Atualizar tempo a cada segundo
    const duelTimer = setInterval(() => {
      if (duelStartTime) {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - duelStartTime) / 1000);
        setDuelTime(elapsedSeconds);
        
        // Enviar atualização para o backend a cada 5 segundos
        if (elapsedSeconds % 5 === 0 && duelId) {
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('updateDuelTime', { duelId, timeInSeconds: elapsedSeconds });
          }
        }
      } else if (duelData.createdAt) {
        // Se ainda não temos duelStartTime, calcular agora
        const createdAt = new Date(duelData.createdAt);
        setDuelStartTime(createdAt.getTime());
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - createdAt.getTime()) / 1000);
        setDuelTime(elapsedSeconds);
      }
    }, 1000);

    return () => {
      clearInterval(duelTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelData, duelStartTime, loading, duelId]);

  // Atualizar refs quando os valores mudam
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
    duelIdRef.current = duelId;
    userIdRef.current = user?.id;
    turnStartedAtRef.current = turnStartedAt;
    turnTimeLimitRef.current = turnTimeLimit || 90;
  }, [isMyTurn, duelId, user?.id, turnStartedAt, turnTimeLimit]);
  
  // Atualizar refs dos modais sempre que os estados mudarem
  useEffect(() => {
    showOpponentHandRevealedRef.current = showOpponentHandRevealed;
    showGracefulCharityModalRef.current = showGracefulCharityModal;
    cardEffectTypeRef.current = cardEffectType;
  }, [showOpponentHandRevealed, showGracefulCharityModal, cardEffectType]);

  // Timer do Turno - Calcula baseado no timestamp do backend
  useEffect(() => {
    // Limpar timer anterior se existir
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }

    // Resetar estado de tempo expirado quando o turno muda
    setTimeExpired(false);
    // NÃO resetar turnTimeRemainingFromServer aqui - ele deve ser atualizado pelo handleDuelUpdate
    // que sempre recebe o tempo do jogador que está jogando (currentTurn)

    // Função para calcular tempo restante baseado no timestamp
    const calculateRemainingTime = (): number => {
      const currentTurnStartedAt = turnStartedAtRef.current;
      const currentTurnTimeLimit = turnTimeLimitRef.current;
      
      // Se não há timestamp, retornar o limite
      if (!currentTurnStartedAt) {
        return currentTurnTimeLimit;
      }
      
      const now = new Date();
      const startedAt = currentTurnStartedAt instanceof Date ? currentTurnStartedAt : new Date(currentTurnStartedAt);
      const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, currentTurnTimeLimit - elapsedSeconds);
      
      return remaining;
    };

    // Atualizar tempo inicial baseado no cálculo
    const initialTime = calculateRemainingTime();
    setTurnTimeLeft(initialTime);

    // Criar timer que recalcula baseado no timestamp
    // O timer deve rodar sempre, independente de ser o turno do jogador ou não
    const timer = setInterval(() => {
      const remaining = calculateRemainingTime();
      setTurnTimeLeft(remaining);
      
      // Verificar se o tempo expirou
      if (remaining <= 0) {
        // Se é o turno do oponente (não é meu turno), marcar como expirado para mostrar botão "Roubar Turno"
        if (!isMyTurnRef.current) {
          setTimeExpired(true);
        } else {
          // Se é meu turno, notificar o oponente que meu tempo expirou
          const socket = getSocket();
          if (socket && socket.connected) {
            socket.emit('timeExpired', { 
              duelId: duelIdRef.current, 
              userId: userIdRef.current 
            });
          }
          setTimeExpired(false); // Não mostrar botão para mim mesmo
        }
      } else {
        // Se ainda tem tempo, resetar timeExpired quando o tempo voltar significativamente
        if (timeExpired && remaining > 5) {
          setTimeExpired(false);
        }
      }
    }, 1000);
    
    setTurnTimer(timer);

    // Cleanup ao desmontar ou mudar turno
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnTimeLimit, turnStartedAt]);

  // Função para finalizar turno
  // Função para descartar uma carta individualmente (na fase END quando tem mais de 6 cartas)
  const handleDiscardCard = (card: any) => {
    // Verificações de segurança
    if (!duelId || !user?.id || currentPhase !== 'END' || myHand.length <= 6) return;
    if (isDiscarding) return; // Evitar múltiplos cliques
    
    const cardId = card.id || card.cardId || card.idCarta;
    if (!cardId) return;

    const cardIdStr = cardId.toString();
    
    // Marcar como descartando para evitar múltiplos cliques
    setIsDiscarding(true);
    
    // Descartar carta imediatamente para o cemitério
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('discardCard', { 
        duelId, 
        userId: user.id,
        cardId: cardIdStr
      });
    }
    
    // Resetar após um pequeno delay para permitir nova ação
    setTimeout(() => {
      setIsDiscarding(false);
    }, 500);
  };

  // Função para finalizar turno (só funciona na fase END)
  const handleEndTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    // Só permitir finalizar turno na fase END
    if (currentPhase !== 'END') {
      return;
    }

    // Se tem mais de 6 cartas, não pode finalizar ainda
    if (myHand.length > 6) {
      return;
    }

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('endTurn', { 
        duelId, 
        userId: user.id,
        cardIdsToDiscard: selectedCardsToDiscard
      });
    }
    
    // Limpar seleção
    setSelectedCardsToDiscard([]);
    
    if (turnTimer) {
      clearInterval(turnTimer);
      setTurnTimer(null);
    }
    setTimeExpired(false);
  };

  // Função para roubar turno quando o oponente está com tempo expirado
  const handleStealTurn = () => {
    if (!duelId || !user?.id) {
      console.error('❌ DuelId ou UserId não encontrados');
      return;
    }

    // Fechar modal de informações da carta imediatamente
    if (selectedCardInfo) {
      console.log('🔒 [handleStealTurn] Fechando modal de informações da carta');
      setSelectedCardInfo(null);
    }

    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('stealTurn', { duelId, userId: user.id });
      setTimeExpired(false);
    }
  };

  // Função helper para comparar cartas
  const isSameCard = (card1: any, card2: any): boolean => {
    if (!card1 || !card2) return false;
    
    // Comparar por id
    if (card1.id && card2.id && card1.id === card2.id) return true;
    if (card1.cardId && card2.cardId && card1.cardId === card2.cardId) return true;
    
    // Comparar id com cardId
    if (card1.id && card2.cardId && card1.id === card2.cardId) return true;
    if (card1.cardId && card2.id && card1.cardId === card2.id) return true;
    
    return false;
  };

  // Função auxiliar para acionar animação de colocação de carta no campo
  const triggerCardPlacementAnimation = (
    card: any,
    zoneIndex: number,
    isMonster: boolean
  ): Promise<void> => {
    return new Promise((resolve) => {
      // Encontrar a posição da carta na mão
      const cardIndexInHand = myHand.findIndex(c => 
        (c.id === card.id || c.cardId === card.cardId || c.idCarta === card.idCarta)
      );

      if (cardIndexInHand === -1) {
        // Carta não encontrada na mão, resolver imediatamente
        resolve();
        return;
      }

      // Remover carta da mão PRIMEIRO (antes da animação)
      const updatedHand = myHand.filter(c => 
        c.id !== card.id && c.cardId !== card.cardId && c.idCarta !== card.idCarta
      );
      setMyHand(updatedHand);

      // Usar requestAnimationFrame e setTimeout para garantir que o DOM esteja atualizado
      requestAnimationFrame(() => {
        setTimeout(() => {
          const handCardElement = document.querySelector(`[data-hand-card-index="${cardIndexInHand}"]`);
          
          // Se não encontrou o elemento (já foi removido), usar posição estimada baseada no índice
          let handRect: DOMRect;
          if (handCardElement && handCardElement instanceof HTMLElement) {
            handRect = handCardElement.getBoundingClientRect();
          } else {
            // Calcular posição estimada baseada no índice anterior
            const cardWidth = Math.max(80, Math.min(120, Math.floor(1000 / Math.max(updatedHand.length + 1, 1))));
            const cardHeight = Math.floor(cardWidth * 1.458);
            const handContainer = document.querySelector('[data-hand-container]');
            if (handContainer) {
              const containerRect = handContainer.getBoundingClientRect();
              const estimatedX = containerRect.left + (cardIndexInHand * cardWidth) + (cardWidth / 2);
              const estimatedY = containerRect.top + (cardHeight / 2);
              handRect = {
                left: estimatedX - cardWidth / 2,
                top: estimatedY - cardHeight / 2,
                width: cardWidth,
                height: cardHeight,
              } as DOMRect;
            } else {
              // Fallback: usar posição da parte inferior da tela
              handRect = {
                left: window.innerWidth / 2,
                top: window.innerHeight - 200,
                width: 100,
                height: 146,
              } as DOMRect;
            }
          }
          
          // Calcular posição no campo - procurar apenas no campo do jogador (parte inferior da tela)
          const fieldSelector = isMonster 
            ? `[data-monster-zone="${zoneIndex}"]`
            : `[data-spell-trap-zone="${zoneIndex}"]`;
          
          // Procurar todos os elementos com esse seletor e escolher o que está na parte inferior (campo do jogador)
          const allFieldElements = document.querySelectorAll(fieldSelector);
          let fieldElement: HTMLElement | null = null;
          
          if (allFieldElements.length > 0) {
            // Se houver múltiplos (campo do jogador e oponente), escolher o que está mais abaixo na tela
            let bottomMostElement: HTMLElement | null = null;
            let maxBottom = -1;
            
            allFieldElements.forEach((el) => {
              if (el instanceof HTMLElement) {
                const rect = el.getBoundingClientRect();
                const bottom = rect.bottom;
                if (bottom > maxBottom) {
                  maxBottom = bottom;
                  bottomMostElement = el;
                }
              }
            });
            
            fieldElement = bottomMostElement;
          } else {
            // Se não encontrou, tentar novamente com querySelector (pode ser que só exista um)
            const singleElement = document.querySelector(fieldSelector);
            if (singleElement instanceof HTMLElement) {
              fieldElement = singleElement;
            }
          }
          
          let fieldRect: DOMRect;
          
          if (fieldElement && fieldElement instanceof HTMLElement) {
            fieldRect = fieldElement.getBoundingClientRect();
          } else {
            // Fallback: calcular posição estimada baseada na estrutura do campo
            // O campo do jogador está na parte inferior da tela
            // Assumir que há 5 slots espaçados horizontalmente
            const fieldCenterX = window.innerWidth / 2;
            const fieldCenterY = window.innerHeight * 0.65; // Campo do jogador está mais abaixo
            
            const slotWidth = isMonster ? 120 : 100;
            const slotHeight = isMonster ? 175 : 145;
            const totalWidth = slotWidth * 5;
            const startX = fieldCenterX - (totalWidth / 2) + (slotWidth / 2);
            const slotX = startX + (zoneIndex * slotWidth);
            
            fieldRect = {
              left: slotX - slotWidth / 2,
              top: fieldCenterY - slotHeight / 2,
              width: slotWidth,
              height: slotHeight,
            } as DOMRect;
          }
          
          // Iniciar animação
          setCardPlacementAnimation({
            card,
            fromPosition: {
              x: handRect.left + handRect.width / 2,
              y: handRect.top + handRect.height / 2,
              width: handRect.width,
              height: handRect.height,
            },
            toPosition: {
              x: fieldRect.left + fieldRect.width / 2,
              y: fieldRect.top + fieldRect.height / 2,
              width: fieldRect.width || (isMonster ? 120 : 100),
              height: fieldRect.height || (isMonster ? 175 : 145),
            },
          });
          
          // Resolver após a animação completar
          setTimeout(() => {
            setCardPlacementAnimation(null);
            resolve();
          }, 500); // Duração da animação
        }, 100); // Delay aumentado para garantir que o DOM esteja atualizado
      });
    });
  };

  // Função para colocar carta no campo
  const handlePlaceCardOnField = async (card: any, position: 'attack' | 'defense' | 'set', zoneIndex: number, cardType?: string, isDragged: boolean = false) => {
    if (!duelId || !user?.id || !isMyTurn) {
      alert('Não é seu turno!');
      return;
    }

    // Verificar se há modal de escolha aberto
    if (showOpponentHandRevealed || showGracefulCharityModal) {
      alert('Você precisa completar a escolha pendente antes de fazer outras ações!');
      return;
    }

    // Validar que está nas fases principais (MAIN1 ou MAIN2)
    if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2') {
      alert('Você só pode colocar cartas no campo nas fases principais (MP1 ou MP2)!');
      return;
    }

    // Se for invocação normal (ataque ou defesa face-up) de monstro nível 4 ou menos, usar o método especial
    const isMonster = cardType === 'Monster' || card.type === 'Monster' || card.cardType === 'Monster';
    const cardLevel = card.level || 0;
    
    // Invocação normal em ataque
    if (isMonster && position === 'attack' && cardLevel <= 4 && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2')) {
      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, true);
      }
      // Usar invocação normal (já valida se pode invocar)
      performAction(duelId, user.id, 'SUMMON_MONSTER', {
        cardId: card.id || card.cardId || card.idCarta,
        cardName: card.name,
        zoneIndex,
        position: 'attack',
      });
      return;
    }
    
    // Invocação normal em defesa (face-up)
    if (isMonster && position === 'defense' && cardLevel <= 4 && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2')) {
      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, true);
      }
      // Usar invocação normal (já valida se pode invocar)
      performAction(duelId, user.id, 'SUMMON_MONSTER', {
        cardId: card.id || card.cardId || card.idCarta,
        cardName: card.name,
        zoneIndex,
        position: 'defense',
      });
      return;
    }
    
    // Para outras ações (set face-down ou monstros nível 5+), usar método antigo
    // Determinar o tipo da carta
    const type = cardType || card.type || card.cardType;
    const isSpellOrTrap = type === 'Spell' || type === 'Trap';

    if (!isMonster && !isSpellOrTrap) {
      alert('Tipo de carta inválido!');
      return;
    }

    if (zoneIndex < 0 || zoneIndex >= 5) {
      alert('Zona inválida!');
      return;
    }

    // Verificar se a carta ainda está na mão
    const cardInHand = myHand.find(c => (c.id === card.id || c.cardId === card.cardId));
    if (!cardInHand) {
      alert('Carta não encontrada na mão!');
      return;
    }

    if (isMonster) {
      // Verificar se a zona de monstro está ocupada (considerar null e undefined como vazio)
      if (myMonsters[zoneIndex] !== null && myMonsters[zoneIndex] !== undefined) {
        alert('Esta zona de monstro já está ocupada!');
        return;
      }

      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, true);
      }

      // Enviar ação para o backend
      // Se for ataque e nível <= 4, usar SUMMON_MONSTER, senão usar SET_MONSTER
      if (position === 'attack' && cardLevel <= 4) {
        performAction(duelId, user.id, 'SUMMON_MONSTER', {
          cardId: card.id || card.cardId || card.idCarta,
          cardName: card.name,
          zoneIndex,
          position: 'attack',
        });
      } else {
        // Para defesa ou set, usar SET_MONSTER
        // Quando colocar em defesa, sempre usar 'set' (face-down) para mostrar a skin da carta
        const finalPosition = position === 'defense' ? 'set' : position;
        console.log(`📤 [handlePlaceCardOnField] Enviando SET_MONSTER - card: ${card.name}, zoneIndex: ${zoneIndex}, position: ${finalPosition}`);
        performAction(duelId, user.id, 'SET_MONSTER', {
          cardId: card.id || card.cardId || card.idCarta,
          cardName: card.name,
          zoneIndex,
          position: finalPosition,
          cardType: 'Monster',
        });
      }
    } else if (isSpellOrTrap) {
      // Verificar se a zona de spell/trap está ocupada (considerar null e undefined como vazio)
      if (mySpellTraps[zoneIndex] !== null && mySpellTraps[zoneIndex] !== undefined) {
        alert('Esta zona de spell/trap já está ocupada!');
        return;
      }

      // Acionar animação apenas se não foi arrastada (foi clicada)
      if (!isDragged) {
        await triggerCardPlacementAnimation(card, zoneIndex, false);
      }

      // NÃO atualizar estado local do campo - deixar o backend fazer isso via duelUpdate
      // Isso evita que a carta apareça antes do backend confirmar

      // Enviar ação para o backend
      performAction(duelId, user.id, position === 'set' ? 'SET_SPELL_TRAP' : 'ACTIVATE_SPELL_TRAP', {
        cardId: card.id || card.cardId || card.idCarta,
        cardName: card.name,
        zoneIndex,
        position: position === 'set' ? 'set' : 'face-up',
      });
    }

    // Limpar seleção
    setSelectedCardForField(null);
  };

  if (!user) {
    return <Navigate to="/" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="text-white text-2xl">Carregando duelo...</div>
      </div>
    );
  }

  // Popup de duelo encerrado
  if (duelEndedData) {
    if (!user) return null;

    const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
    const winnerId = duelEndedData.winnerId !== null && duelEndedData.winnerId !== undefined
      ? (typeof duelEndedData.winnerId === 'string' ? parseInt(duelEndedData.winnerId, 10) : Number(duelEndedData.winnerId))
      : null;
    const player1Id = duelEndedData.player1Id !== null && duelEndedData.player1Id !== undefined
      ? (typeof duelEndedData.player1Id === 'string' ? parseInt(duelEndedData.player1Id, 10) : Number(duelEndedData.player1Id))
      : null;
    const player2Id = duelEndedData.player2Id !== null && duelEndedData.player2Id !== undefined
      ? (typeof duelEndedData.player2Id === 'string' ? parseInt(duelEndedData.player2Id, 10) : Number(duelEndedData.player2Id))
      : null;
    
    const isPlayer1 = player1Id !== null && player1Id === userId;
    const isWinner = winnerId !== null && winnerId === userId;
    const isDraw = duelEndedData.result === 'DRAW' || (winnerId === null && duelEndedData.result !== 'PLAYER1_WIN' && duelEndedData.result !== 'PLAYER2_WIN');
    
    const myPlayer = isPlayer1 ? duelEndedData.player1 : duelEndedData.player2;
    const opponentPlayer = isPlayer1 ? duelEndedData.player2 : duelEndedData.player1;
    
    const myLifePoints = isPlayer1 ? (duelEndedData.player1LifePoints || 0) : (duelEndedData.player2LifePoints || 0);
    const opponentLifePoints = isPlayer1 ? (duelEndedData.player2LifePoints || 0) : (duelEndedData.player1LifePoints || 0);
    
    const winnerLifePoints = winnerId === player1Id 
      ? (duelEndedData.player1LifePoints || 0)
      : (duelEndedData.player2LifePoints || 0);
    const isPerfect = isWinner && winnerLifePoints >= 8000;
    
    const totalTurns = duelEndedData.turnCounter || 0;
    const duelDuration = duelEndedData.duelTime || 0;
    const minutes = Math.floor(duelDuration / 60);
    const seconds = duelDuration % 60;
    
    const getWinReason = () => {
      if (isDraw) return 'Empate';
      if (opponentLifePoints <= 0) return 'LP chegaram a 0';
      return 'Desistência';
    };

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-3xl border-4 shadow-2xl px-8 py-10 max-w-lg w-full mx-4 pointer-events-auto ${
            isWinner 
              ? 'bg-gradient-to-br from-yellow-900/95 via-yellow-800/95 to-yellow-900/95 border-yellow-400 backdrop-blur-md' 
              : isDraw
              ? 'bg-gradient-to-br from-gray-900/95 via-gray-800/95 to-gray-900/95 border-gray-400 backdrop-blur-md'
              : 'bg-gradient-to-br from-red-900/95 via-red-800/95 to-red-900/95 border-red-400 backdrop-blur-md'
          }`}
        >
          <div className="text-center">
            {/* Título */}
            <h2 className={`text-4xl font-bold mb-6 ${
              isWinner ? 'text-yellow-300' : isDraw ? 'text-gray-300' : 'text-red-300'
            }`}>
              {isWinner ? '🏆 WINNER' : isDraw ? '🤝 EMPATE' : '❌ DERROTA'}
            </h2>

            {/* Foto do Perfil e Nick do Jogador */}
            <div className="mb-6">
              <div className="relative inline-block">
                <div className={`absolute inset-0 rounded-full blur-xl opacity-50 ${
                  isWinner ? 'bg-yellow-500' : 'bg-red-500'
                }`}></div>
                <img
                  src={myPlayer?.profileImage ? `http://localhost:3000${myPlayer.profileImage}?t=${Date.now()}` : '/images/default.png'}
                  alt={myPlayer?.nickname || myPlayer?.username}
                  className="relative w-32 h-32 rounded-full border-4 border-white shadow-lg object-cover mx-auto"
                  onError={(e) => {
                    e.currentTarget.src = '/images/default.png';
                  }}
                />
              </div>
              <h3 className="text-2xl font-bold text-white mt-4 mb-1">
                {myPlayer?.clanTag ? `|${myPlayer.clanTag}| ` : ''}{myPlayer?.nickname || myPlayer?.username || 'Jogador'}
              </h3>
              <p className={`text-xl font-bold ${
                isWinner ? 'text-yellow-400' : isDraw ? 'text-gray-400' : 'text-red-400'
              }`}>
                {isWinner ? 'VITÓRIA' : isDraw ? 'EMPATE' : 'DERROTA'}
              </p>
              {isPerfect && (
                <p className="text-2xl font-bold text-yellow-300 mt-2 animate-pulse">
                  ✨ PERFECT ✨
                </p>
              )}
            </div>

            {/* Nick do Adversário */}
            <div className="mb-6">
              <p className="text-lg text-gray-300 mb-2">vs</p>
              <p className="text-xl font-bold text-white">
                {opponentPlayer?.clanTag ? `|${opponentPlayer.clanTag}| ` : ''}{opponentPlayer?.nickname || opponentPlayer?.username || 'Oponente'}
              </p>
            </div>

            {/* Informações do Duelo */}
            <div className="bg-black/30 rounded-xl p-6 mb-6 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">TURNOS:</span>
                <span className="text-white font-bold text-lg">{totalTurns}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">DURAÇÃO:</span>
                <span className="text-white font-bold text-lg">
                  {minutes > 0 ? `${minutes}m ` : ''}{seconds}s
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">MOTIVO:</span>
                <span className="text-white font-bold text-lg">{getWinReason()}</span>
              </div>
              {isWinner && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-600">
                  <span className="text-gray-300">RECOMPENSA:</span>
                  <span className="text-yellow-400 font-bold text-lg">+300 Gold | +1.7 Score</span>
                </div>
              )}
            </div>

            {/* Data de Finalização */}
            <p className="text-xs text-gray-400 mb-6">
              Duelo finalizado em {new Date().toLocaleString('pt-BR')}
            </p>

            {/* Botões */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.location.href = '/random-duel'}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-lg font-bold text-white transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                🎮 Jogar Novamente
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold text-white transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Sair
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Só mostrar erro se realmente não temos duelData E não está carregando
  // Se temos duelData, mesmo com erro, continuar mostrando o duelo (erro pode ser temporário)
  if ((error && !duelData && !loading) || (!duelData && !loading && error)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent p-4">
        <div className="max-w-md w-full bg-slate-800/50 rounded-xl border border-red-500/30 p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-3xl font-bold text-red-400 mb-4">Erro ao Carregar Duelo</h2>
          <p className="text-slate-300 mb-6">
            {error || 'Não foi possível carregar os dados do duelo.'}
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Duelo ID: <span className="font-mono text-purple-400">{duelId}</span>
          </p>
          <button
            onClick={() => window.location.href = '/random-duel'}
            className="gradient blue-purple px-8 py-3 rounded-lg font-bold"
          >
            Voltar para Random Duel
          </button>
        </div>
      </div>
    );
  }

  // Determinar quem é o oponente
  if (!duelData || !duelData.player1 || !user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Carregando duelo...</p>
          {loading && <p className="text-gray-400">Aguarde...</p>}
        </div>
      </div>
    );
  }
  
  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
  const player1Id = typeof duelData.player1.id === 'string' ? parseInt(duelData.player1.id, 10) : Number(duelData.player1.id);
  const isPlayer1 = userId === player1Id;
  const opponent = isPlayer1 ? duelData.player2 : duelData.player1;
  const myClanTag = user?.clanTag || '';
  const opponentClanTag = (opponent as any).clanTag || '';

  // Cosméticos do duelo (playmat e skin) vindos do backend, por jogador
  const myUserInDuel = isPlayer1 ? (duelData as any).player1 : (duelData as any).player2;
  const opponentInDuel = isPlayer1 ? (duelData as any).player2 : (duelData as any).player1;

  const myPlaymatImageUrl =
    myUserInDuel?.equippedPlaymatImage
      ? (myUserInDuel.equippedPlaymatImage.startsWith('http')
          ? myUserInDuel.equippedPlaymatImage
          : `${API_URL}${myUserInDuel.equippedPlaymatImage}`)
      : undefined;

  const opponentPlaymatImageUrl =
    opponentInDuel?.equippedPlaymatImage
      ? (opponentInDuel.equippedPlaymatImage.startsWith('http')
          ? opponentInDuel.equippedPlaymatImage
          : `${API_URL}${opponentInDuel.equippedPlaymatImage}`)
      : undefined;

  const mySkinImageUrl =
    myUserInDuel?.equippedSkinImage
      ? (myUserInDuel.equippedSkinImage.startsWith('http')
          ? myUserInDuel.equippedSkinImage
          : `${API_URL}${myUserInDuel.equippedSkinImage}`)
      : '/images/fundoCarta.webp';

  const opponentSkinImageUrl =
    opponentInDuel?.equippedSkinImage
      ? (opponentInDuel.equippedSkinImage.startsWith('http')
          ? opponentInDuel.equippedSkinImage
          : `${API_URL}${opponentInDuel.equippedSkinImage}`)
      : '/images/fundoCarta.webp';

  return (
    <div className="min-h-screen w-full relative pb-1">

      {/* Background Image */}
      <div 
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: 'url(/images/background.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: -10,
        }}
      />
      
      <div className="w-full flex flex-col relative z-10">
        {/* Header: Informações dos Duelistas - Modernizado */}
        <motion.div 
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col mb-1 py-1.5 bg-black/20 border-b-2 border-white/10 shadow-2xl"
        >
          <div className="flex gap-0">
            {/* Espaço para o sidebar esquerdo (mesma largura do chat) */}
            <div className="w-[320px] flex-shrink-0"></div>
            
            {/* Container centralizado alinhado com os campos de batalha */}
            <div className="flex-1">
              {/* Animação de Ataque */}
      <AnimatePresence>
        {attackAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-[10000] pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="flex items-center gap-8 bg-black/80 backdrop-blur-md rounded-2xl p-8 border-2 border-yellow-400/50 shadow-2xl"
            >
              {/* Carta Atacante */}
              <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="relative"
                style={{ width: '150px', height: '219px' }}
              >
                <CardImage
                  card={attackAnimation.attackerCard}
                  className="w-full h-full rounded-lg border-2 border-yellow-400 shadow-lg"
                  fallback="/images/fundoCarta.webp"
                />
                <div className="absolute -bottom-6 left-0 right-0 text-center">
                  <div className="text-xs text-yellow-300 font-semibold bg-black/70 px-2 py-1 rounded">
                    ATACANTE
                  </div>
                </div>
              </motion.div>

              {/* X */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
                className="text-6xl font-bold text-red-500 drop-shadow-2xl"
                style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.8)' }}
              >
                ✕
              </motion.div>

              {/* Carta Alvo ou Perfil do Duelista Alvo (Ataque Direto) */}
              {attackAnimation.isDirectAttack ? (
                <motion.div
                  initial={{ x: 100, opacity: 0, scale: 0.8 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="relative flex flex-col items-center justify-center"
                >
                  {attackAnimation.targetProfileImage ? (
                    <div className="relative">
                      <div className="rounded-full border-4 border-red-400 shadow-2xl overflow-hidden bg-gradient-to-br from-red-900/50 to-red-800/30 p-2">
                        <img
                          src={attackAnimation.targetProfileImage}
                          alt="Duelista Alvo"
                          className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/images/default.png';
                          }}
                        />
                      </div>
                      <div className="absolute -bottom-4 left-0 right-0 text-center">
                        <div className="text-xs md:text-sm text-red-300 font-semibold bg-black/70 px-3 py-1 rounded">
                          ALVO
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 bg-gradient-to-br from-red-900/50 to-red-800/30 rounded-full border-4 border-red-400 flex items-center justify-center shadow-2xl">
                      <div className="text-center">
                        <div className="text-3xl md:text-4xl mb-2">⚔️</div>
                        <div className="text-xs md:text-sm text-red-300 font-bold">ATAQUE DIRETO</div>
                      </div>
                    </div>
                  )}
                  {/* Dano */}
                  <motion.div
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1.2, y: 0 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                    className="absolute -bottom-12 md:-bottom-16 left-0 right-0 text-center"
                  >
                    <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-red-400 drop-shadow-lg bg-black/80 px-4 py-2 rounded-lg border-2 border-red-500">
                      -{attackAnimation.damage.toLocaleString()}
                    </div>
                  </motion.div>
                </motion.div>
              ) : attackAnimation.targetCard ? (
                <motion.div
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="relative"
                  style={{ width: '150px', height: '219px' }}
                >
                  <CardImage
                    card={attackAnimation.targetCard}
                    className="w-full h-full rounded-lg border-2 border-red-400 shadow-lg"
                    fallback="/images/fundoCarta.webp"
                  />
                  <div className="absolute -bottom-6 left-0 right-0 text-center">
                    <div className="text-xs text-red-300 font-semibold bg-black/70 px-2 py-1 rounded">
                      ALVO
                    </div>
                  </div>
                  {/* Dano */}
                  <motion.div
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1.2, y: 0 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                    className="absolute -bottom-8 left-0 right-0 text-center"
                  >
                    <div className="text-3xl font-bold text-red-400 drop-shadow-lg bg-black/80 px-4 py-2 rounded-lg border-2 border-red-500">
                      -{attackAnimation.damage.toLocaleString()}
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ x: 100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="relative flex flex-col items-center justify-center"
                  style={{ width: '150px', height: '219px' }}
                >
                  <div className="w-full h-full bg-gradient-to-br from-red-900/50 to-red-800/30 rounded-lg border-2 border-red-400 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl mb-2">⚔️</div>
                      <div className="text-sm text-red-300 font-bold">ATAQUE</div>
                    </div>
                  </div>
                  {/* Dano */}
                  <motion.div
                    initial={{ scale: 0, y: 20 }}
                    animate={{ scale: 1.2, y: 0 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                    className="absolute -bottom-8 left-0 right-0 text-center"
                  >
                    <div className="text-3xl font-bold text-red-400 drop-shadow-lg bg-black/80 px-4 py-2 rounded-lg border-2 border-red-500">
                      -{attackAnimation.damage.toLocaleString()}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
            </div>
          </div>
        </motion.div>

      <div className="flex gap-0 flex-1 overflow-hidden">
          {/* Painel Esquerdo: Chat e Logs - Modernizado */}
          <motion.div 
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-[320px] flex-shrink-0 space-y-3 bg-transparent h-full overflow-y-auto pr-2"
          >
            <DuelChat
              messages={chatMessages}
              onSendMessage={(message) => {
                if (duelId && user?.id) {
                  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                  if (!isNaN(userId)) {
                    sendChatMessage(duelId, userId, message);
                  } else {
                    console.error('❌ ID de usuário inválido:', user.id);
                  }
                }
              }}
            />
            <DuelLogs logs={duelLogs} />
            
            {/* Master Card Search - Apenas para MASTER */}
            {user?.role === 'MASTER' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-purple-800/90 to-indigo-900/90 backdrop-blur-md rounded-xl border border-purple-700/50 shadow-2xl overflow-hidden"
              >
                <div className="bg-gradient-to-r from-purple-700/50 to-indigo-800/50 px-4 py-3 border-b border-purple-700/50">
                  <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                    <span className="text-lg">👑</span>
                    Master: Buscar Carta do Deck
                  </h3>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="masterCardSearch"
                      placeholder="Digite o nome da carta..."
                      className="flex-1 bg-gray-900/50 text-white px-4 py-2 rounded-lg border border-purple-600/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const input = e.currentTarget as HTMLInputElement;
                          const cardName = input.value.trim();
                          if (cardName && duelId && user?.id) {
                            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                            if (!isNaN(userId)) {
                              performAction(duelId, userId, 'MASTER_ADD_CARD_TO_HAND', {
                                cardName: cardName,
                              });
                              input.value = '';
                            }
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('masterCardSearch') as HTMLInputElement;
                        const cardName = input?.value.trim();
                        if (cardName && duelId && user?.id) {
                          const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : Number(user.id);
                          if (!isNaN(userId)) {
                            performAction(duelId, userId, 'MASTER_ADD_CARD_TO_HAND', {
                              cardName: cardName,
                            });
                            input.value = '';
                          }
                        }
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors font-semibold text-sm"
                    >
                      Adicionar
                    </button>
                  </div>
                  <p className="text-xs text-purple-300/70 mt-2">
                    Digite o nome da carta e pressione Enter ou clique em Adicionar
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Arena Principal - Modernizado */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex-1 space-y-1 overflow-y-auto pb-1"
          >
            <div className="max-w-5xl mx-auto w-full">
            {/* Linha 1: Perfis dos Duelistas e Timer - Alinhados na mesma linha do topo do playmat */}
            <div className="relative flex flex-col sm:flex-row items-start justify-between w-full px-2 sm:px-4 mb-2 gap-2 sm:gap-0">
            {/* MEU DUELISTA (Esquerda) - Modernizado */}
            <motion.div 
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1 sm:gap-2 bg-black/20 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border-2 border-blue-400/30 shadow-lg transition-all flex-shrink-0 z-10 w-full sm:w-auto"
          >
            {/* Level - Modernizado */}
            <motion.div 
              whileHover={{ rotate: 5 }}
              className="flex flex-col items-center bg-transparent px-1.5 sm:px-3 py-1 sm:py-2 rounded-lg border-2 border-white/20 shadow-md"
            >
              <div className="text-white/70 text-[8px] sm:text-[10px] font-bold tracking-wider">LV</div>
              <div className="text-white text-base sm:text-xl font-bold drop-shadow-lg">{user.level || 1}</div>
            </motion.div>
            
            {/* Avatar Quadrado - Modernizado */}
            <motion.img 
              whileHover={{ rotate: 5 }}
              transition={{ duration: 0.2 }}
              src={
                user.profileImage 
                  ? `http://localhost:3000${user.profileImage}` 
                  : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username) + '&background=3b82f6&color=fff&size=128'
              } 
              alt={user.username}
              className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl border-2 border-blue-400/70 object-cover shadow-lg shadow-blue-500/30 ring-2 ring-blue-500/20"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.username) + '&background=3b82f6&color=fff&size=128';
              }}
            />
            
            {/* Info: Clan + Nick + LP - Modernizado */}
            <div className="min-w-0 flex-1">
              <div className="text-[10px] sm:text-xs font-bold text-blue-300 drop-shadow-md truncate">
                {myClanTag ? `|${myClanTag}| ${user.nickname || user.username}` : (user.nickname || user.username)}
              </div>
              <div className="relative">
                <motion.div 
                  key={myLifePoints}
                  initial={{ scale: 1.2, color: "#ef4444" }}
                  animate={{ scale: 1, color: "#93c5fd" }}
                  transition={{ duration: 0.3 }}
                  className="text-blue-200 font-bold text-sm sm:text-base tracking-wide"
                >
                  LP: {myLifePoints.toLocaleString()}
                </motion.div>
                {/* Animação de dano */}
                <AnimatePresence>
                  {myDamage !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: 0, scale: 0.5 }}
                      animate={{ opacity: 1, y: -30, scale: 1.2 }}
                      exit={{ opacity: 0, y: -60, scale: 0.8 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="absolute -top-8 left-0 right-0 text-center pointer-events-none z-50"
                    >
                      <div className="text-red-400 font-bold text-lg sm:text-xl drop-shadow-lg">
                        -{myDamage.toLocaleString()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="text-[8px] sm:text-[10px] text-blue-300/80 font-medium">
                S: {user.winsSeason || 0}/{user.lossesSeason || 0} | G: {user.winsGeral || 0}/{user.lossesGeral || 0}
              </div>
            </div>
          </motion.div>

          {/* TIMER (Centro) - Modernizado */}
          <div className="absolute left-1/2 top-0 transform -translate-x-1/2 flex items-center justify-center z-20 w-full sm:w-auto">
            <motion.div 
              className={`px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl border-2 shadow-xl transition-all text-xs sm:text-sm ${
                isMyTurn 
                  ? turnTimeLeft <= 10 
                    ? 'bg-gradient-to-br from-red-900/60 to-red-800/50 border-red-400 shadow-red-500/50' 
                    : 'bg-gradient-to-br from-blue-900/60 to-indigo-800/50 border-blue-400 shadow-blue-500/50'
                  : 'bg-gradient-to-br from-slate-800/60 to-slate-700/50 border-slate-500 shadow-slate-600/30'
              }`}
              animate={isMyTurn && turnTimeLeft <= 10 ? { 
                scale: [1, 1.08, 1],
                boxShadow: [
                  "0 0 20px rgba(239, 68, 68, 0.5)",
                  "0 0 40px rgba(239, 68, 68, 0.8)",
                  "0 0 20px rgba(239, 68, 68, 0.5)"
                ]
              } : {}}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              <div className={`text-[10px] mb-0.5 text-center font-bold tracking-widest uppercase ${
                isMyTurn ? 'text-blue-200' : 'text-slate-400'
              }`}>
                {isMyTurn ? 'Seu Turno' : 'Turno Oponente'}
              </div>
              <motion.div 
                key={turnTimeLeft}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                className={`text-2xl font-bold font-mono text-center drop-shadow-lg ${
                  isMyTurn 
                    ? turnTimeLeft <= 10 
                      ? 'text-red-300' 
                      : 'text-blue-200'
                    : 'text-slate-300'
                }`}
              >
                {turnTimeLeft}s
              </motion.div>
            </motion.div>
          </div>

          {/* OPONENTE (Direita) - Modernizado - Alinhado com cartas embaixo */}
          <div className="flex flex-col items-end flex-shrink-0 z-10">
            <motion.div 
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 bg-black/20 px-4 py-2 rounded-xl border-2 border-red-400/30 shadow-lg transition-all"
            >
            {/* Info: Clan + Nick + LP - Modernizado */}
            <div className="text-right">
              <div className="text-xs font-bold text-red-300 drop-shadow-md">
                {opponentClanTag ? `|${opponentClanTag}| ` : ''}
                {opponent.nickname || opponent.username}
              </div>
              <div className="relative">
                <motion.div 
                  key={opponentLifePoints}
                  initial={{ scale: 1.2, color: "#ef4444" }}
                  animate={{ scale: 1, color: "#fca5a5" }}
                  transition={{ duration: 0.3 }}
                  className="text-red-200 font-bold text-base tracking-wide"
                >
                  LP: {opponentLifePoints.toLocaleString()}
                </motion.div>
                {/* Animação de dano */}
                <AnimatePresence>
                  {opponentDamage !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: 0, scale: 0.5 }}
                      animate={{ opacity: 1, y: -30, scale: 1.2 }}
                      exit={{ opacity: 0, y: -60, scale: 0.8 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="absolute -top-8 left-0 right-0 text-center pointer-events-none z-50"
                    >
                      <div className="text-red-400 font-bold text-xl drop-shadow-lg">
                        -{opponentDamage.toLocaleString()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {(opponent.winsSeason !== undefined || opponent.winsGeral !== undefined) && (
                <div className="text-[10px] text-red-300/80 font-medium">
                  S: {opponent.winsSeason || 0}/{opponent.lossesSeason || 0} | G: {opponent.winsGeral || 0}/{opponent.lossesGeral || 0}
                </div>
              )}
            </div>
            
            {/* Avatar Quadrado - Modernizado */}
            <motion.img 
              whileHover={{ rotate: -5 }}
              transition={{ duration: 0.2 }}
              src={
                opponent.profileImage 
                  ? `http://localhost:3000${opponent.profileImage}` 
                  : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(opponent.username) + '&background=ef4444&color=fff&size=128'
              } 
              alt={opponent.username}
              className="w-12 h-12 rounded-lg border-2 border-red-400/70 object-cover shadow-lg shadow-red-500/30 ring-2 ring-red-500/20"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(opponent.username) + '&background=ef4444&color=fff&size=128';
              }}
            />
            
            {/* Level - Modernizado */}
            <motion.div 
              whileHover={{ rotate: -5 }}
              className="flex flex-col items-center bg-transparent px-2 py-1.5 rounded-lg border-2 border-white/20 shadow-md"
            >
              <div className="text-white/70 text-[9px] font-bold tracking-wider">LV</div>
              <div className="text-white text-lg font-bold drop-shadow-lg">{(opponent as any).level || 1}</div>
            </motion.div>
          </motion.div>

          {/* Mão do Oponente (embaixo do perfil) */}
          {((showOpponentHandRevealed && cardEffectType === 'forcefulSentry' ? opponentHandRevealed : opponentHand).length > 0) && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex justify-center gap-2 py-3 overflow-x-auto overflow-y-visible px-3 mt-8"
            >
              {(showOpponentHandRevealed && cardEffectType === 'forcefulSentry' ? opponentHandRevealed : opponentHand).map((card: any, index: number) => {
                const uniqueKey = `opp-hand-${index}-${card.idCarta || card.id || card.cardId || index}`;
                const isRevealed = showOpponentHandRevealed && (cardEffectType === 'forcefulSentry' || cardEffectType === 'confiscation');
                
                return (
                  <motion.div
                    key={uniqueKey}
                    initial={{ y: -100, opacity: 0, rotate: 5 }}
                    animate={{ y: 0, opacity: 1, rotate: isRevealed ? 0 : 180 }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
                    className="w-[60px] h-[85px] transition-all overflow-visible flex-shrink-0 relative cursor-default"
                  >
                    {isRevealed ? (
                      // Mostrar carta virada para cima
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg border-2 border-yellow-400/80 shadow-lg shadow-yellow-500/50"
                      />
                    ) : (
                      // Mostrar verso da carta
                      <div
                        className="w-full h-full rounded-lg border-2 border-red-400/60 shadow-md shadow-red-500/20 transition-all"
                        style={{
                          backgroundImage: `url(${opponentSkinImageUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                        }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
          </div>
          </div>
            {/* Campo do Oponente */}
            <div className="mt-0">
            <DuelField 
              isOpponent={true} 
              deckCount={opponentDeck.length} 
              handCount={opponentHand.length}
              monsters={opponentMonsters}
              spellTraps={opponentSpellTraps}
              graveyard={opponentGraveyard}
              extraDeck={opponentExtraDeck}
              playmatImage={opponentPlaymatImageUrl}
              cardBackImage={opponentSkinImageUrl}
              onGraveyardClick={() => setShowOpponentGraveyardModal(true)}
              onExtraDeckClick={() => setShowOpponentExtraDeckModal(true)}
              onMonsterClick={(targetZoneIndex) => {
                if (attackingMonsterIndex !== null) {
                  // Processar ataque
                  const targetIndex = targetZoneIndex === -1 ? null : targetZoneIndex;
                  
                  // Acionar animação imediatamente
                  triggerAttackAnimation(attackingMonsterIndex, targetIndex);
                  
                  performAction(duelId, user.id, 'ATTACK', {
                    attackerZoneIndex: attackingMonsterIndex,
                    targetZoneIndex: targetIndex,
                  });
                  setAttackingMonsterIndex(null);
                }
              }}
              onMonsterDrop={(attackerZoneIndex, targetZoneIndex) => {
                // Processar ataque via drag and drop
                // Se está em STANDBY ou MAIN1, mudar automaticamente para BATTLE antes de atacar
                if ((currentPhase === 'STANDBY' || currentPhase === 'MAIN1' || currentPhase === 'BATTLE') && isMyTurn) {
                  // Acionar animação imediatamente
                  triggerAttackAnimation(attackerZoneIndex, targetZoneIndex);
                  
                  performAction(duelId, user.id, 'ATTACK', {
                    attackerZoneIndex,
                    targetZoneIndex,
                  });
                }
              }}
              isSelectingTarget={attackingMonsterIndex !== null && currentPhase === 'BATTLE' && isMyTurn}
              canAttack={currentPhase === 'BATTLE' && isMyTurn}
              isMyTurn={isMyTurn}
              currentPhase={currentPhase}
              isSelectingSpellTrapTarget={isSelectingMSTTarget && isMyTurn}
              isSelectingMonsterTarget={(isSelectingSnowmanEaterTarget || isSelectingChaosSorcererTarget) && isMyTurn}
              onCardClick={(card, zoneIndex) => {
                // Se estamos selecionando alvo para MST, processar escolha
                if (isSelectingMSTTarget && zoneIndex !== undefined) {
                  const targetPlayer = 'opponent'; // Campo do oponente
                  if (duelId && user?.id) {
                    performAction(duelId, user.id, 'MYSTICAL_SPACE_TYPHOON_CHOICE', {
                      targetPlayer,
                      targetZoneIndex: zoneIndex,
                    });
                    setIsSelectingMSTTarget(false);
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para SnowmanEater, processar escolha
                if (isSelectingSnowmanEaterTarget && zoneIndex !== undefined && card) {
                  // Verificar se o monstro está face-up (attack ou defense)
                  const isFaceUp = card.position === 'attack' || card.position === 'defense';
                  if (isFaceUp) {
                    const targetPlayer = 'opponent'; // Campo do oponente
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'SNOWMAN_EATER_CHOICE', {
                        targetPlayer,
                        targetZoneIndex: zoneIndex,
                      });
                      setIsSelectingSnowmanEaterTarget(false);
                    }
                  } else {
                    // Mostrar mensagem se tentar escolher um monstro face-down
                    alert('SnowmanEater só pode destruir monstros face-up (ataque ou defesa)');
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para Breaker, processar escolha
                if (isSelectingBreakerTarget && breakerMonsterZoneIndex !== null && zoneIndex !== undefined) {
                  const targetPlayer = 'opponent'; // Campo do oponente
                  if (duelId && user?.id) {
                    performAction(duelId, user.id, 'BREAKER_REMOVE_COUNTER', {
                      monsterZoneIndex: breakerMonsterZoneIndex,
                      targetPlayer,
                      targetZoneIndex: zoneIndex,
                    });
                    setIsSelectingBreakerTarget(false);
                    setBreakerMonsterZoneIndex(null);
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para ChaosSorcerer, processar escolha
                if (isSelectingChaosSorcererTarget && chaosSorcererMonsterZoneIndex !== null && zoneIndex !== undefined && card) {
                  // Verificar se o monstro está face-up (attack ou defense)
                  const isFaceUp = card.position === 'attack' || card.position === 'defense';
                  if (isFaceUp) {
                    const targetPlayer = 'opponent'; // Campo do oponente
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'CHAOS_SORCERER_EFFECT_CHOICE', {
                        targetPlayer,
                        targetZoneIndex: zoneIndex,
                      });
                      setIsSelectingChaosSorcererTarget(false);
                      setChaosSorcererMonsterZoneIndex(null);
                    }
                  } else {
                    // Mostrar mensagem se tentar escolher um monstro face-down
                    alert('ChaosSorcerer só pode banir monstros face-up (ataque ou defesa)');
                  }
                  return;
                }
                
                console.log('🔍 [DuelArena] Card clicked:', {
                  name: card?.name,
                  description: card?.description,
                  hasDescription: !!card?.description,
                  descriptionLength: card?.description?.length || 0,
                  allKeys: Object.keys(card || {})
                });
                setSelectedCardInfo(card);
              }}
            />
            </div>

            {/* Meu Campo */}
            <DuelField 
              isOpponent={false} 
              deckCount={myDeck.length} 
              handCount={myHand.length}
              monsters={myMonsters}
              spellTraps={mySpellTraps}
              graveyard={myGraveyard}
              extraDeck={myExtraDeck}
              playmatImage={myPlaymatImageUrl}
              cardBackImage={mySkinImageUrl}
              onGraveyardClick={() => setShowGraveyardModal(true)}
              monsterDestroyedThisTurn={monsterDestroyedThisTurn}
              onExtraDeckClick={() => setShowExtraDeckModal(true)}
              onAttackClick={(zoneIndex) => {
                // Iniciar seleção de alvo
                setAttackingMonsterIndex(zoneIndex);
              }}
              canAttack={currentPhase === 'BATTLE' && isMyTurn}
              onChangePosition={(zoneIndex, newPosition) => {
                // Mudar posição do monstro
                if (duelId && user?.id) {
                  performAction(duelId, user.id, 'CHANGE_POSITION', {
                    zoneIndex,
                    newPosition,
                  });
                }
              }}
              onBreakerRemoveCounter={(monsterZoneIndex) => {
                // Ativar efeito do Breaker - iniciar seleção de alvo
                if (duelId && user?.id) {
                  setIsSelectingBreakerTarget(true);
                  setBreakerMonsterZoneIndex(monsterZoneIndex);
                }
              }}
              onActivateMonsterEffect={(monsterZoneIndex) => {
                // Verificar qual monstro está na zona para determinar qual efeito ativar
                const monster = myMonsters[monsterZoneIndex];
                if (!monster) return;
                
                const cardId = monster.idCarta || monster.id || monster.cardId;
                const cardName = (monster.name || monster.cardName || '').toLowerCase();
                
                // Verificar se é ChaosSorcerer
                const isChaosSorcerer = cardId === 'ChaosSorcerer' || 
                                       cardId === 'chaossorcerer' ||
                                       cardName === 'chaos sorcerer' ||
                                       (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer'));
                
                // Verificar se é Red-Eyes Darkness Metal Dragon
                const isRedEyesDarknessMetalDragon = cardId === 'RedEyesDarknessMetalDragon' ||
                                                     cardId === 'Red-EyesDarknessMetalDragon' ||
                                                     cardId === 'redeyesdarknessmetaldragon' ||
                                                     cardName === 'red-eyes darkness metal dragon' ||
                                                     cardName === 'red eyes darkness metal dragon' ||
                                                     (typeof cardId === 'string' && cardId.toLowerCase().includes('redeyesdarknessmetaldragon')) ||
                                                     (typeof cardName === 'string' && cardName.includes('red-eyes darkness metal dragon'));
                
                // Verificar se é Cyber-Stein
                const isCyberStein = cardId === 'CyberStein' || 
                                    cardId === 'cyberstein' ||
                                    cardId === 'Cyber-Stein' ||
                                    cardName === 'cyber-stein' ||
                                    cardName === 'cyber stein' ||
                                    (typeof cardId === 'string' && cardId.toLowerCase().includes('cyberstein'));
                
                // Verificar se é Exiled Force
                const isExiledForce = cardId === 'ExiledForce' ||
                                     cardId === 'exiledforce' ||
                                     cardId === 'Exiled-Force' ||
                                     cardName === 'exiled force' ||
                                     cardName === 'exiled-force' ||
                                     (typeof cardId === 'string' && cardId.toLowerCase().includes('exiledforce')) ||
                                     (typeof cardName === 'string' && cardName.includes('exiled force'));
                
                if (duelId && user?.id) {
                  if (isChaosSorcerer) {
                    // Ativar efeito do ChaosSorcerer
                    performAction(duelId, user.id, 'START_CHAOS_SORCERER_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isRedEyesDarknessMetalDragon) {
                    // Ativar efeito do Red-Eyes Darkness Metal Dragon
                    performAction(duelId, user.id, 'START_RED_EYES_DARKNESS_METAL_DRAGON_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isCyberStein) {
                    // Ativar efeito do Cyber-Stein
                    performAction(duelId, user.id, 'START_CYBER_STEIN_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else if (isExiledForce) {
                    // Ativar efeito do Exiled Force
                    performAction(duelId, user.id, 'START_EXILED_FORCE_EFFECT', {
                      monsterZoneIndex,
                    });
                  } else {
                    // Verificar se é Dark Armed Dragon
                    const monster = myMonsters[monsterZoneIndex];
                    if (monster) {
                      const monsterCardId = (monster.idCarta || monster.id || monster.cardId || '').toString().toLowerCase();
                      const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                      const isDarkArmedDragon = monsterCardId === 'darkarmeddragon' ||
                                                monsterCardId === 'dark-armeddragon' ||
                                                monsterCardId === 'darkarmed-dragon' ||
                                                monsterName === 'dark armed dragon' ||
                                                monsterName === 'dark-armed dragon' ||
                                                monsterName === 'darkarmeddragon' ||
                                                (typeof monsterCardId === 'string' && monsterCardId.includes('darkarmeddragon')) ||
                                                (typeof monsterName === 'string' && monsterName.includes('dark armed dragon'));
                      
                      if (isDarkArmedDragon) {
                        // Ativar efeito do Dark Armed Dragon
                        performAction(duelId, user.id, 'START_DARK_ARMED_DRAGON_EFFECT', {
                          monsterZoneIndex,
                        });
                      }
                    }
                  }
                }
              }}
              isMyTurn={isMyTurn}
              currentPhase={currentPhase}
              currentTurn={currentTurn}
              positionChangedThisTurn={positionChangedThisTurn}
              onSpellTrapSlotClick={(zoneIndex) => {
                if (selectingSpellTrapSlot) {
                  handlePlaceCardOnField(
                    selectingSpellTrapSlot.card,
                    selectingSpellTrapSlot.position,
                    zoneIndex,
                    selectingSpellTrapSlot.card.type || selectingSpellTrapSlot.card.cardType
                  );
                  setSelectingSpellTrapSlot(null);
                }
              }}
              onSpellTrapDrop={(card, zoneIndex, position) => {
                if (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') {
                  // Passar isDragged=true porque a carta foi arrastada, não clicada
                  handlePlaceCardOnField(card, position, zoneIndex, card.type || card.cardType, true);
                }
              }}
              onEquipSpellDrop={(card, monsterZoneIndex, spellTrapZoneIndex) => {
                console.log('🔍 [DuelArena] onEquipSpellDrop chamado:', {
                  cardName: card.name || card.cardName,
                  monsterZoneIndex,
                  spellTrapZoneIndex,
                  duelId: !!duelId,
                  userId: user?.id,
                  currentPhase,
                  isMyTurn
                });
                
                // Verificar condições básicas
                if (!duelId || !user?.id) {
                  console.error('❌ [DuelArena] onEquipSpellDrop - duelId ou userId não encontrado');
                  alert('Erro: Duelo ou usuário não encontrado');
                  return;
                }
                
                // Verificar se está na fase correta
                if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2') {
                  console.warn('⚠️ [DuelArena] onEquipSpellDrop - não está na fase correta:', currentPhase);
                  alert('Você só pode equipar spells durante as fases MAIN1 ou MAIN2!');
                  return;
                }
                
                // Verificar se é o turno do jogador
                if (!isMyTurn) {
                  console.warn('⚠️ [DuelArena] onEquipSpellDrop - não é o turno do jogador');
                  alert('Você só pode equipar spells no seu turno!');
                  return;
                }
                
                if (spellTrapZoneIndex !== undefined) {
                  // Spell já está no campo, equipar diretamente
                  console.log('✅ [DuelArena] Equipando spell do campo:', {
                    spellTrapZoneIndex,
                    monsterZoneIndex
                  });
                  performAction(duelId, user.id, 'EQUIP_SPELL_FROM_FIELD', {
                    spellTrapZoneIndex,
                    monsterZoneIndex,
                  });
                } else {
                  // Spell está na mão, encontrar uma zona de spell/trap vazia
                  const emptySpellTrapIndex = mySpellTraps.findIndex((st: any) => st === null || st === undefined);
                  if (emptySpellTrapIndex === -1) {
                    alert('Não há zonas de spell/trap disponíveis!');
                    return;
                  }
                  
                  const cardId = card.idCarta || card.id || card.cardId;
                  if (!cardId) {
                    console.error('❌ [DuelArena] onEquipSpellDrop - cardId não encontrado');
                    alert('Erro: ID da carta não encontrado');
                    return;
                  }
                  
                  console.log('✅ [DuelArena] Equipando spell da mão:', {
                    cardId,
                    monsterZoneIndex,
                    spellTrapZoneIndex: emptySpellTrapIndex
                  });
                  performAction(duelId, user.id, 'EQUIP_SPELL', {
                    cardId,
                    monsterZoneIndex,
                    spellTrapZoneIndex: emptySpellTrapIndex,
                  });
                }
              }}
              isSelectingSpellTrapSlot={selectingSpellTrapSlot !== null && currentPhase !== 'BATTLE' && isMyTurn}
              isSelectingSpellTrapTarget={(isSelectingMSTTarget || isSelectingBreakerTarget) && isMyTurn}
              isSelectingMonsterTarget={isSelectingSnowmanEaterTarget && isMyTurn}
              onCardClick={(card, zoneIndex) => {
                // Se estamos selecionando alvo para MST, processar escolha
                if (isSelectingMSTTarget && zoneIndex !== undefined) {
                  const targetPlayer = 'player'; // Campo do próprio jogador
                  if (duelId && user?.id) {
                    performAction(duelId, user.id, 'MYSTICAL_SPACE_TYPHOON_CHOICE', {
                      targetPlayer,
                      targetZoneIndex: zoneIndex,
                    });
                    setIsSelectingMSTTarget(false);
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para SnowmanEater, processar escolha
                if (isSelectingSnowmanEaterTarget && zoneIndex !== undefined && card) {
                  // Verificar se o monstro está face-up (attack ou defense)
                  const isFaceUp = card.position === 'attack' || card.position === 'defense';
                  if (isFaceUp) {
                    const targetPlayer = 'player'; // Campo do próprio jogador
                    if (duelId && user?.id) {
                      performAction(duelId, user.id, 'SNOWMAN_EATER_CHOICE', {
                        targetPlayer,
                        targetZoneIndex: zoneIndex,
                      });
                      setIsSelectingSnowmanEaterTarget(false);
                    }
                  } else {
                    // Mostrar mensagem se tentar escolher um monstro face-down
                    alert('SnowmanEater só pode destruir monstros face-up (ataque ou defesa)');
                  }
                  return;
                }
                
                // Se estamos selecionando alvo para Breaker, processar escolha
                if (isSelectingBreakerTarget && breakerMonsterZoneIndex !== null && zoneIndex !== undefined) {
                  const targetPlayer = 'player'; // Campo do próprio jogador
                  if (duelId && user?.id) {
                    performAction(duelId, user.id, 'BREAKER_REMOVE_COUNTER', {
                      monsterZoneIndex: breakerMonsterZoneIndex,
                      targetPlayer,
                      targetZoneIndex: zoneIndex,
                    });
                    setIsSelectingBreakerTarget(false);
                    setBreakerMonsterZoneIndex(null);
                  }
                  return;
                }
                
                console.log('🔍 [DuelArena] Card clicked:', {
                  name: card?.name,
                  description: card?.description,
                  hasDescription: !!card?.description,
                  descriptionLength: card?.description?.length || 0,
                  allKeys: Object.keys(card || {})
                });
                setSelectedCardInfo(card);
              }}
              onActivateCard={(card, zoneIndex) => {
                if (duelId && user?.id && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2')) {
                  // Verificar se há modal de escolha aberto
                  if (showOpponentHandRevealed || showGracefulCharityModal) {
                    alert('Você precisa completar a escolha pendente antes de fazer outras ações!');
                    return;
                  }
                  
                  performAction(duelId, user.id, 'ACTIVATE_SPELL_TRAP', {
                    cardId: card.idCarta || card.id || card.cardId,
                    cardName: card.name || card.cardName,
                    zoneIndex: zoneIndex,
                    position: 'face-up',
                  });
                }
              }}
            />

            {/* Aviso de seleção de alvo de ataque */}
            {attackingMonsterIndex !== null && currentPhase === 'BATTLE' && isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-red-600/95 to-orange-600/95 text-white px-6 py-3 rounded-lg shadow-2xl border-2 border-red-400/70"
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">⚔️</span>
                  <div>
                    <p className="font-bold text-lg">Selecione o alvo do ataque</p>
                    <p className="text-sm opacity-90">
                      {opponentMonsters.some((m: any) => m !== null && m !== undefined)
                        ? 'Clique em um monstro do oponente para atacar'
                        : 'Clique em um monstro do oponente ou em um slot vazio para ataque direto'}
                    </p>
                  </div>
                  <button
                    onClick={() => setAttackingMonsterIndex(null)}
                    className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}

            {/* Aviso de seleção de slot de spell/trap */}
            {selectingSpellTrapSlot !== null && currentPhase !== 'BATTLE' && isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-green-600/95 to-purple-600/95 text-white px-6 py-3 rounded-lg shadow-2xl border-2 border-green-400/70"
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{selectingSpellTrapSlot.position === 'set' ? '📜' : '✨'}</span>
                  <div>
                    <p className="font-bold text-lg">Selecione um slot de Spell/Trap</p>
                    <p className="text-sm opacity-90">Clique em um slot vazio de Spell/Trap para colocar {selectingSpellTrapSlot.card.name}</p>
                  </div>
                  <button
                    onClick={() => setSelectingSpellTrapSlot(null)}
                    className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}

            {/* Aviso de seleção de alvo para efeito do ChaosSorcerer */}
            {isSelectingChaosSorcererTarget && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gradient-to-r from-indigo-600/95 to-purple-600/95 text-white px-6 py-3 rounded-lg shadow-2xl border-2 border-indigo-400/70"
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">🌟</span>
                  <div>
                    <p className="font-bold text-lg">Efeito do ChaosSorcerer</p>
                    <p className="text-sm opacity-90">Selecione 1 monstro face-up do oponente para banir (você não poderá atacar neste turno)</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsSelectingChaosSorcererTarget(false);
                      setChaosSorcererMonsterZoneIndex(null);
                      // Cancelar a escolha pendente no backend
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_EFFECT', {});
                      }
                    }}
                    className="ml-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}

            {/* Overlay de Fase - Aparece rapidamente quando muda */}
            <AnimatePresence>
              {showPhaseOverlay && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.3, y: -100 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.3, y: 100 }}
                  transition={{ 
                    duration: 0.25,
                    ease: [0.34, 1.56, 0.64, 1]
                  }}
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-slate-700/90 via-slate-600/90 to-slate-700/90 rounded-2xl border-2 border-slate-400/50 shadow-xl px-16 py-12 backdrop-blur-md"
                  >
                    <motion.h2 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                      className="text-6xl font-bold text-white text-center tracking-wider"
                    >
                      {phaseOverlayText}
                    </motion.h2>
                    {phaseOverlaySubtext && (
                      <motion.p 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, delay: 0.1 }}
                        className="text-2xl text-slate-200 text-center mt-4 font-semibold"
                      >
                        {phaseOverlaySubtext}
                      </motion.p>
                    )}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Overlay de Invocação - Aparece rapidamente quando invoca */}
            <AnimatePresence>
              {showSummonOverlay && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.3, y: 100 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.3, y: -100 }}
                  transition={{ 
                    duration: 0.25,
                    ease: [0.34, 1.56, 0.64, 1]
                  }}
                  className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gradient-to-br from-amber-600/90 via-orange-600/90 to-amber-600/90 rounded-2xl border-2 border-amber-400/50 shadow-xl px-16 py-12 backdrop-blur-md"
                  >
                    <motion.h2 
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                      className="text-6xl font-bold text-white text-center tracking-wider"
                    >
                      SUMMON!
                    </motion.h2>
                    <motion.p 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.1 }}
                      className="text-2xl text-amber-100 text-center mt-4 font-semibold"
                    >
                      {summonCardName}
                    </motion.p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botão Roubar Turno - Aparece quando não é meu turno e tempo do oponente expirou */}
            {!isMyTurn && turnTimeRemainingFromServer !== null && turnTimeRemainingFromServer <= 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center items-center py-3 px-5"
              >
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStealTurn}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all border-2 min-w-[120px] bg-gradient-to-r from-red-600 to-orange-600 text-white border-red-300 shadow-xl shadow-red-500/60 hover:from-red-500 hover:to-orange-500 cursor-pointer ring-2 ring-red-400/50 animate-pulse"
                  title="Roubar Turno - Tempo do oponente expirou!"
                >
                  ⚡ ROUBAR TURNO
                </motion.button>
              </motion.div>
            )}

            {/* Fases do Jogo - Modernizado - Só aparece quando é meu turno */}
            {isMyTurn && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center items-center gap-2 py-3 px-5 bg-gradient-to-r from-purple-900/40 via-blue-900/40 to-indigo-900/40 rounded-xl border-2 border-purple-500/30 shadow-xl backdrop-blur-sm"
              >
                {['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'].map((phase, index) => {
                  const phaseAbbreviations: { [key: string]: string } = {
                    DRAW: 'DP',
                    STANDBY: 'SBP',
                    MAIN1: 'MP1',
                    BATTLE: 'BP',
                    MAIN2: 'MP2',
                    END: 'EP'
                  };
                  
                  const phaseFullNames: { [key: string]: string } = {
                    DRAW: 'Draw Phase (Fase de Compras)',
                    STANDBY: 'Standby Phase (Fase de Apoio)',
                    MAIN1: 'Main Phase 1 (Fase Principal 1)',
                    BATTLE: 'Battle Phase (Fase de Batalha)',
                    MAIN2: 'Main Phase 2 (Fase Principal 2)',
                    END: 'End Phase (Fase Final)'
                  };
                  
                  const phases = ['DRAW', 'STANDBY', 'MAIN1', 'BATTLE', 'MAIN2', 'END'];
                  const phaseIndex = phases.indexOf(currentPhase);
                  const isActive = currentPhase === phase;
                  const isPast = phaseIndex > index;
                  const isFuture = phaseIndex < index;
                  
                  // Verificar se é o primeiro turno do primeiro jogador (player1 começa)
                  // No primeiro turno, o jogador que começa não pode atacar, então desabilitar fase BATTLE
                  // É o primeiro turno se: é o turno do player1, ainda não houve mudança de turno, e é o turno atual
                  const isFirstTurnOfFirstPlayer = currentTurn === 1 && isPlayer1 && isMyTurn && !hasTurnChanged;
                  const isBattlePhaseDisabled = phase === 'BATTLE' && isFirstTurnOfFirstPlayer;
                  
                  // Função para ir diretamente para a fase clicada
                  const handlePhaseClick = async () => {
                    if (!duelId || !user?.id || phase === 'DRAW' || isPast || isBattlePhaseDisabled) return;
                    
                    const socket = getSocket();
                    if (!socket || !socket.connected) return;
                    
                    // Se clicou na fase atual, não fazer nada (exceto END)
                    if (isActive && phase !== 'END') {
                      return;
                    }
                    
                    // Se clicou na fase atual (END), avançar fase (que vai verificar se precisa descartar ou avançar turno)
                    if (isActive && phase === 'END') {
                      // Se tem mais de 6 cartas, não pode avançar ainda - precisa descartar primeiro
                      if (myHand.length > 6) {
                        return;
                      }
                      // Se tem 6 ou menos cartas, avançar fase (que vai avançar o turno automaticamente)
                      socket.emit('nextPhase', { duelId, userId: user.id });
                      return;
                    }
                    
                    // Se clicou em uma fase futura, ir diretamente para ela
                    if (isFuture) {
                      // Se é o primeiro turno do primeiro jogador e está tentando ir para BATTLE, ir para MAIN2
                      let targetPhase = phase;
                      if (isFirstTurnOfFirstPlayer && phase === 'BATTLE') {
                        targetPhase = 'MAIN2';
                      }
                      
                      // Chamar goToPhase para ir diretamente para a fase alvo
                      socket.emit('goToPhase', { duelId, userId: user.id, targetPhase });
                    }
                  };
                  
                  return (
                    <React.Fragment key={phase}>
                      {isMyTurn ? (
                        <>
                          {phase === 'END' && isActive && myHand.length <= 6 ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleEndTurn()}
                              className="px-6 py-2.5 rounded-xl font-bold text-sm transition-all border-2 min-w-[120px]  bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-300 shadow-xl shadow-green-500/60 hover:from-green-500 hover:to-emerald-500 cursor-pointer ring-2 ring-green-400/50"
                              title="Finalizar Turno"
                            >
                              ✓ Finalizar
                            </motion.button>
                          ) : phase === 'END' && isActive && myHand.length > 6 ? (
                            // Não mostrar botão quando tem mais de 6 cartas - apenas o aviso de descarte
                            null
                          ) : (
                            <motion.button
                              whileHover={!isPast && phase !== 'DRAW' && !isBattlePhaseDisabled ? { y: -2, scale: 1.05 } : {}}
                              whileTap={!isPast && phase !== 'DRAW' && !isBattlePhaseDisabled ? { scale: 0.95 } : {}}
                              onClick={handlePhaseClick}
                              disabled={isPast || phase === 'DRAW' || isBattlePhaseDisabled}
                              className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all border-2 min-w-[60px] ${
                                isBattlePhaseDisabled
                                  ? 'bg-black/30 text-white/40 border-white/10 cursor-not-allowed opacity-50'
                                  : isActive
                                  ? 'bg-gradient-to-br from-gray-600 to-gray-700 text-white border-gray-400 shadow-xl shadow-gray-500/60 hover:from-gray-500 hover:to-gray-600 cursor-pointer ring-2 ring-gray-400/50'
                                  : isFuture
                                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white border-purple-300 shadow-xl shadow-purple-500/60 hover:from-purple-400 hover:to-pink-400 cursor-pointer ring-2 ring-purple-400/50'
                                  : phase === 'DRAW' && isActive
                                  ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white border-blue-300 shadow-xl shadow-blue-500/60 cursor-wait ring-2 ring-blue-400/50 animate-pulse'
                                  : isPast
                                  ? 'bg-black/30 text-white/40 border-white/10 cursor-not-allowed opacity-50'
                                  : 'bg-black/30 text-white/40 border-white/10 cursor-not-allowed opacity-50'
                              }`}
                              title={
                                isBattlePhaseDisabled
                                  ? 'Você não pode atacar no primeiro turno do jogo'
                                  : isPast 
                                  ? 'Fase já passada' 
                                  : phase === 'DRAW' 
                                  ? 'Processando automaticamente...' 
                                  : isFuture
                                  ? `Avançar para ${phaseFullNames[phase]}`
                                  : phaseFullNames[phase]
                              }
                            >
                              {phaseAbbreviations[phase]}
                            </motion.button>
                          )}
                        </>
                      ) : null}
                      {index < 5 && (
                        <div className="flex items-center">
                          <div className={`w-1.5 h-1.5 rounded-full transition-all ${
                            isPast ? 'bg-green-500' : isActive ? 'bg-gray-400 animate-pulse' : 'bg-purple-500/50'
                          }`} />
                          {isFuture && (
                            <div className="w-8 h-0.5 bg-gradient-to-r from-purple-500/50 to-transparent" />
                          )}
                          {!isFuture && !isActive && !isPast && (
                            <div className="w-8 h-0.5 bg-slate-700/30" />
                          )}
                          {isPast && (
                            <div className="w-8 h-0.5 bg-green-500/50" />
                          )}
                          {isActive && (
                            <div className="w-8 h-0.5 bg-gradient-to-r from-gray-400/50 to-transparent" />
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </motion.div>
            )}

            {/* Minha Mão (cartas visíveis) - Modernizado */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex justify-start items-center gap-2 py-1 overflow-x-auto overflow-y-visible px-3 min-h-[200px] relative w-full mt-2"
              style={{ 
                overflowY: 'visible',
                overflowX: 'auto',
                paddingTop: '10px', 
                paddingBottom: '5px',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent',
                maxWidth: '100%'
              }}
              onClick={(e) => {
                // Fechar zoom se clicar fora das cartas
                if (e.target === e.currentTarget) {
                  setZoomedCard(null);
                  setSelectedCardForField(null);
                }
              }}
            >
              {myHand.length === 0 ? (
                <div className="text-slate-300 text-center py-8 w-full">
                  <p className="text-lg font-bold">Nenhuma carta na mão</p>
                  <p className="text-sm text-slate-400 mt-2">Deck: {myDeck.length} cartas restantes</p>
                </div>
              ) : (
                <div 
                  data-hand-container 
                  className="flex gap-2 overflow-x-auto overflow-y-visible pb-4 px-4 items-center w-full" 
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent', maxWidth: '100%' }}
                  onWheel={(e) => {
                    // Permitir scroll horizontal com a roda do mouse
                    const container = e.currentTarget;
                    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                      // Se o scroll vertical for maior, converter para horizontal
                      e.preventDefault();
                      container.scrollLeft += e.deltaY;
                    }
                  }}
                >
                {(() => {
                  // Log todas as cartas na mão para debug do Dark Armed Dragon
                  const darkArmedDragonInHand = myHand.find((c: any) => {
                    if (!c) return false;
                    const name = (c?.name || c?.cardName || '').toLowerCase().trim();
                    const idCarta = (c?.idCarta || '').toLowerCase().trim();
                    // Verificação exata - deve ser exatamente "Dark Armed Dragon"
                    const isDarkArmedDragon = name === 'dark armed dragon' || name === 'dark-armed dragon' ||
                           idCarta === 'darkarmeddragon' || idCarta === 'dark-armeddragon' || idCarta === 'darkarmed-dragon' ||
                           idCarta === 'darkarmeddragon';
                    if (isDarkArmedDragon) {
                      console.log('🔍 [Dark Armed Dragon] Dark Armed Dragon encontrado na mão:', {
                        name: c.name || c.cardName,
                        idCarta: c.idCarta,
                        id: c.id,
                        cardId: c.cardId,
                        fullCard: c
                      });
                    }
                    return isDarkArmedDragon;
                  });
                  return null;
                })()}
                {myHand.map((card: any, index: number) => {
                  // Criar chave única combinando index com idCarta para diferenciar cópias da mesma carta
                  // O index garante unicidade mesmo que haja múltiplas cópias da mesma carta
                  const uniqueKey = `my-hand-${index}-${card.idCarta || card.id || card.cardId || index}`;
                  // Tamanho fixo para as cartas - permitir scroll horizontal quando houver muitas
                  const cardWidth = 120; // Tamanho fixo
                  const cardHeight = Math.floor(cardWidth * 1.458); // Proporção 59:86
                  
                  const cardType = card.type || card.cardType;
                  const isSpellOrTrap = cardType === 'Spell' || cardType === 'Trap';
                  const canDrag = isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && isSpellOrTrap;
                  
                  return (
                  <motion.div
                    key={uniqueKey}
                    data-hand-card-index={index}
                    initial={{ y: 100, opacity: 0, rotate: -5 }}
                    animate={{
                      y: 0,
                      opacity: 1,
                      rotate: 0,
                    }}
                    transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
                    className={`transition-all overflow-visible flex-shrink-0 relative ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                    style={{
                      width: `${cardWidth}px`,
                      height: `${cardHeight}px`,
                      minWidth: `${cardWidth}px`,
                      maxWidth: `${cardWidth}px`,
                      flexShrink: 0
                    }}
                    title={card.name || `Carta ${index + 1}`}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      if (canDrag) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('application/json', JSON.stringify(card));
                        // Criar imagem customizada para o drag
                        const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
                        dragImage.style.position = 'absolute';
                        dragImage.style.top = '-1000px';
                        dragImage.style.width = `${cardWidth}px`;
                        dragImage.style.height = `${cardHeight}px`;
                        document.body.appendChild(dragImage);
                        e.dataTransfer.setDragImage(dragImage, cardWidth / 2, cardHeight / 2);
                        setTimeout(() => document.body.removeChild(dragImage), 0);
                      }
                    }}
                    onDragEnd={(e) => {
                      // Limpar qualquer feedback visual
                    }}
                      onClick={(e) => {
                      e.stopPropagation();
                      // Ao clicar, mostrar informações da carta
                      console.log('🔍 [DuelArena] Hand card clicked:', {
                        name: card?.name,
                        description: card?.description,
                        hasDescription: !!card?.description,
                        descriptionLength: card?.description?.length || 0,
                        allKeys: Object.keys(card || {})
                      });
                      setSelectedCardInfo(card);
                      setSelectedCardForField(null); // Limpar seleção
                    }}
                  >
                    <CardImage
                      card={card}
                      className="w-full h-full"
                      fallback="/images/fundoCarta.webp"
                    />
                    
                    {/* Botões de ação - Mostra caveira na fase END quando precisa descartar, senão mostra botões normais */}
                    {(() => {
                      const isZoomed = zoomedCard && isSameCard(zoomedCard, card);
                      const shouldShow = isMyTurn && !isZoomed;
                      const needsDiscard = currentPhase === 'END' && myHand.length > 6;
                      const cardType = card.type || card.cardType;
                      const isMonster = cardType === 'Monster';
                      const isSpellOrTrap = cardType === 'Spell' || cardType === 'Trap';
                      
                      if (!shouldShow) return null;
                      
                      // Se precisa descartar, mostrar botão de caveira
                      if (needsDiscard) {
                        return (
                          <div 
                            className="absolute top-1 left-1 pointer-events-auto z-50"
                            style={{ 
                              zIndex: 10000
                            }}
                          >
                                    <motion.button
                                      whileHover={{ y: -2 }}
                                      whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDiscardCard(card);
                                setZoomedCard(null);
                              }}
                              className="w-10 h-10 bg-gradient-to-br from-red-700/90 to-red-800/90 hover:from-red-600 hover:to-red-700 border-2 border-red-500/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-red-500/50  hover:shadow-red-500/70"
                              title="Descartar para o Cemitério"
                            >
                              <span className="text-xl">💀</span>
                            </motion.button>
                          </div>
                        );
                      }
                      
                      // Senão, mostrar botões normais de invocar
                      if (isMonster || isSpellOrTrap) {
                        return (
                          <div 
                            className="absolute top-1 left-1 flex gap-1 pointer-events-auto z-50"
                            style={{ 
                              zIndex: 10000
                            }}
                          >
                            {isMonster ? (
                              <>
                                {(() => {
                                  const cardLevel = card.level || 0;
                                  const isInMainPhase = (currentPhase === 'MAIN1' || currentPhase === 'MAIN2');
                                  const availableMonstersCount = myMonsters.filter(m => m !== null && m !== undefined).length;
                                  
                                  // Verificar se é Dark Armed Dragon (não pode ser invocado normalmente)
                                  const cardIdCarta = card.idCarta || card.id || card.cardId || '';
                                  const cardName = (card.name || card.cardName || '').toLowerCase().trim();
                                  // Verificação exata - deve ser exatamente "Dark Armed Dragon" ou variações exatas do ID
                                  const isDarkArmedDragon = cardIdCarta === 'DarkArmedDragon' ||
                                                          cardIdCarta === 'darkarmeddragon' ||
                                                          cardIdCarta === 'Dark-ArmedDragon' ||
                                                          cardIdCarta === 'DarkArmed-Dragon' ||
                                                          cardName === 'dark armed dragon' ||
                                                          cardName === 'dark-armed dragon';
                                  
                                  // Se for Dark Armed Dragon, não mostrar botões de invocação normal aqui
                                  // (será tratado mais abaixo com verificação de 3 Dark no cemitério)
                                  // NÃO retornar null aqui - deixar o código continuar para mostrar o botão de invocação especial
                                  // if (isDarkArmedDragon) {
                                  //   return null; // Não mostrar botões de invocação normal
                                  // }
                                  
                                  // Verificar se é Swift Gaia The Fierce Knight
                                  const isSwiftGaia = cardIdCarta.toLowerCase().includes('swiftgaiathefierceknight') || 
                                                      card.name?.toLowerCase().includes('swift gaia') ||
                                                      card.name?.toLowerCase().includes('swiftgaia');
                                  const isOnlyCardInHand = myHand.length === 1;
                                  const canSummonSwiftGaiaWithoutTribute = isSwiftGaia && isOnlyCardInHand;
                                  
                                  // Determinar quantos tributos são necessários
                                  let requiredTributes = 0;
                                  if (cardLevel >= 7) {
                                    requiredTributes = 2;
                                  } else if (cardLevel >= 5) {
                                    requiredTributes = 1;
                                  }
                                  
                                  // Se é Swift Gaia e único card na mão, não precisa de tributo
                                  if (canSummonSwiftGaiaWithoutTribute) {
                                    requiredTributes = 0;
                                  }
                                  
                                  // Verificar se pode invocar (sem tributo ou com tributos disponíveis)
                                  // IMPORTANTE: Sempre mostrar os botões, mesmo quando normalSummonUsed é true
                                  // Eles ficarão desabilitados para indicar que não pode mais invocar
                                  const canSummonWithoutTribute = (cardLevel <= 4 || canSummonSwiftGaiaWithoutTribute) && !normalSummonUsed && isInMainPhase;
                                  const canSummonWithTribute = requiredTributes > 0 && !normalSummonUsed && isInMainPhase && availableMonstersCount >= requiredTributes;
                                  const canSummon = canSummonWithoutTribute || canSummonWithTribute;
                                  // isDisabled será true quando normalSummonUsed é true, mas os botões ainda devem aparecer
                                  // SEMPRE mostrar os botões quando isMonster é true, independente de isDisabled
                                  const isDisabled = !canSummon;
                                  
                                  const handleSummonClick = async (position: 'attack' | 'defense' | 'set') => {
                                    if (isDisabled) {
                                      if (normalSummonUsed) {
                                        alert('Você já usou sua invocação normal neste turno!');
                                      } else if (requiredTributes > 0 && availableMonstersCount < requiredTributes) {
                                        alert(`Você precisa de ${requiredTributes} monstro(s) no campo para tributar, mas só tem ${availableMonstersCount}!`);
                                      } else {
                                        alert('Você só pode invocar monstros nas fases principais!');
                                      }
                                      return;
                                    }
                                    
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Se precisa de tributo, mostrar modal
                                    if (requiredTributes > 0) {
                                      setTributeModalData({
                                        card,
                                        position,
                                        requiredTributes,
                                      });
                                      setShowTributeModal(true);
                                    } else {
                                      // Invocação normal sem tributo - acionar animação antes
                                      // Atualizar estado local imediatamente para que os botões fiquem desabilitados
                                      setNormalSummonUsed(true);
                                      await triggerCardPlacementAnimation(card, emptyZoneIndex, true);
                                      performAction(duelId, user.id, 'SUMMON_MONSTER', {
                                        cardId: card.id || card.cardId || card.idCarta,
                                        cardName: card.name,
                                        zoneIndex: emptyZoneIndex,
                                        position,
                                      });
                                      setZoomedCard(null);
                                    }
                                  };
                                  
                                  // Verificar se é Cyber Dragon e se pode ser invocado por invocação especial
                                  const cardIdCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
                                  const isCyberDragon = cardName === 'cyberdragon' || 
                                                       cardName === 'cyber dragon' ||
                                                       cardIdCheck === 'cyberdragon' ||
                                                       cardIdCheck.includes('cyberdragon');
                                  
                                  // Verificar se é uma carta Chaos que requer invocação especial (ChaosSorcerer, ChaosEmperorDragon, BlackLusterSoldierEnvoyOfTheBeginning)
                                  // O backend usa isExactCard que compara idCarta.toLowerCase().trim() e também verifica o nome
                                  const cardIdForCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase().trim();
                                  const cardNameForCheck = (card.name || card.cardName || '').toLowerCase().trim();
                                  
                                  // Função auxiliar para verificar se corresponde (similar ao isExactCard do backend)
                                  const matchesCard = (idToCheck: string, nameToCheck: string, targetId: string, targetNameVariations: string[]) => {
                                    // Verificar por ID exato ou se contém
                                    if (idToCheck === targetId.toLowerCase() || idToCheck.includes(targetId.toLowerCase()) || targetId.toLowerCase().includes(idToCheck)) {
                                      return true;
                                    }
                                    // Verificar por nome (exato ou contém)
                                    for (const nameVar of targetNameVariations) {
                                      const nameVarLower = nameVar.toLowerCase();
                                      if (nameToCheck === nameVarLower || nameToCheck.includes(nameVarLower) || nameVarLower.includes(nameToCheck)) {
                                        return true;
                                      }
                                    }
                                    // Verificar se o nome corresponde ao padrão do backend (converte "ChaosSorcerer" -> "chaos sorcerer")
                                    const targetNameFromId = targetId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
                                    if (nameToCheck === targetNameFromId || nameToCheck.includes(targetNameFromId) || targetNameFromId.includes(nameToCheck)) {
                                      return true;
                                    }
                                    return false;
                                  };
                                  
                                  // Verificar se é uma das cartas Chaos (usando a mesma lógica do backend isExactCard)
                                  const isChaosSorcerer = matchesCard(
                                    cardIdForCheck,
                                    cardNameForCheck,
                                    'chaossorcerer',
                                    ['chaos sorcerer', 'chaossorcerer']
                                  );
                                  const isChaosEmperorDragon = matchesCard(
                                    cardIdForCheck,
                                    cardNameForCheck,
                                    'chaosemperordragon',
                                    ['chaos emperor dragon', 'chaosemperordragon']
                                  );
                                  const isBlackLusterSoldier = matchesCard(
                                    cardIdForCheck,
                                    cardNameForCheck,
                                    'blacklustersoldierenvoyofthebeginning',
                                    ['black luster soldier envoy of the beginning', 'blacklustersoldierenvoyofthebeginning', 'black luster soldier']
                                  ) || (typeof cardIdForCheck === 'string' && cardIdForCheck.includes('blacklustersoldier'));
                                  const isChaosCard = isChaosSorcerer || isChaosEmperorDragon || isBlackLusterSoldier;
                                  
                                  // Verificar se é Red-Eyes Darkness Metal Dragon
                                  const isRedEyesDarknessMetalDragon = cardIdForCheck === 'redeyesdarknessmetaldragon' ||
                                                                       cardIdForCheck === 'red-eyesdarknessmetaldragon' ||
                                                                       cardIdForCheck === 'redeyesdarknessmetaldragon' ||
                                                                       cardNameForCheck === 'red-eyes darkness metal dragon' ||
                                                                       cardNameForCheck === 'red eyes darkness metal dragon' ||
                                                                       cardNameForCheck.includes('red-eyes darkness metal dragon') ||
                                                                       (typeof cardIdForCheck === 'string' && cardIdForCheck.toLowerCase().includes('redeyesdarknessmetaldragon')) ||
                                                                       (typeof cardNameForCheck === 'string' && cardNameForCheck.includes('red-eyes darkness metal dragon'));
                                  
                                  // Log detalhado de TODAS as cartas na mão para debug
                                  console.log('🔍 [DuelArena] Verificando carta na mão:', {
                                    name: card.name || card.cardName,
                                    idCarta: card.idCarta,
                                    id: card.id,
                                    cardId: card.cardId,
                                    cardName: cardName,
                                    cardIdCheck: cardIdCheck,
                                    cardIdForCheck: cardIdForCheck,
                                    type: card.type || card.cardType
                                  });
                                  
                                  // Verificação exata como no backend (isExactCard)
                                  // Log se detectou carta Chaos
                                  if (isChaosCard) {
                                    const cardType = isChaosSorcerer ? 'ChaosSorcerer' : 
                                                    isChaosEmperorDragon ? 'ChaosEmperorDragon' : 
                                                    'BlackLusterSoldierEnvoyOfTheBeginning';
                                    console.log(`✅ [DuelArena] ${cardType} DETECTADO!`, {
                                      cardIdForCheck,
                                      cardNameForCheck,
                                      isChaosSorcerer,
                                      isChaosEmperorDragon,
                                      isBlackLusterSoldier
                                    });
                                  }
                                  
                                  // Debug: Log para verificar se detectou carta Chaos
                                  if (isChaosCard) {
                                    const cardType = isChaosSorcerer ? 'ChaosSorcerer' : 
                                                    isChaosEmperorDragon ? 'ChaosEmperorDragon' : 
                                                    'BlackLusterSoldierEnvoyOfTheBeginning';
                                    console.log(`✅ [DuelArena] ${cardType} DETECTADO!`, {
                                      cardName: cardNameForCheck,
                                      cardIdCheck,
                                      cardIdForCheck,
                                      myGraveyardLength: myGraveyard.length,
                                      currentPhase,
                                      isMyTurn
                                    });
                                  } else {
                                    // Log se não detectou - pode ajudar a identificar o problema
                                    if (cardName.includes('chaos') || cardName.includes('sorcerer') || 
                                        cardIdCheck.includes('chaos') || cardIdCheck.includes('sorcerer')) {
                                      console.log('⚠️ [DuelArena] Carta parece ser ChaosSorcerer mas não foi detectada:', {
                                        cardName,
                                        cardIdCheck,
                                        cardIdForCheck,
                                        idCarta: card.idCarta,
                                        id: card.id,
                                        cardId: card.cardId
                                      });
                                    }
                                  }
                                  
                                  // Condições para invocação especial: oponente tem pelo menos 1 monstro E jogador não tem nenhum
                                  const opponentMonstersCount = opponentMonsters.filter((m: any) => m !== null && m !== undefined).length;
                                  const playerMonstersCount = myMonsters.filter((m: any) => m !== null && m !== undefined).length;
                                  const canSpecialSummonCyberDragon = isCyberDragon && 
                                                                      opponentMonstersCount >= 1 && 
                                                                      playerMonstersCount === 0 &&
                                                                      (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                                      isMyTurn;
                                  
                                  // Para ChaosSorcerer, o botão sempre aparece - o backend valida as condições ao abrir o modal
                                  
                                  const handleSpecialSummonCyberDragon = async (position: 'attack' | 'defense') => {
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Acionar animação antes de invocar
                                    await triggerCardPlacementAnimation(card, emptyZoneIndex, true);
                                    performAction(duelId, user.id, 'SPECIAL_SUMMON_CYBER_DRAGON', {
                                      cardId: card.id || card.cardId || card.idCarta,
                                      cardName: card.name,
                                      zoneIndex: emptyZoneIndex,
                                      position,
                                    });
                                    setZoomedCard(null);
                                  };
                                  
                                  const handleSpecialSummonChaosSorcerer = async () => {
                                    console.log('🔍 [handleSpecialSummonChaosSorcerer] Iniciando invocação especial do ChaosSorcerer');
                                    
                                    // Verificar se há zona vazia (mas não invocar ainda - só quando confirmar no modal)
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Priorizar instanceId (único), depois idCarta, id, cardId
                                    const cardIdToSend = card.instanceId || card.idCarta || card.id || card.cardId;
                                    console.log('🔍 [handleSpecialSummonChaosSorcerer] Enviando ação para abrir modal:', {
                                      actionType: 'START_CHAOS_SORCERER_SUMMON',
                                      cardId: cardIdToSend,
                                      instanceId: card.instanceId,
                                      idCarta: card.idCarta,
                                      id: card.id,
                                      cardName: card.name || card.cardName,
                                      duelId,
                                      userId: user.id,
                                      emptyZoneIndex
                                    });
                                    
                                    // NÃO remover a carta da mão ainda - apenas abrir o modal
                                    // A carta só será removida quando o usuário confirmar no modal
                                    performAction(duelId, user.id, 'START_CHAOS_SORCERER_SUMMON', {
                                      cardId: cardIdToSend,
                                    });
                                    setZoomedCard(null);
                                  };

                                  const handleSpecialSummonRedEyesDarknessMetalDragon = async () => {
                                    console.log('🔍 [handleSpecialSummonRedEyesDarknessMetalDragon] Iniciando invocação especial');
                                    
                                    // Verificar se há zona vazia (mas não invocar ainda - só quando confirmar no modal)
                                    const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                    if (emptyZoneIndex === -1) {
                                      alert('Todas as zonas de monstro estão ocupadas!');
                                      return;
                                    }
                                    
                                    // Priorizar instanceId (único), depois idCarta, id, cardId (mesma ordem do ChaosSorcerer)
                                    const cardIdToSend = card.instanceId || card.idCarta || card.id || card.cardId;
                                    console.log('🔍 [handleSpecialSummonRedEyesDarknessMetalDragon] Enviando ação para abrir modal:', {
                                      actionType: 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON',
                                      cardId: cardIdToSend,
                                      instanceId: card.instanceId,
                                      idCarta: card.idCarta,
                                      id: card.id,
                                      cardName: card.name || card.cardName,
                                      duelId,
                                      userId: user.id,
                                      emptyZoneIndex
                                    });
                                    
                                    // NÃO remover a carta da mão ainda - apenas abrir o modal
                                    performAction(duelId, user.id, 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON', {
                                      cardId: cardIdToSend,
                                    });
                                    setZoomedCard(null);
                                  };

                                  // Se for uma carta Chaos, não mostrar botões de invocação normal (só invocação especial)
                                  // O botão sempre aparece - o backend valida as condições ao abrir o modal
                                  if (isChaosCard) {
                                    const cardDisplayName = isChaosSorcerer ? 'ChaosSorcerer' : 
                                                           isChaosEmperorDragon ? 'ChaosEmperorDragon' : 
                                                           'BlackLusterSoldierEnvoyOfTheBeginning';
                                    return (
                                      <>
                                        {/* Botão de Invocação Especial de cartas Chaos - sempre visível */}
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonChaosSorcerer();
                                          }}
                                          className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-black/30 border-purple-400/70 cursor-pointer"
                                          title={`Invocação Especial - ${cardDisplayName} - Bane 1 LIGHT e 1 DARK do cemitério - Não conta como invocação normal`}
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-6 h-6 object-contain"
                                          />
                                        </motion.button>
                                      </>
                                    );
                                  }

                                  // Verificar se é Dark Armed Dragon - verificação exata
                                  // Usar cardIdCarta e cardName que já foram declarados anteriormente (linha ~4374-4375), ou cardIdForCheck/cardNameForCheck se disponíveis
                                  // Verificação exata - deve ser exatamente "Dark Armed Dragon" ou variações exatas do ID
                                  // IMPORTANTE: cardIdCarta e cardName já foram definidos anteriormente, então podemos usá-los aqui
                                  const isDarkArmedDragonCheck = isDarkArmedDragon || // Reutilizar verificação anterior
                                                                 (cardIdCarta === 'DarkArmedDragon' ||
                                                                  cardIdCarta === 'darkarmeddragon' ||
                                                                  cardIdCarta === 'Dark-ArmedDragon' ||
                                                                  cardIdCarta === 'DarkArmed-Dragon' ||
                                                                  cardName === 'dark armed dragon' ||
                                                                  cardName === 'dark-armed dragon' ||
                                                                  (cardIdForCheck === 'darkarmeddragon' ||
                                                                   cardIdForCheck === 'dark-armeddragon' ||
                                                                   cardIdForCheck === 'darkarmed-dragon' ||
                                                                   cardNameForCheck === 'dark armed dragon' ||
                                                                   cardNameForCheck === 'dark-armed dragon'));
                                  
                                  // Log para verificar se Dark Armed Dragon está sendo detectado
                                  // Verificar se é potencialmente Dark Armed Dragon
                                  const mightBeDarkArmedDragon = cardName === 'dark armed dragon' || 
                                                                  cardName === 'dark-armed dragon' || 
                                                                  cardIdCarta.toLowerCase() === 'darkarmeddragon' || 
                                                                  cardIdForCheck === 'darkarmeddragon' ||
                                                                  (cardIdCarta.toLowerCase().includes('dark') && cardName.includes('dragon'));
                                  
                                  if (mightBeDarkArmedDragon) {
                                    console.log('🔍 [Dark Armed Dragon] Possível Dark Armed Dragon detectado:', {
                                      isDarkArmedDragon: isDarkArmedDragon,
                                      isDarkArmedDragonCheck: isDarkArmedDragonCheck,
                                      cardIdCarta: cardIdCarta,
                                      cardName: cardName,
                                      cardIdForCheck: cardIdForCheck,
                                      cardNameForCheck: cardNameForCheck,
                                      fullCard: card
                                    });
                                  }

                                  // Se for Red-Eyes Darkness Metal Dragon, não mostrar botões de invocação normal (só invocação especial)
                                  if (isRedEyesDarknessMetalDragon) {
                                    // Verificar se a própria carta é do Tipo Dragão
                                    const cardRace = (card.race || card.cardRace || '').toString().toUpperCase().trim();
                                    const isDragonType = cardRace === 'DRAGON' || cardRace === 'DRAGÃO' || cardRace.includes('DRAGON');
                                    
                                    if (!isDragonType) {
                                      return null; // Não mostrar botão se a carta não for do tipo Dragon
                                    }
                                    
                                    // Verificar se há monstros do Tipo Dragão face-up no campo
                                    const hasDragonFaceUp = myMonsters.some((monster: any) => {
                                      if (!monster || monster === null) return false;
                                      // Verificar se está face-up
                                      if (monster.position !== 'attack' && monster.position !== 'defense') return false;
                                      // Verificar se é do Tipo Dragão
                                      const race = (monster.race || monster.cardRace || '').toString().toUpperCase().trim();
                                      return race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');
                                    });
                                    
                                    // Só mostrar o botão se houver pelo menos um Dragon face-up
                                    if (!hasDragonFaceUp) {
                                      return null;
                                    }
                                    
                                    return (
                                      <>
                                        {/* Botão de Invocação Especial do Red-Eyes Darkness Metal Dragon - aparece apenas quando há Dragon face-up */}
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonRedEyesDarknessMetalDragon();
                                          }}
                                          className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-black/30 border-red-400/70 cursor-pointer"
                                          title="Invocação Especial - Red-Eyes Darkness Metal Dragon - Bane 1 monstro do Tipo Dragão face-up que você controla"
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-6 h-6 object-contain"
                                          />
                                        </motion.button>
                                      </>
                                    );
                                  }

                                  // Se for Dark Armed Dragon, não mostrar botões de invocação normal (só invocação especial)
                                  if (isDarkArmedDragonCheck) {
                                    console.log('✅ [Dark Armed Dragon] Carta detectada como Dark Armed Dragon:', {
                                      cardIdCarta,
                                      cardName,
                                      cardIdForCheck,
                                      cardNameForCheck,
                                      isMyTurn,
                                      currentPhase
                                    });
                                    
                                    // Verificar se é o turno do jogador e está na fase principal
                                    if (!isMyTurn) {
                                      console.log('⚠️ [Dark Armed Dragon] Não é o turno do jogador');
                                      return null;
                                    }
                                    
                                    if (currentPhase !== 'MAIN1' && currentPhase !== 'MAIN2') {
                                      console.log('⚠️ [Dark Armed Dragon] Não está na fase principal:', currentPhase);
                                      return null;
                                    }
                                    
                                    // Verificar se há exatamente 3 monstros Dark no cemitério
                                    // IMPORTANTE: Conta TODOS os monstros Dark, mesmo que tenham o mesmo nome
                                    // Cada carta no cemitério é contada separadamente, independente do nome
                                    const graveyardToCheck = myGraveyard || [];
                                    console.log('🔍 [Dark Armed Dragon] Verificando cemitério:', {
                                      graveyardLength: graveyardToCheck.length,
                                      graveyard: graveyardToCheck.map((c: any) => ({
                                        name: c?.name || c?.cardName,
                                        type: c?.type || c?.cardType,
                                        attribute: c?.attribute || c?.cardAttribute
                                      }))
                                    });
                                    
                                    const darkMonstersInGraveyard = graveyardToCheck.filter((c: any) => {
                                      if (!c) return false;
                                      const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
                                      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
                                      if (!isMonster) {
                                        console.log('🔍 [Dark Armed Dragon] Carta não é monstro:', {
                                          name: c?.name || c?.cardName,
                                          type: cardType
                                        });
                                        return false;
                                      }
                                      
                                      // Verificar atributo de múltiplas formas
                                      const attributeRaw = c.attribute || c.cardAttribute || c.card?.attribute || c.card?.cardAttribute || '';
                                      const attribute = String(attributeRaw).toUpperCase().trim();
                                      
                                      // Verificar se é Dark - aceitar DARK, TREVAS, DARKNESS, ou qualquer string que contenha DARK
                                      const isDark = attribute === 'DARK' || 
                                                    attribute === 'TREVAS' ||
                                                    attribute === 'DARKNESS' ||
                                                    attribute === 'DARK ATTRIBUTE' ||
                                                    (typeof attribute === 'string' && attribute.includes('DARK'));
                                      
                                      if (!isDark) {
                                        console.log('⚠️ [Dark Armed Dragon] Carta não é Dark:', {
                                          name: c?.name || c?.cardName,
                                          attribute: attribute,
                                          attributeRaw: attributeRaw,
                                          fullCard: c
                                        });
                                      } else {
                                        console.log('✅ [Dark Armed Dragon] Monstro Dark encontrado:', {
                                          name: c?.name || c?.cardName,
                                          attribute: attribute
                                        });
                                      }
                                      
                                      return isDark;
                                    });
                                    
                                    console.log('🔍 [Dark Armed Dragon] Monstros Dark encontrados:', {
                                      count: darkMonstersInGraveyard.length,
                                      monsters: darkMonstersInGraveyard.map((c: any) => ({
                                        name: c?.name || c?.cardName,
                                        attribute: c?.attribute || c?.cardAttribute
                                      }))
                                    });
                                    
                                    // Só mostrar o botão se houver exatamente 3 Dark no cemitério
                                    if (darkMonstersInGraveyard.length !== 3) {
                                      console.log('⚠️ [Dark Armed Dragon] Não há exatamente 3 Dark no cemitério:', darkMonstersInGraveyard.length);
                                      return null;
                                    }
                                    
                                    console.log('✅ [Dark Armed Dragon] Condições atendidas - mostrando botão de invocação especial');
                                    
                                    const handleSpecialSummonDarkArmedDragon = async () => {
                                      console.log('🔍 [handleSpecialSummonDarkArmedDragon] Iniciando invocação especial');
                                      
                                      // Verificar se há zona vazia
                                      const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                                      if (emptyZoneIndex === -1) {
                                        alert('Todas as zonas de monstro estão ocupadas!');
                                        return;
                                      }
                                      
                                      const cardIdToSend = card.instanceId || card.idCarta || card.id || card.cardId;
                                      console.log('🔍 [handleSpecialSummonDarkArmedDragon] Enviando ação para invocação especial:', {
                                        actionType: 'START_DARK_ARMED_DRAGON_SUMMON',
                                        cardId: cardIdToSend,
                                        instanceId: card.instanceId,
                                        idCarta: card.idCarta,
                                        id: card.id,
                                        cardName: card.name || card.cardName,
                                        duelId,
                                        userId: user.id,
                                        emptyZoneIndex
                                      });
                                      
                                      performAction(duelId, user.id, 'START_DARK_ARMED_DRAGON_SUMMON', {
                                        cardId: cardIdToSend,
                                      });
                                      setZoomedCard(null);
                                    };
                                    
                                    return (
                                      <>
                                        {/* Botão de Invocação Especial do Dark Armed Dragon - aparece apenas quando há exatamente 3 Dark no cemitério */}
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonDarkArmedDragon();
                                          }}
                                          className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-black/30 border-purple-400/70 cursor-pointer"
                                          title="Invocação Especial - Dark Armed Dragon - Requer exatamente 3 monstros Dark no cemitério - Invoca em modo de ataque"
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-6 h-6 object-contain"
                                          />
                                        </motion.button>
                                      </>
                                    );
                                  }

                                  return (
                                    <>
                                      {/* Botão de Invocação Especial do Cyber Dragon (se condições forem atendidas) - sempre invoca em ataque */}
                                      {canSpecialSummonCyberDragon && (
                                        <motion.button
                                          whileHover={{ y: -2 }}
                                          whileTap={{ scale: 0.9 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSpecialSummonCyberDragon('attack');
                                          }}
                                          className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-black/30 border-yellow-400/70 cursor-pointer"
                                          title={`Invocação Especial - Cyber Dragon em Ataque (ATK: ${card.atk || 0}) - Não conta como invocação normal - Pode mudar para defesa no mesmo turno`}
                                        >
                                          <img 
                                            src="/images/Duelo/SpecialSummon.png" 
                                            alt="Special Summon" 
                                            className="w-6 h-6 object-contain"
                                          />
                                        </motion.button>
                                      )}
                                      
                                      {/* Botão de Invocação Normal em Ataque (face-up) */}
                                      <motion.button
                                        whileHover={!isDisabled ? { y: -2 } : {}}
                                        whileTap={!isDisabled ? { scale: 0.9 } : {}}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSummonClick('attack');
                                        }}
                                        disabled={isDisabled}
                                        className={`w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg  ${
                                          isDisabled
                                            ? 'bg-black/30 border-gray-500/50 cursor-not-allowed opacity-50'
                                            : 'bg-black/30 border-red-400/70 cursor-pointer'
                                        }`}
                                        title={isDisabled 
                                          ? (normalSummonUsed 
                                              ? 'Você já usou sua invocação normal neste turno' 
                                              : requiredTributes > 0 && availableMonstersCount < requiredTributes
                                                ? `Precisa de ${requiredTributes} tributo(s), mas só tem ${availableMonstersCount} monstro(s)`
                                                : 'Só pode invocar nas fases principais')
                                          : canSummonSwiftGaiaWithoutTribute
                                            ? `Invocar em Ataque (ATK: ${card.atk || 0}) - Pode ser invocado sem tributo (único card na mão)`
                                            : requiredTributes > 0
                                              ? `Invocar em Ataque (ATK: ${card.atk || 0}) - Precisa de ${requiredTributes} tributo(s)`
                                              : `Invocar em Ataque (ATK: ${card.atk || 0}) - Invocação Normal`}
                                      >
                                        <img 
                                          src="/images/Duelo/Ataque.png" 
                                          alt="Ataque" 
                                          className="w-6 h-6 object-contain"
                                        />
                                      </motion.button>
                                      
                                      {/* Set (Invocar face-down em defesa) - conta como invocação normal */}
                                      <motion.button
                                        whileHover={!isDisabled ? { y: -2 } : {}}
                                        whileTap={!isDisabled ? { scale: 0.9 } : {}}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSummonClick('set');
                                        }}
                                        disabled={isDisabled}
                                        className={`w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg  ${
                                          isDisabled
                                            ? 'bg-black/30 border-gray-500/50 cursor-not-allowed opacity-50'
                                            : 'bg-black/30 border-blue-400/70 cursor-pointer'
                                        }`}
                                        title={isDisabled 
                                          ? (normalSummonUsed 
                                              ? 'Você já usou sua invocação normal neste turno' 
                                              : requiredTributes > 0 && availableMonstersCount < requiredTributes
                                                ? `Precisa de ${requiredTributes} tributo(s), mas só tem ${availableMonstersCount} monstro(s)`
                                                : 'Só pode invocar nas fases principais')
                                          : canSummonSwiftGaiaWithoutTribute
                                            ? `Set (Face-down em Defesa) - Pode ser invocado sem tributo (único card na mão)`
                                            : requiredTributes > 0
                                              ? `Set (Face-down em Defesa) - Precisa de ${requiredTributes} tributo(s)`
                                              : `Set (Face-down em Defesa) - DEF: ${card.def || 0}`}
                                      >
                                        <span className="text-sm">🛡️</span>
                                      </motion.button>
                                    </>
                                  );
                                })()}
                              </>
                            ) : (
                              <>
                                {/* Botão "Ativar" - apenas para Spell cards (ativar da mão) */}
                                {(cardType === 'Spell' || card.type === 'Spell' || card.cardType === 'Spell') && (
                                  <motion.button
                                    whileHover={{ y: -2 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      // Encontrar primeiro slot vazio à esquerda
                                      const emptyZoneIndex = mySpellTraps.findIndex(s => s === null || s === undefined);
                                      if (emptyZoneIndex !== -1) {
                                        // Acionar animação antes de ativar
                                        await triggerCardPlacementAnimation(card, emptyZoneIndex, false);
                                        // Ativar Spell da mão (vai direto para face-up)
                                        performAction(duelId, user.id, 'ACTIVATE_SPELL_TRAP', {
                                          cardId: card.id || card.cardId || card.idCarta,
                                          cardName: card.name,
                                          zoneIndex: emptyZoneIndex,
                                          position: 'face-up',
                                        });
                                        setZoomedCard(null);
                                      } else {
                                        alert('Todas as zonas de spell/trap estão ocupadas!');
                                      }
                                    }}
                                    className="w-8 h-8 bg-gradient-to-br from-green-600/90 to-green-700/90 hover:from-green-500 hover:to-green-600 border-2 border-green-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-green-500/40  hover:shadow-green-500/60"
                                    title="Ativar Spell (da mão)"
                                  >
                                    <span className="text-sm">✨</span>
                                  </motion.button>
                                )}
                                
                                {/* Botão "Setar" - para Spell e Trap cards (colocar no campo em set) */}
                                <motion.button
                                  whileHover={{ y: -2 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Encontrar primeiro slot vazio à esquerda
                                    const emptyZoneIndex = mySpellTraps.findIndex(s => s === null || s === undefined);
                                    if (emptyZoneIndex !== -1) {
                                      handlePlaceCardOnField(card, 'set', emptyZoneIndex, cardType);
                                      setZoomedCard(null);
                                    } else {
                                      alert('Todas as zonas de spell/trap estão ocupadas!');
                                    }
                                  }}
                                  className="w-8 h-8 bg-gradient-to-br from-purple-600/90 to-purple-700/90 hover:from-purple-500 hover:to-purple-600 border-2 border-purple-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-purple-500/40  hover:shadow-purple-500/60"
                                  title={cardType === 'Trap' || card.type === 'Trap' || card.cardType === 'Trap' 
                                    ? "Setar Trap (só pode ser setada, não ativada manualmente)" 
                                    : "Setar Spell (pode ser ativada depois)"}
                                >
                                  <span className="text-sm">📜</span>
                                </motion.button>
                              </>
                            )}
                          </div>
                        );
                      }
                      
                      return null;
                    })()}
                  </motion.div>
                );
              })}
              </div>
            )}
            </motion.div>
          </div>
          </motion.div>
        </div>
      </div>

      {/* Aviso de Descarte (quando está na fase END com mais de 6 cartas) */}
      {currentPhase === 'END' && isMyTurn && myHand.length > 6 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] bg-gradient-to-r from-red-600 to-orange-600 text-white px-6 py-3 rounded-xl border-2 border-red-400 shadow-2xl ">
          <p className="text-lg font-bold text-center">
            💀 Você tem {myHand.length} cartas na mão! Clique nas cartas com 💀 para descartá-las até ficar com 6.
          </p>
        </div>
      )}

      {/* Modal do Extra Deck */}
      {showExtraDeckModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/50 backdrop-blur-md"
        >
          <div className="bg-black/30 rounded-2xl border-2 border-purple-500/50 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Extra Deck
              </h2>
              <button
                onClick={() => setShowExtraDeckModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-purple-400">{myExtraDeck.length}</span>
            </p>

            {myExtraDeck.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Extra Deck vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {myExtraDeck.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`extra-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Extra Deck card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg shadow-lg hover:shadow-xl transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal do Extra Deck do Oponente */}
      {showOpponentExtraDeckModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/50 backdrop-blur-md"
        >
          <div className="bg-black/30 rounded-2xl border-2 border-purple-500/50 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                Extra Deck do Oponente
              </h2>
              <button
                onClick={() => setShowOpponentExtraDeckModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-purple-400">{opponentExtraDeck.length}</span>
            </p>

            {opponentExtraDeck.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Extra Deck vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {opponentExtraDeck.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`opponent-extra-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Opponent Extra Deck card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg shadow-lg hover:shadow-xl transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal do Cemitério do Oponente */}
      {showOpponentGraveyardModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/50 backdrop-blur-md"
        >
          <div className="bg-black/30 rounded-2xl border-2 border-white/20 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Cemitério do Oponente (GY)
              </h2>
              <button
                onClick={() => setShowOpponentGraveyardModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-yellow-400">{opponentGraveyard.length}</span>
            </p>

            {opponentGraveyard.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Cemitério vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {opponentGraveyard.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`opponent-gy-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Opponent Graveyard card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg border-2 border-purple-500/30 transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Seção de Cartas Banidas do Oponente */}
            <div className="mt-8 pt-8 border-t border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">
                Cartas Banidas do Oponente (Banished)
              </h3>
              <p className="text-slate-300 mb-6 text-center">
                Total de cartas banidas: <span className="font-bold text-red-400">{opponentBanished.length}</span>
              </p>

              {opponentBanished.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-lg">Nenhuma carta banida</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {opponentBanished.map((card, index) => {
                    const cardId = card.id || card.cardId || card.idCarta;
                    return (
                      <motion.div
                        key={`opponent-banished-${index}-${cardId}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="relative cursor-pointer aspect-[59/86]"
                        onClick={() => {
                          console.log('🔍 [DuelArena] Opponent Banished card clicked:', {
                            name: card?.name,
                            description: card?.description,
                            hasDescription: !!card?.description,
                            descriptionLength: card?.description?.length || 0,
                            allKeys: Object.keys(card || {})
                          });
                          setSelectedCardInfo(card);
                        }}
                      >
                        <CardImage
                          card={card}
                          className="w-full h-full rounded-lg border-2 border-red-500/50 transition-all opacity-80"
                          fallback="/images/fundoCarta.webp"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal do Cemitério */}
      {showGraveyardModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/50 backdrop-blur-md"
        >
          <div className="bg-black/30  rounded-2xl border-2 border-white/20 p-6 max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Cemitério (GY)
              </h2>
              <button
                onClick={() => setShowGraveyardModal(false)}
                className="text-white hover:text-red-400 text-2xl font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-300 mb-6 text-center">
              Total de cartas: <span className="font-bold text-yellow-400">{myGraveyard.length}</span>
            </p>

            {myGraveyard.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xl">Cemitério vazio</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                {myGraveyard.map((card, index) => {
                  const cardId = card.id || card.cardId || card.idCarta;
                  return (
                    <motion.div
                      key={`gy-${index}-${cardId}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative cursor-pointer aspect-[59/86]"
                      onClick={() => {
                        console.log('🔍 [DuelArena] Graveyard card clicked:', {
                          name: card?.name,
                          description: card?.description,
                          hasDescription: !!card?.description,
                          descriptionLength: card?.description?.length || 0,
                          allKeys: Object.keys(card || {})
                        });
                        setSelectedCardInfo(card);
                      }}
                    >
                      <CardImage
                        card={card}
                        className="w-full h-full rounded-lg border-2 border-purple-500/30 transition-all"
                        fallback="/images/fundoCarta.webp"
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Seção de Cartas Banidas */}
            <div className="mt-8 pt-8 border-t border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">
                Cartas Banidas (Banished)
              </h3>
              <p className="text-slate-300 mb-6 text-center">
                Total de cartas banidas: <span className="font-bold text-red-400">{myBanished.length}</span>
              </p>

              {myBanished.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-lg">Nenhuma carta banida</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {myBanished.map((card, index) => {
                    const cardId = card.id || card.cardId || card.idCarta;
                    return (
                      <motion.div
                        key={`banished-${index}-${cardId}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.02 }}
                        className="relative cursor-pointer aspect-[59/86]"
                        onClick={() => {
                          console.log('🔍 [DuelArena] Banished card clicked:', {
                            name: card?.name,
                            description: card?.description,
                            hasDescription: !!card?.description,
                            descriptionLength: card?.description?.length || 0,
                            allKeys: Object.keys(card || {})
                          });
                          setSelectedCardInfo(card);
                        }}
                      >
                        <CardImage
                          card={card}
                          className="w-full h-full rounded-lg border-2 border-red-500/50 transition-all opacity-80"
                          fallback="/images/fundoCarta.webp"
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confiscation - Seleção de Carta do Oponente */}
      <AnimatePresence mode="wait">
        {showOpponentHandRevealed && cardEffectType === 'confiscation' && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 10000, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
            onClick={(e) => {
              // Não fechar o modal ao clicar no overlay - o usuário deve selecionar uma carta
              e.stopPropagation();
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-transparent rounded-2xl border-2 border-red-500/50 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      ✨ Confiscation Ativada
                    </h2>
                    <p className="text-red-400 text-sm font-semibold">
                      Selecione uma carta do oponente para enviar ao cemitério
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Cartas na mão:</p>
                    <p className="text-xl font-bold text-yellow-400">{opponentHandRevealed.length}</p>
                  </div>
                </div>

                {/* Grid de Cartas */}
                {opponentHandRevealed.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">O oponente não tem cartas na mão</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          console.log('🎯 Confiscation: Continuando sem cartas');
                          // Completar efeito mesmo sem cartas
                          performAction(duelId, user.id, 'CONFISCATION_CHOICE', {
                            chosenCardIndex: -1,
                          });
                          // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                          // O modal será fechado automaticamente quando pendingChoice for null
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Continuar
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-4">
                    {opponentHandRevealed.map((card: any, index: number) => {
                      const uniqueKey = `confiscation-card-${index}-${card.idCarta || card.id || card.cardId || index}`;
                      return (
                        <motion.div
                          key={uniqueKey}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          onClick={() => {
                            // Enviar carta direto para o cemitério
                            if (duelId && user?.id) {
                              const cardInstanceId = card.instanceId;
                              if (!cardInstanceId) {
                                console.error(`❌ Confiscation: Carta não tem instanceId:`, card);
                                return;
                              }
                              console.log(`🎯 Confiscation: Carta selecionada: ${card.name || card.cardName} (instanceId: ${cardInstanceId})`);
                              
                              // Enviar escolha para o backend usando instanceId
                              performAction(duelId, user.id, 'CONFISCATION_CHOICE', {
                                instanceId: cardInstanceId,
                              });
                              
                              // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                              // O modal será fechado automaticamente quando pendingChoice for null
                            }
                          }}
                          className="relative cursor-pointer group"
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className="relative aspect-[59/86] rounded-lg overflow-hidden border-3 border-yellow-400/50 shadow-lg transition-all group-hover:border-yellow-400 group-hover:shadow-2xl">
                            <CardImage
                              card={card}
                              className="w-full h-full object-cover"
                              fallback="/images/fundoCarta.webp"
                            />
                            {/* Overlay de seleção */}
                            <div className="absolute inset-0 bg-yellow-400/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                Enviar ao Cemitério
                              </div>
                            </div>
                          </div>
                          {/* Nome da carta abaixo */}
                          <div className="mt-1 text-center">
                            <p className="text-white text-xs font-semibold truncate px-1">
                              {card.name || card.cardName || 'Carta Desconhecida'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Instruções */}
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-white text-center text-sm">
                    <span className="font-bold text-yellow-400">💡 Dica:</span> Clique em uma carta acima para enviá-la ao cemitério do oponente
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de The Forceful Sentry - Seleção de Carta do Oponente */}
      <AnimatePresence mode="wait">
        {showOpponentHandRevealed && cardEffectType === 'forcefulSentry' && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            style={{ 
              pointerEvents: 'auto', 
              zIndex: 10000, 
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            } as React.CSSProperties}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-transparent rounded-2xl border-2 border-blue-500/50 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      ⚔️ The Forceful Sentry Ativada
                    </h2>
                    <p className="text-blue-400 text-sm font-semibold">
                      Selecione uma carta do oponente para retornar ao deck (será embaralhado)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Cartas na mão:</p>
                    <p className="text-xl font-bold text-yellow-400">{opponentHandRevealed.length}</p>
                  </div>
                </div>

                {/* Grid de Cartas */}
                {opponentHandRevealed.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">O oponente não tem cartas na mão</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          console.log('🎯 The Forceful Sentry: Continuando sem cartas');
                          // Completar efeito mesmo sem cartas (enviar instanceId vazio)
                          performAction(duelId, user.id, 'FORCEFUL_SENTRY_CHOICE', {
                            instanceId: '',
                          });
                          // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                          // O modal será fechado automaticamente quando pendingChoice for null
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Continuar
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-4">
                    {opponentHandRevealed.map((card: any, index: number) => {
                      const uniqueKey = `forceful-sentry-card-${index}-${card.idCarta || card.id || card.cardId || index}`;
                      return (
                        <motion.div
                          key={uniqueKey}
                          initial={{ opacity: 0, scale: 0.8, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          onClick={() => {
                            // Enviar carta de volta para o deck
                            if (duelId && user?.id) {
                              const cardInstanceId = card.instanceId;
                              if (!cardInstanceId) {
                                console.error(`❌ ForcefulSentry: Carta não tem instanceId:`, card);
                                return;
                              }
                              console.log(`🎯 The Forceful Sentry: Carta selecionada: ${card.name || card.cardName} (instanceId: ${cardInstanceId})`);
                              
                              // Enviar escolha para o backend usando instanceId
                              performAction(duelId, user.id, 'FORCEFUL_SENTRY_CHOICE', {
                                instanceId: cardInstanceId,
                              });
                              
                              // NÃO fechar o modal aqui - deixar o backend confirmar via pendingChoice
                              // O modal será fechado automaticamente quando pendingChoice for null
                            }
                          }}
                          className="relative cursor-pointer group"
                          whileHover={{ scale: 1.05, zIndex: 10 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <div className="relative aspect-[59/86] rounded-lg overflow-hidden border-3 border-yellow-400/50 shadow-lg transition-all group-hover:border-yellow-400 group-hover:shadow-2xl">
                            <CardImage
                              card={card}
                              className="w-full h-full object-cover"
                              fallback="/images/fundoCarta.webp"
                            />
                            {/* Overlay de seleção */}
                            <div className="absolute inset-0 bg-blue-400/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="bg-blue-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                Retornar ao Deck
                              </div>
                            </div>
                          </div>
                          {/* Nome da carta abaixo */}
                          <div className="mt-1 text-center">
                            <p className="text-white text-xs font-semibold truncate px-1">
                              {card.name || card.cardName || 'Carta Desconhecida'}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Instruções */}
                <div className="mt-4 p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg">
                  <p className="text-white text-center text-sm">
                    <span className="font-bold text-yellow-400">💡 Dica:</span> Clique em uma carta acima para retorná-la ao deck do oponente (o deck será embaralhado)
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de GracefulCharity - Seleção de 2 Cartas para Descartar */}
      {showGracefulCharityModal && (
        <div
          id="graceful-charity-overlay"
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
          style={{ 
            zIndex: 10000,
            pointerEvents: 'auto'
          } as React.CSSProperties}
        >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-transparent rounded-2xl border-2 border-green-500/50 shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto"
              style={{ backgroundColor: 'transparent', background: 'transparent', pointerEvents: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                {/* Cabeçalho */}
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      ✨ Graceful Charity Ativada
                    </h2>
                    <p className="text-green-400 text-sm font-semibold">
                      Selecione 2 cartas da sua mão para descartar
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Cartas selecionadas:</p>
                    <p className="text-xl font-bold text-yellow-400">{selectedGracefulCharityCards.length} / 2</p>
                  </div>
                </div>

                {/* Grid de Cartas */}
                {gracefulCharityHand.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-lg mb-4">Você não tem cartas na mão</p>
                    <p className="text-sm text-yellow-400">Aguardando processamento...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-4">
                      {gracefulCharityHand.map((card: any, index: number) => {
                        const cardInstanceId = card.instanceId || `card-${index}`;
                        const uniqueKey = `graceful-charity-card-${index}-${cardInstanceId}`;
                        const isSelected = selectedGracefulCharityCards.includes(cardInstanceId);
                        
                        return (
                          <motion.div
                            key={uniqueKey}
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() => {
                              if (isSelected) {
                                // Desmarcar carta
                                setSelectedGracefulCharityCards(prev => prev.filter(id => id !== cardInstanceId));
                              } else {
                                // Marcar carta (máximo 2)
                                if (selectedGracefulCharityCards.length < 2) {
                                  setSelectedGracefulCharityCards(prev => [...prev, cardInstanceId]);
                                }
                              }
                            }}
                            className={`relative cursor-pointer group ${isSelected ? 'ring-4 ring-green-400' : ''}`}
                            whileHover={{ scale: 1.05, zIndex: 10 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <div className={`relative aspect-[59/86] rounded-lg overflow-hidden border-3 shadow-lg transition-all ${
                              isSelected 
                                ? 'border-green-400 shadow-green-400/50' 
                                : 'border-yellow-400/50 group-hover:border-yellow-400 group-hover:shadow-2xl'
                            }`}>
                              <CardImage
                                card={card}
                                className="w-full h-full object-cover"
                                fallback="/images/fundoCarta.webp"
                              />
                              {/* Overlay de seleção */}
                              {isSelected && (
                                <div className="absolute inset-0 bg-green-400/50 flex items-center justify-center">
                                  <div className="bg-green-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                    Selecionada
                                  </div>
                                </div>
                              )}
                              {!isSelected && (
                                <div className="absolute inset-0 bg-yellow-400/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-xs">
                                    Selecionar
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Nome da carta abaixo */}
                            <div className="mt-1 text-center">
                              <p className="text-white text-xs font-semibold truncate px-1">
                                {card.name || card.cardName || 'Carta Desconhecida'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Botão de confirmar */}
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => {
                          if (duelId && user?.id && selectedGracefulCharityCards.length === 2) {
                            console.log(`🎯 GracefulCharity: Descartando cartas com instanceIds:`, selectedGracefulCharityCards);
                            
                            // Limpar seleção e fechar modal imediatamente após enviar
                            const instanceIdsToDiscard = [...selectedGracefulCharityCards];
                            setSelectedGracefulCharityCards([]);
                            
                            performAction(duelId, user.id, 'GRACEFUL_CHARITY_CHOICE', {
                              instanceIdsToDiscard: instanceIdsToDiscard,
                            });
                            
                            // Fechar modal imediatamente após enviar (o backend confirmará via duelUpdate)
                            // Usar setTimeout para garantir que o performAction seja enviado primeiro
                            setTimeout(() => {
                              console.log(`✅ GracefulCharity: Fechando modal após enviar escolha`);
                              setShowGracefulCharityModal(false);
                              setGracefulCharityHand([]);
                            }, 100);
                          }
                        }}
                        disabled={selectedGracefulCharityCards.length !== 2}
                        className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                          selectedGracefulCharityCards.length === 2
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {selectedGracefulCharityCards.length === 2 
                          ? '✅ Descartar 2 Cartas' 
                          : `Selecione ${2 - selectedGracefulCharityCards.length} carta(s) para descartar`}
                      </button>
                    </div>
                  </>
                )}

                {/* Instruções */}
                <div className="mt-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
                  <p className="text-white text-center text-sm">
                    <span className="font-bold text-yellow-400">💡 Dica:</span> Selecione 2 cartas acima para descartá-las ao cemitério
                  </p>
                </div>
              </div>
            </motion.div>
        </div>
      )}

      {/* Modal de MonsterReborn */}
      <AnimatePresence>
        {showMonsterRebornModal && monsterRebornData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-purple-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-purple-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                      ⚰️ Monster Reborn
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro do seu cemitério ou do cemitério do oponente para reviver
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMonsterRebornModal(false);
                      setMonsterRebornData(null);
                      setSelectedMonsterReborn(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Meu Cemitério */}
                {monsterRebornData.playerGraveyard.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Meu Cemitério</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {monsterRebornData.playerGraveyard.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `player-${monster.graveyardIndex || index}-${index}`;
                        const isSelected = selectedMonsterReborn?.graveyard === 'player' && 
                                          selectedMonsterReborn?.index === index &&
                                          (selectedMonsterReborn.instanceId === monster.instanceId || 
                                           selectedMonsterReborn.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`player-graveyard-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMonsterReborn({ 
                                graveyard: 'player', 
                                index,
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full"
                              fallback="/images/fundoCarta.webp"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || 'Monstro'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Seção: Cemitério do Oponente */}
                {monsterRebornData.opponentGraveyard.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Cemitério do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {monsterRebornData.opponentGraveyard.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `opponent-${monster.graveyardIndex || index}-${index}`;
                        const isSelected = selectedMonsterReborn?.graveyard === 'opponent' && 
                                          selectedMonsterReborn?.index === index &&
                                          (selectedMonsterReborn.instanceId === monster.instanceId || 
                                           selectedMonsterReborn.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`opponent-graveyard-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMonsterReborn({ 
                                graveyard: 'opponent', 
                                index,
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full"
                              fallback="/images/fundoCarta.webp"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || 'Monstro'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mensagem se não houver monstros */}
                {monsterRebornData.playerGraveyard.length === 0 && monsterRebornData.opponentGraveyard.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros nos cemitérios para reviver</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMonsterRebornModal(false);
                        setMonsterRebornData(null);
                        setSelectedMonsterReborn(null);
                      }}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {monsterRebornData.playerGraveyard.length > 0 || monsterRebornData.opponentGraveyard.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMonsterRebornModal(false);
                        setMonsterRebornData(null);
                        setSelectedMonsterReborn(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (duelId && user?.id && selectedMonsterReborn) {
                          console.log(`🎯 MonsterReborn: Revivendo monstro:`, selectedMonsterReborn);
                          
                          performAction(duelId, user.id, 'MONSTER_REBORN_CHOICE', {
                            chosenMonster: selectedMonsterReborn,
                          });
                          
                          // Resetar estados
                          setShowMonsterRebornModal(false);
                          setMonsterRebornData(null);
                          setSelectedMonsterReborn(null);
                        }
                      }}
                      disabled={!selectedMonsterReborn}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                        selectedMonsterReborn
                          ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white cursor-pointer'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedMonsterReborn ? '✅ Reviver Monstro' : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Animação de carta saindo da mão para o campo */}
      <AnimatePresence>
        {cardPlacementAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-[10000]"
            style={{ zIndex: 10000 }}
          >
            <motion.div
              initial={{
                x: cardPlacementAnimation.fromPosition.x,
                y: cardPlacementAnimation.fromPosition.y,
                width: cardPlacementAnimation.fromPosition.width,
                height: cardPlacementAnimation.fromPosition.height,
                scale: 1,
                rotate: 0,
              }}
              animate={{
                x: cardPlacementAnimation.toPosition.x,
                y: cardPlacementAnimation.toPosition.y,
                width: cardPlacementAnimation.toPosition.width,
                height: cardPlacementAnimation.toPosition.height,
                scale: 1,
                rotate: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.8,
              }}
              transition={{
                duration: 0.5,
                ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
              }}
              style={{
                position: 'fixed',
                transform: 'translate(-50%, -50%)',
                zIndex: 10001,
              }}
            >
              <CardImage
                card={cardPlacementAnimation.card}
                className="w-full h-full object-cover rounded-lg shadow-2xl"
                style={{
                  filter: 'drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5))',
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de ChaosSorcerer Special Summon */}
      {/* Debug: Log do estado do modal */}
      {(() => {
        console.log(`🔍 [DuelArena Render] Estado do modal ChaosSorcerer:`, {
          showChaosSorcererModal,
          hasChaosSorcererData: !!chaosSorcererData,
          lightMonstersCount: chaosSorcererData?.lightMonsters?.length || 0,
          darkMonstersCount: chaosSorcererData?.darkMonsters?.length || 0,
          shouldRender: showChaosSorcererModal && chaosSorcererData
        });
        return null;
      })()}
      <AnimatePresence>
        {showChaosSorcererModal && chaosSorcererData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher os monstros
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-purple-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
                      ✨ {chaosSorcererData?.cardName || 'Carta Chaos'} - Invocação Especial
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro LIGHT e 1 monstro DARK do seu cemitério para banir
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowChaosSorcererModal(false);
                      setChaosSorcererData(null);
                      setSelectedLightMonster(null);
                      setSelectedDarkMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros LIGHT */}
                {chaosSorcererData.lightMonsters.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-yellow-400 mb-4">💡 Monstros LIGHT</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {chaosSorcererData.lightMonsters.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `light-${monster.graveyardIndex}-${index}` || `light-${index}`;
                        const isSelected = selectedLightMonster?.arrayIndex === index && 
                                          (selectedLightMonster.instanceId === monster.instanceId || 
                                           selectedLightMonster.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`light-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedLightMonster({
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex,
                                arrayIndex: index
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                                : 'border-gray-600 hover:border-yellow-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Seção: Monstros DARK */}
                {chaosSorcererData.darkMonsters.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">🌑 Monstros DARK</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {chaosSorcererData.darkMonsters.map((monster: any, index: number) => {
                        // Usar instanceId ou graveyardIndex como identificador único
                        const uniqueId = monster.instanceId || `dark-${monster.graveyardIndex}-${index}` || `dark-${index}`;
                        const isSelected = selectedDarkMonster?.arrayIndex === index && 
                                          (selectedDarkMonster.instanceId === monster.instanceId || 
                                           selectedDarkMonster.graveyardIndex === monster.graveyardIndex);
                        return (
                          <motion.div
                            key={`dark-${uniqueId}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDarkMonster({
                                instanceId: monster.instanceId,
                                graveyardIndex: monster.graveyardIndex,
                                arrayIndex: index
                              });
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {chaosSorcererData.lightMonsters.length === 0 && chaosSorcererData.darkMonsters.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros LIGHT ou DARK no cemitério</p>
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowChaosSorcererModal(false);
                        setChaosSorcererData(null);
                        setSelectedLightMonster(null);
                        setSelectedDarkMonster(null);
                      }}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {chaosSorcererData.lightMonsters.length > 0 && chaosSorcererData.darkMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowChaosSorcererModal(false);
                        setChaosSorcererData(null);
                        setSelectedLightMonster(null);
                        setSelectedDarkMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={async () => {
                        if (duelId && user?.id && selectedLightMonster !== null && selectedDarkMonster !== null) {
                          // Encontrar zona vazia
                          const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                          if (emptyZoneIndex === -1) {
                            alert('Todas as zonas de monstro estão ocupadas!');
                            return;
                          }
                          
                          // Fechar modal de seleção de monstros primeiro
                          setShowChaosSorcererModal(false);
                          
                          // Mostrar popup para escolher posição
                          const position = window.confirm('✨ Invocar ChaosSorcerer em Posição de ATAQUE?\n\nOK = Ataque\nCancelar = Defesa') ? 'attack' : 'defense';
                          
                          // Obter os monstros selecionados com seus identificadores únicos
                          const selectedLightMonsterData = chaosSorcererData.lightMonsters[selectedLightMonster.arrayIndex];
                          const selectedDarkMonsterData = chaosSorcererData.darkMonsters[selectedDarkMonster.arrayIndex];
                          
                          console.log(`🎯 [ChaosSorcerer Modal] Confirmando invocação - Banindo monstros LIGHT (índice ${selectedLightMonster.arrayIndex}, instanceId: ${selectedLightMonster.instanceId}) e DARK (índice ${selectedDarkMonster.arrayIndex}, instanceId: ${selectedDarkMonster.instanceId}), posição: ${position}`);
                          
                          // Enviar ação para banir monstros e invocar
                          // Usar instanceId ou graveyardIndex para identificar cada carta única
                          performAction(duelId, user.id, 'CHAOS_SORCERER_SUMMON_CHOICE', {
                            lightMonsterIndex: selectedLightMonster.arrayIndex,
                            darkMonsterIndex: selectedDarkMonster.arrayIndex,
                            lightMonsterInstanceId: selectedLightMonster.instanceId || selectedLightMonsterData?.instanceId,
                            darkMonsterInstanceId: selectedDarkMonster.instanceId || selectedDarkMonsterData?.instanceId,
                            lightMonsterGraveyardIndex: selectedLightMonster.graveyardIndex || selectedLightMonsterData?.graveyardIndex,
                            darkMonsterGraveyardIndex: selectedDarkMonster.graveyardIndex || selectedDarkMonsterData?.graveyardIndex,
                            zoneIndex: emptyZoneIndex,
                            position,
                          });
                          
                          // Resetar estados do modal
                          setChaosSorcererData(null);
                          setSelectedLightMonster(null);
                          setSelectedDarkMonster(null);
                          
                          // A carta será removida da mão e os monstros serão banidos pelo backend
                        }
                      }}
                      disabled={selectedLightMonster === null || selectedDarkMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors ${
                        selectedLightMonster !== null && selectedDarkMonster !== null
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white cursor-pointer'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedLightMonster !== null && selectedDarkMonster !== null ? `✅ Invocar ${chaosSorcererData?.cardName || 'Carta Chaos'}` : 'Selecione 1 LIGHT e 1 DARK'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de ChangeOfHeart */}
      <AnimatePresence>
        {showChangeOfHeartModal && changeOfHeartData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-pink-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-pink-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-pink-400 to-pink-600 bg-clip-text text-transparent">
                      💖 Change of Heart
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro do campo do oponente para controlar durante este turno (qualquer posição)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowChangeOfHeartModal(false);
                      setChangeOfHeartData(null);
                      setSelectedChangeOfHeartMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros do Oponente */}
                {changeOfHeartData.opponentMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {changeOfHeartData.opponentMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedChangeOfHeartMonster === realZoneIndex;
                        const isFaceDown = monster.position === 'set';
                        const isDefense = monster.position === 'defense';
                        const isAttack = monster.position === 'attack';
                        
                        // Para monstros em defesa ou face down, precisamos rotacionar 90 graus
                        // Carta padrão: 120px x 175px (largura x altura)
                        // Após rotação: 175px x 120px (largura x altura)
                        // Container precisa ser 175px x 175px para não cortar
                        const needsRotation = isDefense || isFaceDown;
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        
                        return (
                          <motion.div
                            key={`opponent-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedChangeOfHeartMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-pink-400 ring-4 ring-pink-400/50 shadow-lg shadow-pink-500/50'
                                : 'border-gray-600 hover:border-pink-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              {isFaceDown ? (
                                // Monstro face down: mostrar skin da carta do oponente
                                <div
                                  className="w-full h-full"
                                  style={{
                                    backgroundImage: `url(${opponentSkinImageUrl})`,
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                    backgroundRepeat: 'no-repeat',
                                  }}
                                />
                              ) : (
                                // Monstro face up: mostrar imagem da carta
                                <CardImage
                                  card={monster}
                                  className="w-full h-full"
                                  fallback="/images/fundoCarta.webp"
                                />
                              )}
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-pink-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-pink-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {isFaceDown ? 'Monstro Face Down' : (monster.name || monster.cardName || 'Monstro')}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-pink-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : monster.position === 'defense' ? 'DEF' : 'SET'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros no campo do oponente para controlar</p>
                    <button
                      onClick={() => {
                        setShowChangeOfHeartModal(false);
                        setChangeOfHeartData(null);
                        setSelectedChangeOfHeartMonster(null);
                      }}
                      className="mt-4 bg-pink-600 hover:bg-pink-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {changeOfHeartData.opponentMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowChangeOfHeartModal(false);
                        setChangeOfHeartData(null);
                        setSelectedChangeOfHeartMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedChangeOfHeartMonster !== null && duelId && user?.id) {
                          console.log('✨ [ChangeOfHeart] Enviando escolha:', selectedChangeOfHeartMonster);
                          performAction(duelId, user.id, 'CHANGE_OF_HEART_CHOICE', {
                            chosenMonsterZoneIndex: selectedChangeOfHeartMonster,
                          });
                          
                          // Resetar estados
                          setShowChangeOfHeartModal(false);
                          setChangeOfHeartData(null);
                          setSelectedChangeOfHeartMonster(null);
                        }
                      }}
                      disabled={selectedChangeOfHeartMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedChangeOfHeartMonster !== null
                          ? 'bg-pink-600 hover:bg-pink-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedChangeOfHeartMonster !== null 
                        ? '✅ Controlar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de UnitedWeStand */}
      <AnimatePresence>
        {showUnitedWeStandModal && unitedWeStandData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                      ⚔️ United We Stand
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro face-up do seu campo para equipar. O monstro ganha 800 de ATK para cada monstro face-up no seu campo (incluindo ele mesmo).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowUnitedWeStandModal(false);
                      setUnitedWeStandData(null);
                      setSelectedUnitedWeStandMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up Disponíveis */}
                {unitedWeStandData.availableMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up Disponíveis</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {unitedWeStandData.availableMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedUnitedWeStandMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                        const isAttack = monster.position === 'attack';
                        
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`available-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedUnitedWeStandMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-yellow-400 ring-4 ring-yellow-400/50 shadow-lg shadow-yellow-500/50'
                                : 'border-gray-600 hover:border-yellow-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-yellow-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no seu campo para equipar</p>
                    <button
                      onClick={() => {
                        setShowUnitedWeStandModal(false);
                        setUnitedWeStandData(null);
                        setSelectedUnitedWeStandMonster(null);
                      }}
                      className="mt-4 bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {unitedWeStandData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowUnitedWeStandModal(false);
                        setUnitedWeStandData(null);
                        setSelectedUnitedWeStandMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedUnitedWeStandMonster !== null && duelId && user?.id) {
                          console.log('✨ [UnitedWeStand] Enviando escolha:', selectedUnitedWeStandMonster);
                          performAction(duelId, user.id, 'UNITED_WE_STAND_CHOICE', {
                            chosenMonsterZoneIndex: selectedUnitedWeStandMonster,
                          });
                          
                          // Resetar estados
                          setShowUnitedWeStandModal(false);
                          setUnitedWeStandData(null);
                          setSelectedUnitedWeStandMonster(null);
                        }
                      }}
                      disabled={selectedUnitedWeStandMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedUnitedWeStandMonster !== null
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedUnitedWeStandMonster !== null 
                        ? '✅ Equipar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de MagePower */}
      <AnimatePresence>
        {showMagePowerModal && magePowerData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-purple-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-purple-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                      ⚡ Mage Power
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro face-up do seu campo para equipar. O monstro ganha 500 de ATK para cada carta na sua zona de spell/trap (incluindo esta carta).
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowMagePowerModal(false);
                      setMagePowerData(null);
                      setSelectedMagePowerMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up Disponíveis */}
                {magePowerData.availableMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up Disponíveis</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {magePowerData.availableMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedMagePowerMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                        const isAttack = monster.position === 'attack';
                        
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`available-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedMagePowerMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-purple-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no seu campo para equipar</p>
                    <button
                      onClick={() => {
                        setShowMagePowerModal(false);
                        setMagePowerData(null);
                        setSelectedMagePowerMonster(null);
                      }}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {magePowerData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowMagePowerModal(false);
                        setMagePowerData(null);
                        setSelectedMagePowerMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedMagePowerMonster !== null && duelId && user?.id) {
                          console.log('✨ [MagePower] Enviando escolha:', selectedMagePowerMonster);
                          performAction(duelId, user.id, 'MAGE_POWER_CHOICE', {
                            chosenMonsterZoneIndex: selectedMagePowerMonster,
                          });
                          
                          // Resetar estados
                          setShowMagePowerModal(false);
                          setMagePowerData(null);
                          setSelectedMagePowerMonster(null);
                        }
                      }}
                      disabled={selectedMagePowerMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedMagePowerMonster !== null
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedMagePowerMonster !== null 
                        ? '✅ Equipar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de BrainControl */}
      <AnimatePresence>
        {showBrainControlModal && brainControlData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-blue-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-blue-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                      🧠 Brain Control
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha um monstro face-up do campo do oponente para controlar durante este turno (custo: 800 LP)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowBrainControlModal(false);
                      setBrainControlData(null);
                      setSelectedBrainControlMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up do Oponente */}
                {brainControlData.opponentMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {brainControlData.opponentMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedBrainControlMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                        const isAttack = monster.position === 'attack';
                        
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        // Usar instanceId ou zoneIndex como chave única
                        const uniqueKey = monster.instanceId || `opponent-monster-${realZoneIndex}-${index}`;
                        return (
                          <motion.div
                            key={uniqueKey}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedBrainControlMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-blue-400 ring-4 ring-blue-400/50 shadow-lg shadow-blue-500/50'
                                : 'border-gray-600 hover:border-blue-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-blue-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-blue-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-blue-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no campo do oponente para controlar</p>
                    <button
                      onClick={() => {
                        setShowBrainControlModal(false);
                        setBrainControlData(null);
                        setSelectedBrainControlMonster(null);
                      }}
                      className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {brainControlData.opponentMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowBrainControlModal(false);
                        setBrainControlData(null);
                        setSelectedBrainControlMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedBrainControlMonster !== null && duelId && user?.id) {
                          console.log('✨ [BrainControl] Enviando escolha:', selectedBrainControlMonster);
                          performAction(duelId, user.id, 'BRAIN_CONTROL_CHOICE', {
                            chosenMonsterZoneIndex: selectedBrainControlMonster,
                          });
                          
                          // Resetar estados
                          setShowBrainControlModal(false);
                          setBrainControlData(null);
                          setSelectedBrainControlMonster(null);
                        }
                      }}
                      disabled={selectedBrainControlMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedBrainControlMonster !== null
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedBrainControlMonster !== null 
                        ? '✅ Controlar Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de SoulTaker */}
      <AnimatePresence>
        {showSoulTakerModal && soulTakerData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-red-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-red-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                      💀 Soul Taker
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro face-up que seu oponente controla; destrua o alvo e, depois, seu oponente ganha 1000 PV.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowSoulTakerModal(false);
                      setSoulTakerData(null);
                      setSelectedSoulTakerMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Face-Up do Oponente */}
                {soulTakerData.opponentMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Monstros Face-Up do Oponente</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {soulTakerData.opponentMonsters.map((monster: any, index: number) => {
                        // O backend envia os monstros com zoneIndex no objeto
                        const realZoneIndex = monster.zoneIndex !== undefined ? monster.zoneIndex : index;
                        const isSelected = selectedSoulTakerMonster === realZoneIndex;
                        const isDefense = monster.position === 'defense';
                        const isAttack = monster.position === 'attack';
                        
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`opponent-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedSoulTakerMonster(realZoneIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-red-400 ring-4 ring-red-400/50 shadow-lg shadow-red-500/50'
                                : 'border-gray-600 hover:border-red-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-red-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-red-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className="bg-red-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros face-up no campo do oponente para destruir</p>
                    <button
                      onClick={() => {
                        setShowSoulTakerModal(false);
                        setSoulTakerData(null);
                        setSelectedSoulTakerMonster(null);
                      }}
                      className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {soulTakerData.opponentMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        if (duelId && user?.id) {
                          // Cancelar ativação da carta no backend
                          performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                        }
                        setShowSoulTakerModal(false);
                        setSoulTakerData(null);
                        setSelectedSoulTakerMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedSoulTakerMonster !== null && duelId && user?.id) {
                          console.log('✨ [SoulTaker] Enviando escolha:', selectedSoulTakerMonster);
                          performAction(duelId, user.id, 'SOUL_TAKER_CHOICE', {
                            chosenMonsterZoneIndex: selectedSoulTakerMonster,
                          });
                          
                          // Resetar estados
                          setShowSoulTakerModal(false);
                          setSoulTakerData(null);
                          setSelectedSoulTakerMonster(null);
                        }
                      }}
                      disabled={selectedSoulTakerMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedSoulTakerMonster !== null
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedSoulTakerMonster !== null 
                        ? '💀 Destruir Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Exiled Force */}
      <AnimatePresence>
        {showExiledForceModal && exiledForceData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-orange-500/50 shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 border-b-2 border-orange-500/30 pb-4">
                  <div>
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-red-600 bg-clip-text text-transparent">
                      💥 Exiled Force
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Você pode tributar este monstro; destrua 1 monstro no campo.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowExiledForceModal(false);
                      setExiledForceData(null);
                      setSelectedExiledForceMonster(null);
                    }}
                    className="text-gray-400 hover:text-orange-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Seção: Monstros Disponíveis */}
                {exiledForceData.availableMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-white mb-4">Selecione um Monstro para Destruir</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {exiledForceData.availableMonsters.map((item: any, index: number) => {
                        const { monster, zoneIndex, player } = item;
                        const isSelected = selectedExiledForceMonster?.zoneIndex === zoneIndex && 
                                          selectedExiledForceMonster?.player === player;
                        const isDefense = monster.position === 'defense';
                        const isAttack = monster.position === 'attack';
                        
                        // Para monstros em defesa, precisamos rotacionar 90 graus
                        const needsRotation = isDefense;
                        const containerSize = needsRotation ? '175px' : '120px';
                        const containerHeight = needsRotation ? '175px' : '175px';
                        const cardWidth = '120px';
                        const cardHeight = '175px';
                        
                        return (
                          <motion.div
                            key={`exiled-force-monster-${player}-${zoneIndex}-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedExiledForceMonster({ zoneIndex, player });
                            }}
                            className={`relative cursor-pointer rounded-xl border-2 transition-all ${
                              isSelected
                                ? 'border-orange-400 ring-4 ring-orange-400/50 shadow-lg shadow-orange-500/50'
                                : 'border-gray-600 hover:border-orange-500/50'
                            }`}
                            style={{ 
                              width: containerSize, 
                              height: containerHeight,
                              overflow: 'visible',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <div
                              className="relative"
                              style={{
                                width: cardWidth,
                                height: cardHeight,
                                transform: needsRotation ? 'rotate(90deg)' : 'none',
                                transformOrigin: 'center center',
                                overflow: 'hidden',
                                borderRadius: '8px',
                              }}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-full"
                                fallback="/images/fundoCarta.webp"
                              />
                            </div>
                            {isSelected && (
                              <div className="absolute inset-0 bg-orange-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-orange-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                            <div className="absolute top-1 right-1 pointer-events-none">
                              <div className={`${player === 'player' ? 'bg-blue-500/90' : 'bg-red-500/90'} text-white text-xs px-2 py-1 rounded font-bold`}>
                                {player === 'player' ? 'SEU' : 'OPONENTE'}
                              </div>
                            </div>
                            <div className="absolute top-1 left-1 pointer-events-none">
                              <div className="bg-orange-500/90 text-white text-xs px-2 py-1 rounded font-bold">
                                {monster.position === 'attack' ? 'ATK' : 'DEF'}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros no campo para destruir</p>
                    <button
                      onClick={() => {
                        setShowExiledForceModal(false);
                        setExiledForceData(null);
                        setSelectedExiledForceMonster(null);
                      }}
                      className="mt-4 bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Botões */}
                {exiledForceData.availableMonsters.length > 0 ? (
                  <div className="flex justify-center gap-4 mt-6">
                    <button
                      onClick={() => {
                        setShowExiledForceModal(false);
                        setExiledForceData(null);
                        setSelectedExiledForceMonster(null);
                      }}
                      className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (selectedExiledForceMonster !== null && duelId && user?.id && exiledForceData?.monsterZoneIndex !== undefined) {
                          console.log('✨ [Exiled Force] Enviando escolha:', selectedExiledForceMonster);
                          performAction(duelId, user.id, 'EXILED_FORCE_CHOICE', {
                            monsterZoneIndex: exiledForceData.monsterZoneIndex,
                            targetPlayer: selectedExiledForceMonster.player,
                            targetZoneIndex: selectedExiledForceMonster.zoneIndex,
                          });
                          
                          // Resetar estados
                          setShowExiledForceModal(false);
                          setExiledForceData(null);
                          setSelectedExiledForceMonster(null);
                        }
                      }}
                      disabled={selectedExiledForceMonster === null}
                      className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                        selectedExiledForceMonster !== null
                          ? 'bg-orange-600 hover:bg-orange-700 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {selectedExiledForceMonster !== null 
                        ? '💥 Destruir Monstro' 
                        : 'Selecione um monstro'}
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal do Efeito do Dark Armed Dragon */}
      <AnimatePresence>
        {showDarkArmedDragonEffectModal && darkArmedDragonEffectData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowDarkArmedDragonEffectModal(false);
                setDarkArmedDragonEffectData(null);
                setSelectedDarkMonsterToBanish(null);
                setSelectedCardToDestroy(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-purple-900/95 to-indigo-900/95 border-2 border-purple-400/70 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Efeito do Dark Armed Dragon
                </h2>
                <p className="text-purple-200 text-sm">
                  {selectedDarkMonsterToBanish === null
                    ? 'Selecione 1 monstro Dark do seu cemitério para banir'
                    : selectedCardToDestroy === null
                    ? 'Selecione 1 carta no campo para destruir'
                    : 'Confirme a destruição'}
                </p>
              </div>

              {selectedDarkMonsterToBanish === null ? (
                // Primeira etapa: Selecionar monstro Dark do cemitério
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Monstros Dark no Cemitério:</h3>
                  {darkArmedDragonEffectData.darkMonsters.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {darkArmedDragonEffectData.darkMonsters.map((monster: any, index: number) => {
                        const isSelected = selectedDarkMonsterToBanish === index;
                        return (
                          <motion.div
                            key={index}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedDarkMonsterToBanish(index)}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                : 'border-purple-600/50 hover:border-purple-400'
                            }`}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-48 object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                <div className="bg-purple-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                  Selecionado
                                </div>
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                              <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                                {monster.name || monster.cardName || 'Monstro'}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-lg">Não há monstros Dark no seu cemitério</p>
                    </div>
                  )}
                </div>
              ) : selectedCardToDestroy === null ? (
                // Segunda etapa: Selecionar carta no campo para destruir
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Selecione uma carta no campo para destruir:</h3>
                  <div className="space-y-6">
                    {/* Monstros do jogador */}
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Seus Monstros:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {myMonsters.map((monster: any, index: number) => {
                          if (!monster || monster === null) return null;
                          const isSelected = selectedCardToDestroy?.player === 'player' && 
                                           selectedCardToDestroy?.type === 'monster' && 
                                           selectedCardToDestroy?.zoneIndex === index;
                          return (
                            <motion.div
                              key={`player-monster-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'player', type: 'monster', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-32 object-cover"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Spell/Trap do jogador */}
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Suas Magias/Armadilhas:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {mySpellTraps.map((spellTrap: any, index: number) => {
                          if (!spellTrap || spellTrap === null) return null;
                          const isSelected = selectedCardToDestroy?.player === 'player' && 
                                           selectedCardToDestroy?.type === 'spellTrap' && 
                                           selectedCardToDestroy?.zoneIndex === index;
                          return (
                            <motion.div
                              key={`player-spelltrap-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'player', type: 'spellTrap', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              <CardImage
                                card={spellTrap}
                                className="w-full h-32 object-cover"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Monstros do oponente */}
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Monstros do Oponente:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {opponentMonsters.map((monster: any, index: number) => {
                          if (!monster || monster === null) return null;
                          const isSelected = selectedCardToDestroy?.player === 'opponent' && 
                                           selectedCardToDestroy?.type === 'monster' && 
                                           selectedCardToDestroy?.zoneIndex === index;
                          return (
                            <motion.div
                              key={`opponent-monster-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'opponent', type: 'monster', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              <CardImage
                                card={monster}
                                className="w-full h-32 object-cover"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Spell/Trap do oponente */}
                    <div>
                      <h4 className="text-md font-semibold text-purple-200 mb-3">Magias/Armadilhas do Oponente:</h4>
                      <div className="grid grid-cols-5 gap-2">
                        {opponentSpellTraps.map((spellTrap: any, index: number) => {
                          if (!spellTrap || spellTrap === null) return null;
                          const isSelected = selectedCardToDestroy?.player === 'opponent' && 
                                           selectedCardToDestroy?.type === 'spellTrap' && 
                                           selectedCardToDestroy?.zoneIndex === index;
                          return (
                            <motion.div
                              key={`opponent-spelltrap-${index}`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setSelectedCardToDestroy({ player: 'opponent', type: 'spellTrap', zoneIndex: index })}
                              className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? 'border-purple-400 shadow-lg shadow-purple-500/50'
                                  : 'border-purple-600/50 hover:border-purple-400'
                              }`}
                            >
                              <CardImage
                                card={spellTrap}
                                className="w-full h-32 object-cover"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-purple-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                                  <div className="bg-purple-400/95 text-black px-2 py-1 rounded-lg font-bold text-xs">
                                    Selecionado
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Botões */}
              <div className="flex justify-center gap-4 mt-6">
                <button
                  onClick={() => {
                    if (selectedDarkMonsterToBanish === null) {
                      // Fechar modal
                      setShowDarkArmedDragonEffectModal(false);
                      setDarkArmedDragonEffectData(null);
                      setSelectedDarkMonsterToBanish(null);
                      setSelectedCardToDestroy(null);
                    } else if (selectedCardToDestroy === null) {
                      // Voltar para seleção de monstro Dark
                      setSelectedDarkMonsterToBanish(null);
                    } else {
                      // Voltar para seleção de carta
                      setSelectedCardToDestroy(null);
                    }
                  }}
                  className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                >
                  {selectedDarkMonsterToBanish === null ? 'Cancelar' : selectedCardToDestroy === null ? 'Voltar' : 'Voltar'}
                </button>
                {selectedDarkMonsterToBanish !== null && (
                  <button
                    onClick={() => {
                      if (selectedCardToDestroy === null) {
                        // Avançar para seleção de carta
                        // Não fazer nada, apenas deixar o usuário selecionar
                      } else if (duelId && user?.id && darkArmedDragonEffectData) {
                        // Confirmar efeito
                        const darkMonster = darkArmedDragonEffectData.darkMonsters[selectedDarkMonsterToBanish];
                        // Usar o graveyardIndex do monstro (calculado no backend) ou encontrar no cemitério atual
                        let graveyardIndex = darkMonster?.graveyardIndex;
                        if (graveyardIndex === undefined || graveyardIndex === null) {
                          // Se não tiver graveyardIndex, encontrar no cemitério atual
                          const monsterId = darkMonster?.idCarta || darkMonster?.id || darkMonster?.cardId;
                          const monsterInstanceId = darkMonster?.instanceId;
                          graveyardIndex = myGraveyard.findIndex((c: any) => {
                            if (monsterInstanceId && c.instanceId) {
                              return c.instanceId === monsterInstanceId;
                            }
                            const cId = c.idCarta || c.id || c.cardId;
                            return cId === monsterId || String(cId) === String(monsterId);
                          });
                        }
                        
                        if (graveyardIndex === -1) {
                          alert('Monstro não encontrado no cemitério');
                          return;
                        }
                        
                        performAction(duelId, user.id, 'DARK_ARMED_DRAGON_EFFECT_CHOICE', {
                          monsterZoneIndex: darkArmedDragonEffectData.monsterZoneIndex,
                          darkGraveyardIndex: graveyardIndex,
                          targetPlayer: selectedCardToDestroy.player,
                          targetType: selectedCardToDestroy.type,
                          targetZoneIndex: selectedCardToDestroy.zoneIndex,
                        });
                        
                        // Resetar estados
                        setShowDarkArmedDragonEffectModal(false);
                        setDarkArmedDragonEffectData(null);
                        setSelectedDarkMonsterToBanish(null);
                        setSelectedCardToDestroy(null);
                      }
                    }}
                    disabled={selectedCardToDestroy === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                      selectedCardToDestroy !== null
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedCardToDestroy === null
                      ? 'Continuar'
                      : '💀 Banir e Destruir'}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Informações da Carta */}
      <AnimatePresence>
        {selectedCardInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={() => setSelectedCardInfo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-yellow-500/50 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6 border-b-2 border-yellow-500/30 pb-4">
                  <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                    📋 Informações da Carta
                  </h2>
                  <button
                    onClick={() => setSelectedCardInfo(null)}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex flex-col lg:flex-row gap-6">
                  {/* Imagem da Carta - Tamanho Correto */}
                  <div className="flex justify-center lg:justify-start flex-shrink-0">
                    <div className="w-[280px] h-[400px] rounded-xl shadow-2xl border-2 border-yellow-500/30 overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
                      <CardImage
                        card={selectedCardInfo}
                        className="w-full h-full"
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                        fallback="/images/fundoCarta.webp"
                      />
                    </div>
                  </div>

                  {/* Informações da Carta */}
                  <div className="flex-1 space-y-4 overflow-y-auto max-h-[500px] pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent' }}>
                    <div>
                      <h3 className="text-3xl font-bold text-yellow-400 mb-2">
                        {selectedCardInfo.name || 'Nome não disponível'}
                      </h3>
                      {selectedCardInfo.clanTag && (
                        <p className="text-lg text-purple-400 mb-2">
                          |{selectedCardInfo.clanTag}|
                        </p>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Tipo da Carta */}
                      <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                        <span className="text-gray-400 font-semibold">Tipo: </span>
                        <span className="text-white font-bold text-lg">
                          {selectedCardInfo.type || selectedCardInfo.cardType || 'Desconhecido'}
                        </span>
                      </div>

                      {/* ATK e DEF (se for monstro) */}
                      {(selectedCardInfo.type === 'Monster' || selectedCardInfo.cardType === 'Monster') && (
                        <div className="grid grid-cols-2 gap-3">
                          {selectedCardInfo.atk !== undefined && (
                            <div className="bg-gradient-to-br from-red-900/30 to-red-800/20 p-3 rounded-lg border-2 border-red-500/50">
                              <span className="text-red-300 text-sm font-semibold block">⚔️ ATK</span>
                              <span className="text-red-400 font-bold text-2xl">{selectedCardInfo.atk || 0}</span>
                            </div>
                          )}
                          {selectedCardInfo.def !== undefined && (
                            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 p-3 rounded-lg border-2 border-blue-500/50">
                              <span className="text-blue-300 text-sm font-semibold block">🛡️ DEF</span>
                              <span className="text-blue-400 font-bold text-2xl">{selectedCardInfo.def || 0}</span>
                            </div>
                          )}
                          {selectedCardInfo.level !== undefined && (
                            <div className="bg-gradient-to-br from-yellow-900/30 to-yellow-800/20 p-3 rounded-lg border-2 border-yellow-500/50">
                              <span className="text-yellow-300 text-sm font-semibold block">⭐ Nível</span>
                              <span className="text-yellow-400 font-bold text-2xl">{selectedCardInfo.level || 0}</span>
                            </div>
                          )}
                          {selectedCardInfo.attribute && (
                            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 p-3 rounded-lg border-2 border-purple-500/50">
                              <span className="text-purple-300 text-sm font-semibold block">🌟 Atributo</span>
                              <span className="text-white font-bold text-lg">{selectedCardInfo.attribute}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Descrição/Efeito da Carta */}
                      <div className="mt-4">
                        <span className="text-yellow-400 font-bold text-lg block mb-2">
                          📜 {selectedCardInfo.type === 'Monster' || selectedCardInfo.cardType === 'Monster' ? 'Efeito' : 'Descrição'}:
                        </span>
                        <p className="text-gray-200 bg-gradient-to-br from-gray-800/80 to-gray-900/80 p-4 rounded-lg border-2 border-yellow-500/30 leading-relaxed text-sm whitespace-pre-wrap">
                          {selectedCardInfo.description || selectedCardInfo.effect || selectedCardInfo.desc || 'Sem descrição disponível.'}
                        </p>
                      </div>

                      {/* ID da Carta */}
                      <div className="mt-6 pt-4 border-t border-gray-700">
                        <span className="text-gray-500 text-xs font-semibold">CARD ID: </span>
                        <span className="text-gray-400 text-xs font-mono">
                          {selectedCardInfo.idCarta || selectedCardInfo.id || selectedCardInfo.cardId || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Seleção de Tributos */}
      <TributeSelectionModal
        isOpen={showTributeModal}
        onClose={() => {
          setShowTributeModal(false);
          setTributeModalData(null);
        }}
        onConfirm={async (selectedTributes) => {
          if (!tributeModalData || !duelId || !user?.id) return;
          
          const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
          if (emptyZoneIndex === -1) {
            alert('Todas as zonas de monstro estão ocupadas!');
            setShowTributeModal(false);
            setTributeModalData(null);
            return;
          }
          
          // Atualizar estado local imediatamente para que os botões fiquem desabilitados
          setNormalSummonUsed(true);
          
          // Acionar animação antes de invocar com tributos
          await triggerCardPlacementAnimation(tributeModalData.card, emptyZoneIndex, true);
          
          // Invocar com tributos
          performAction(duelId, user.id, 'SUMMON_MONSTER', {
            cardId: tributeModalData.card.id || tributeModalData.card.cardId || tributeModalData.card.idCarta,
            cardName: tributeModalData.card.name,
            zoneIndex: emptyZoneIndex,
            position: tributeModalData.position,
            tributeZoneIndices: selectedTributes, // Índices dos monstros a serem tributados
          });
          
          setZoomedCard(null);
          setShowTributeModal(false);
          setTributeModalData(null);
        }}
        monsters={myMonsters}
        requiredTributes={tributeModalData?.requiredTributes || 0}
        summoningCard={tributeModalData?.card || null}
        position={tributeModalData?.position || 'attack'}
      />

      {/* Modal de Invocação Especial do Red-Eyes Darkness Metal Dragon */}
      <AnimatePresence>
        {showRedEyesDarknessMetalDragonModal && redEyesDarknessMetalDragonData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher o dragão
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-red-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                      🐉 Red-Eyes Darkness Metal Dragon - Invocação Especial
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Escolha 1 monstro do Tipo Dragão face-up que você controla para banir
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowRedEyesDarknessMetalDragonModal(false);
                      setRedEyesDarknessMetalDragonData(null);
                      setSelectedDragonToBanish(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Monstros Dragão disponíveis */}
                {redEyesDarknessMetalDragonData.dragonMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-red-400 mb-4">🐉 Monstros Dragão no Campo</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {redEyesDarknessMetalDragonData.dragonMonsters.map((monster: any, index: number) => {
                        const isSelected = selectedDragonToBanish === index;
                        return (
                          <motion.div
                            key={`dragon-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDragonToBanish(index);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-red-400 ring-4 ring-red-400/50 shadow-lg shadow-red-500/50'
                                : 'border-gray-600 hover:border-red-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros do Tipo Dragão face-up no campo</p>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowRedEyesDarknessMetalDragonModal(false);
                      setRedEyesDarknessMetalDragonData(null);
                      setSelectedDragonToBanish(null);
                    }}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedDragonToBanish === null || !redEyesDarknessMetalDragonData || !duelId || !user?.id) return;
                      
                      const selectedDragon = redEyesDarknessMetalDragonData.dragonMonsters[selectedDragonToBanish];
                      if (!selectedDragon) return;
                      
                      const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                      if (emptyZoneIndex === -1) {
                        alert('Todas as zonas de monstro estão ocupadas!');
                        return;
                      }
                      
                      // Fechar modal de seleção de dragão
                      setShowRedEyesDarknessMetalDragonModal(false);
                      
                      // Sempre invocar em ataque
                      const position = 'attack';
                      
                      console.log(`🎯 [Red-Eyes Darkness Metal Dragon Modal] Confirmando invocação - Banindo dragão (índice ${selectedDragon.zoneIndex}), posição: ${position}`);
                      
                      // Enviar ação de invocação especial
                      performAction(duelId, user.id, 'RED_EYES_DARKNESS_METAL_DRAGON_SUMMON_CHOICE', {
                        cardId: redEyesDarknessMetalDragonData.cardId,
                        dragonZoneIndex: selectedDragon.zoneIndex,
                        zoneIndex: emptyZoneIndex,
                        position,
                      });
                      
                      setRedEyesDarknessMetalDragonData(null);
                      setSelectedDragonToBanish(null);
                    }}
                    disabled={selectedDragonToBanish === null}
                    className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                      selectedDragonToBanish !== null
                        ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedDragonToBanish !== null ? '✅ Confirmar Invocação' : 'Selecione um Dragão'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Efeito do Red-Eyes Darkness Metal Dragon */}
      <AnimatePresence>
        {showRedEyesDarknessMetalDragonEffectModal && redEyesDarknessMetalDragonEffectData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher o dragão
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-red-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
                      🐉 Red-Eyes Darkness Metal Dragon - Efeito
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Uma vez por turno: invoque por invocação especial 1 monstro do Tipo Dragão da sua mão ou Cemitério (exceto Red-Eyes Darkness Metal Dragon)
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowRedEyesDarknessMetalDragonEffectModal(false);
                      setRedEyesDarknessMetalDragonEffectData(null);
                      setSelectedDragonSource(null);
                      setSelectedDragonIndex(null);
                      setSelectedDragonId(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Dragões na mão */}
                {redEyesDarknessMetalDragonEffectData.dragonsInHand.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-blue-400 mb-4">🃏 Dragões na Mão ({redEyesDarknessMetalDragonEffectData.dragonsInHand.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {redEyesDarknessMetalDragonEffectData.dragonsInHand.map((dragon: any, index: number) => {
                        const dragonId = `hand-${index}`;
                        const isSelected = selectedDragonId === dragonId;
                        return (
                          <motion.div
                            key={`hand-dragon-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDragonId(dragonId);
                              setSelectedDragonSource('hand');
                              setSelectedDragonIndex(index);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-blue-400 ring-4 ring-blue-400/50 shadow-lg shadow-blue-500/50'
                                : 'border-gray-600 hover:border-blue-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={dragon}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 bg-blue-600/80 text-white text-xs font-bold px-2 py-1 rounded">
                              Mão
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Dragões no cemitério */}
                {redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-purple-400 mb-4">⚰️ Dragões no Cemitério ({redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.map((dragon: any, index: number) => {
                        const dragonId = `graveyard-${index}`;
                        const isSelected = selectedDragonId === dragonId;
                        return (
                          <motion.div
                            key={`gy-dragon-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedDragonId(dragonId);
                              setSelectedDragonSource('graveyard');
                              setSelectedDragonIndex(index);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 ring-4 ring-purple-400/50 shadow-lg shadow-purple-500/50'
                                : 'border-gray-600 hover:border-purple-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={dragon}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 bg-purple-600/80 text-white text-xs font-bold px-2 py-1 rounded">
                              Cemitério
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mensagem se não houver dragões */}
                {redEyesDarknessMetalDragonEffectData.dragonsInHand.length === 0 && redEyesDarknessMetalDragonEffectData.dragonsInGraveyard.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros do Tipo Dragão na sua mão ou cemitério (exceto Red-Eyes Darkness Metal Dragon)</p>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        // Cancelar ativação da carta no backend
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowRedEyesDarknessMetalDragonEffectModal(false);
                      setRedEyesDarknessMetalDragonEffectData(null);
                      setSelectedDragonSource(null);
                      setSelectedDragonIndex(null);
                      setSelectedDragonId(null);
                    }}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedDragonSource === null || selectedDragonIndex === null || !redEyesDarknessMetalDragonEffectData || !duelId || !user?.id) return;
                      
                      const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                      if (emptyZoneIndex === -1) {
                        alert('Todas as zonas de monstro estão ocupadas!');
                        return;
                      }
                      
                      // Enviar ação de efeito
                      performAction(duelId, user.id, 'RED_EYES_DARKNESS_METAL_DRAGON_EFFECT_CHOICE', {
                        monsterZoneIndex: redEyesDarknessMetalDragonEffectData.monsterZoneIndex,
                        source: selectedDragonSource,
                        cardIndex: selectedDragonSource === 'hand' 
                          ? redEyesDarknessMetalDragonEffectData.dragonsInHand[selectedDragonIndex]?.handIndex
                          : redEyesDarknessMetalDragonEffectData.dragonsInGraveyard[selectedDragonIndex]?.graveyardIndex,
                        zoneIndex: emptyZoneIndex,
                        position: 'attack',
                      });
                      
                      setShowRedEyesDarknessMetalDragonEffectModal(false);
                      setRedEyesDarknessMetalDragonEffectData(null);
                      setSelectedDragonSource(null);
                      setSelectedDragonIndex(null);
                      setSelectedDragonId(null);
                    }}
                    disabled={selectedDragonSource === null || selectedDragonIndex === null}
                    className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                      selectedDragonSource !== null && selectedDragonIndex !== null
                        ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedDragonSource !== null && selectedDragonIndex !== null ? '✅ Confirmar Invocação (Ataque)' : 'Selecione um Dragão'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Cyber-Stein */}
      <AnimatePresence>
        {showCyberSteinModal && cyberSteinData && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md"
            onClick={(e) => {
              // Não fechar ao clicar fora - precisa escolher um monstro
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border-2 border-cyan-500/50"
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                      ⚡ Cyber-Stein - Efeito
                    </h2>
                    <p className="text-gray-300 mt-2">
                      Pague 5000 LP; invoque por invocação especial 1 monstro do seu Extra Deck em modo de ataque
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowCyberSteinModal(false);
                      setCyberSteinData(null);
                      setSelectedCyberSteinMonster(null);
                    }}
                    className="text-gray-400 hover:text-red-400 text-4xl font-bold transition-colors hover:scale-110 transform"
                  >
                    ✕
                  </button>
                </div>

                {/* Monstros do Extra Deck */}
                {cyberSteinData.extraDeckMonsters.length > 0 ? (
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-cyan-400 mb-4">📦 Monstros do Extra Deck ({cyberSteinData.extraDeckMonsters.length})</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {cyberSteinData.extraDeckMonsters.map((monster: any, index: number) => {
                        const extraDeckIndex = monster.extraDeckIndex !== undefined ? monster.extraDeckIndex : index;
                        const isSelected = selectedCyberSteinMonster === extraDeckIndex;
                        return (
                          <motion.div
                            key={`extra-deck-monster-${index}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setSelectedCyberSteinMonster(extraDeckIndex);
                            }}
                            className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-cyan-400 ring-4 ring-cyan-400/50 shadow-lg shadow-cyan-500/50'
                                : 'border-gray-600 hover:border-cyan-500/50'
                            }`}
                            style={{ width: '120px', height: '175px' }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-cyan-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ✓
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p className="text-lg">Não há monstros no seu Extra Deck para invocar</p>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowCyberSteinModal(false);
                      setCyberSteinData(null);
                      setSelectedCyberSteinMonster(null);
                    }}
                    className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedCyberSteinMonster !== null && cyberSteinData && duelId && user?.id) {
                        const emptyZoneIndex = myMonsters.findIndex(m => m === null || m === undefined);
                        if (emptyZoneIndex === -1) {
                          alert('Todas as zonas de monstro estão ocupadas!');
                          return;
                        }
                        
                        performAction(duelId, user.id, 'CYBER_STEIN_EFFECT_CHOICE', {
                          monsterZoneIndex: cyberSteinData.monsterZoneIndex,
                          extraDeckIndex: selectedCyberSteinMonster,
                        });
                        
                        setShowCyberSteinModal(false);
                        setCyberSteinData(null);
                        setSelectedCyberSteinMonster(null);
                      }
                    }}
                    disabled={selectedCyberSteinMonster === null}
                    className={`px-6 py-3 rounded-lg font-bold transition-colors ${
                      selectedCyberSteinMonster !== null
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white cursor-pointer'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedCyberSteinMonster !== null ? '⚡ Confirmar (Pagar 5000 LP)' : 'Selecione um Monstro'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal do Reinforcement Of The Army */}
      <AnimatePresence>
        {showReinforcementOfTheArmyModal && reinforcementOfTheArmyData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowReinforcementOfTheArmyModal(false);
                setReinforcementOfTheArmyData(null);
                setSelectedReinforcementOfTheArmyMonster(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-yellow-900/95 to-orange-900/95 border-2 border-yellow-400/70 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Reinforcement Of The Army
                </h2>
                <p className="text-yellow-200 text-sm">
                  Selecione 1 monstro Warrior de Level 4 ou menos do seu deck para adicionar à sua mão
                </p>
              </div>

              {reinforcementOfTheArmyData.warriorMonsters.length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Monstros Warrior de Level 4 ou menos no Deck:</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {reinforcementOfTheArmyData.warriorMonsters.map((monster: any, index: number) => {
                      const isSelected = selectedReinforcementOfTheArmyMonster === monster.deckIndex;
                      return (
                        <motion.div
                          key={index}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setSelectedReinforcementOfTheArmyMonster(monster.deckIndex)}
                          className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                            isSelected
                              ? 'border-yellow-400 shadow-lg shadow-yellow-500/50'
                              : 'border-yellow-600/50 hover:border-yellow-400'
                          }`}
                          style={{ width: '120px', height: '175px' }}
                        >
                          <CardImage
                            card={monster}
                            className="w-full h-full object-cover"
                            fallback="/images/fundoCarta.webp"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-yellow-400/30 flex items-center justify-center pointer-events-none rounded-xl">
                              <div className="bg-yellow-400/95 text-black px-3 py-1.5 rounded-lg font-bold text-sm">
                                Selecionado
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-1 left-1 right-1 text-center pointer-events-none">
                            <p className="text-white text-xs font-semibold bg-black/70 px-2 py-1 rounded truncate">
                              {monster.name || monster.cardName || 'Monstro'}
                            </p>
                          </div>
                          <div className="absolute top-1 left-1 pointer-events-none">
                            <div className="bg-yellow-500/90 text-black text-xs px-2 py-1 rounded font-bold">
                              Lv.{monster.level || monster.cardLevel || '?'}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">Não há monstros Warrior de Level 4 ou menos no seu deck</p>
                  <button
                    onClick={() => {
                      setShowReinforcementOfTheArmyModal(false);
                      setReinforcementOfTheArmyData(null);
                      setSelectedReinforcementOfTheArmyMonster(null);
                    }}
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Botões */}
              {reinforcementOfTheArmyData.warriorMonsters.length > 0 ? (
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowReinforcementOfTheArmyModal(false);
                      setReinforcementOfTheArmyData(null);
                      setSelectedReinforcementOfTheArmyMonster(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedReinforcementOfTheArmyMonster !== null && duelId && user?.id) {
                        console.log('✨ [ReinforcementOfTheArmy] Enviando escolha:', selectedReinforcementOfTheArmyMonster);
                        performAction(duelId, user.id, 'REINFORCEMENT_OF_THE_ARMY_CHOICE', {
                          deckIndex: selectedReinforcementOfTheArmyMonster,
                        });
                        
                        // Resetar estados
                        setShowReinforcementOfTheArmyModal(false);
                        setReinforcementOfTheArmyData(null);
                        setSelectedReinforcementOfTheArmyMonster(null);
                      }
                    }}
                    disabled={selectedReinforcementOfTheArmyMonster === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                      selectedReinforcementOfTheArmyMonster !== null
                        ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedReinforcementOfTheArmyMonster !== null 
                      ? '⚔️ Adicionar à Mão' 
                      : 'Selecione um monstro'}
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
        
        {/* Modal Last Will */}
        {showLastWillModal && lastWillData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowLastWillModal(false);
                setLastWillData(null);
                setSelectedLastWillMonster(null);
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border-2 border-purple-500/50 rounded-xl shadow-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4 text-center">
                Last Will - Selecione um Monstro com ATK ≤ 1500
              </h2>
              <p className="text-gray-300 text-center mb-6">
                Escolha um monstro do seu deck com ATK de 1500 ou menos para invocar por invocação especial no primeiro slot disponível
              </p>

              {/* Lista de Monstros */}
              {lastWillData.eligibleMonsters.length > 0 ? (
                <div>
                  <h3 className="text-lg font-bold text-white mb-3 text-center">Monstros Disponíveis:</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-96 overflow-y-auto">
                    {lastWillData.eligibleMonsters.map((monster: any, index: number) => {
                      const isSelected = selectedLastWillMonster === monster.deckIndex;
                      return (
                        <motion.div
                          key={monster.deckIndex || index}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setSelectedLastWillMonster(monster.deckIndex);
                          }}
                          className={`cursor-pointer rounded-lg border-2 p-2 transition-all ${
                            isSelected
                              ? 'border-yellow-500 bg-yellow-500/20 shadow-lg shadow-yellow-500/50'
                              : 'border-gray-600 bg-gray-800/50 hover:border-gray-400'
                          }`}
                        >
                          <CardImage
                            card={monster}
                            className="w-full aspect-[2/3] object-cover rounded"
                          />
                          <div className="mt-2 text-center">
                            <p className="text-white text-xs font-bold truncate">
                              {monster.name || monster.cardName}
                            </p>
                            <p className="text-yellow-400 text-xs">
                              ATK: {monster.atk || monster.cardAtk || 0}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-lg">Não há monstros com ATK ≤ 1500 no seu deck</p>
                  <button
                    onClick={() => {
                      setShowLastWillModal(false);
                      setLastWillData(null);
                      setSelectedLastWillMonster(null);
                    }}
                    className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-bold transition-colors text-sm"
                  >
                    Fechar
                  </button>
                </div>
              )}

              {/* Botões */}
              {lastWillData.eligibleMonsters.length > 0 ? (
                <div className="flex justify-center gap-4 mt-6">
                  <button
                    onClick={() => {
                      if (duelId && user?.id) {
                        performAction(duelId, user.id, 'CANCEL_CARD_ACTIVATION', {});
                      }
                      setShowLastWillModal(false);
                      setLastWillData(null);
                      setSelectedLastWillMonster(null);
                    }}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (selectedLastWillMonster !== null && duelId && user?.id) {
                        // Encontrar o primeiro slot vazio automaticamente
                        const firstEmptyZone = myMonsters.findIndex((monster: any) => monster === null || monster === undefined);
                        
                        if (firstEmptyZone === -1) {
                          alert('Não há slots disponíveis para invocar o monstro');
                          return;
                        }
                        
                        console.log('✨ [LastWill] Enviando escolha:', { deckIndex: selectedLastWillMonster, zoneIndex: firstEmptyZone });
                        performAction(duelId, user.id, 'LAST_WILL_CHOICE', {
                          deckIndex: selectedLastWillMonster,
                          zoneIndex: firstEmptyZone,
                        });
                        
                        // Resetar estados
                        setShowLastWillModal(false);
                        setLastWillData(null);
                        setSelectedLastWillMonster(null);
                      }
                    }}
                    disabled={selectedLastWillMonster === null}
                    className={`px-8 py-3 rounded-lg font-bold transition-colors text-sm ${
                      selectedLastWillMonster !== null
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {selectedLastWillMonster !== null
                      ? '✨ Invocar por Invocação Especial' 
                      : 'Selecione um monstro'}
                  </button>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DuelArena;
