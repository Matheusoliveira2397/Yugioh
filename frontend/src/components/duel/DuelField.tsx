import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { getCardImage } from '../../utils/cardImage';
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
  positionChangedThisTurn?: boolean; // Se já mudou a posição de algum monstro neste turno
  onMonsterDrop?: (attackerZoneIndex: number, targetZoneIndex: number | null) => void; // Callback quando soltar monstro para atacar
  onSpellTrapDrop?: (card: any, zoneIndex: number, position: 'set' | 'face-up') => void; // Callback quando soltar spell/trap da mão
  onEquipSpellDrop?: (card: any, monsterZoneIndex: number, spellTrapZoneIndex?: number) => void; // Callback quando soltar spell equip em um monstro (spellTrapZoneIndex se vier do campo)
  onActivateMonsterEffect?: (monsterZoneIndex: number) => void; // Callback para ativar efeito de monstro (ex: ChaosSorcerer)
  monsterDestroyedThisTurn?: boolean; // Flag para Last Will - indica se um monstro foi destruído neste turno
}

const DuelField: React.FC<DuelFieldProps> = ({
  isOpponent,
  deckCount = 40,
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
  positionChangedThisTurn = false,
  onMonsterDrop,
  onSpellTrapDrop,
  onEquipSpellDrop,
  onActivateMonsterEffect,
  monsterDestroyedThisTurn = false,
}) => {
  // 5 Zones para monstros e spell/trap
  const monsterZones = Array(5).fill(null);
  const spellTrapZones = Array(5).fill(null);

  // Cada jogador tem sua imagem de campo (ou playmat equipado)
  const defaultFieldImage = isOpponent 
    ? '/images/CampoDeDuelo01.jpg' 
    : '/images/CampoDeDuelo02.jpg';
  const fieldImage = playmatImage || defaultFieldImage;

  const fallbackCard = cardBackImage || '/images/fundoCarta.webp';
  
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
      className="relative aspect-[21/9] w-full max-w-5xl mx-auto rounded-2xl border-2 border-white/20 shadow-2xl mb-1 flex items-center justify-center"
      style={{ overflow: 'visible' }}
      onDragOver={(e) => {
        // Permitir drop apenas no playmat do oponente para ataque direto
        if (isOpponent && canDirectAttack && onMonsterDrop) {
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
        if (isOpponent && canDirectAttack && onMonsterDrop) {
          const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
          if (!isNaN(attackerZoneIndex)) {
            onMonsterDrop(attackerZoneIndex, null);
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
            left: `${dragPosition.x - 50}px`,
            top: `${dragPosition.y - 73}px`,
            width: '100px',
            height: '146px',
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
        {/* Imagem de Fundo do Campo - Playmat preenchendo todo o campo */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${fieldImage})`,
            // 'cover' para preencher toda a área mantendo proporção do playmat
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'local',
            opacity: 1,
            filter: 'brightness(1) saturate(1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />

        {/* Zonas do Campo (por cima da imagem) - Modernizado */}
        <div className="relative px-6 pt-3 pb-0" style={{ overflow: 'visible' }}>
      {/* Linha 1 (Topo): Field Zone | 5 Monster Zones | Graveyard */}
      <div className="grid grid-cols-7 gap-6 mt-6 justify-items-center">
        {/* Field Zone / Graveyard - Modernizado */}
        <motion.div 
          className="zone-card border-2 border-yellow-400/60 rounded-lg w-[100px] h-[146px] transition-all cursor-pointer flex items-center justify-center bg-transparent"
          style={{ aspectRatio: '59/86' }}>
          <div>
            <div className="text-yellow-300 text-sm font-bold drop-shadow-lg">
              {isOpponent ? 'FIELD' : 'FIELD'}
            </div>
          </div>
        </motion.div>

        {/* 5 Monster Zones - Modernizado */}
        {monsterZones.map((_, index) => {
          const monster = monsters[index];
          const isDefense = monster && (monster.position === 'defense' || monster.position === 'set');
          const isAttack = monster && monster.position === 'attack';
          const hasMonster = monster !== null && monster !== undefined;
          
          // Debug: verificar posição do monstro
          if (monster && process.env.NODE_ENV === 'development') {
            console.log(`[DuelField] Monstro ${monster.name} na zona ${index}: position=${monster.position}, isDefense=${isDefense}, isAttack=${isAttack}`);
          }
          
          
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
                  if (isOpponent && onMonsterDrop) {
                    // Ataque de monstro no oponente
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    e.currentTarget.classList.add('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
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
                      // Permitir drop em qualquer caso se houver onEquipSpellDrop
                    }
                    
                    // Permitir drop se for spell equip ou se tiver onEquipSpellDrop (verificação completa no onDrop)
                    if (onEquipSpellDrop) {
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
                  e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105', 'ring-green-400/70', 'bg-green-400/20');
                }}
                onDrop={(e) => {
                  console.log('🎯 [DuelField] onDrop CHAMADO!', {
                    isOpponent,
                    hasMonster,
                    monsterPosition: monster?.position,
                    onEquipSpellDrop: !!onEquipSpellDrop,
                    onMonsterDrop: !!onMonsterDrop,
                    index
                  });
                  
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105', 'ring-green-400/70', 'bg-green-400/20');
                  
                  if (isOpponent && onMonsterDrop) {
                    // Ataque de monstro no oponente (pode ser face-up ou face-down)
                    const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
                    if (!isNaN(attackerZoneIndex)) {
                      if (hasMonster) {
                        // Atacar monstro específico (face-up ou face-down)
                        console.log(`⚔️ [DuelField] Atacando monstro do oponente na zona ${index}, posição: ${monster?.position}`);
                        onMonsterDrop(attackerZoneIndex, index);
                      } else {
                        // Verificar se pode fazer ataque direto
                        const hasAnyMonster = monsters.some((m: any) => m !== null && m !== undefined);
                        if (!hasAnyMonster) {
                          // Ataque direto
                          onMonsterDrop(attackerZoneIndex, null);
                        } else {
                          alert('Você não pode atacar diretamente enquanto o oponente tiver monstros no campo!');
                        }
                      }
                    }
                  } else if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense')) {
                    // Verificar se é uma spell equip sendo arrastada (da mão ou do campo)
                    const cardData = e.dataTransfer.getData('application/json');
                    const spellTrapZoneIndex = e.dataTransfer.getData('spellTrapZoneIndex');
                    const isFromField = spellTrapZoneIndex !== '';
                    
                    console.log('🔍 [DuelField] onDrop - spell equip:', {
                      cardData: !!cardData,
                      cardDataLength: cardData ? cardData.length : 0,
                      spellTrapZoneIndex,
                      isFromField,
                      hasMonster,
                      monsterPosition: monster.position,
                      onEquipSpellDrop: !!onEquipSpellDrop,
                      monsterZoneIndex: index
                    });
                    
                    if (!onEquipSpellDrop) {
                      console.error('❌ [DuelField] onDrop - onEquipSpellDrop não está definido!');
                      return;
                    }
                    
                    if (!cardData || cardData.trim() === '') {
                      console.error('❌ [DuelField] onDrop - cardData está vazio ou não existe!');
                      console.log('🔍 [DuelField] onDrop - tipos de dados disponíveis:', e.dataTransfer.types);
                      return;
                    }
                    
                    try {
                      const card = JSON.parse(cardData);
                      const cardType = card.type || card.cardType;
                      const spellType = card.spellType;
                      const cardId = (card.idCarta || card.id || card.cardId || '').toLowerCase();
                      const cardName = card.name || card.cardName || '';
                      
                      // Verificar se é spell Equip - verificar tanto 'Equip' quanto possíveis variações
                      const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) || 
                                           cardId.includes('unitedwestand') || 
                                           cardId.includes('magepower') ||
                                           cardId.includes('hornoftheunicorn') ||
                                           cardId.includes('malevolentnuzzler') ||
                                           cardId.includes('equip') ||
                                           (cardName && cardName.toLowerCase().includes('equip'));
                      
                      console.log('🔍 [DuelField] onDrop - card parsed:', {
                        cardType,
                        spellType,
                        cardId,
                        cardName,
                        isEquipSpell,
                        fullCard: card
                      });
                      
                      if (isEquipSpell) {
                        // Equipar spell no monstro (suporta múltiplos equips)
                        console.log('✅ [DuelField] onDrop - chamando onEquipSpellDrop com:', {
                          card: cardName,
                          monsterZoneIndex: index,
                          spellTrapZoneIndex: isFromField ? parseInt(spellTrapZoneIndex, 10) : undefined
                        });
                        onEquipSpellDrop(card, index, isFromField ? parseInt(spellTrapZoneIndex, 10) : undefined);
                        setDraggingCardIndex(null);
                        return;
                      } else {
                        console.log('⚠️ [DuelField] onDrop - não é spell equip:', {
                          cardType,
                          spellType,
                          cardId,
                          cardName
                        });
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
                  if (isSelectingTarget && isOpponent && hasMonster && onMonsterClick) {
                    // Pode atacar monstro em qualquer posição (ataque ou defesa)
                    onMonsterClick(index);
                  } else if (isSelectingTarget && isOpponent && !hasMonster && onMonsterClick) {
                    // Ataque direto - só permitir se não houver monstros no campo
                    const hasAnyMonster = monsters.some((m: any) => m !== null && m !== undefined);
                    if (!hasAnyMonster) {
                      onMonsterClick(-1);
                    } else {
                      // Não permitir ataque direto se houver monstros
                      alert('Você não pode atacar diretamente enquanto o oponente tiver monstros no campo!');
                    }
                  } else if (hasMonster && onCardClick) {
                    // Se está selecionando alvo de monstro (ex: SnowmanEater, ChaosSorcerer), permitir clicar
                    if (isSelectingMonsterTarget) {
                      // Verificar se o monstro está face-up
                      const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                      if (isFaceUp) {
                        onCardClick(monster, index);
                      } else {
                        // Mostrar mensagem se tentar escolher um monstro face-down
                        alert('Você só pode selecionar monstros face-up (ataque ou defesa)');
                      }
                    } else if (!isSelectingTarget) {
                      // Mostrar informações da carta apenas se não estiver selecionando alvo de ataque
                      onCardClick(monster);
                    }
                  }
                }}
                className={`zone-card rounded-lg w-[100px] h-[146px] transition-all bg-transparent relative ${
                  hasMonster 
                    ? isSelectingMonsterTarget && (monster.position === 'attack' || monster.position === 'defense')
                      ? 'border-4 border-blue-400/80 ring-4 ring-blue-400/50 cursor-pointer'
                      : 'border-0' // Sem borda quando há carta no slot (ataque ou defesa)
                    : 'border-2 border-red-400/50 hover:border-red-300/70 hover:shadow-lg hover:shadow-red-500/40' // Borda normal quando vazio
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
                        if (!isOpponent && canAttack && currentPhase === 'BATTLE') {
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
                      if (!isOpponent && canAttack && currentPhase === 'BATTLE') {
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
                      if (!isOpponent && canAttack && currentPhase === 'BATTLE') {
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
                      if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense') && onEquipSpellDrop) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(e) => {
                      console.log('🎯 [DuelField] onDrop no elemento do monstro!');
                      // Processar drop diretamente no elemento do monstro
                      if (!isOpponent && hasMonster && (monster.position === 'attack' || monster.position === 'defense') && onEquipSpellDrop) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const cardData = e.dataTransfer.getData('application/json');
                        const spellTrapZoneIndex = e.dataTransfer.getData('spellTrapZoneIndex');
                        const isFromField = spellTrapZoneIndex !== '';
                        
                        console.log('🔍 [DuelField] onDrop no monstro - spell equip:', {
                          cardData: !!cardData,
                          cardDataLength: cardData ? cardData.length : 0,
                          spellTrapZoneIndex,
                          isFromField,
                          hasMonster,
                          monsterPosition: monster.position,
                          onEquipSpellDrop: !!onEquipSpellDrop,
                          monsterZoneIndex: index
                        });
                        
                        if (!cardData || cardData.trim() === '') {
                          console.error('❌ [DuelField] onDrop no monstro - cardData está vazio!');
                          return;
                        }
                        
                        try {
                          const card = JSON.parse(cardData);
                          const cardType = card.type || card.cardType;
                          const spellType = card.spellType;
                          const cardId = (card.idCarta || card.id || card.cardId || '').toLowerCase();
                          const cardName = card.name || card.cardName || '';
                          const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                                               cardId.includes('unitedwestand') || 
                                               cardId.includes('magepower') ||
                                               cardId.includes('hornoftheunicorn') ||
                                               cardId.includes('malevolentnuzzler');
                          
                          if (isEquipSpell) {
                            // Permitir múltiplos equips - os efeitos serão somados
                            console.log('✅ [DuelField] onDrop no monstro - chamando onEquipSpellDrop (suporta múltiplos equips)');
                            onEquipSpellDrop(card, index, isFromField ? parseInt(spellTrapZoneIndex, 10) : undefined);
                            setDraggingCardIndex(null);
                          }
                        } catch (err) {
                          console.error('❌ [DuelField] onDrop no monstro - erro:', err);
                        }
                      }
                    }}
                    onDragStart={(e) => {
                      if (!isOpponent && canAttack && currentPhase === 'BATTLE') {
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
                          canDrag = !monster.attackedThisTurn;
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
                      if (isSelectingTarget && isOpponent && onMonsterClick) {
                        onMonsterClick(index);
                      } else if (onCardClick && !isSelectingTarget) {
                        // Mostrar informações da carta apenas se não estiver selecionando alvo
                        // Se está selecionando alvo de monstro (ex: SnowmanEater), passar o índice
                        if (isSelectingMonsterTarget) {
                          const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                          if (isFaceUp) {
                            onCardClick(monster, index);
                          }
                        } else {
                          onCardClick(monster);
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
                    {/* Indicador de ATK na parte inferior da carta */}
                    {(() => {
                      const baseAtk = monster.atk || 0;
                      const equipmentBonus = monster.equipmentBonusAtk || 0;
                      const spellCounterBonus = monster.spellCounterBonusAtk || 0;
                      const totalAtk = baseAtk + equipmentBonus + spellCounterBonus;
                      const hasBonus = equipmentBonus > 0 || spellCounterBonus > 0;
                      
                      return (
                        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-20">
                          <div className={`px-2 py-1 rounded-lg shadow-lg border-2 ${
                            hasBonus 
                              ? 'bg-gradient-to-r from-yellow-600/90 to-orange-600/90 border-yellow-400/70' 
                              : 'bg-black/80 border-red-500/70'
                          }`}>
                            <div className="flex items-center gap-1">
                              <span className="text-white text-xs font-bold">ATK</span>
                              <span className={`text-sm font-bold ${
                                hasBonus ? 'text-yellow-200' : 'text-white'
                              }`}>
                                {totalAtk.toLocaleString()}
                              </span>
                              {hasBonus && (
                                <span className="text-yellow-300 text-xs">(+{equipmentBonus + spellCounterBonus})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                ) : null}
                
                {/* Botão de ataque - aparece durante Battle Phase em monstros em posição de ataque que ainda não atacaram */}
                {!isOpponent && canAttack && isAttack && onAttackClick && (() => {
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
                  
                  // Para MatazaTheZapper ou CyberTwinDragon, verificar se já atacou 2 vezes
                  if (isMatazaTheZapper || isCyberTwinDragon) {
                    const attacksThisTurn = monster.attacksThisTurn || 0;
                    return attacksThisTurn < 2;
                  }
                  
                  // Para outros monstros, verificar se já atacou uma vez
                  return !monster.attackedThisTurn;
                })() && (
                  <motion.button
                    whileHover={{}}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onAttackClick) {
                        onAttackClick(index);
                      }
                    }}
                    className="absolute top-1 right-1 z-50 w-8 h-8 bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-2 border-red-400/70 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-lg shadow-red-500/50 hover:shadow-red-500/70"
                    title={`Atacar com ${monster.name} (ATK: ${(monster.atk || 0) + (monster.equipmentBonusAtk || 0) + (monster.spellCounterBonusAtk || 0)})`}
                  >
                    <span className="text-sm">⚔️</span>
                  </motion.button>
                )}
                
                {/* Botões para mudar posição - apenas nas fases principais, para o próprio jogador, e se não foi invocado no turno atual */}
                {!isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && onChangePosition && hasMonster && (
                  (() => {
                    const summonedTurn = monster.summonedTurn;
                    const monsterPositionChanged = monster.positionChangedThisTurn === true;
                    // Cyber Dragon invocado por invocação especial pode mudar posição no mesmo turno
                    const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                    const monsterName = (monster.name || monster.cardName || '').toLowerCase();
                    const isCyberDragon = monsterCardId.toLowerCase().includes('cyberdragon') || 
                                         monsterName === 'cyber dragon' ||
                                         monsterName === 'cyberdragon';
                    const isSpecialSummoned = monster.specialSummoned === true;
                    const canChangePositionSameTurn = isCyberDragon && isSpecialSummoned;
                    const canChangePosition = (canChangePositionSameTurn || (!summonedTurn || summonedTurn !== currentTurn)) && !monsterPositionChanged;
                    
                    return (
                      <div className="absolute top-1 left-1 flex gap-1 z-50">
                        {/* Botão para mudar para ataque */}
                        {monster.position !== 'attack' && (
                          <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (monsterPositionChanged) {
                                alert('Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno!');
                                return;
                              }
                              if (summonedTurn === currentTurn && !canChangePositionSameTurn) {
                                alert('Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado!');
                                return;
                              }
                              if (onChangePosition) {
                                onChangePosition(index, 'attack');
                              }
                            }}
                            disabled={!canChangePosition}
                            className={`w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg ${
                              !canChangePosition
                                ? 'bg-gradient-to-br from-gray-600/50 to-gray-700/50 border-gray-500/50 cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-br from-red-600/90 to-red-700/90 hover:from-red-500 hover:to-red-600 border-red-400/70 cursor-pointer shadow-red-500/40 hover:shadow-red-500/60'
                            }`}
                            title={!canChangePosition 
                              ? (monsterPositionChanged 
                                  ? 'Este monstro já mudou posição neste turno' 
                                  : 'Não pode mudar posição no mesmo turno da invocação') 
                              : 'Mudar para Ataque'}
                          >
                            <span className="text-sm">⚔️</span>
                          </motion.button>
                        )}
                        
                        {/* Botão para mudar para defesa */}
                        {monster.position !== 'defense' && monster.position !== 'set' && (
                          <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (monsterPositionChanged) {
                                alert('Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno!');
                                return;
                              }
                              if (summonedTurn === currentTurn && !canChangePositionSameTurn) {
                                alert('Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado!');
                                return;
                              }
                              if (onChangePosition) {
                                onChangePosition(index, 'defense');
                              }
                            }}
                            disabled={!canChangePosition}
                            className={`w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg ${
                              !canChangePosition
                                ? 'bg-gradient-to-br from-gray-600/50 to-gray-700/50 border-gray-500/50 cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-br from-blue-600/90 to-blue-700/90 hover:from-blue-500 hover:to-blue-600 border-blue-400/70 cursor-pointer shadow-blue-500/40 hover:shadow-blue-500/60'
                            }`}
                            title={!canChangePosition 
                              ? (monsterPositionChanged 
                                  ? 'Este monstro já mudou posição neste turno' 
                                  : 'Não pode mudar posição no mesmo turno da invocação') 
                              : 'Mudar para Defesa'}
                          >
                            <span className="text-sm">🛡️</span>
                          </motion.button>
                        )}
                        
                        {/* Botão para ativar efeito do Breaker The Magical Warrior (remover marcador) */}
                        {(() => {
                          const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
                          const isBreaker = monsterCardId.toLowerCase().includes('breakerthemagicalwarrior') ||
                                            monsterCardId.toLowerCase().includes('breaker') ||
                                            monster.name?.toLowerCase().includes('breaker');
                          const hasSpellCounters = monster.spellCounters && monster.spellCounters > 0;
                          const canActivateBreaker = !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && 
                                                     isBreaker && hasSpellCounters && onBreakerRemoveCounter;
                          
                          return canActivateBreaker ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onBreakerRemoveCounter) {
                                  onBreakerRemoveCounter(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-purple-600/90 to-purple-700/90 hover:from-purple-500 hover:to-purple-600 border-purple-400/70 cursor-pointer shadow-purple-500/40 hover:shadow-purple-500/60"
                              title={`Remover Marcador de Magia e destruir 1 Spell/Trap (${monster.spellCounters} marcador(es))`}
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
                                                           isChaosSorcerer && !effectUsedThisTurn && onActivateMonsterEffect;
                          
                          return canActivateChaosSorcerer ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onActivateMonsterEffect) {
                                  onActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-indigo-600/90 to-purple-600/90 hover:from-indigo-500 hover:to-purple-500 border-indigo-400/70 cursor-pointer shadow-indigo-500/40 hover:shadow-indigo-500/60"
                              title="Efeito do ChaosSorcerer: Uma vez por turno, banir 1 monstro face-up do oponente (não pode atacar neste turno)"
                            >
                              <span className="text-sm">🌟</span>
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
                                                          isRedEyesDarknessMetalDragon && !effectUsedThisTurn && onActivateMonsterEffect;
                          
                          return canActivateRedEyesEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onActivateMonsterEffect) {
                                  onActivateMonsterEffect(index);
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
                                                             isCyberStein && !effectUsedThisTurn && onActivateMonsterEffect;
                          
                          return canActivateCyberSteinEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onActivateMonsterEffect) {
                                  onActivateMonsterEffect(index);
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
                                                                   isDarkArmedDragon && !effectUsedThisTurn && onActivateMonsterEffect;
                          
                          return canActivateDarkArmedDragonEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onActivateMonsterEffect) {
                                  onActivateMonsterEffect(index);
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
                                                               isExiledForce && !effectUsedThisTurn && onActivateMonsterEffect;
                          
                          return canActivateExiledForceEffect ? (
                            <motion.button
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onActivateMonsterEffect) {
                                  onActivateMonsterEffect(index);
                                }
                              }}
                              className="w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg bg-gradient-to-br from-orange-600/90 to-red-600/90 hover:from-orange-500 hover:to-red-500 border-orange-400/70 cursor-pointer shadow-orange-500/40 hover:shadow-orange-500/60"
                              title="Efeito do Exiled Force: Você pode tributar este monstro; destrua 1 monstro no campo."
                            >
                              <span className="text-sm">💥</span>
                            </motion.button>
                          ) : null;
                        })()}
                        
                        {/* Botão para virar face-down (set) para face-up */}
                        {monster.position === 'set' && (
                          <motion.button
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (monsterPositionChanged) {
                                alert('Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno!');
                                return;
                              }
                              if (summonedTurn === currentTurn && !canChangePositionSameTurn) {
                                alert('Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado!');
                                return;
                              }
                              // Quando está em 'set' (face-down), pode virar para 'defense' (face-up em defesa) ou 'attack' (face-up em ataque)
                              // Por padrão, vamos virar para 'defense'
                              if (onChangePosition) {
                                onChangePosition(index, 'defense');
                              }
                            }}
                            disabled={!canChangePosition}
                            className={`w-8 h-8 border-2 rounded-lg flex items-center justify-center transition-all shadow-lg ${
                              !canChangePosition
                                ? 'bg-gradient-to-br from-gray-600/50 to-gray-700/50 border-gray-500/50 cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-br from-yellow-600/90 to-yellow-700/90 hover:from-yellow-500 hover:to-yellow-600 border-yellow-400/70 cursor-pointer shadow-yellow-500/40 hover:shadow-yellow-500/60'
                            }`}
                            title={!canChangePosition 
                              ? (monsterPositionChanged 
                                  ? 'Este monstro já mudou posição neste turno' 
                                  : 'Não pode mudar posição no mesmo turno da invocação') 
                              : 'Virar para cima (Defesa)'}
                          >
                            <span className="text-sm">🔄</span>
                          </motion.button>
                        )}
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
                  className={`absolute group ${isSelectingTarget && isOpponent ? 'cursor-pointer' : onCardClick ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Permitir clicar na carta em defesa para atacar
                    if (isSelectingTarget && isOpponent && onMonsterClick) {
                      onMonsterClick(index);
                    } else if (onCardClick && !isSelectingTarget) {
                      // Só mostrar informações se a carta estiver face-up OU se não for do oponente
                      // Cartas viradas para baixo do oponente não devem revelar informações
                      if (monster.position !== 'set' || !isOpponent) {
                        // Se está selecionando alvo de monstro (ex: SnowmanEater), passar o índice
                        if (isSelectingMonsterTarget) {
                          const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                          if (isFaceUp) {
                            onCardClick(monster, index);
                          }
                        } else {
                          onCardClick(monster);
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
                    pointerEvents: (isSelectingTarget && isOpponent) || onCardClick ? 'auto' : 'none',
                    overflow: 'visible',
                  }}
                >
                  {monster.position === 'set' ? (
                    // Face-down (set): mostrar skin da carta
                    // Quando invocamos em defesa da mão, sempre vai face-down (set)
                    <div
                      className={isSelectingTarget && isOpponent ? 'ring-4 ring-yellow-400/70' : ''}
                      onDragOver={(e) => {
                        // Permitir drop de ataque em monstros face-down do oponente
                        if (isOpponent && onMonsterDrop) {
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
                        if (isOpponent && onMonsterDrop) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.classList.remove('ring-4', 'ring-yellow-400/70', 'bg-yellow-400/20', 'scale-105');
                          
                          const attackerZoneIndex = parseInt(e.dataTransfer.getData('attackerZoneIndex'), 10);
                          if (!isNaN(attackerZoneIndex)) {
                            console.log(`⚔️ [DuelField] Atacando monstro face-down do oponente na zona ${index}`);
                            onMonsterDrop(attackerZoneIndex, index);
                          }
                        }
                      }}
                      style={{
                        backgroundImage: `url(${fallbackCard})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        transform: 'rotate(90deg)', // Rotacionar 90 graus para ficar deitada
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
                    (() => {
                      // Debug: verificar se o monstro tem as propriedades necessárias
                      if (process.env.NODE_ENV === 'development') {
                        console.log(`[DuelField] Monstro em defesa face-up:`, {
                          name: monster.name,
                          position: monster.position,
                          idCarta: monster.idCarta,
                          id: monster.id,
                          cardId: monster.cardId,
                          cardImage: monster.cardImage,
                        });
                      }
                      
                      return (
                        <div
                          className={isSelectingTarget && isOpponent ? 'ring-4 ring-yellow-400/70' : onCardClick ? 'cursor-pointer' : ''}
                          style={{
                            transform: 'rotate(90deg)', // Rotacionar 90 graus para ficar deitada
                            transformOrigin: 'center center',
                            borderRadius: '8px',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                            width: '100%',
                            height: '100%',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Se está selecionando alvo e é monstro do oponente, processar ataque
                            if (isSelectingTarget && isOpponent && onMonsterClick) {
                              onMonsterClick(index);
                            } else if (onCardClick && !isSelectingTarget) {
                              // Mostrar informações da carta apenas se não estiver selecionando alvo
                              // Se está selecionando alvo de monstro (ex: SnowmanEater), passar o índice
                        if (isSelectingMonsterTarget) {
                          const isFaceUp = monster.position === 'attack' || monster.position === 'defense';
                          if (isFaceUp) {
                            onCardClick(monster, index);
                          }
                        } else {
                          onCardClick(monster);
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
                      );
                    })()
                  )}
                  </motion.div>
              ) : null}
            </div>
          );
        })}

        {/* Graveyard / Field Zone - Modernizado */}
        <motion.div 
          onClick={onGraveyardClick}
          className="zone-card border-2 border-gray-400/60 rounded-lg w-[100px] h-[146px] relative overflow-hidden transition-all cursor-pointer bg-transparent"
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
            <div className="absolute inset-0 flex items-center justify-center">
              <div>
                <div className="text-gray-300 text-sm font-bold drop-shadow-lg">
                  GY
                </div>
                <div className="text-gray-200 text-base font-bold drop-shadow-lg">0</div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Linha 2 (Baixo): Extra Deck | 5 Spell/Trap Zones | Deck */}
      <div className="grid grid-cols-7 gap-6 justify-items-center mt-12">
        {/* Extra Deck / Deck - Modernizado */}
        <motion.div 
              onClick={onExtraDeckClick}
              className="zone-card border-2 border-purple-400/60 rounded-lg w-[100px] h-[146px] relative overflow-hidden bg-transparent transition-all cursor-pointer hover:border-purple-300/80 hover:shadow-lg hover:shadow-purple-500/40"
              style={{ aspectRatio: '59/86' }}>
          {extraDeck && extraDeck.length > 0 ? (
            <>
              {/* Mostrar a primeira carta do extra deck empilhada */}
              <div className="absolute inset-0">
                <CardImage
                  card={extraDeck[0]}
                  className="w-full h-full"
                  fallback={cardBackImage || '/images/fundoCarta.webp'}
                />
              </div>
              {/* Contador de cartas */}
              <div className="absolute bottom-1 right-1 z-10 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded">
                {extraDeck.length}
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div>
                <div className="text-purple-300 text-sm font-bold drop-shadow-lg">
                  {isOpponent ? 'EXTRA' : 'EXTRA'}
                </div>
                <div className="text-purple-200 text-base font-bold drop-shadow-lg">
                  0
                </div>
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
                if (isSelectingSpellTrapSlot && !isOpponent && isEmpty && onSpellTrapSlotClick) {
                  onSpellTrapSlotClick(index);
                } else if (isSelectingSpellTrapTarget && !isEmpty && spellTrap && onCardClick) {
                  // Selecionando alvo para destruir spell/trap
                  onCardClick(spellTrap, index);
                } else if (spellTrap && onCardClick && !isSelectingSpellTrapSlot && !isSelectingSpellTrapTarget) {
                  onCardClick(spellTrap, index);
                }
              }}
              onDragOver={(e) => {
                if (!isOpponent && isEmpty && onSpellTrapDrop) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('ring-4', 'ring-green-400', 'bg-green-400/20');
                }
              }}
              onDragLeave={(e) => {
                if (!isOpponent && isEmpty && onSpellTrapDrop) {
                  e.currentTarget.classList.remove('ring-4', 'ring-green-400', 'bg-green-400/20');
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isOpponent && isEmpty && onSpellTrapDrop) {
                  e.currentTarget.classList.remove('ring-4', 'ring-green-400', 'bg-green-400/20');
                  
                  const cardData = e.dataTransfer.getData('application/json');
                  if (cardData) {
                    try {
                      const card = JSON.parse(cardData);
                      const cardType = card.type || card.cardType;
                      const isTrap = cardType === 'Trap';
                      // Trap só pode ser setada, Spell pode ser setada ou ativada
                      const position = isTrap ? 'set' : 'set'; // Por padrão, setar. O usuário pode ativar depois se for Spell
                      onSpellTrapDrop(card, index, position);
                    } catch (error) {
                      console.error('Erro ao processar drop de spell/trap:', error);
                    }
                  }
                }
              }}
              className={`zone-card rounded-lg w-[100px] h-[146px] transition-all bg-transparent relative overflow-hidden ${
                spellTrap 
                  ? isSelectingSpellTrapTarget
                    ? 'border-4 border-yellow-400/80 ring-4 ring-yellow-400/50 cursor-pointer'
                    : 'border-0' // Sem borda quando há carta no slot
                  : 'border-2 border-green-400/50 hover:border-green-300/70 hover:shadow-lg hover:shadow-green-500/40' // Borda normal quando vazio
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
                          !isOpponent && (spellTrap.type === 'Spell' || spellTrap.cardType === 'Spell') && spellTrap.spellType === 'Equip'
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
                          const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toLowerCase();
                          const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                                               cardId.includes('unitedwestand') || 
                                               cardId.includes('magepower') ||
                                               cardId.includes('hornoftheunicorn') ||
                                               cardId.includes('malevolentnuzzler');
                          return isEquipSpell;
                        })()}
                        onDragStart={(e) => {
                          if (!isOpponent) {
                            const cardType = spellTrap.type || spellTrap.cardType;
                            const spellType = spellTrap.spellType;
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toLowerCase();
                            const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                                                 cardId.includes('unitedwestand') || 
                                                 cardId.includes('magepower') ||
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
                          if (onCardClick && !isSelectingSpellTrapSlot) {
                            // Só mostrar informações se a carta estiver face-up OU se não for do oponente
                            // Cartas viradas para baixo do oponente não devem revelar informações
                            if (spellTrap.position === 'face-up' || !isOpponent) {
                              onCardClick(spellTrap, index);
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
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toLowerCase();
                            const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                                                 cardId.includes('unitedwestand') || 
                                                 cardId.includes('magepower') ||
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
                          const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toLowerCase();
                          const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                                               cardId.includes('unitedwestand') || 
                                               cardId.includes('magepower') ||
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
                            const cardId = (spellTrap.idCarta || spellTrap.id || spellTrap.cardId || '').toLowerCase();
                            const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                                                 cardId.includes('unitedwestand') || 
                                                 cardId.includes('magepower') ||
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
                          if (onCardClick && !isSelectingSpellTrapSlot) {
                            // Só mostrar informações se a carta estiver face-up OU se não for do oponente
                            // Cartas viradas para baixo do oponente não devem revelar informações
                            if (spellTrap.position === 'face-up' || !isOpponent) {
                              onCardClick(spellTrap, index);
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
                          
                          return !isOpponent && isMyTurn && (currentPhase === 'MAIN1' || currentPhase === 'MAIN2') && onActivateCard && 
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
                              if (onActivateCard) {
                                onActivateCard(spellTrap, index);
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
          className="zone-card border-0 rounded-lg w-[100px] h-[146px] relative overflow-hidden transition-all cursor-pointer bg-transparent"
          style={{ aspectRatio: '59/86' }}>
          {deckCount > 0 ? (
            <>
              {/* Imagem de verso de carta (usa skin de carta equipada ou fundo padrão) */}
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
