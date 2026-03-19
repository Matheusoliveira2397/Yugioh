import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getCardImage } from '../../utils/cardImage';
import { getDefaultSkinCardImageUrl } from '../../utils/imageUrl';
import CardImage from '../CardImage';

interface DuelFieldProps {
  isOpponent: boolean;
  deckCount?: number;
  handCount?: number;
  monsters?: (any | null)[]; // Array de 5 posições para os monstros no campo
  spellTraps?: (any | null)[]; // Array de 5 posições para spell/trap no campo
  graveyard?: any[]; // Array de cartas no cemitério
  extraDeck?: any[]; // Array de cartas do extra deck
  playmatImage?: string;
  cardBackImage?: string;
  onGraveyardClick?: () => void; // Callback quando clicar no cemitério
  onExtraDeckClick?: () => void; // Callback quando clicar no extra deck
  onMonsterClick?: (zoneIndex: number) => void; // Callback quando clicar em um monstro (para ataque)
  isSelectingTarget?: boolean; // Se está selecionando alvo de ataque
  onAttackClick?: (zoneIndex: number) => void; // Callback quando clicar no botão de ataque
  canAttack?: boolean; // Se pode atacar (está na Battle Phase e é o turno do jogador)
  onSpellTrapSlotClick?: (zoneIndex: number) => void; // Callback quando clicar em um slot de spell/trap
  isSelectingSpellTrapSlot?: boolean; // Se está selecionando um slot de spell/trap
  isSelectingSpellTrapTarget?: boolean; // Se está selecionando alvo de spell/trap (ex: Mystical Space Typhoon)
  isSelectingMonsterTarget?: boolean; // Se está selecionando alvo de monstro (ex: SnowmanEater)
  onCardClick?: (card: any, zoneIndex?: number) => void; // Callback quando clicar em uma carta no campo
  onActivateCard?: (card: any, zoneIndex: number) => void; // Callback para ativar carta no campo
  onChangePosition?: (zoneIndex: number, newPosition: 'attack' | 'defense') => void; // Callback para mudar posição do monstro
  onBreakerRemoveCounter?: (monsterZoneIndex: number) => void; // Callback para remover marcador do Breaker
  isMyTurn?: boolean; // Se é o turno do jogador
  currentPhase?: string; // Fase atual do duelo
  currentTurn?: number; // Turno atual do duelo
  turnCounter?: number; // Contador global de turnos (para comparar com summonedTurnNumber)
  positionChangedThisTurn?: boolean; // Se já mudou a posição de algum monstro neste turno
  onMonsterDrop?: (attackerZoneIndex: number, targetZoneIndex: number | null) => void; // Callback quando soltar monstro para atacar
  onSpellTrapDrop?: (card: any, zoneIndex: number, position: 'set' | 'face-up') => void; // Callback quando soltar spell/trap da mão
  onMonsterFromHandDrop?: (card: any, zoneIndex: number, position: 'attack' | 'defense' | 'set') => void; // Callback quando soltar monstro da mão em zona vazia
  onEquipSpellDrop?: (card: any, monsterZoneIndex: number, spellTrapZoneIndex?: number) => void; // Callback quando soltar spell equip em um monstro (spellTrapZoneIndex se vier do campo)
  onActivateMonsterEffect?: (monsterZoneIndex: number) => void; // Callback para ativar efeito de monstro (ex: ChaosSorcerer)
  monsterDestroyedThisTurn?: boolean; // Flag para Last Will - indica se um monstro foi destruído neste turno
  disabled?: boolean; // Modo somente leitura (ex: espectador) — desativa todas as ações
  /** Bônus de ATK da Banner of Courage durante a Fase de Batalha (0 ou 200) - para exibir no ATK e no cálculo de dano */
  bannerOfCourageBonus?: number;
}

const DuelField: React.FC<DuelFieldProps> = ({
  isOpponent,
  deckCount = 40,
  handCount = 0,
  monsters = Array(5).fill(null),
  spellTraps = Array(5).fill(null),
  graveyard = [],
  extraDeck = [],
  playmatImage,
  cardBackImage,
  onGraveyardClick,
  onExtraDeckClick,
  onMonsterClick,
  isSelectingTarget = false,
  onAttackClick,
  canAttack = false,
  onSpellTrapSlotClick,
  isSelectingSpellTrapSlot = false,
  isSelectingSpellTrapTarget = false,
  isSelectingMonsterTarget = false,
  onCardClick,
  onActivateCard,
  onChangePosition,
  onBreakerRemoveCounter,
  isMyTurn = false,
  currentPhase = 'MAIN1',
  currentTurn = 1,
  turnCounter = 1,
  positionChangedThisTurn = false,
  onMonsterDrop,
  onSpellTrapDrop,
  onMonsterFromHandDrop,
  onEquipSpellDrop,
  onActivateMonsterEffect,
  monsterDestroyedThisTurn = false,
  disabled = false,
  bannerOfCourageBonus = 0,
}) => {
  const safeOnGraveyardClick = disabled ? undefined : onGraveyardClick;
  const safeOnExtraDeckClick = disabled ? undefined : onExtraDeckClick;
  const safeOnMonsterClick = disabled ? undefined : onMonsterClick;
  const safeOnAttackClick = disabled ? undefined : onAttackClick;
  const safeOnSpellTrapSlotClick = disabled ? undefined : onSpellTrapSlotClick;
  const safeOnCardClick = disabled ? undefined : onCardClick;
  const safeOnActivateCard = disabled ? undefined : onActivateCard;
  const safeOnChangePosition = disabled ? undefined : onChangePosition;
  const safeOnBreakerRemoveCounter = disabled ? undefined : onBreakerRemoveCounter;
  const safeOnMonsterDrop = disabled ? undefined : onMonsterDrop;
  const safeOnSpellTrapDrop = disabled ? undefined : onSpellTrapDrop;
  const safeOnMonsterFromHandDrop = disabled ? undefined : onMonsterFromHandDrop;
  const safeOnEquipSpellDrop = disabled ? undefined : onEquipSpellDrop;
  const safeOnActivateMonsterEffect = disabled ? undefined : onActivateMonsterEffect;

  // 5 Zones para monstros e spell/trap
  const monsterZones = Array(5).fill(null);
  const spellTrapZones = Array(5).fill(null);

  // Cada jogador tem sua imagem de campo (ou playmat equipado)
  const defaultFieldImage = isOpponent 
    ? '/images/CampoDeDuelo01.jpg' 
    : '/images/CampoDeDuelo02.jpg';
  // Fallback em níveis: 1) sleeve equipada, 2) SkinDefault (API), 3) fundoCarta (local, sempre existe)
  const FUNDO_CARTA_LOCAL = '/images/fundoCarta.webp';
  const defaultSkinCardUrl = getDefaultSkinCardImageUrl();

  const [cardBackLoadError, setCardBackLoadError] = useState(false);
  const [defaultSkinLoadError, setDefaultSkinLoadError] = useState(false);

  const fallbackCard =
    (cardBackImage && !cardBackLoadError)
      ? cardBackImage
      : defaultSkinLoadError
        ? FUNDO_CARTA_LOCAL
        : defaultSkinCardUrl;

  React.useEffect(() => {
    setCardBackLoadError(false);
    setDefaultSkinLoadError(false);
  }, [cardBackImage]);

  // Pré-carregar sleeve equipada; se falhar, usaremos SkinDefault
  React.useEffect(() => {
    if (!cardBackImage) return;
    const img = new Image();
    img.onerror = () => setCardBackLoadError(true);
    img.src = cardBackImage;
  }, [cardBackImage]);

  // Se estamos usando SkinDefault e ela também falhar (ex.: API sem uploads), usar fundoCarta local
  React.useEffect(() => {
    if (cardBackImage && !cardBackLoadError) return;
    if (defaultSkinCardUrl === FUNDO_CARTA_LOCAL) return;
    const img = new Image();
    img.onerror = () => setDefaultSkinLoadError(true);
    img.src = defaultSkinCardUrl;
  }, [cardBackImage, cardBackLoadError, defaultSkinCardUrl]);

  // Verificar se pode fazer ataque direto (nenhum monstro no campo do oponente)
  const canDirectAttack = isOpponent && monsters.every((m: any) => m === null || m === undefined);
  
  // Estado para rastrear qual carta está sendo arrastada e posição do cursor
  const [draggingCardIndex, setDraggingCardIndex] = useState<number | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [draggingCard, setDraggingCard] = useState<any | null>(null);

  // Handler para rastrear movimento do mouse durante drag
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingCardIndex !== null) {
        setDragPosition({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = () => {
      if (draggingCardIndex !== null) {
        setDraggingCardIndex(null);
        setDragPosition(null);
        setDraggingCard(null);
      }
    };

    if (draggingCardIndex !== null) {
      // Usar capture e passive para melhor performance
      document.addEventListener('mousemove', handleMouseMove, { passive: true, capture: true });
      document.addEventListener('mouseup', handleMouseUp, { capture: true });
      // Também rastrear durante drag
      document.addEventListener('dragover', handleMouseMove, { passive: true, capture: true });
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, { capture: true });
      document.removeEventListener('mouseup', handleMouseUp, { capture: true });
      document.removeEventListener('dragover', handleMouseMove, { capture: true });
    };
  }, [draggingCardIndex]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="relative aspect-[21/9] w-full max-w-[min(1280px,92vw)] mx-auto rounded-2xl border-2 border-white shadow-2xl mb-1 flex items-center justify-center"
      style={{ overflow: 'visible' }}
      onDragOver={(e) => {
        // Permitir drop apenas no playmat do oponente para ataque direto
        if (isOpponent && canDirectAttack && safeOnMonsterDrop) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
        } else if (!isOpponent) {
          // Prevenir drop no próprio campo
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'none';
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Ataque direto no playmat do oponente
        if (isOpponent && canDirectAttack && safeOnMonsterDrop) {
          const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
          if (!isNaN(attackerZoneIndex)) {
            safeOnMonsterDrop(attackerZoneIndex, null);
          }
        }
        setDraggingCardIndex(null);
        setDragPosition(null);
        setDraggingCard(null);
      }}
    >
      {/* Carta sendo arrastada que segue o cursor */}
      {draggingCardIndex !== null && dragPosition && draggingCard && (
        <div
          className="fixed pointer-events-none z-[9999]"
          style={{
            left: `${dragPosition.x - 40}px`,
            top: `${dragPosition.y - 58}px`,
            width: '80px',
            height: '117px',
            transform: 'scale(1.15) rotate(8deg)',
            transition: 'none',
            willChange: 'transform',
          }}
        >
          <CardImage
            card={draggingCard}
            className="w-full h-full rounded-md"
            style={{
              filter: 'drop-shadow(0 15px 40px rgba(0,0,0,0.9)) brightness(1.1)',
              border: '3px solid rgba(255, 255, 255, 0.5)',
            }}
            fallback={fallbackCard}
          />
        </div>
      )}
      {/* Wrapper que rotaciona TODO o campo do oponente (playmat + zonas) */}
      <div className={`relative w-full h-full ${isOpponent ? 'transform rotate-180' : ''}`}>
        {/* Camada 1: fundo padrão (sempre visível; fica visível se o playmat customizado falhar) */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${defaultFieldImage})`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        {/* Camada 2: playmat do jogador (em produção pode 404; onError deixa o padrão aparecer) */}
        {playmatImage && (
          <img
            src={playmatImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectFit: 'cover' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}

        {/* Zonas do Campo: mais espaço entre slots para cartas em defesa não ficarem coladas */}
        <div className="relative px-6 pt-2 pb-0" style={{ overflow: 'visible' }}>
      {/* Linha 1: todos os slots 80px (mesmo tamanho da carta do campo e da mão) */}
      <div className="grid gap-6 mt-3 justify-items-center" style={{ gridTemplateColumns: 'repeat(7, 80px)' }}>
        {/* Field Zone */}
        <motion.div 
          className="zone-card border-2 border-white rounded-lg w-[80px] h-[117px] transition-all cursor-pointer flex items-center justify-center bg-transparent overflow-visible"
          style={{ aspectRatio: '59/86' }}>
          <div className="flex items-center justify-center min-h-0 py-1">
            <span className="text-yellow-300 text-xs font-bold drop-shadow-lg leading-tight">
              FIELD
            </span>
          </div>
        </motion.div>

        {/* 5 Monster Zones - Modernizado */}
        {monsterZones.map((_, index) => {
          const monster = monsters[index];
          const isDefense = monster && (monster.position === 'defense' || monster.position === 'set');
          const isAttack = monster && monster.position === 'attack';
          const hasMonster = monster !== null && monster !== undefined;
          
          return (
            <div
              key={`monster-${index}`}
              data-monster-zone={index}
              className="relative"
              style={{
                position: 'relative',
                zIndex: isDefense ? 30 : 1,
              }}
            >
              {/* Slot (sempre visível, mas sem borda quando há carta em defesa) */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onDragOver={(e) => {
                  if (isOpponent && safeOnMonsterDrop) {
                    // Ataque de monstro no oponente
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    e.currentTarget.classList.add('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                  } else if (!isOpponent && !hasMonster && safeOnMonsterFromHandDrop) {
                    // Permitir drop de carta da mão em zona vazia
                    // Verificar se tem dados JSON (carta da mão) - não podemos ler os dados no onDragOver, só verificar tipos
                    const hasCardData = e.dataTransfer.types.includes('application/json');
                    
                    // Se tem dados JSON, é uma carta da mão (monstro ou spell/trap)
                    if (hasCardData) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      e.currentTarget.classList.add('ring-4', 'ring-blue-400/70', 'bg-blue-400/20', 'scale-105');
                    }
                  } else if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense')) {
                    // Permitir drop de spell equip em monstro face-up do próprio campo
                    // Tentar verificar se é uma spell Equip sendo arrastada
                    let isEquipSpell = false;
                    try {
                      // Tentar ler os dados (pode não funcionar em todos os navegadores no onDragOver)
                      if (e.dataTransfer.types.includes('application/json')) {
                        const cardData = e.dataTransfer.getData('application/json');
                        if (cardData) {
                          const card = JSON.parse(cardData);
                          const cardType = card.type || card.cardType;
                          const spellType = card.spellType;
                          isEquipSpell = cardType === 'Spell' && spellType === 'Equip';
                        }
                      }
                    } catch (err) {
                      // Se não conseguir ler, assumir que pode ser spell equip e verificar no onDrop
                      // Permitir drop em qualquer caso se houver safeOnEquipSpellDrop
                    }
                    
                    // Permitir drop se for spell equip ou se tiver safeOnEquipSpellDrop (verificação completa no onDrop)
                    if (safeOnEquipSpellDrop) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      e.currentTarget.classList.add('ring-4', 'ring-green-400/70', 'bg-green-400/20', 'scale-105');
                      return;
                    }
                    // Prevenir drop se não tiver handler
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'none';
                  } else if (!isOpponent) {
                    // Prevenir drop no próprio campo (para outras situações)
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'none';
                  }
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105', 'ring-green-400/70', 'bg-green-400/20', 'ring-blue-400/70', 'bg-blue-400/20');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105', 'ring-green-400/70', 'bg-green-400/20');
                  
                  if (isOpponent && safeOnMonsterDrop) {
                    // Ataque de monstro no oponente (pode ser face-up ou face-down)
                    const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
                    if (!isNaN(attackerZoneIndex)) {
                      if (hasMonster) {
                        safeOnMonsterDrop(attackerZoneIndex, index);
                      } else {
                        const hasAnyMonster = monsters.some((m: any) => m !== null && m !== undefined);
                        if (!hasAnyMonster) {
                          safeOnMonsterDrop(attackerZoneIndex, null);
                        } else {
                          alert('Você não pode atacar diretamente enquanto o oponente tiver monstros no campo!');
                        }
                      }
                    }
                  } else if (!isOpponent && !hasMonster && safeOnMonsterFromHandDrop) {
                    // Zona de monstro vazia - verificar se é uma carta da mão sendo solta
                    const cardData = e.dataTransfer.getData('application/json');
                    const attackerZoneIndex = e.dataTransfer.getData('attackerZoneIndex');
                    
                    // Se não tem attackerZoneIndex, é uma carta da mão (não um monstro do campo)
                    if (!attackerZoneIndex && cardData) {
                      try {
                        const card = JSON.parse(cardData);
                        const cardType = card.type || card.cardType;
                        const isMonster = cardType === 'Monster';
                        
                        if (isMonster) {
                          safeOnMonsterFromHandDrop(card, index, 'attack');
                          setDraggingCardIndex(null);
                          setDragPosition(null);
                          setDraggingCard(null);
                          return;
                        }
                      } catch (err) {
                        console.error('❌ [DuelField] onDrop - erro ao parsear card da mão:', err);
                      }
                    }
                  } else if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense')) {
                    // Verificar se é uma spell equip sendo arrastada (da mão ou do campo)
                    const cardData = e.dataTransfer.getData('application/json');
                    const spellTrapZoneIndex = e.dataTransfer.getData('spellTrapZoneIndex');
                    const isFromField = spellTrapZoneIndex !== '';
                    
                    if (!safeOnEquipSpellDrop) {
                      console.error('❌ [DuelField] onDrop - safeOnEquipSpellDrop não está definido!');
                      return;
                    }
                    
                    if (!cardData || cardData.trim() === '') {
                      console.error('❌ [DuelField] onDrop - cardData está vazio ou não existe!');
                      return;
                    }
                    
                    try {
                      const card = JSON.parse(cardData);
                      const cardType = card.type || card.cardType;
                      const spellType = card.spellType;
                      const cardId = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
                      const cardName = (card.name || card.cardName || '').toString();
                      const cardNameLower = cardName.toLowerCase();
                      
                      // Verificar se é spell Equip - por tipo, id ou nome (ex.: United We Stand com id numérico)
                      const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                           cardId.includes('unitedwestand') ||
                                           cardNameLower.includes('united we stand') ||
                                           cardNameLower.includes('unitedwestand') ||
                                           cardId.includes('magepower') ||
                                           cardNameLower.includes('mage power') ||
                                           cardId.includes('hornoftheunicorn') ||
                                           cardId.includes('malevolentnuzzler') ||
                                           cardId.includes('equip') ||
                                           cardNameLower.includes('equip');
                      
                      if (isEquipSpell) {
                        safeOnEquipSpellDrop(card, index, isFromField ? parseInt(spellTrapZoneIndex, 10) : undefined);
                        setDraggingCardIndex(null);
                        return;
                      }
                    } catch (err) {
                      console.error('❌ [DuelField] onDrop - erro ao parsear card:', err);
                      console.error('❌ [DuelField] onDrop - cardData que causou erro:', cardData);
                    }
                  }
                  setDraggingCardIndex(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSelectingTarget && isOpponent && hasMonster && safeOnMonsterClick) {
                    // Pode atacar monstro em qualquer posição (ataque ou defesa)
                    safeOnMonsterClick(index);
                  } else if (isSelectingTarget && isOpponent && !hasMonster && safeOnMonsterClick) {
                    // Ataque direto - só permitir se não houver monstros no campo
                    const hasAnyMonster = monsters.some((m: any) => m !== null && m !== undefined);
                    if (!hasAnyMonster) {
                      safeOnMonsterClick(-1);
                    } else {
                      // Não permitir ataque direto se houver monstros
                      alert('Você não pode atacar diretamente enquanto o oponente tiver monstros no campo!');
                    }
                  } else if (hasMonster && safeOnCardClick) {
                    // Se está selecionando alvo de monstro (ex: SnowmanEater, ChaosSorcerer), permitir clicar
                    if (isSelectingMonsterTarget) {
                      // Verificar se o monstro está face-up
                      const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                      if (isFaceUp) {
                        safeOnCardClick(monster, index);
                      } else {
                        // Mostrar mensagem se tentar escolher um monstro face-down
                        alert('Você só pode selecionar monstros face-up (ataque ou defesa)');
                      }
                    } else if (!isSelectingTarget) {
                      // Mostrar informações da carta apenas se não estiver selecionando alvo de ataque
                      safeOnCardClick(monster);
                    }
                  }
                }}
                className={`zone-card rounded-lg w-[80px] h-[117px] transition-all bg-transparent relative border-2 border-white ${
                  hasMonster 
                    ? isSelectingMonsterTarget && (monster.position === 'attack' || monster.position === 'defense')
                      ? 'ring-4 ring-blue-400/50 cursor-pointer'
                      : ''
                    : 'hover:shadow-lg hover:shadow-white/30'
                } overflow-visible ${
                  isSelectingTarget && isOpponent 
                    ? hasMonster 
                      ? 'cursor-pointer ring-4 ring-yellow-400/70' 
                      : (() => {
                          // Só mostrar indicador de ataque direto se não houver monstros no campo
                          const hasAnyMonster = monsters.some((m: any) => m !== null && m !== undefined);
                          return hasAnyMonster ? 'cursor-not-allowed opacity-50' : 'cursor-pointer ring-4 ring-blue-400/70';
                        })()
                    : 'cursor-pointer'
                }`}
                title={monster ? monster.name : isSelectingTarget && isOpponent ? "Clique para atacar este monstro" : "Monster Zone"}
              >
                {monster && monster.position === 'attack' ? (
                  <motion.div
                    className={`absolute inset-0 w-full h-full overflow-visible ${
                      (() => {
                        // Permitir arrastar para atacar em STANDBY, MAIN1 ou BATTLE
                        if (!isOpponent && isMyTurn && (currentPhase === 'STANDBY' || currentPhase === 'MAIN1' || currentPhase === 'BATTLE')) {
                          // Verificar se é MatazaTheZapper ou CyberTwinDragon (podem atacar 2 vezes)
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId;
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                                    monsterCardId === 'matazathezapper' ||
                                                    monsterName === 'mataza the zapper' ||
                                                    monsterName === 'matazathezapper' ||
                                                    (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('matazathezapper'));
                          const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                                    monsterCardId === 'cybertwindragon' ||
                                                    monsterCardId === 'Cyber-TwinDragon' ||
                                                    monsterCardId === 'CyberTwin-Dragon' ||
                                                    monsterName === 'cyber twin dragon' ||
                                                    monsterName === 'cyber-twin dragon' ||
                                                    monsterName === 'cybertwindragon' ||
                                                    (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('cybertwindragon'));
                          
                        if (isMatazaTheZapper || isCyberTwinDragon) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          return attacksThisTurn < 2;
                        }
                        // BLS - Envoy of the Beginning: segundo ataque se destruiu monstro em batalha (canAttackAgainThisTurn)
                        const isBLS = (monster.name || monster.cardName || '').toLowerCase().includes('black luster soldier') || (monster.idCarta || monster.id || '').toString().toLowerCase().includes('blacklustersoldier');
                        if (isBLS && !!monster.canAttackAgainThisTurn) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          return attacksThisTurn < 2;
                        }
                        return !monster.attackedThisTurn;
                      }
                      return false;
                    })()
                        ? 'cursor-grab active:cursor-grabbing'
                        : 'cursor-pointer'
                    }`}
                    style={{
                      zIndex: draggingCardIndex === index ? 100 : 5,
                      // Permitir pointer-events para drag (ataque) e drop (equip spell)
                      // Se não estiver em modo de drag para atacar, ainda permitir drop
                      pointerEvents: 'auto',
                    }}
                    draggable={(() => {
                      // Permitir arrastar para atacar em STANDBY, MAIN1 ou BATTLE
                      if (!isOpponent && isMyTurn && (currentPhase === 'STANDBY' || currentPhase === 'MAIN1' || currentPhase === 'BATTLE')) {
                        // Verificar se é MatazaTheZapper ou CyberTwinDragon (podem atacar 2 vezes)
                        const monsterCardId = monster.idCarta || monster.id || monster.cardId;
                        const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                        const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                                  monsterCardId === 'matazathezapper' ||
                                                  monsterName === 'mataza the zapper' ||
                                                  monsterName === 'matazathezapper' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('matazathezapper'));
                        const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                                  monsterCardId === 'cybertwindragon' ||
                                                  monsterCardId === 'Cyber-TwinDragon' ||
                                                  monsterCardId === 'CyberTwin-Dragon' ||
                                                  monsterName === 'cyber twin dragon' ||
                                                  monsterName === 'cyber-twin dragon' ||
                                                  monsterName === 'cybertwindragon' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('cybertwindragon'));
                        
                        if (isMatazaTheZapper || isCyberTwinDragon) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          return attacksThisTurn < 2;
                        }
                        const isBLS = (monster.name || monster.cardName || '').toLowerCase().includes('black luster soldier') || (monster.idCarta || monster.id || '').toString().toLowerCase().includes('blacklustersoldier');
                        if (isBLS && !!monster.canAttackAgainThisTurn) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          return attacksThisTurn < 2;
                        }
                        return !monster.attackedThisTurn;
                      }
                      return false;
                    })()}
                    animate={{
                      scale: draggingCardIndex === index ? 0.9 : 1,
                      opacity: draggingCardIndex === index ? 0.3 : 1,
                      rotate: draggingCardIndex === index ? 5 : 0,
                    }}
                    whileHover={(() => {
                      // Permitir hover para atacar em STANDBY, MAIN1 ou BATTLE
                      if (!isOpponent && isMyTurn && (currentPhase === 'STANDBY' || currentPhase === 'MAIN1' || currentPhase === 'BATTLE')) {
                        // Verificar se é MatazaTheZapper ou CyberTwinDragon (podem atacar 2 vezes)
                        const monsterCardId = monster.idCarta || monster.id || monster.cardId;
                        const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                        const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                                  monsterCardId === 'matazathezapper' ||
                                                  monsterName === 'mataza the zapper' ||
                                                  monsterName === 'matazathezapper' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('matazathezapper'));
                        const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                                  monsterCardId === 'cybertwindragon' ||
                                                  monsterCardId === 'Cyber-TwinDragon' ||
                                                  monsterCardId === 'CyberTwin-Dragon' ||
                                                  monsterName === 'cyber twin dragon' ||
                                                  monsterName === 'cyber-twin dragon' ||
                                                  monsterName === 'cybertwindragon' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('cybertwindragon'));
                        
                        if (isMatazaTheZapper || isCyberTwinDragon) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          return attacksThisTurn < 2;
                        }
                        const isBLSHover = (monster.name || monster.cardName || '').toLowerCase().includes('black luster soldier') || (monster.idCarta || monster.id || '').toString().toLowerCase().includes('blacklustersoldier');
                        if (isBLSHover && !!monster.canAttackAgainThisTurn) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          return attacksThisTurn < 2;
                        }
                        return !monster.attackedThisTurn;
                      }
                      return false;
                    })() ? {
                      scale: 1.05,
                      boxShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
                    } : {}}
                    transition={{ duration: 0.2 }}
                    onDragOver={(e) => {
                      // Permitir drop de spell equip mesmo no elemento do monstro (suporta múltiplos equips)
                      if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense') && safeOnEquipSpellDrop) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(e) => {
                      if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense') && safeOnEquipSpellDrop) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const cardData = e.dataTransfer.getData('application/json');
                        const spellTrapZoneIndex = e.dataTransfer.getData('spellTrapZoneIndex');
                        const isFromField = spellTrapZoneIndex !== '';
                        
                        if (!cardData || cardData.trim() === '') {
                          console.error('❌ [DuelField] onDrop no monstro - cardData está vazio!');
                          return;
                        }
                        
                        try {
                          const card = JSON.parse(cardData);
                          const cardType = card.type || card.cardType;
                          const spellType = card.spellType;
                          const cardId = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
                          const cardName = (card.name || card.cardName || '').toString();
                          const cardNameLower = cardName.toLowerCase();
                          const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                               cardId.includes('unitedwestand') ||
                                               cardNameLower.includes('united we stand') ||
                                               cardNameLower.includes('unitedwestand') ||
                                               cardId.includes('magepower') ||
                                               cardNameLower.includes('mage power') ||
                                               cardId.includes('hornoftheunicorn') ||
                                               cardId.includes('malevolentnuzzler');
                          
                          if (isEquipSpell) {
                            safeOnEquipSpellDrop(card, index, isFromField ? parseInt(spellTrapZoneIndex, 10) : undefined);
                            setDraggingCardIndex(null);
                          }
                        } catch (err) {
                          console.error('❌ [DuelField] onDrop no monstro - erro:', err);
                        }
                      }
                    }}
                    onDragStart={(e) => {
                      // Permitir arrastar monstro para atacar em STANDBY, MAIN1 ou BATTLE
                      if (!isOpponent && isMyTurn && (currentPhase === 'STANDBY' || currentPhase === 'MAIN1' || currentPhase === 'BATTLE')) {
                        // Verificar se é MatazaTheZapper (pode atacar 2 vezes)
                        const monsterCardId = monster.idCarta || monster.id || monster.cardId;
                        const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                        const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                                  monsterCardId === 'matazathezapper' ||
                                                  monsterName === 'mataza the zapper' ||
                                                  monsterName === 'matazathezapper' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('matazathezapper'));
                        const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                                  monsterCardId === 'cybertwindragon' ||
                                                  monsterCardId === 'Cyber-TwinDragon' ||
                                                  monsterCardId === 'CyberTwin-Dragon' ||
                                                  monsterName === 'cyber twin dragon' ||
                                                  monsterName === 'cyber-twin dragon' ||
                                                  monsterName === 'cybertwindragon' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('cybertwindragon'));
                        
                        let canDrag = false;
                        if (isMatazaTheZapper || isCyberTwinDragon) {
                          const attacksThisTurn = monster.attacksThisTurn || 0;
                          canDrag = attacksThisTurn < 2;
                        } else {
                          const isBLSDrag = (monster.name || monster.cardName || '').toLowerCase().includes('black luster soldier') || (monster.idCarta || monster.id || '').toString().toLowerCase().includes('blacklustersoldier');
                          if (isBLSDrag && !!monster.canAttackAgainThisTurn) {
                            const attacksThisTurn = monster.attacksThisTurn || 0;
                            canDrag = attacksThisTurn < 2;
                          } else {
                            canDrag = !monster.attackedThisTurn;
                          }
                        }
                        
                        if (canDrag) {
                          setDraggingCardIndex(index);
                          setDraggingCard(monster);
                          setDragPosition({ x: e.clientX, y: e.clientY });
                          e.dataTransfer.setData('attackerZoneIndex', index.toString());
                          e.dataTransfer.effectAllowed = 'move';
                          
                          // Criar uma imagem invisível para o drag (para esconder a imagem padrão)
                          const dragImage = document.createElement('div');
                          dragImage.style.width = '1px';
                          dragImage.style.height = '1px';
                          dragImage.style.opacity = '0';
                          document.body.appendChild(dragImage);
                          e.dataTransfer.setDragImage(dragImage, 0, 0);
                          setTimeout(() => {
                            if (document.body.contains(dragImage)) {
                              document.body.removeChild(dragImage);
                            }
                          }, 0);
                        } else {
                          e.preventDefault();
                        }
                      } else {
                        e.preventDefault();
                      }
                    }}
                    onDragEnd={() => {
                      setDraggingCardIndex(null);
                      setDragPosition(null);
                      setDraggingCard(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Se está selecionando alvo e é monstro do oponente, processar ataque
                      if (isSelectingTarget && isOpponent && safeOnMonsterClick) {
                        safeOnMonsterClick(index);
                      } else if (safeOnCardClick && !isSelectingTarget) {
                        // Mostrar informações da carta apenas se não estiver selecionando alvo
                        // Se está selecionando alvo de monstro (ex: SnowmanEater), passar o índice
                        if (isSelectingMonsterTarget) {
                          const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                          if (isFaceUp) {
                            safeOnCardClick(monster, index);
                          }
                        } else {
                          safeOnCardClick(monster);
                        }
                      }
                    }}
                  >
                    <CardImage
                      card={monster}
                      className="w-full h-full"
                      style={{
                        width: '100%',
                        height: '100%',
                      }}
                      fallback={fallbackCard}
                    />
                    {/* Indicador de ATK (Slifer oponente: -2000 se invocado em ataque; mínimo 0) */}
                    {(() => {
                      const baseAtk = Number(monster.atk) || 0;
                      const equipmentBonus = Number(monster.equipmentBonusAtk) || 0;
                      const spellCounterBonus = Number(monster.spellCounterBonusAtk) || 0;
                      const isSlifer = /slifer\s*the\s*sky\s*dragon/i.test((monster.name || monster.cardName || ''));
                      const sliferBonus = isSlifer ? (handCount ?? 0) * 1000 : 0;
                      const sliferDebuff = Number(monster.sliferAtkDebuff) || 0;
                      const totalAtk = Math.max(0, baseAtk + equipmentBonus + spellCounterBonus + bannerOfCourageBonus + sliferBonus - sliferDebuff);
                      return (
                        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-20">
                          <div className="px-2 py-1 rounded-lg shadow-lg border-2 bg-black/80 border-red-500/70">
                            <div className="flex items-center gap-1">
                              <span className="text-white text-xs font-bold">ATK</span>
                              <span className="text-sm font-bold text-white">
                                {totalAtk.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                ) : null}
                
                {/* Botão de ataque - aparece durante Battle Phase em monstros em posição de ataque que ainda não atacaram */}
                {!isOpponent && canAttack && isAttack && safeOnAttackClick && (() => {
                  // Verificar se o monstro não pode atacar neste turno (ex: ChaosSorcerer após usar efeito)
                  if (monster.cannotAttackThisTurn === true) {
                    return false;
                  }
                  
                  // Verificar se é MatazaTheZapper ou CyberTwinDragon (podem atacar 2 vezes)
                  const monsterCardId = monster.idCarta || monster.id || monster.cardId;
                  const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                  const isMatazaTheZapper = monsterCardId === 'MatazaTheZapper' || 
                                            monsterCardId === 'matazathezapper' ||
                                            monsterName === 'mataza the zapper' ||
                                            monsterName === 'matazathezapper' ||
                                            (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('matazathezapper'));
                  const isCyberTwinDragon = monsterCardId === 'CyberTwinDragon' || 
                                            monsterCardId === 'cybertwindragon' ||
                                            monsterCardId === 'Cyber-TwinDragon' ||
                                            monsterCardId === 'CyberTwin-Dragon' ||
                                            monsterName === 'cyber twin dragon' ||
                                            monsterName === 'cyber-twin dragon' ||
                                            monsterName === 'cybertwindragon' ||
                                            (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('cybertwindragon'));
                  
                  if (isMatazaTheZapper || isCyberTwinDragon) {
                    const attacksThisTurn = monster.attacksThisTurn || 0;
                    return attacksThisTurn < 2;
                  }
                  const isBLSBtn = (monster.name || monster.cardName || '').toLowerCase().includes('black luster soldier') || (monster.idCarta || monster.id || '').toString().toLowerCase().includes('blacklustersoldier');
                  if (isBLSBtn && !!monster.canAttackAgainThisTurn) {
                    const attacksThisTurn = monster.attacksThisTurn || 0;
                    return attacksThisTurn < 2;
                  }
                  return !monster.attackedThisTurn;
                })() && (
                  <motion.button
                    whileHover={{}}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (safeOnAttackClick) {
                        safeOnAttackClick(index);
                      }
                    }}
                    className="absolute top-1 left-1 z-50 w-8 h-8 bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-2 border-red-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-red-500/50 hover:shadow-red-500/70"
                    title={`Atacar com ${monster.name} (ATK: ${Math.max(0, (monster.atk || 0) + (monster.equipmentBonusAtk || 0) + (monster.spellCounterBonusAtk || 0) + bannerOfCourageBonus + (/slifer\s*the\s*sky\s*dragon/i.test((monster.name || monster.cardName || '')) ? (handCount ?? 0) * 1000 : 0) - (Number(monster.sliferAtkDebuff) || 0))})`}
                  >
                    <span className="text-sm">⚔️</span>
                  </motion.button>
                )}
                
                {/* Botões para mudar posição - apenas nas fases principais, para o próprio jogador, e se não foi invocado no turno atual */}
                {!isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && safeOnChangePosition && hasMonster && (
                  (() => {
                    // Usar summonedTurnNumber (do backend) em vez de summonedTurn
                    const summonedTurnNumber = monster.summonedTurnNumber;
                    const monsterPositionChanged = monster.positionChangedThisTurn === true;
                    // Monstro invocado por invocação especial pode mudar posição no mesmo turno
                    const isSpecialSummoned = monster.specialSummoned === true;
                    const canChangePositionSameTurn = isSpecialSummoned;
                    
                    // Verificar se foi invocado no turno atual (comparar com turnCounter global)
                    const wasSummonedThisTurn = summonedTurnNumber != null && Number(summonedTurnNumber) === Number(turnCounter);
                    
                    // Pode mudar posição se:
                    // 1. Foi invocado por invocação especial (pode mudar no mesmo turno), OU
                    // 2. NÃO foi invocado neste turno, OU
                    // 3. summonedTurnNumber não está definido (assumir que foi invocado em turno anterior)
                    // E não mudou posição neste turno ainda
                    const canChangePosition = !monsterPositionChanged && (canChangePositionSameTurn || !wasSummonedThisTurn);
                    
                    return (
                      <div className="absolute top-1 left-1 flex gap-1 z-50">
                        {/* Botão para mudar para ataque */}
                        {monster.position !== 'attack' && canChangePosition && (
                          <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (monsterPositionChanged) {
                                alert('Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno!');
                                return;
                              }
                              if (summonedTurnNumber != null && Number(summonedTurnNumber) === Number(turnCounter) && !canChangePositionSameTurn) {
                                alert('Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado!');
                                return;
                              }
                              if (safeOnChangePosition) {
                                safeOnChangePosition(index, 'attack');
                              }
                            }}
                            className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-red-400/70 cursor-pointer shadow-red-500/40 hover:shadow-red-500/60"
                            title="Mudar para Ataque"
                          >
                            <img 
                              src="/images/Duelo/Ataque.png" 
                              alt="Ataque" 
                              className="w-6 h-6 object-contain"
                            />
                          </motion.button>
                        )}
                        
                        {/* Botão para mudar para defesa */}
                        {monster.position !== 'defense' && monster.position !== 'set' && canChangePosition && (
                          <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (monsterPositionChanged) {
                                alert('Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno!');
                                return;
                              }
                              if (summonedTurnNumber != null && Number(summonedTurnNumber) === Number(turnCounter) && !canChangePositionSameTurn) {
                                alert('Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado!');
                                return;
                              }
                              if (safeOnChangePosition) {
                                safeOnChangePosition(index, 'defense');
                              }
                            }}
                            className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-blue-600/90 to-blue-700/90 hover:from-blue-500 hover:to-blue-600 border-blue-400/70 cursor-pointer shadow-blue-500/40 hover:shadow-blue-500/60"
                            title="Mudar para Defesa"
                          >
                            <span className="text-sm">🛡️</span>
                          </motion.button>
                        )}
                        
                        {/* Botão para ativar efeito do Breaker the Magical Warrior: escolher 1 S/T no campo para destruir (perde +300 ATK) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const isBreaker = monsterCardId.toLowerCase().includes('breakerthemagicalwarrior') ||
                                            monsterCardId.toLowerCase().includes('breaker') ||
                                            monster.name?.toLowerCase().includes('breaker');
                          const hasAtkBonus = monster.spellCounters && monster.spellCounters > 0;
                          const canActivateBreaker = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                     isBreaker && hasAtkBonus && safeOnBreakerRemoveCounter;
                          return canActivateBreaker ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnBreakerRemoveCounter) safeOnBreakerRemoveCounter(index);
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-purple-600/90 to-purple-700/90 hover:from-purple-500 hover:to-purple-600 border-purple-400/70 cursor-pointer shadow-purple-500/40 hover:shadow-purple-500/60"
                              title="Escolher 1 Spell/Trap no campo para destruir (este monstro perde os +300 de ATK)"
                            >
                              <span className="text-sm">✨</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do ChaosSorcerer (banir monstro face-up do oponente) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isChaosSorcerer = monsterCardId === 'ChaosSorcerer' || 
                                                  monsterCardId === 'chaossorcerer' ||
                                                  monsterName === 'chaos sorcerer' ||
                                                  (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('chaossorcerer'));
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateChaosSorcerer = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && 
                                                           isChaosSorcerer && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateChaosSorcerer ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-indigo-600/90 to-purple-600/90 hover:from-indigo-500 hover:to-purple-500 border-indigo-400/70 cursor-pointer shadow-indigo-500/40 hover:shadow-indigo-500/60"
                              title="Efeito do ChaosSorcerer: Uma vez por turno, banir 1 monstro face-up do oponente (não pode atacar neste turno)"
                            >
                              <span className="text-sm">🌟</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Chaos Emperor Dragon (descartar todas as cartas e causar dano) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isChaosEmperorDragon = monsterCardId === 'ChaosEmperorDragon' || 
                                                      monsterCardId === 'chaosemperordragon' ||
                                                      monsterCardId === 'Chaos-EmperorDragon' ||
                                                      monsterCardId === 'ChaosEmperor-Dragon' ||
                                                      monsterName === 'chaos emperor dragon' ||
                                                      monsterName === 'chaos-emperor dragon' ||
                                                      monsterName === 'chaosemperordragon' ||
                                                      (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('chaosemperordragon')) ||
                                                      (typeof monsterName === 'string' && monsterName.includes('chaos emperor dragon'));
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateChaosEmperorDragon = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && 
                                                                 isChaosEmperorDragon && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateChaosEmperorDragon ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-red-600/90 to-orange-600/90 hover:from-red-500 hover:to-orange-500 border-red-400/70 cursor-pointer shadow-red-500/40 hover:shadow-red-500/60"
                              title="Efeito do Chaos Emperor Dragon: Pague 1000 LP; descarte todas as cartas do campo e da mão de ambos os duelistas para o cemitério. O oponente perde 300 LP por cada carta enviada."
                            >
                              <span className="text-sm">💥</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Black Luster Soldier - Envoy of the Beginning (escolher efeito 1: banir monstro ou 2: segundo ataque se destruir) */}
                        {(() => {
                          const monsterCardId = (monster.idCarta || monster.id || monster.cardId || '').toString().toLowerCase();
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isBlackLusterSoldier = monsterCardId === 'blacklustersoldierenvoyofthebeginning' ||
                                                       monsterCardId.includes('blacklustersoldier') ||
                                                       monsterName.includes('black luster soldier');
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateBLSEffect = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                       isBlackLusterSoldier && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateBLSEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-amber-600/90 to-yellow-600/90 hover:from-amber-500 hover:to-yellow-500 border-amber-400/70 cursor-pointer shadow-amber-500/40 hover:shadow-amber-500/60"
                              title="Efeito do Black Luster Soldier: Escolha 1 - Banir 1 monstro (não ataca este turno) ou 2 - Se destruir monstro em batalha, pode atacar novamente"
                            >
                              <span className="text-sm">⚔️</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Red-Eyes Darkness Metal Dragon (invocar dragão da mão/cemitério) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isRedEyesDarknessMetalDragon = monsterCardId === 'RedEyesDarknessMetalDragon' ||
                                                               monsterCardId === 'Red-EyesDarknessMetalDragon' ||
                                                               monsterCardId === 'redeyesdarknessmetaldragon' ||
                                                               monsterName === 'red-eyes darkness metal dragon' ||
                                                               monsterName === 'red eyes darkness metal dragon' ||
                                                               (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('redeyesdarknessmetaldragon')) ||
                                                               (typeof monsterName === 'string' && monsterName.includes('red-eyes darkness metal dragon'));
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateRedEyesEffect = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && 
                                                          isRedEyesDarknessMetalDragon && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateRedEyesEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-red-600/90 to-orange-600/90 hover:from-red-500 hover:to-orange-500 border-red-400/70 cursor-pointer shadow-red-500/40 hover:shadow-red-500/60"
                              title="Efeito do Red-Eyes Darkness Metal Dragon: Uma vez por turno, invocar por invocação especial 1 monstro do Tipo Dragão da sua mão ou Cemitério (exceto Red-Eyes Darkness Metal Dragon) em posição de ataque"
                            >
                              <span className="text-sm">🐉</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Cyber-Stein (pagar 5000 LP e invocar do Extra Deck) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isCyberStein = monsterCardId === 'CyberStein' || 
                                              monsterCardId === 'cyberstein' ||
                                              monsterCardId === 'Cyber-Stein' ||
                                              monsterName === 'cyber-stein' ||
                                              monsterName === 'cyber stein' ||
                                              (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('cyberstein'));
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateCyberSteinEffect = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && 
                                                             isCyberStein && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateCyberSteinEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-cyan-600/90 to-blue-600/90 hover:from-cyan-500 hover:to-blue-500 border-cyan-400/70 cursor-pointer shadow-cyan-500/40 hover:shadow-cyan-500/60"
                              title="Efeito do Cyber-Stein: Pague 5000 LP; invoque por invocação especial 1 monstro do seu Extra Deck em modo de ataque"
                            >
                              <span className="text-sm">⚡</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Dark Armed Dragon (banir Dark do cemitério e destruir carta) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isDarkArmedDragon = monsterCardId === 'DarkArmedDragon' ||
                                                    monsterCardId === 'darkarmeddragon' ||
                                                    monsterCardId === 'Dark-ArmedDragon' ||
                                                    monsterCardId === 'DarkArmed-Dragon' ||
                                                    monsterName === 'dark armed dragon' ||
                                                    monsterName === 'dark-armed dragon' ||
                                                    monsterName === 'darkarmeddragon' ||
                                                    (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('darkarmeddragon')) ||
                                                    (typeof monsterName === 'string' && monsterName.includes('dark armed dragon'));
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateDarkArmedDragonEffect = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                                   isDarkArmedDragon && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateDarkArmedDragonEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-purple-600/90 to-indigo-600/90 hover:from-purple-500 hover:to-indigo-500 border-purple-400/70 cursor-pointer shadow-purple-500/40 hover:shadow-purple-500/60"
                              title="Efeito do Dark Armed Dragon: Bane 1 monstro Dark do seu cemitério; depois, você pode destruir 1 carta no campo."
                            >
                              <span className="text-sm">⚡</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Exiled Force (tributar e destruir monstro) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isExiledForce = monsterCardId === 'ExiledForce' ||
                                                monsterCardId === 'exiledforce' ||
                                                monsterCardId === 'Exiled-Force' ||
                                                monsterName === 'exiled force' ||
                                                monsterName === 'exiled-force' ||
                                                (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('exiledforce')) ||
                                                (typeof monsterName === 'string' && monsterName.includes('exiled force'));
                          const effectUsedThisTurn = monster.effectUsedThisTurn === true;
                          const canActivateExiledForceEffect = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                               isExiledForce && !effectUsedThisTurn && safeOnActivateMonsterEffect;
                          
                          return canActivateExiledForceEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) {
                                  safeOnActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-orange-600/90 to-red-600/90 hover:from-orange-500 hover:to-red-500 border-orange-400/70 cursor-pointer shadow-orange-500/40 hover:shadow-orange-500/60"
                              title="Efeito do Exiled Force: Você pode tributar este monstro; destrua 1 monstro no campo."
                            >
                              <span className="text-sm">💥</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para ativar efeito do Obelisk the Tormentor (escolher 2 monstros seus, destruir todos do oponente) */}
                        {(() => {
                          const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                          const isObelisk = /obelisk\s*the\s*tormentor/.test(monsterName);
                          const canActivateObelisk = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') &&
                                                    isObelisk && safeOnActivateMonsterEffect;
                          return canActivateObelisk ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (safeOnActivateMonsterEffect) safeOnActivateMonsterEffect(index);
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-amber-700/90 to-amber-900/90 hover:from-amber-600 hover:to-amber-800 border-amber-500/70 cursor-pointer shadow-amber-500/40"
                              title="Efeito do Obelisk: Escolha 2 monstros que você controla; destrua todos os monstros do oponente. (1x por turno)"
                            >
                              <span className="text-sm">⚡</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Não mostrar botão de flip quando o monstro está em defesa face-down (set) */}
                      </div>
                    );
                  })()
                )}
              </motion.div>
              
              {/* Carta em defesa (aparece sobreposta no slot, inteira e deitada) */}
              {isDefense ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`absolute group ${isSelectingTarget && isOpponent ? 'cursor-pointer' : safeOnCardClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Permitir clicar na carta em defesa para atacar
                    if (isSelectingTarget && isOpponent && safeOnMonsterClick) {
                      safeOnMonsterClick(index);
                    } else if (safeOnCardClick && !isSelectingTarget) {
                      // Só mostrar informações se a carta estiver face-up OU se não for do oponente
                      // Cartas viradas para baixo do oponente não devem revelar informações
                      if (monster.position !== 'set' || !isOpponent) {
                        // Se está selecionando alvo de monstro (ex: SnowmanEater), passar o índice
                        if (isSelectingMonsterTarget) {
                          const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                          if (isFaceUp) {
                            safeOnCardClick(monster, index);
                          }
                        } else {
                          safeOnCardClick(monster);
                        }
                      }
                    }
                  }}
                  style={{
                    // Posicionar exatamente sobre o slot (mesmo tamanho e posição)
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 30,
                    // Permitir pointer-events quando está selecionando alvo OU quando há safeOnMonsterDrop (para permitir drag and drop em monstros face-down)
                    pointerEvents: (isSelectingTarget && isOpponent) || safeOnCardClick || (isOpponent && safeOnMonsterDrop) ? 'auto' : 'none',
                    overflow: 'visible',
                  }}
                >
                  {monster.position === 'set' ? (
                    // Face-down (set): mostrar sleeve da carta
                    // Quando invocamos em defesa da mão, sempre vai face-down (set)
                    <div
                      className={isSelectingTarget && isOpponent ? 'ring-4 ring-yellow-400/70' : ''}
                      onDragOver={(e) => {
                        // Permitir drop de ataque em monstros face-down do oponente
                        if (isOpponent && safeOnMonsterDrop) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          e.currentTarget.classList.add('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                      }}
                      onDrop={(e) => {
                        // Permitir atacar monstros face-down do oponente
                        if (isOpponent && safeOnMonsterDrop) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                          
                          const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
                          if (!isNaN(attackerZoneIndex)) {
                            safeOnMonsterDrop(attackerZoneIndex, index);
                          }
                        }
                      }}
                      style={{
                        backgroundImage: `url(${fallbackCard})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        transform: 'rotate(90deg)', // Mesmo tamanho que ataque (104×152), só deitada
                        transformOrigin: 'center center',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                        width: '100%',
                        height: '100%',
                      }}
                      title={isSelectingTarget && isOpponent ? `Clique para atacar ${monster.name || "Monster in Defense"}` : monster.name || "Monster in Defense"}
                    />
                  ) : (
                    // Face-up em defesa (defense): mostrar imagem do monstro
                    (() => (
                        <div
                          className={isSelectingTarget && isOpponent ? 'ring-4 ring-yellow-400/70' : safeOnCardClick ? 'cursor-pointer' : ''}
                          style={{
                            transform: 'rotate(90deg)', // Mesmo tamanho que ataque (104×152), só deitada
                            transformOrigin: 'center center',
                            borderRadius: '8px',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            position: 'relative',
                            pointerEvents: 'auto', // Permitir eventos de drag-and-drop
                          }}
                          onDragOver={(e) => {
                            // Permitir drop de ataque em monstros em defesa face-up do oponente
                            if (isOpponent && safeOnMonsterDrop) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              e.currentTarget.classList.add('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                            }
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                          }}
                          onDrop={(e) => {
                            // Permitir atacar monstros em defesa face-up do oponente
                            if (isOpponent && safeOnMonsterDrop) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                              
                              const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
                              if (!isNaN(attackerZoneIndex)) {
                                safeOnMonsterDrop(attackerZoneIndex, index);
                              }
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Se está selecionando alvo e é monstro do oponente, processar ataque
                            if (isSelectingTarget && isOpponent && safeOnMonsterClick) {
                              safeOnMonsterClick(index);
                            } else if (safeOnCardClick && !isSelectingTarget) {
                              // Mostrar informações da carta apenas se não estiver selecionando alvo
                              // Se está selecionando alvo de monstro (ex: SnowmanEater), passar o índice
                        if (isSelectingMonsterTarget) {
                          const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                          if (isFaceUp) {
                            safeOnCardClick(monster, index);
                          }
                        } else {
                          safeOnCardClick(monster);
                        }
                            }
                          }}
                          title={isSelectingTarget && isOpponent ? `Clique para atacar ${monster.name || "Monster in Defense"}` : monster.name || "Monster in Defense"}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              position: 'absolute',
                              top: 0,
                              left: 0,
                            }}
                          >
                            <CardImage
                              card={monster}
                              className="w-full h-full"
                              style={{
                                width: '100%',
                                height: '100%',
                              }}
                              fallback={fallbackCard}
                            />
                          </div>
                        </div>
                    ))()
                  )}
                  {/* DEF em baixo da carta (sibling do div rotacionado = não gira), centralizado, legível */}
                  {monster && monster.position === 'defense' && (() => {
                    const baseDef = Number(monster.def) || 0;
                    const equipmentBonusDef = Number(monster.equipmentBonusDef) || 0;
                    const spellCounterBonusDef = Number(monster.spellCounterBonusDef) || 0;
                    const isSliferDef = /slifer\s*the\s*sky\s*dragon/i.test((monster.name || monster.cardName || ''));
                    const sliferBonusDef = isSliferDef ? (handCount ?? 0) * 1000 : 0;
                    const totalDef = baseDef + equipmentBonusDef + spellCounterBonusDef + sliferBonusDef;
                    return (
                      <div
                        className="absolute z-20 pointer-events-none"
                        style={{
                          left: '50%',
                          bottom: 2,
                          transform: 'translateX(-50%)',
                        }}
                      >
                        <div className="px-2 py-1 rounded-lg shadow-lg border-2 bg-black/80 border-blue-500/70 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="text-white text-xs font-bold">DEF</span>
                            <span className="text-sm font-bold text-white">
                              {totalDef.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </motion.div>
              ) : null}
            </div>
          );
        })}

        {/* Graveyard - texto GY visível por completo */}
        <motion.div 
          onClick={safeOnGraveyardClick}
          className="zone-card border-2 border-white rounded-lg w-[80px] h-[117px] relative overflow-hidden transition-all cursor-pointer bg-transparent"
          style={{ aspectRatio: '59/86' }}>
          {graveyard.length > 0 ? (
            <>
              {/* Mostrar a última carta descartada (topo do cemitério) */}
              {(() => {
                const lastCard = graveyard[graveyard.length - 1];
                
                return (
                  <>
                    {/* Imagem da última carta usando CardImage */}
                    <div className="absolute inset-0">
                      <CardImage
                        card={lastCard}
                        className="w-full h-full"
                        fallback={fallbackCard}
                      />
                    </div>
                    {/* Contador de cartas no canto */}
                    <div className="absolute bottom-1 right-1 z-10 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded ">
                      {graveyard.length}
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center py-1">
              <div className="text-center">
                <div className="text-gray-300 text-xs font-bold drop-shadow-lg">GY</div>
                <div className="text-gray-200 text-sm font-bold drop-shadow-lg">0</div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Linha 2 (Baixo): Extra Deck | 5 Spell/Trap Zones | Deck - mesmas colunas que a linha 1 */}
      <div className="grid gap-6 justify-items-center mt-6" style={{ gridTemplateColumns: 'repeat(7, 80px)' }}>
        {/* Extra Deck / Deck - Modernizado */}
        <motion.div 
              onClick={safeOnExtraDeckClick}
              className="zone-card border-2 border-white rounded-lg w-[80px] h-[117px] relative overflow-hidden bg-transparent transition-all cursor-pointer hover:shadow-lg hover:shadow-white/30"
              style={{ aspectRatio: '59/86' }}>
          {extraDeck && extraDeck.length > 0 ? (
            <>
              {/* Mostrar a primeira carta do extra deck empilhada */}
              <div className="absolute inset-0">
                <CardImage
                  card={extraDeck[0]}
                  className="w-full h-full"
                  fallback={fallbackCard}
                />
              </div>
              {/* Contador de cartas */}
              <div className="absolute bottom-1 right-1 z-10 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded">
                {extraDeck.length}
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center py-1">
              <div className="text-center">
                <div className="text-purple-300 text-xs font-bold drop-shadow-lg">ED</div>
                <div className="text-purple-200 text-sm font-bold drop-shadow-lg">0</div>
              </div>
            </div>
          )}
        </motion.div>

        {/* 5 Spell/Trap Zones - Modernizado */}
        {spellTrapZones.map((_, index) => {
          const spellTrap = spellTraps[index];
          const isEmpty = !spellTrap || spellTrap === null;
          return (
            <motion.div
              key={`spell-${index}`}
              data-spell-trap-zone={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={(e) => {
                e.stopPropagation();
                if (isSelectingSpellTrapSlot && !isOpponent && isEmpty && safeOnSpellTrapSlotClick) {
                  safeOnSpellTrapSlotClick(index);
                } else if (isSelectingSpellTrapTarget && !isEmpty && spellTrap && safeOnCardClick) {
                  // Selecionando alvo para destruir spell/trap
                  safeOnCardClick(spellTrap, index);
                } else if (spellTrap && safeOnCardClick && !isSelectingSpellTrapSlot && !isSelectingSpellTrapTarget) {
                  safeOnCardClick(spellTrap, index);
                }
              }}
              onDragOver={(e) => {
                if (!isOpponent && isEmpty && safeOnSpellTrapDrop) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('ring-4', 'ring-green-400', 'bg-green-400/20');
                }
              }}
              onDragLeave={(e) => {
                if (!isOpponent && isEmpty && safeOnSpellTrapDrop) {
                  e.currentTarget.classList.remove('ring-4', 'ring-green-400', 'bg-green-400/20');
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isOpponent && isEmpty && safeOnSpellTrapDrop) {
                  e.currentTarget.classList.remove('ring-4', 'ring-green-400', 'bg-green-400/20');
                  
                  const cardData = e.dataTransfer.getData('application/json');
                  if (cardData) {
                    try {
                      const card = JSON.parse(cardData);
                      const cardType = card.type || card.cardType;
                      const isTrap = cardType === 'Trap';
                      // Trap só pode ser setada, Spell pode ser setada ou ativada
                      const position = isTrap ? 'set' : 'set'; // Por padrão, setar. O usuário pode ativar depois se for Spell
                      safeOnSpellTrapDrop(card, index, position);
                    } catch (error) {
                      console.error('Erro ao processar drop de spell/trap:', error);
                    }
                  }
                }
              }}
              className={`zone-card rounded-lg w-[80px] h-[117px] transition-all bg-transparent relative overflow-hidden border-2 border-white ${
                spellTrap 
                  ? isSelectingSpellTrapTarget
                    ? 'ring-4 ring-yellow-400/50 cursor-pointer'
                    : ''
                  : 'hover:shadow-lg hover:shadow-white/30'
              } ${
                isSelectingSpellTrapSlot && !isOpponent && isEmpty
                  ? 'ring-4 ring-green-400/70 animate-pulse cursor-pointer'
                  : isEmpty
                  ? 'cursor-pointer'
                  : isSelectingSpellTrapTarget && spellTrap
                  ? 'cursor-pointer'
                  : 'cursor-default'
              }`}
              title={spellTrap ? spellTrap.name : isSelectingSpellTrapSlot && !isOpponent ? "Clique para colocar a carta aqui" : "Spell/Trap Zone"}
            >
              {spellTrap ? (() => {
                const cardImageUrl = getCardImage(spellTrap);
                
                return (
                  <>
                    {spellTrap.position === 'face-up' ? (
                      // Face-up: carta virada para cima - sem bordas, apenas a imagem
                      <div
                        className={`absolute inset-0 w-full h-full rounded-lg cursor-pointer ${
                          !isOpponent && (() => {
                            const cardType = spellTrap.type || spellTrap.cardType;
                            const spellType = spellTrap.spellType;
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toString().toLowerCase();
                            const cardName = ((spellTrap.name || spellTrap.cardName || '').toString()).toLowerCase();
                            return (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                              cardId.includes('unitedwestand') || cardName.includes('united we stand') || cardName.includes('unitedwestand') ||
                              cardId.includes('magepower') || cardName.includes('mage power') ||
                              cardId.includes('hornoftheunicorn') || cardId.includes('malevolentnuzzler');
                          })()
                            ? 'cursor-grab active:cursor-grabbing'
                            : ''
                        }`}
                        style={{
                          backgroundImage: cardImageUrl 
                            ? `url(${cardImageUrl})` 
                            : `url(${fallbackCard})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          aspectRatio: '59/86',
                          zIndex: 5,
                        }}
                        draggable={!isOpponent && (() => {
                          const cardType = spellTrap.type || spellTrap.cardType;
                          const spellType = spellTrap.spellType;
                          const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toString().toLowerCase();
                          const cardName = ((spellTrap.name || spellTrap.cardName || '').toString()).toLowerCase();
                          const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                               cardId.includes('unitedwestand') ||
                                               cardName.includes('united we stand') ||
                                               cardName.includes('unitedwestand') ||
                                               cardId.includes('magepower') ||
                                               cardName.includes('mage power') ||
                                               cardId.includes('hornoftheunicorn') ||
                                               cardId.includes('malevolentnuzzler');
                          return isEquipSpell;
                        })()}
                        onDragStart={(e) => {
                          if (!isOpponent) {
                            const cardType = spellTrap.type || spellTrap.cardType;
                            const spellType = spellTrap.spellType;
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toString().toLowerCase();
                            const cardName = ((spellTrap.name || spellTrap.cardName || '').toString()).toLowerCase();
                            const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                                 cardId.includes('unitedwestand') ||
                                                 cardName.includes('united we stand') ||
                                                 cardName.includes('unitedwestand') ||
                                                 cardId.includes('magepower') ||
                                                 cardName.includes('mage power') ||
                                                 cardId.includes('hornoftheunicorn') ||
                                                 cardId.includes('malevolentnuzzler');
                            
                            if (isEquipSpell) {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('application/json', JSON.stringify(spellTrap));
                              e.dataTransfer.setData('spellTrapZoneIndex', index.toString());
                            }
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (safeOnCardClick && !isSelectingSpellTrapSlot) {
                            // Só mostrar informações se a carta estiver face-up OU se não for do oponente
                            // Cartas viradas para baixo do oponente não devem revelar informações
                            if (spellTrap.position === 'face-up' || !isOpponent) {
                              safeOnCardClick(spellTrap, index);
                            }
                          }
                        }}
                      />
                    ) : (
                      // Set: carta virada para baixo (fundo de carta) - sem bordas
                      <div
                        className={`absolute inset-0 w-full h-full rounded-lg group cursor-pointer relative ${
                          !isOpponent && (() => {
                            const cardType = spellTrap.type || spellTrap.cardType;
                            const spellType = spellTrap.spellType;
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toString().toLowerCase();
                            const cardName = ((spellTrap.name || spellTrap.cardName || '').toString()).toLowerCase();
                            const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                                 cardId.includes('unitedwestand') ||
                                                 cardName.includes('united we stand') ||
                                                 cardName.includes('unitedwestand') ||
                                                 cardId.includes('magepower') ||
                                                 cardName.includes('mage power') ||
                                                 cardId.includes('hornoftheunicorn') ||
                                                 cardId.includes('malevolentnuzzler');
                            return isEquipSpell;
                          })()
                            ? 'cursor-grab active:cursor-grabbing'
                            : ''
                        }`}
                        style={{
                          backgroundImage: `url(${fallbackCard})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          aspectRatio: '59/86',
                          zIndex: 5,
                        }}
                        draggable={!isOpponent && (() => {
                          const cardType = spellTrap.type || spellTrap.cardType;
                          const spellType = spellTrap.spellType;
                          const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toString().toLowerCase();
                          const cardName = ((spellTrap.name || spellTrap.cardName || '').toString()).toLowerCase();
                          const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                               cardId.includes('unitedwestand') ||
                                               cardName.includes('united we stand') ||
                                               cardName.includes('unitedwestand') ||
                                               cardId.includes('magepower') ||
                                               cardName.includes('mage power') ||
                                               cardId.includes('hornoftheunicorn') ||
                                               cardId.includes('malevolentnuzzler');
                          return isEquipSpell;
                        })()}
                        onDragStart={(e) => {
                          if (!isOpponent) {
                            // Verificar se o clique foi no botão de ativação
                            const target = e.target as HTMLElement;
                            if (target.closest('button')) {
                              e.preventDefault();
                              return;
                            }
                            
                            const cardType = spellTrap.type || spellTrap.cardType;
                            const spellType = spellTrap.spellType;
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toString().toLowerCase();
                            const cardName = ((spellTrap.name || spellTrap.cardName || '').toString()).toLowerCase();
                            const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                                                 cardId.includes('unitedwestand') ||
                                                 cardName.includes('united we stand') ||
                                                 cardName.includes('unitedwestand') ||
                                                 cardId.includes('magepower') ||
                                                 cardName.includes('mage power') ||
                                                 cardId.includes('hornoftheunicorn') ||
                                                 cardId.includes('malevolentnuzzler');
                            
                            if (isEquipSpell) {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('application/json', JSON.stringify(spellTrap));
                              e.dataTransfer.setData('spellTrapZoneIndex', index.toString());
                            }
                          }
                        }}
                        onClick={(e) => {
                          // Não processar clique se foi no botão de ativação
                          const target = e.target as HTMLElement;
                          if (target.closest('button')) {
                            return;
                          }
                          
                          e.stopPropagation();
                          if (safeOnCardClick && !isSelectingSpellTrapSlot) {
                            // Só mostrar informações se a carta estiver face-up OU se não for do oponente
                            // Cartas viradas para baixo do oponente não devem revelar informações
                            if (spellTrap.position === 'face-up' || !isOpponent) {
                              safeOnCardClick(spellTrap, index);
                            }
                          }
                        }}
                        title={spellTrap.name || "Spell/Trap Set"}
                      >
                        {/* Botão de Ativação - aparece apenas para Spell cards que estão "set" e é o turno do jogador */}
                        {/* Trap cards não podem ser ativadas manualmente - só ativam automaticamente no turno do oponente */}
                        {/* Last Will só pode ser ativada se um monstro foi destruído neste turno */}
                        {(() => {
                          const cardId = spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '';
                          const cardName = (spellTrap.name || spellTrap.cardName || '').toLowerCase();
                          const isLastWill = cardId.toLowerCase().includes('lastwill') || 
                                            cardName.includes('last will');
                          
                          // Para Last Will, verificar se um monstro foi destruído neste turno
                          if (isLastWill && !monsterDestroyedThisTurn) {
                            return false; // Não mostrar botão se Last Will e nenhum monstro foi destruído
                          }
                          
                          return !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && safeOnActivateCard && 
                                 spellTrap.position === 'set' && 
                                 (spellTrap.type === 'Spell' || spellTrap.cardType === 'Spell');
                        })() && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              if (safeOnActivateCard) {
                                safeOnActivateCard(spellTrap, index);
                              }
                            }}
                            onMouseDown={(e) => {
                              // Prevenir que o drag comece quando clicar no botão
                              e.stopPropagation();
                            }}
                            className="absolute top-1 right-1 z-50 w-8 h-8 bg-gradient-to-br from-green-600/90 to-green-700/90 hover:from-green-500 hover:to-green-600 border-2 border-green-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-green-500/50 hover:shadow-green-500/70 pointer-events-auto"
                            title={`Ativar ${spellTrap.name || spellTrap.cardName || 'Spell'}`}
                          >
                            <span className="text-sm">✨</span>
                          </motion.button>
                        )}
                      </div>
                    )}
                  </>
                );
              })() : null}
            </motion.div>
          );
        })}

        {/* Deck / Extra Deck - Modernizado */}
        <motion.div 
          className="zone-card border-2 border-white rounded-lg w-[80px] h-[117px] relative overflow-hidden transition-all cursor-pointer bg-transparent"
          style={{ aspectRatio: '59/86' }}>
          {deckCount > 0 ? (
            <>
              {/* Imagem de verso de carta (usa sleeve equipada ou fundo padrão) */}
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${fallbackCard})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              {/* Contador de cartas no canto inferior direito */}
              <div className="absolute bottom-1 right-1 z-10 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded">
                {deckCount}
              </div>
            </>
          ) : (
            /* Deck vazio - Modernizado */
            <div className="absolute inset-0 flex items-center justify-center  bg-slate-800/60 rounded-xl">
              <div className="text-center">
                <div className="text-slate-400 text-xs font-bold">
                  DECK
                </div>
                <div className="text-slate-500 text-sm">
                  VAZIO
                </div>
              </div>
            </div>
          )}
        </motion.div>
        </div>
      </div>
      </div>
    </motion.div>
  );
};

export default DuelField;
