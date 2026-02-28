import { Injectable } from '@nestjs/common';
import { Duel, TurnPhase } from '../../entities/duel.entity';
import { DuelUtilsService } from '../duel-utils.service';
import { logger } from '../../../../common/utils/logger.util';

/**
 * Serviço responsável por validações de ataque
 * Separa a lógica de validação do DuelsService principal
 * 
 * Responsabilidades:
 * - Validar se o monstro pode atacar
 * - Validar se está na fase correta
 * - Validar limites de ataque (1 vez por turno, exceto especiais)
 * - Validar bloqueios (SwordsOfRevealingLight, etc)
 */
@Injectable()
export class AttackValidationService {
  constructor(
    private duelUtils: DuelUtilsService,
  ) {}

  /**
   * Valida se um ataque pode ser realizado
   */
  validateAttack(
    duel: Duel,
    userId: number,
    attackerZoneIndex: number,
    attacker: any
  ): { valid: boolean; message?: string } {
    // Verificar se é o turno do jogador
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    
    if (!isCurrentTurn) {
      return { valid: false, message: 'Não é seu turno' };
    }

    // Verificar se está na fase BATTLE
    if (duel.currentPhase !== TurnPhase.BATTLE) {
      return { valid: false, message: 'Você só pode atacar na fase de batalha' };
    }

    // Verificar se o monstro existe e está em posição de ataque
    if (!attacker || attacker.position !== 'attack') {
      return { valid: false, message: 'Monstro atacante inválido ou não está em posição de ataque' };
    }

    // Verificar se ChaosSorcerer não pode atacar
    if (attacker.cannotAttackThisTurn === true) {
      return { valid: false, message: 'ChaosSorcerer não pode atacar no turno em que você ativar seu efeito!' };
    }

    // Verificar limites de ataque
    const monsterCardId = attacker.idCarta || attacker.id || attacker.cardId;
    const monsterName = (attacker.name || attacker.cardName || '').toLowerCase();
    const isMatazaTheZapper = this.duelUtils.isExactCard(attacker, 'MatazaTheZapper');
    const isCyberTwinDragon = this.duelUtils.isExactCard(attacker, 'CyberTwinDragon');
    
    const maxAttacks = (isMatazaTheZapper || isCyberTwinDragon) ? 2 : 1;
    
    if (attacker.attacksThisTurn === undefined || attacker.attacksThisTurn === null) {
      attacker.attacksThisTurn = 0;
    }
    
    if (attacker.attacksThisTurn >= maxAttacks) {
      const message = isMatazaTheZapper 
        ? 'Mataza The Zapper já atacou 2 vezes neste turno!'
        : isCyberTwinDragon
        ? 'Cyber Twin Dragon já atacou 2 vezes neste turno!'
        : 'Este monstro já atacou neste turno. Cada monstro só pode atacar uma vez por turno!';
      return { valid: false, message };
    }

    return { valid: true };
  }

  /**
   * Verifica se SwordsOfRevealingLight está bloqueando ataques
   */
  checkSwordsOfRevealingLight(
    duel: Duel,
    defenderField: any
  ): { blocked: boolean; message?: string } {
    if (defenderField && defenderField.spellTrap && Array.isArray(defenderField.spellTrap)) {
      for (const spellTrap of defenderField.spellTrap) {
        if (spellTrap && spellTrap !== null && spellTrap.position === 'face-up') {
          const isSwordsOfRevealingLight = this.duelUtils.isExactCard(spellTrap, 'SwordsOfRevealingLight');
          
          if (isSwordsOfRevealingLight) {
            const currentTurnCounter = duel.turnCounter || 1;
            const currentTurn = duel.currentTurn;
            const activationTurnCounter = spellTrap.activationTurnCounter;
            const activatedByPlayer1 = spellTrap.activatedByPlayer1;
            
            if (!activationTurnCounter || activatedByPlayer1 === undefined) {
              return { blocked: true, message: 'SwordsOfRevealingLight está bloqueando seus ataques!' };
            }
            
            const opponentTurn = activatedByPlayer1 ? 2 : 1;
            
            if (currentTurn === opponentTurn) {
              const activationTurn = spellTrap.activationTurn;
              const activatedInOpponentTurn = activationTurn === opponentTurn;
              
              let opponentTurnsSinceActivation: number;
              if (activatedInOpponentTurn) {
                opponentTurnsSinceActivation = Math.floor((currentTurnCounter - activationTurnCounter) / 2);
              } else {
                opponentTurnsSinceActivation = Math.floor((currentTurnCounter - activationTurnCounter) / 2) + 1;
              }
              
              if (opponentTurnsSinceActivation < 3) {
                return { blocked: true, message: 'SwordsOfRevealingLight está bloqueando seus ataques!' };
              }
            }
          }
        }
      }
    }

    return { blocked: false };
  }
}

