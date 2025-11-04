import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Tournament, TournamentStatus, TournamentFormat } from './entities/tournament.entity';
import { TournamentParticipant, ParticipantStatus } from './entities/tournament-participant.entity';
import { TournamentMatch, MatchStatus } from './entities/tournament-match.entity';
import { DuelsService } from '../duels/duels.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    @InjectRepository(Tournament)
    private tournamentRepository: Repository<Tournament>,
    @InjectRepository(TournamentParticipant)
    private participantRepository: Repository<TournamentParticipant>,
    @InjectRepository(TournamentMatch)
    private matchRepository: Repository<TournamentMatch>,
    private duelsService: DuelsService,
    private usersService: UsersService,
  ) {}

  // ========== CRON JOBS - AUTOMAÇÃO ========== //

  /**
   * Executa a cada minuto para verificar torneios que precisam de ações automáticas
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleTournamentAutomation() {
    const now = new Date();

    // 1. Abrir inscrições automaticamente
    await this.autoOpenRegistrations(now);

    // 2. Fechar inscrições automaticamente
    await this.autoCloseRegistrations(now);

    // 3. Iniciar torneios (fazer sorteio)
    await this.autoStartTournaments(now);

    // 4. Iniciar partidas automaticamente
    await this.autoStartMatches(now);

    // 5. Verificar partidas que terminaram para avançar fase
    await this.autoAdvancePhases();
  }

  /**
   * Abre inscrições de torneios agendados
   */
  private async autoOpenRegistrations(now: Date) {
    const tournamentsToOpen = await this.tournamentRepository.find({
      where: {
        status: TournamentStatus.SCHEDULED,
        registrationOpenAt: LessThan(now),
      },
    });

    for (const tournament of tournamentsToOpen) {
      tournament.status = TournamentStatus.REGISTRATION_OPEN;
      await this.tournamentRepository.save(tournament);
      this.logger.log(`🔓 Inscrições abertas para torneio: ${tournament.name}`);
    }
  }

  /**
   * Fecha inscrições automaticamente
   */
  private async autoCloseRegistrations(now: Date) {
    const tournamentsToClose = await this.tournamentRepository.find({
      where: {
        status: TournamentStatus.REGISTRATION_OPEN,
        registrationCloseAt: LessThan(now),
      },
    });

    for (const tournament of tournamentsToClose) {
      tournament.status = TournamentStatus.REGISTRATION_CLOSED;
      await this.tournamentRepository.save(tournament);
      this.logger.log(`🔒 Inscrições fechadas para torneio: ${tournament.name}`);
    }
  }

  /**
   * Inicia torneios automaticamente (faz sorteio)
   */
  private async autoStartTournaments(now: Date) {
    const tournamentsToStart = await this.tournamentRepository.find({
      where: {
        status: TournamentStatus.REGISTRATION_CLOSED,
        startAt: LessThan(now),
      },
      relations: ['participants', 'participants.user'],
    });

    for (const tournament of tournamentsToStart) {
      try {
        await this.generateBracket(tournament.id);
        tournament.status = TournamentStatus.IN_PROGRESS;
        await this.tournamentRepository.save(tournament);
        this.logger.log(`🎲 Sorteio realizado para torneio: ${tournament.name}`);
      } catch (error) {
        this.logger.error(`Erro ao iniciar torneio ${tournament.id}:`, error);
      }
    }
  }

  /**
   * Inicia partidas automaticamente no horário agendado
   */
  private async autoStartMatches(now: Date) {
    const matchesToStart = await this.matchRepository.find({
      where: {
        status: MatchStatus.READY,
        scheduledAt: LessThan(now),
      },
      relations: ['player1', 'player2', 'tournament'],
    });

    for (const match of matchesToStart) {
      try {
        if (!match.player1Id || !match.player2Id) {
          this.logger.warn(`Partida ${match.id} não tem ambos jogadores`);
          continue;
        }

        // Criar duelo
        const duel = await this.duelsService.createDuel(
          match.player1Id,
          match.player2Id,
        );

        match.duelId = duel.id;
        match.status = MatchStatus.IN_PROGRESS;
        match.startedAt = new Date();
        await this.matchRepository.save(match);

        this.logger.log(`⚔️ Duelo iniciado automaticamente: ${match.player1.username} vs ${match.player2.username}`);
      } catch (error) {
        this.logger.error(`Erro ao iniciar partida ${match.id}:`, error);
      }
    }
  }

  /**
   * Avança fases automaticamente quando rodada termina
   */
  private async autoAdvancePhases() {
    const tournamentsInProgress = await this.tournamentRepository.find({
      where: { status: TournamentStatus.IN_PROGRESS },
      relations: ['matches'],
    });

    for (const tournament of tournamentsInProgress) {
      const currentRoundMatches = tournament.matches.filter(
        (m) => m.round === tournament.currentRound,
      );

      // Verificar se todas as partidas da rodada terminaram
      const allFinished = currentRoundMatches.every(
        (m) => m.status === MatchStatus.FINISHED || m.status === MatchStatus.WALKOVER,
      );

      if (allFinished && currentRoundMatches.length > 0) {
        const hasNextRound = currentRoundMatches.some((m) => m.nextMatchId);

        if (hasNextRound) {
          // Avançar para próxima rodada
          await this.advanceToNextRound(tournament.id);
        } else {
          // Torneio terminou
          await this.finishTournament(tournament.id);
        }
      }
    }
  }

  // ========== MÉTODOS PRINCIPAIS ========== //

  /**
   * Cria um novo torneio
   */
  async create(userId: string, tournamentData: Partial<Tournament>) {
    const tournament = this.tournamentRepository.create({
      ...tournamentData,
      createdBy: userId,
      currentParticipants: 0,
    });

    return await this.tournamentRepository.save(tournament);
  }

  /**
   * Inscrever usuário no torneio
   */
  async register(tournamentId: string, userId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Inscrições não estão abertas');
    }

    if (tournament.currentParticipants >= tournament.maxParticipants) {
      throw new BadRequestException('Torneio está cheio');
    }

    // Verificar se já está inscrito
    const existing = await this.participantRepository.findOne({
      where: { tournamentId, userId },
    });

    if (existing) {
      throw new BadRequestException('Você já está inscrito neste torneio');
    }

    // Cobrar taxa de inscrição
    if (tournament.entryFee > 0) {
      const user = await this.usersService.findById(userId);
      if (user.coins < tournament.entryFee) {
        throw new BadRequestException('Moedas insuficientes');
      }
      await this.usersService.updateCoins(userId, -tournament.entryFee);
    }

    // Criar participante
    const participant = this.participantRepository.create({
      tournamentId,
      userId,
    });

    await this.participantRepository.save(participant);

    // Atualizar contador
    tournament.currentParticipants++;
    await this.tournamentRepository.save(tournament);

    // Se atingiu o máximo, fechar inscrições
    if (tournament.currentParticipants >= tournament.maxParticipants) {
      tournament.status = TournamentStatus.REGISTRATION_CLOSED;
      await this.tournamentRepository.save(tournament);
      this.logger.log(`🔒 Torneio ${tournament.name} atingiu capacidade máxima`);
    }

    return participant;
  }

  /**
   * Gera chave do torneio (bracket)
   */
  async generateBracket(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['participants', 'participants.user'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    const participants = tournament.participants.filter(
      (p) => p.status === ParticipantStatus.REGISTERED,
    );

    if (participants.length < 2) {
      throw new BadRequestException('Torneio precisa de pelo menos 2 participantes');
    }

    // Embaralhar participantes (sorteio aleatório)
    const shuffled = this.shuffleArray([...participants]);

    // Atribuir seeds
    shuffled.forEach((participant, index) => {
      participant.seed = index + 1;
      participant.status = ParticipantStatus.ACTIVE;
    });

    await this.participantRepository.save(shuffled);

    // Criar partidas da primeira rodada
    const matchesFirstRound: Partial<TournamentMatch>[] = [];
    const startTime = new Date(tournament.startAt);

    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        matchesFirstRound.push({
          tournamentId,
          round: 1,
          matchNumber: Math.floor(i / 2) + 1,
          player1Id: shuffled[i].userId,
          player2Id: shuffled[i + 1].userId,
          status: MatchStatus.READY,
          scheduledAt: new Date(startTime.getTime() + (i / 2) * 30 * 60 * 1000), // 30min entre partidas
        });
      }
    }

    const createdMatches = await this.matchRepository.save(matchesFirstRound);

    // Criar estrutura das próximas rodadas
    await this.createNextRoundStructure(tournament, createdMatches);

    return createdMatches;
  }

  /**
   * Cria estrutura das próximas rodadas
   */
  private async createNextRoundStructure(tournament: Tournament, previousMatches: TournamentMatch[]) {
    const totalRounds = Math.ceil(Math.log2(tournament.maxParticipants));
    
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = Math.pow(2, totalRounds - round);
      const nextRoundMatches: Partial<TournamentMatch>[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        const match = this.matchRepository.create({
          tournamentId: tournament.id,
          round,
          matchNumber: i + 1,
          status: MatchStatus.SCHEDULED,
          scheduledAt: new Date(tournament.startAt.getTime() + (round - 1) * 60 * 60 * 1000), // 1h por rodada
        });

        nextRoundMatches.push(match);
      }

      const savedMatches = await this.matchRepository.save(nextRoundMatches);

      // Conectar partidas anteriores com próximas
      for (let i = 0; i < previousMatches.length; i++) {
        const nextMatchIndex = Math.floor(i / 2);
        previousMatches[i].nextMatchId = savedMatches[nextMatchIndex].id;
        await this.matchRepository.save(previousMatches[i]);
      }

      previousMatches = savedMatches;
    }
  }

  /**
   * Avança para próxima rodada
   */
  private async advanceToNextRound(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });

    tournament.currentRound++;
    await this.tournamentRepository.save(tournament);

    this.logger.log(`📈 Torneio ${tournament.name} avançou para rodada ${tournament.currentRound}`);
  }

  /**
   * Finaliza torneio
   */
  private async finishTournament(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches'],
    });

    const finalMatch = tournament.matches.find(
      (m) => m.nextMatchId === null && m.status === MatchStatus.FINISHED,
    );

    if (finalMatch?.winnerId) {
      tournament.winnerId = finalMatch.winnerId;
      tournament.status = TournamentStatus.FINISHED;
      tournament.finishedAt = new Date();

      // Distribuir prêmios
      await this.distributePrizes(tournament);

      await this.tournamentRepository.save(tournament);

      this.logger.log(`🏆 Torneio ${tournament.name} finalizado!`);
    }
  }

  /**
   * Distribui prêmios
   */
  private async distributePrizes(tournament: Tournament) {
    if (tournament.winnerId && tournament.prizeFirst > 0) {
      await this.usersService.updateCoins(tournament.winnerId, tournament.prizeFirst);
      this.logger.log(`💰 Prêmio de ${tournament.prizeFirst} moedas entregue ao vencedor`);
    }
    // TODO: Implementar prêmios para 2º e 3º lugares
  }

  /**
   * Embaralha array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Listar todos os torneios
   */
  async findAll(status?: TournamentStatus) {
    const where = status ? { status } : {};
    return await this.tournamentRepository.find({
      where,
      relations: ['creator', 'participants'],
      order: { startAt: 'ASC' },
    });
  }

  /**
   * Buscar torneio por ID
   */
  async findOne(id: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id },
      relations: ['creator', 'participants', 'participants.user', 'matches', 'matches.player1', 'matches.player2', 'matches.winner'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    return tournament;
  }
}
