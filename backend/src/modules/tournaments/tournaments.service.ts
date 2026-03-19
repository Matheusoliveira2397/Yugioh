import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual, MoreThan, Between, IsNull } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Tournament, TournamentStatus, TournamentFormat } from './entities/tournament.entity';
import { TournamentParticipant, ParticipantStatus } from './entities/tournament-participant.entity';
import { TournamentMatch, MatchStatus } from './entities/tournament-match.entity';
import { DuelsService } from '../duels/duels.service';
import { DuelOrigin, DuelResult } from '../duels/entities/duel.entity';
import { UsersService } from '../users/users.service';
import { AchievementsService } from '../users/achievements.service';
import { ShopService } from '../shop/shop.service';
import { AchievementType } from '../users/entities/achievement.entity';

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
    @Inject(forwardRef(() => DuelsService))
    private duelsService: DuelsService,
    private usersService: UsersService,
    private achievementsService: AchievementsService,
    private shopService: ShopService,
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
        registrationOpenAt: LessThanOrEqual(now),
      },
    });

    for (const tournament of tournamentsToOpen) {
      tournament.status = TournamentStatus.REGISTRATION_OPEN;
      await this.tournamentRepository.save(tournament);
      this.logger.log(`🔓 Inscrições abertas para torneio: ${tournament.name}`);
    }
  }

  /**
   * Fecha inscrições automaticamente e faz sorteio se necessário
   */
  private async autoCloseRegistrations(now: Date) {
    const tournamentsToClose = await this.tournamentRepository.find({
      where: {
        status: TournamentStatus.REGISTRATION_OPEN,
        registrationCloseAt: LessThanOrEqual(now),
      },
      relations: ['participants'],
    });

    for (const tournament of tournamentsToClose) {
      tournament.status = TournamentStatus.REGISTRATION_CLOSED;
      await this.tournamentRepository.save(tournament);
      this.logger.log(`🔒 Inscrições fechadas para torneio: ${tournament.name}`);

      // Gerar bracket automaticamente quando inscrições fecharem (fase de divulgação)
      if (tournament.currentParticipants >= 2) {
        try {
          // Verificar se o bracket já foi gerado
          const existingMatches = await this.matchRepository.find({
            where: { tournamentId: tournament.id },
            take: 1,
          });

          if (existingMatches.length === 0) {
            await this.generateBracket(tournament.id);
            this.logger.log(`🎲 Chave gerada automaticamente para torneio: ${tournament.name}`);
          }
        } catch (error) {
          this.logger.error(`Erro ao gerar chave automática do torneio ${tournament.id}:`, error);
        }
      }
    }
  }

  /**
   * Inicia torneios automaticamente (muda status para IN_PROGRESS quando horário chegar)
   */
  private async autoStartTournaments(now: Date) {
    const tournamentsToStart = await this.tournamentRepository.find({
      where: {
        status: TournamentStatus.REGISTRATION_CLOSED,
        startAt: LessThanOrEqual(now),
      },
      relations: ['participants', 'participants.user'],
    });

    for (const tournament of tournamentsToStart) {
      try {
        // Verificar se o bracket já foi gerado
        const existingMatches = await this.matchRepository.find({
          where: { tournamentId: tournament.id },
          take: 1,
        });

        // Se não tem bracket, gerar agora
        if (existingMatches.length === 0) {
          await this.generateBracket(tournament.id);
          this.logger.log(`🎲 Chave gerada para torneio: ${tournament.name}`);
        }

        // Mudar status para IN_PROGRESS (fase de duelos)
        tournament.status = TournamentStatus.IN_PROGRESS;
        await this.tournamentRepository.save(tournament);
        this.logger.log(`⚔️ Torneio iniciado: ${tournament.name}`);
      } catch (error) {
        this.logger.error(`Erro ao iniciar torneio ${tournament.id}:`, error);
      }
    }
  }

  /**
   * Inicia partidas automaticamente no horário agendado
   * Abre TODOS os duelos da fase atual que estão prontos
   */
  private async autoStartMatches(now: Date) {
    // Buscar torneios em andamento
    const tournamentsInProgress = await this.tournamentRepository.find({
      where: { status: TournamentStatus.IN_PROGRESS },
    });

    for (const tournament of tournamentsInProgress) {
      // Buscar todas as partidas da rodada atual que estão prontas para começar
const matchesToStart = await this.matchRepository.find({
      where: {
        tournamentId: tournament.id,
        round: tournament.currentRound,
        status: MatchStatus.READY,
        scheduledAt: LessThanOrEqual(now),
      },
        relations: ['player1', 'player2', 'tournament'],
      });

      this.logger.log(`🔍 [autoStartMatches] Torneio ${tournament.name} - Rodada ${tournament.currentRound}: ${matchesToStart.length} partidas prontas para iniciar`);

      // Iniciar TODAS as partidas da fase atual
      for (const match of matchesToStart) {
        try {
          if (!match.player1Id || !match.player2Id) {
            this.logger.warn(`Partida ${match.id} não tem ambos jogadores`);
            continue;
          }

          if (match.player1Id === match.player2Id) {
            this.logger.warn(`Partida ${match.id} tem o mesmo jogador nos dois lados (${match.player1Id}). Marcando como W.O. e não criando duelo.`);
            match.winnerId = match.player1Id;
            match.status = MatchStatus.WALKOVER;
            match.finishedAt = new Date();
            await this.matchRepository.save(match);
            continue;
          }

          // Verificar se já tem duelo criado
          if (match.duelId) {
            this.logger.log(`Partida ${match.id} já tem duelo ${match.duelId}, pulando...`);
            continue;
          }

          // Criar duelo
          const duel = await this.duelsService.createDuel(
            match.player1Id,
            match.player2Id,
            DuelOrigin.TOURNAMENT,
          );

          if (!duel || !duel.id) {
            this.logger.error(`Erro ao criar duelo para partida ${match.id}`);
            continue;
          }

          match.duelId = duel.id!;
          match.status = MatchStatus.IN_PROGRESS;
          match.startedAt = new Date();
          await this.matchRepository.save(match);

          this.logger.log(`⚔️ Duelo iniciado automaticamente: ${match.player1?.username || match.player1Id} vs ${match.player2?.username || match.player2Id} (Partida ${match.matchNumber} - Rodada ${match.round})`);
        } catch (error) {
          this.logger.error(`Erro ao iniciar partida ${match.id}:`, error);
        }
      }
    }

    // Também processar partidas de torneios que não estão em IN_PROGRESS mas têm partidas READY
    const otherMatchesToStart = await this.matchRepository.find({
      where: {
        status: MatchStatus.READY,
        scheduledAt: LessThanOrEqual(now),
      },
      relations: ['player1', 'player2', 'tournament'],
    });

    // Filtrar apenas as que não foram processadas acima
    const otherMatches = otherMatchesToStart.filter(m => {
      const tournament = tournamentsInProgress.find(t => t.id === m.tournamentId);
      return !tournament || tournament.currentRound !== m.round;
    });

    for (const match of otherMatches) {
      try {
        if (!match.player1Id || !match.player2Id || match.duelId) {
          continue;
        }

        if (match.player1Id === match.player2Id) {
          this.logger.warn(`Partida ${match.id} tem o mesmo jogador nos dois lados (${match.player1Id}). Marcando como W.O.`);
          match.winnerId = match.player1Id;
          match.status = MatchStatus.WALKOVER;
          match.finishedAt = new Date();
          await this.matchRepository.save(match);
          continue;
        }

        const duel = await this.duelsService.createDuel(
          match.player1Id,
          match.player2Id,
          DuelOrigin.TOURNAMENT,
        );

        if (!duel || !duel.id) {
          continue;
        }

        match.duelId = duel.id!;
        match.status = MatchStatus.IN_PROGRESS;
        match.startedAt = new Date();
        await this.matchRepository.save(match);

        this.logger.log(`⚔️ Duelo iniciado automaticamente (outros): ${match.player1?.username || match.player1Id} vs ${match.player2?.username || match.player2Id}`);
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

  private static readonly VALID_MAX_PARTICIPANTS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

  /** Formatos que usam chave eliminatória (vagas = potência de 2). */
  private static readonly ELIMINATION_FORMATS = [
    TournamentFormat.SINGLE_ELIMINATION,
    TournamentFormat.DOUBLE_ELIMINATION,
  ];

  /**
   * Cria um novo torneio. Mata-mata exige vagas em potência de 2; pontos corridos aceita 2 a 128.
   */
  async create(userId: number, tournamentData: Partial<Tournament>) {
    const max = tournamentData.maxParticipants ?? 16;
    const format = this.normalizeFormat((tournamentData as any).format);

    if (TournamentsService.ELIMINATION_FORMATS.includes(format)) {
      if (!TournamentsService.VALID_MAX_PARTICIPANTS.includes(max)) {
        throw new BadRequestException(
          `Para mata-mata, vagas devem ser potência de 2: ${TournamentsService.VALID_MAX_PARTICIPANTS.join(', ')}`,
        );
      }
    } else {
      if (max < 2 || max > 128) {
        throw new BadRequestException('Para pontos corridos, vagas devem ser entre 2 e 128.');
      }
    }

    const tournament = this.tournamentRepository.create({
      ...tournamentData,
      format,
      maxParticipants: max,
      minLevel: tournamentData.minLevel ?? 1,
      maxLevel: tournamentData.maxLevel ?? null,
      entryFeeType: (tournamentData as any).entryFeeType === 'cash' ? 'cash' : 'credit',
      tournamentTypeId: (tournamentData as any).tournamentTypeId ?? null,
      createdBy: userId,
      currentParticipants: 0,
    });

    return await this.tournamentRepository.save(tournament);
  }

  private normalizeFormat(value: unknown): TournamentFormat {
    if (value === TournamentFormat.ROUND_ROBIN || value === 'round_robin') return TournamentFormat.ROUND_ROBIN;
    if (value === TournamentFormat.SWISS || value === 'swiss') return TournamentFormat.SWISS;
    if (value === TournamentFormat.DOUBLE_ELIMINATION || value === 'double_elimination') return TournamentFormat.DOUBLE_ELIMINATION;
    return TournamentFormat.SINGLE_ELIMINATION;
  }

  /**
   * Inscrever usuário no torneio
   */
  async register(tournamentId: string, userId: number) {
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
      where: { tournament: { id: tournamentId }, userId },
    });

    if (existing) {
      throw new BadRequestException('Você já está inscrito neste torneio');
    }

    const user = await this.usersService.findById(userId);
    const minLevel = tournament.minLevel ?? 1;
    if ((user?.level ?? 1) < minLevel) {
      throw new BadRequestException(`Nível mínimo para este torneio: ${minLevel}`);
    }
    const maxLevel = tournament.maxLevel;
    if (maxLevel != null && (user?.level ?? 1) > maxLevel) {
      throw new BadRequestException(`Nível máximo para este torneio: ${maxLevel}`);
    }

    // Cobrar taxa de inscrição (crédito ou cash)
    const feeType = (tournament as any).entryFeeType === 'cash' ? 'cash' : 'credit';
    if (tournament.entryFee > 0) {
      if (feeType === 'cash') {
        if ((user.cash ?? 0) < tournament.entryFee) {
          throw new BadRequestException('Cash insuficiente para a taxa de inscrição');
        }
        await this.usersService.update(userId, {
          cash: (user.cash ?? 0) - tournament.entryFee,
        });
      } else {
        if ((user.credits || 0) < tournament.entryFee) {
          throw new BadRequestException('Créditos insuficientes');
        }
        await this.usersService.update(userId, {
          credits: (user.credits || 0) - tournament.entryFee,
        });
      }
    }

    // Garantir que tournamentId está definido
    const tournamentIdValue = String(tournament.id).trim();
    const userIdValue = Number(userId);
    
    if (!tournamentIdValue || tournamentIdValue === 'undefined' || tournamentIdValue === 'null') {
      this.logger.error(`Erro: tournamentId inválido. Tournament:`, tournament);
      throw new BadRequestException('Erro: ID do torneio é inválido');
    }

    if (!userIdValue || isNaN(userIdValue)) {
      this.logger.error(`Erro: userId inválido. UserId:`, userId);
      throw new BadRequestException('Erro: ID do usuário é inválido');
    }

    this.logger.log(`📝 Registrando usuário ${userIdValue} no torneio ${tournamentIdValue}`);

    try {
      const existingAgain = await this.participantRepository.findOne({
        where: { tournament: { id: tournamentIdValue }, userId: userIdValue },
      });
      if (existingAgain) {
        throw new BadRequestException('Você já está inscrito neste torneio');
      }

      const participant = this.participantRepository.create({
        tournament,
        userId: userIdValue,
        status: ParticipantStatus.REGISTERED,
        wins: 0,
        losses: 0,
        draws: 0,
      });
      await this.participantRepository.save(participant);
      this.logger.log(`✅ Participante inserido com sucesso.`);

      tournament.currentParticipants++;
      await this.tournamentRepository.save(tournament);

      if (tournament.currentParticipants >= tournament.maxParticipants) {
        tournament.status = TournamentStatus.REGISTRATION_CLOSED;
        await this.tournamentRepository.save(tournament);
        this.logger.log(`🔒 Torneio ${tournament.name} atingiu capacidade máxima`);
      }

      const saved = await this.participantRepository.findOne({
        where: { id: participant.id },
        relations: ['user', 'tournament'],
      });
      if (!saved) {
        throw new BadRequestException('Inscrição feita, mas não foi possível carregar o registro.');
      }
      return saved;
    } catch (error: any) {
      this.logger.error(`❌ Erro ao registrar participante:`, error);
      if (error.code === '23505') {
        throw new BadRequestException('Você já está inscrito neste torneio');
      }
      if (error.code === '23503') {
        throw new BadRequestException('Torneio ou usuário inválido.');
      }
      throw new BadRequestException(error.message || 'Erro ao se inscrever no torneio');
    }
  }

  /**
   * Gera chave do torneio (bracket): mata-mata ou pontos corridos (round-robin).
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

    const shuffled = this.shuffleArray([...participants]);
    shuffled.forEach((participant, index) => {
      participant.seed = index + 1;
      participant.status = ParticipantStatus.ACTIVE;
    });
    await this.participantRepository.save(shuffled);

    const startTime = new Date(tournament.startAt);

    if (tournament.format === TournamentFormat.ROUND_ROBIN) {
      return await this.generateRoundRobinBracket(tournament, shuffled, startTime);
    }

    // Mata-mata: primeira rodada + estrutura das próximas
    const matchesFirstRound: Partial<TournamentMatch>[] = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        matchesFirstRound.push({
          tournamentId: tournament.id,
          round: 1,
          matchNumber: Math.floor(i / 2) + 1,
          player1Id: shuffled[i].userId,
          player2Id: shuffled[i + 1].userId,
          status: MatchStatus.READY,
          scheduledAt: startTime,
        });
      }
    }

    const createdMatches = await this.matchRepository.save(matchesFirstRound);
    await this.createNextRoundStructure(tournament, createdMatches);
    return createdMatches;
  }

  /**
   * Gera partidas do torneio de pontos corridos (todos contra todos). Método do círculo.
   */
  private async generateRoundRobinBracket(
    tournament: Tournament,
    participants: TournamentParticipant[],
    startTime: Date,
  ): Promise<TournamentMatch[]> {
    const N = participants.length;
    const rounds = N % 2 === 0 ? N - 1 : N;
    const matchesToCreate: Partial<TournamentMatch>[] = [];
    let matchNumber = 0;
    const mod = Math.max(N - 1, 1);

    for (let r = 0; r < rounds; r++) {
      const opponent0 = (1 + r) % mod + 1;
      const rest = Array.from({ length: N - 1 }, (_, i) => i + 1).filter((x) => x !== opponent0);
      const roundPairs: Array<[number, number]> = [[0, opponent0]];
      for (let i = 0; i < Math.floor(rest.length / 2); i++) {
        roundPairs.push([rest[i], rest[rest.length - 1 - i]]);
      }
      roundPairs.forEach(([pi, pj]) => {
        matchNumber++;
        matchesToCreate.push({
          tournamentId: tournament.id,
          round: r + 1,
          matchNumber,
          player1Id: participants[pi].userId,
          player2Id: participants[pj].userId,
          status: MatchStatus.READY,
          scheduledAt: new Date(startTime.getTime() + r * 60 * 60 * 1000),
        });
      });
    }

    return await this.matchRepository.save(matchesToCreate);
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
          scheduledAt: new Date(tournament.startAt.getTime() + (round - 1) * 60 * 60 * 1000),
          isThirdPlaceMatch: false,
        });
        nextRoundMatches.push(match);
      }

      const savedMatches = await this.matchRepository.save(nextRoundMatches);

      // Disputa de 3º lugar: sempre criar partida entre perdedores das semi (quando há pelo menos 4 participantes)
      if (round === totalRounds && totalRounds >= 2 && previousMatches.length === 2) {
        const thirdPlaceMatch = this.matchRepository.create({
          tournamentId: tournament.id,
          round: totalRounds,
          matchNumber: savedMatches.length + 1,
          status: MatchStatus.SCHEDULED,
          scheduledAt: new Date(tournament.startAt.getTime() + (round - 1) * 60 * 60 * 1000),
          isThirdPlaceMatch: true,
        });
        const [savedThird] = await this.matchRepository.save([thirdPlaceMatch]);
        for (let i = 0; i < previousMatches.length; i++) {
          previousMatches[i].nextConsolationMatchId = savedThird.id;
        }
      }

      for (let i = 0; i < previousMatches.length; i++) {
        const nextMatchIndex = Math.floor(i / 2);
        previousMatches[i].nextMatchId = savedMatches[nextMatchIndex].id;
        await this.matchRepository.save(previousMatches[i]);
      }

      previousMatches = savedMatches;
    }
  }

  /**
   * Atualiza partida do torneio quando duelo termina
   */
  async updateTournamentMatchFromDuel(duelId: string, winnerId: number, result: DuelResult): Promise<void> {
    // Validar formato UUID antes de fazer a query
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(duelId)) {
      this.logger.error(`❌ [updateTournamentMatchFromDuel] ID inválido (não é UUID): ${duelId}`);
      return;
    }
    
    const match = await this.matchRepository.findOne({
      where: { duelId },
      relations: ['tournament'],
    });

    if (!match) {
      this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] Partida não encontrada para duelo ${duelId}`);
      return;
    }

    const tournament = match.tournament;
    const isRoundRobin = tournament?.format === TournamentFormat.ROUND_ROBIN;

    match.winnerId = winnerId;
    match.status = MatchStatus.FINISHED;
    match.finishedAt = new Date();
    await this.matchRepository.save(match);

    const loserId = match.player1Id === winnerId ? match.player2Id : match.player1Id;

    if (loserId) {
      const loserParticipant = await this.participantRepository.findOne({
        where: { tournament: { id: match.tournamentId }, userId: loserId },
      });
      if (loserParticipant) {
        loserParticipant.losses = (loserParticipant.losses || 0) + 1;
        if (!isRoundRobin) {
          loserParticipant.status = ParticipantStatus.ELIMINATED;
          this.logger.log(`🚫 [updateTournamentMatchFromDuel] Jogador ${loserId} eliminado (mata-mata).`);
        }
        await this.participantRepository.save(loserParticipant);
      }
    }
    const winnerParticipant = await this.participantRepository.findOne({
      where: { tournament: { id: match.tournamentId }, userId: winnerId },
    });
    if (winnerParticipant) {
      winnerParticipant.wins = (winnerParticipant.wins || 0) + 1;
      await this.participantRepository.save(winnerParticipant);
    }

    this.logger.log(`✅ [updateTournamentMatchFromDuel] Partida ${match.id} (Rodada ${match.round}) finalizada. Vencedor: ${winnerId}`);

    if (isRoundRobin) {
      await this.checkRoundRobinTournamentFinished(match.tournamentId);
      return;
    }

    // Mata-mata: avançar vencedor para próxima fase
    if (match.nextMatchId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(match.nextMatchId).trim())) {
        this.logger.error(`❌ [updateTournamentMatchFromDuel] nextMatchId inválido (não é UUID): ${match.nextMatchId}`);
        return;
      }
      const nextMatch = await this.matchRepository.findOne({
        where: { id: match.nextMatchId },
      });

      if (nextMatch) {
        // Determinar qual posição o vencedor deve ocupar na próxima partida
        // Buscar todas as partidas da rodada atual que levam para esta próxima partida
        const matchesLeadingToNext = await this.matchRepository.find({
          where: {
            tournamentId: match.tournamentId,
            round: match.round,
            nextMatchId: nextMatch.id,
          },
          order: { matchNumber: 'ASC' },
        });

        this.logger.log(`🔍 [updateTournamentMatchFromDuel] Partidas que levam para próxima: ${matchesLeadingToNext.length}, Match atual: ${match.matchNumber} (ID: ${match.id}), Round: ${match.round}`);

        // Encontrar a posição da partida atual na lista ordenada
        const currentMatchIndex = matchesLeadingToNext.findIndex(m => m.id === match.id);
        
        if (currentMatchIndex === -1) {
          this.logger.error(`❌ [updateTournamentMatchFromDuel] Partida atual não encontrada na lista de partidas que levam para a próxima!`);
          return;
        }

        // A primeira partida (índice 0) vai para player1Id, a segunda (índice 1) vai para player2Id
        const shouldGoToPlayer1 = currentMatchIndex === 0;
        
        if (shouldGoToPlayer1) {
          if (nextMatch.player1Id && nextMatch.player1Id !== winnerId) {
            this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] player1Id já está ocupado (${nextMatch.player1Id}), mas vencedor ${winnerId} também precisa ir para lá. Substituindo...`);
          }
          nextMatch.player1Id = winnerId;
          this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerId} atribuído ao player1Id da próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round})`);
        } else {
          if (nextMatch.player2Id && nextMatch.player2Id !== winnerId) {
            this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] player2Id já está ocupado (${nextMatch.player2Id}), mas vencedor ${winnerId} também precisa ir para lá. Substituindo...`);
          }
          // Evitar colocar o mesmo jogador nos dois lados (ex.: bye mal preenchido)
          if (nextMatch.player1Id === winnerId) {
            this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] Vencedor ${winnerId} já está em player1Id da próxima partida. Marcando partida como W.O.`);
            nextMatch.winnerId = winnerId;
            nextMatch.status = MatchStatus.WALKOVER;
            nextMatch.finishedAt = new Date();
          } else {
            nextMatch.player2Id = winnerId;
            this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerId} atribuído ao player2Id da próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round})`);
          }
        }

        // Se ambos os jogadores estão definidos, marcar como READY
        if (nextMatch.player1Id && nextMatch.player2Id) {
          nextMatch.status = MatchStatus.READY;
          this.logger.log(`✅ [updateTournamentMatchFromDuel] Próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round}) está pronta com ambos os jogadores: ${nextMatch.player1Id} vs ${nextMatch.player2Id}`);
        } else {
          this.logger.log(`⏳ [updateTournamentMatchFromDuel] Próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round}) aguardando outro jogador. Atual: player1Id=${nextMatch.player1Id}, player2Id=${nextMatch.player2Id}`);
        }

        await this.matchRepository.save(nextMatch);
        this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerId} avançou para próxima fase (Partida ${nextMatch.matchNumber} - Rodada ${nextMatch.round})`);
      } else {
        this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] Próxima partida não encontrada (nextMatchId: ${match.nextMatchId})`);
      }
    } else {
      this.logger.log(`ℹ️ [updateTournamentMatchFromDuel] Partida ${match.id} não tem próxima partida (final do torneio)`);
    }

    // Avançar perdedor para disputa de 3º lugar (quando existir)
    if (loserId && match.nextConsolationMatchId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(String(match.nextConsolationMatchId).trim())) {
        const thirdPlaceMatch = await this.matchRepository.findOne({
          where: { id: match.nextConsolationMatchId },
        });
        if (thirdPlaceMatch) {
          const matchesLeadingToThird = await this.matchRepository.find({
            where: {
              tournamentId: match.tournamentId,
              round: match.round,
              nextConsolationMatchId: thirdPlaceMatch.id,
            },
            order: { matchNumber: 'ASC' },
          });
          const idx = matchesLeadingToThird.findIndex(m => m.id === match.id);
          if (idx === 0) {
            thirdPlaceMatch.player1Id = loserId;
            this.logger.log(`✅ [updateTournamentMatchFromDuel] Perdedor ${loserId} -> 3º lugar (player1)`);
          } else if (idx === 1) {
            thirdPlaceMatch.player2Id = loserId;
            this.logger.log(`✅ [updateTournamentMatchFromDuel] Perdedor ${loserId} -> 3º lugar (player2)`);
          }
          if (thirdPlaceMatch.player1Id && thirdPlaceMatch.player2Id) {
            thirdPlaceMatch.status = MatchStatus.READY;
          }
          await this.matchRepository.save(thirdPlaceMatch);
        }
      }
    }

    // Se esta partida é a disputa de 3º lugar: definir finalPosition 3 e 4
    if (match.isThirdPlaceMatch && loserId) {
      await this.participantRepository.update(
        { tournament: { id: match.tournamentId }, userId: winnerId },
        { finalPosition: 3 },
      );
      await this.participantRepository.update(
        { tournament: { id: match.tournamentId }, userId: loserId },
        { finalPosition: 4 },
      );
      this.logger.log(`🏅 [updateTournamentMatchFromDuel] 3º lugar: ${winnerId}, 4º lugar: ${loserId}`);
    }

    // Verificar se todas as partidas da rodada atual terminaram para avançar fase
    await this.checkAndAdvanceRound(match.tournamentId);
  }

  /**
   * Verifica se todas as partidas da rodada terminaram e avança fase se necessário
   */
  private async checkAndAdvanceRound(tournamentId: string): Promise<void> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches'],
    });

    if (!tournament) {
      this.logger.warn(`⚠️ [checkAndAdvanceRound] Torneio não encontrado: ${tournamentId}`);
      return;
    }

    const currentRoundMatches = tournament.matches.filter(
      (m) => m.round === tournament.currentRound,
    );

    this.logger.log(`🔍 [checkAndAdvanceRound] Verificando rodada ${tournament.currentRound} do torneio ${tournament.name}. Total de partidas: ${currentRoundMatches.length}`);

    // Verificar status de cada partida
    const matchStatuses = currentRoundMatches.map(m => ({
      id: m.id,
      matchNumber: m.matchNumber,
      status: m.status,
      winnerId: m.winnerId,
      player1Id: m.player1Id,
      player2Id: m.player2Id,
      nextMatchId: m.nextMatchId,
    }));
    this.logger.log(`📊 [checkAndAdvanceRound] Status das partidas:`, JSON.stringify(matchStatuses, null, 2));

    // Verificar se todas as partidas da rodada terminaram
    const allFinished = currentRoundMatches.every(
      (m) => m.status === MatchStatus.FINISHED || m.status === MatchStatus.WALKOVER,
    );

    this.logger.log(`✅ [checkAndAdvanceRound] Todas as partidas terminaram? ${allFinished}`);

    if (allFinished && currentRoundMatches.length > 0) {
      const hasNextRound = currentRoundMatches.some((m) => m.nextMatchId);

      this.logger.log(`🔍 [checkAndAdvanceRound] Tem próxima rodada? ${hasNextRound}`);

      if (hasNextRound) {
        // Avançar para próxima rodada
        await this.advanceToNextRound(tournament.id);
        
        // Buscar torneio atualizado para pegar o currentRound correto
        const updatedTournament = await this.tournamentRepository.findOne({
          where: { id: tournament.id },
        });
        
        if (!updatedTournament) {
          this.logger.error(`❌ [checkAndAdvanceRound] Não foi possível buscar torneio atualizado após avançar rodada`);
          return;
        }
        
        // Iniciar automaticamente as partidas da próxima rodada se estiverem prontas
        const nextRound = updatedTournament.currentRound;
        this.logger.log(`📈 [checkAndAdvanceRound] Avançou para rodada ${nextRound}. Buscando partidas prontas...`);
        
        const nextRoundMatches = await this.matchRepository.find({
          where: {
            tournamentId: tournament.id,
            round: nextRound,
          },
        });

        this.logger.log(`🔍 [checkAndAdvanceRound] Partidas da rodada ${nextRound}: ${nextRoundMatches.length}`);
        
        for (const nextMatch of nextRoundMatches) {
          this.logger.log(`🔍 [checkAndAdvanceRound] Partida ${nextMatch.matchNumber} (Round ${nextRound}): status=${nextMatch.status}, player1Id=${nextMatch.player1Id}, player2Id=${nextMatch.player2Id}, duelId=${nextMatch.duelId}`);
        }

        const readyMatches = nextRoundMatches.filter(m => m.status === MatchStatus.READY);
        this.logger.log(`✅ [checkAndAdvanceRound] Partidas prontas (READY): ${readyMatches.length}`);

        // Iniciar todas as partidas da próxima rodada que estão prontas
        for (const nextMatch of readyMatches) {
          if (nextMatch.player1Id && nextMatch.player2Id && !nextMatch.duelId) {
            if (nextMatch.player1Id === nextMatch.player2Id) {
              this.logger.warn(`⚠️ [checkAndAdvanceRound] Partida ${nextMatch.matchNumber} tem o mesmo jogador nos dois lados (${nextMatch.player1Id}). Marcando como W.O.`);
              nextMatch.winnerId = nextMatch.player1Id;
              nextMatch.status = MatchStatus.WALKOVER;
              nextMatch.finishedAt = new Date();
              await this.matchRepository.save(nextMatch);
              continue;
            }
            try {
              this.logger.log(`⚔️ [checkAndAdvanceRound] Iniciando duelo para partida ${nextMatch.matchNumber}: ${nextMatch.player1Id} vs ${nextMatch.player2Id}`);
              
              const duel = await this.duelsService.createDuel(
                nextMatch.player1Id,
                nextMatch.player2Id,
                DuelOrigin.TOURNAMENT,
              );

              if (duel && duel.id) {
                nextMatch.duelId = duel.id;
                nextMatch.status = MatchStatus.IN_PROGRESS;
                nextMatch.startedAt = new Date();
                await this.matchRepository.save(nextMatch);
                this.logger.log(`✅ [checkAndAdvanceRound] Duelo iniciado automaticamente para próxima fase: ${nextMatch.player1Id} vs ${nextMatch.player2Id} (Duel ID: ${duel.id})`);
              }
            } catch (error) {
              this.logger.error(`❌ [checkAndAdvanceRound] Erro ao iniciar duelo da próxima fase ${nextMatch.id}:`, error);
            }
          } else {
            this.logger.warn(`⚠️ [checkAndAdvanceRound] Partida ${nextMatch.matchNumber} não pode ser iniciada: player1Id=${nextMatch.player1Id}, player2Id=${nextMatch.player2Id}, duelId=${nextMatch.duelId}`);
          }
        }
      } else {
        // Torneio terminou
        this.logger.log(`🏆 [checkAndAdvanceRound] Torneio ${tournament.name} terminou! Finalizando...`);
        await this.finishTournament(tournament.id);
      }
    } else if (!allFinished && currentRoundMatches.length > 0) {
      const unfinishedMatches = currentRoundMatches.filter(
        (m) => m.status !== MatchStatus.FINISHED && m.status !== MatchStatus.WALKOVER,
      );
      this.logger.log(`⏳ [checkAndAdvanceRound] Aguardando ${unfinishedMatches.length} partida(s) terminar:`, unfinishedMatches.map(m => `Match ${m.matchNumber} (${m.status})`));
    }
  }

  /**
   * Avança para próxima rodada
   */
  private async advanceToNextRound(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    tournament.currentRound++;
    await this.tournamentRepository.save(tournament);

    this.logger.log(`📈 Torneio ${tournament.name} avançou para rodada ${tournament.currentRound}`);
  }

  /**
   * Pontos corridos: verifica se todas as partidas terminaram e finaliza o torneio (ranking por vitórias).
   */
  private async checkRoundRobinTournamentFinished(tournamentId: string): Promise<void> {
    const [tournament, allMatches, participants] = await Promise.all([
      this.tournamentRepository.findOne({ where: { id: tournamentId } }),
      this.matchRepository.find({ where: { tournamentId } }),
      this.participantRepository.find({
        where: { tournament: { id: tournamentId } },
        order: { seed: 'ASC' },
      }),
    ]);

    if (!tournament || tournament.status === TournamentStatus.FINISHED) return;
    const total = allMatches.length;
    const finished = allMatches.filter(
      (m) => m.status === MatchStatus.FINISHED || m.status === MatchStatus.WALKOVER,
    ).length;
    if (total === 0 || finished < total) return;

    const sorted = [...participants].sort((a, b) => {
      const winsA = a.wins ?? 0;
      const winsB = b.wins ?? 0;
      if (winsB !== winsA) return winsB - winsA;
      return (a.losses ?? 0) - (b.losses ?? 0);
    });

    const places = [1, 2, 3, 4] as const;
    for (let i = 0; i < Math.min(sorted.length, 4); i++) {
      await this.participantRepository.update(
        { tournament: { id: tournamentId }, userId: sorted[i].userId },
        { finalPosition: places[i] },
      );
    }

    tournament.winnerId = sorted[0]?.userId ?? null;
    tournament.status = TournamentStatus.FINISHED;
    tournament.finishedAt = new Date();
    await this.tournamentRepository.save(tournament);

    await this.distributePrizes(tournament);
    await this.awardTournamentPoints(tournamentId);
    this.logger.log(`🏆 Torneio pontos corridos ${tournament.name} finalizado! Campeão: ${tournament.winnerId}`);
  }

  /**
   * Finaliza torneio. Quem vencer a final é o campeão (winnerId).
   */
  private async finishTournament(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const finalMatch = await this.matchRepository.findOne({
      where: {
        tournamentId,
        status: MatchStatus.FINISHED,
        nextMatchId: IsNull(),
        isThirdPlaceMatch: false,
      },
    });

    if (finalMatch?.winnerId) {
      tournament.winnerId = finalMatch.winnerId;
      tournament.status = TournamentStatus.FINISHED;
      tournament.finishedAt = new Date();

      const loserId = finalMatch.player1Id === finalMatch.winnerId ? finalMatch.player2Id : finalMatch.player1Id;
      await this.participantRepository.update(
        { tournament: { id: tournamentId }, userId: finalMatch.winnerId },
        { finalPosition: 1 },
      );
      if (loserId) {
        await this.participantRepository.update(
          { tournament: { id: tournamentId }, userId: loserId },
          { finalPosition: 2 },
        );
      }

      await this.tournamentRepository.save(tournament);

      // Distribuir prêmios
      await this.distributePrizes(tournament);

      // Atribuir pontos de torneio (ranking Obelisco/Rá/Slifer)
      await this.awardTournamentPoints(tournamentId);

      this.logger.log(`🏆 Torneio ${tournament.name} finalizado!`);
    }
  }

  /** Pontos por posição final (1º, 2º, 3º, 4º) para o ranking de torneios */
  private static readonly POINTS_BY_PLACE: Record<number, number> = {
    1: 100,
    2: 50,
    3: 25,
    4: 10,
  };

  private async awardTournamentPoints(tournamentId: string) {
    const full = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });
    if (!full?.participants?.length) return;
    for (const p of full.participants) {
      const place = p.finalPosition;
      const points = TournamentsService.POINTS_BY_PLACE[place];
      if (points == null || points === 0) continue;
      try {
        const user = await this.usersService.findById(p.userId);
        const current = (user as any).tournamentPoints ?? 0;
        await this.usersService.update(p.userId, { tournamentPoints: current + points });
        this.logger.log(`📊 Pontos de torneio: +${points} (${place}º) -> userId ${p.userId} (total: ${current + points})`);
      } catch (err) {
        this.logger.error(`Erro ao atribuir pontos de torneio para userId ${p.userId}:`, err);
      }
    }
  }

  /**
   * Distribui prêmios
   */
  private async distributePrizes(tournament: Tournament) {
    const fullTournament = await this.tournamentRepository.findOne({
      where: { id: tournament.id },
      relations: ['participants', 'participants.user'],
    });
    if (!fullTournament) return;

    const details = fullTournament.prizeDetails;
    const places = [1, 2, 3, 4] as const;

    for (const place of places) {
      const participants = fullTournament.participants?.filter((p) => p.finalPosition === place) ?? [];
      const prize = details?.[place];
      const creditLegacy = place === 1 ? fullTournament.prizeFirst : place === 2 ? fullTournament.prizeSecond : place === 3 ? fullTournament.prizeThird : 0;
      const credit = prize?.credit ?? (place <= 3 ? creditLegacy : 0);
      const cash = prize?.cash ?? 0;
      const cardIds = prize?.cardIds ?? [];
      const trophyTitle = prize?.trophyTitle;
      const trophyIcon = prize?.trophyIcon;
      const stars = Math.max(0, prize?.stars ?? 0);

      for (const p of participants) {
        const userId = p.userId;
        try {
          if (stars > 0) {
            const user = await this.usersService.findById(userId);
            const currentStars = (user as any).stars ?? 0;
            await this.usersService.update(userId, { stars: currentStars + stars });
            this.logger.log(`⭐ Prêmio ${place}º: ${stars} estrela(s) -> userId ${userId}`);
          }
          if (credit > 0) {
            const user = await this.usersService.findById(userId);
            await this.usersService.update(userId, { credits: (user.credits || 0) + credit });
            this.logger.log(`💰 Prêmio ${place}º: ${credit} créditos -> userId ${userId}`);
          }
          if (cash > 0) {
            const user = await this.usersService.findById(userId);
            await this.usersService.update(userId, { cash: (user.cash || 0) + cash });
            this.logger.log(`💵 Prêmio ${place}º: ${cash} cash -> userId ${userId}`);
          }
          for (const cardId of cardIds) {
            await this.shopService.addCardToUserInventory(userId, cardId, 'REWARD', 1);
            this.logger.log(`🃏 Prêmio ${place}º: carta ${cardId} -> userId ${userId}`);
          }
          if (trophyTitle) {
            await this.achievementsService.createForUser(userId, {
              type: AchievementType.TOURNAMENT_WINNER,
              title: trophyTitle,
              description: `${fullTournament.name} - ${place}º lugar`,
              icon: trophyIcon ?? undefined,
              metadata: { tournamentId: fullTournament.id, place, tournamentName: fullTournament.name },
            });
            this.logger.log(`🏆 Troféu ${place}º: ${trophyTitle} -> userId ${userId}`);
          }
        } catch (err) {
          this.logger.error(`Erro ao distribuir prêmio ${place}º para userId ${userId}:`, err);
        }
      }
    }
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

  /**
   * Atualizar torneio
   */
  async update(id: string, tournamentData: Partial<Tournament>) {
    const tournamentId = typeof id === 'string' ? id.trim() : id;
    const tournament = await this.tournamentRepository.findOne({ where: { id: tournamentId } });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    const format = tournamentData.format != null
      ? this.normalizeFormat((tournamentData as any).format)
      : tournament.format;
    const max = tournamentData.maxParticipants ?? tournament.maxParticipants;

    if (TournamentsService.ELIMINATION_FORMATS.includes(format)) {
      if (max != null && !TournamentsService.VALID_MAX_PARTICIPANTS.includes(max)) {
        throw new BadRequestException(
          `Para mata-mata, vagas devem ser potência de 2: ${TournamentsService.VALID_MAX_PARTICIPANTS.join(', ')}`,
        );
      }
    } else {
      if (max != null && (max < 2 || max > 128)) {
        throw new BadRequestException('Para pontos corridos, vagas devem ser entre 2 e 128.');
      }
    }

    const { id: _id, createdAt, createdBy, ...safeData } = tournamentData as Partial<Tournament> & { id?: string; createdAt?: Date; createdBy?: number };
    const data = {
      ...safeData,
      format: format ?? tournament.format,
    };
    Object.assign(tournament, data);
    return await this.tournamentRepository.save(tournament);
  }

  /**
   * Excluir torneio
   */
  async remove(id: string) {
    const tournamentId = typeof id === 'string' ? id.trim() : id;
    const tournament = await this.tournamentRepository.findOne({ where: { id: tournamentId } });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    await this.tournamentRepository.remove(tournament);
    return { message: 'Torneio excluído com sucesso' };
  }

  /**
   * Obter top 3 do torneio (mata-mata: pela final; pontos corridos: por finalPosition).
   */
  async getTop3(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches', 'participants', 'participants.user'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    if (tournament.status !== TournamentStatus.FINISHED) {
      throw new BadRequestException('Torneio ainda não foi finalizado');
    }

    const top3: Array<{ position: number; user: any; prize: number }> = [];
    const prizeByPlace: Record<number, number> = {
      1: tournament.prizeFirst,
      2: tournament.prizeSecond,
      3: tournament.prizeThird,
    };

    if (tournament.format === TournamentFormat.ROUND_ROBIN) {
      const byPosition = (tournament.participants ?? [])
        .filter((p) => p.finalPosition != null && p.finalPosition >= 1 && p.finalPosition <= 3)
        .sort((a, b) => (a.finalPosition ?? 99) - (b.finalPosition ?? 99));
      for (const p of byPosition.slice(0, 3)) {
        const u = p.user ?? (await this.usersService.findById(p.userId));
        if (u) {
          top3.push({
            position: p.finalPosition!,
            user: { id: u.id, nickname: u.nickname, profileImage: u.profileImage },
            prize: prizeByPlace[p.finalPosition!] ?? 0,
          });
        }
      }
      return top3;
    }

    const allMatches = await this.matchRepository.find({
      where: { tournamentId, status: MatchStatus.FINISHED },
      relations: ['player1', 'player2', 'winner'],
    });
    const finalMatch = allMatches.find(m => !m.nextMatchId && !m.isThirdPlaceMatch);

    // 1º lugar (vencedor da final)
    if (finalMatch?.winnerId) {
      const winner = await this.usersService.findById(finalMatch.winnerId);
      top3.push({
        position: 1,
        user: {
          id: winner.id,
          nickname: winner.nickname,
          profileImage: winner.profileImage,
        },
        prize: tournament.prizeFirst,
      });
    }

    // 2º lugar (perdedor da final)
    if (finalMatch && finalMatch.player1Id && finalMatch.player2Id) {
      const loserId = finalMatch.player1Id === finalMatch.winnerId ? finalMatch.player2Id : finalMatch.player1Id;
      if (loserId) {
        const loser = await this.usersService.findById(loserId);
        top3.push({
          position: 2,
          user: {
            id: loser.id,
            nickname: loser.nickname,
            profileImage: loser.profileImage,
          },
          prize: tournament.prizeSecond,
        });
      }
    }

    // 3º lugar (perdedores das semifinais)
    if (finalMatch) {
      // Encontrar as semifinais (partidas que levam à final)
      const semifinals = allMatches.filter(m => m.nextMatchId === finalMatch.id);
      
      if (semifinals.length > 0) {
        // Pegar os perdedores das semifinais (que não são o vencedor nem o perdedor da final)
        const finalPlayers = [finalMatch.player1Id, finalMatch.player2Id].filter(id => id !== null);
        const semifinalLosers = semifinals
          .map(m => {
            if (m.winnerId === finalMatch.player1Id || m.winnerId === finalMatch.player2Id) {
              // O vencedor da semifinal foi para a final, então o perdedor é o outro jogador
              return m.player1Id === m.winnerId ? m.player2Id : m.player1Id;
            }
            return null;
          })
          .filter(id => id !== null && !finalPlayers.includes(id!));

        if (semifinalLosers.length > 0) {
          const thirdPlaceId = semifinalLosers[0];
          const thirdPlace = await this.usersService.findById(thirdPlaceId!);
          top3.push({
            position: 3,
            user: {
              id: thirdPlace.id,
              nickname: thirdPlace.nickname,
              profileImage: thirdPlace.profileImage,
            },
            prize: tournament.prizeThird,
          });
        }
      }
    }

    return top3;
  }

  /**
   * Obter bracket/chave do torneio
   */
  async getBracket(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    // Buscar todas as partidas com relações
    const allMatches = await this.matchRepository.find({
      where: { tournamentId },
      relations: ['player1', 'player2', 'winner'],
      order: { round: 'ASC', matchNumber: 'ASC' },
    });

    // Organizar partidas por rodada
    const matchesByRound: { [round: number]: TournamentMatch[] } = {};
    
    allMatches.forEach(match => {
      if (!matchesByRound[match.round]) {
        matchesByRound[match.round] = [];
      }
      matchesByRound[match.round].push(match);
    });

    // Ordenar partidas dentro de cada rodada
    Object.keys(matchesByRound).forEach(round => {
      matchesByRound[parseInt(round)].sort((a, b) => a.matchNumber - b.matchNumber);
    });

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        currentRound: tournament.currentRound,
        maxParticipants: tournament.maxParticipants,
        currentParticipants: tournament.currentParticipants,
      },
      rounds: matchesByRound,
      totalRounds: Math.max(...Object.keys(matchesByRound).map(r => parseInt(r)), 0),
    };
  }
}
