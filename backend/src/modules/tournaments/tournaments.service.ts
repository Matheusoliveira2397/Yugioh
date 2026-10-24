import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, LessThanOrEqual, MoreThan, Between, IsNull, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Tournament, TournamentStatus, TournamentFormat } from './entities/tournament.entity';
import { TournamentParticipant, ParticipantStatus } from './entities/tournament-participant.entity';
import { TournamentMatch, MatchStatus } from './entities/tournament-match.entity';
import { DuelsService } from '../duels/duels.service';
import { Duel, DuelOrigin, DuelResult, DuelStatus } from '../duels/entities/duel.entity';
import { UsersService } from '../users/users.service';
import { AchievementsService } from '../users/achievements.service';
import { ShopService } from '../shop/shop.service';
import { AchievementType } from '../users/entities/achievement.entity';
import { User } from '../users/entities/user.entity';
import { UserCard } from '../shop/entities/user-card.entity';
import { Achievement } from '../users/entities/achievement.entity';
import { ManagedBot } from '../bots/entities/managed-bot.entity';
import { DEFAULT_ROUND_INTERVAL_MINUTES, roundScheduledAt, validateRoundIntervalMinutes } from './tournament-round-schedule';
import { MissionsService } from '../missions/missions.service';
import { MissionObjectiveType } from '../missions/mission-objective.types';

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
    private missionsService: MissionsService,
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

    // 5. Recuperar conclusões gravadas no duelo mas não propagadas à chave.
    await this.reconcileFinishedDuelMatches();

    // 6. Verificar partidas que terminaram para avançar fase
    await this.autoAdvancePhases();

    // 7. Tentar novamente prêmios incompletos de torneios finalizados neste fluxo.
    await this.reconcilePendingAwards();
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
          await this.ensureBracketGenerated(tournament.id);
          this.logger.log(`🎲 Chave garantida para torneio: ${tournament.name}`);
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
        // Garantir chave completa (com todos os inscritos) antes de iniciar
        await this.ensureBracketGenerated(tournament.id);
        this.logger.log(`🎲 Chave garantida para torneio: ${tournament.name}`);

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
   * Inicia partidas da rodada atual no horário agendado.
   * Não inicia rodadas futuras (isso causava cascata de duelos).
   */
  private async autoStartMatches(now: Date) {
    const tournamentsInProgress = await this.tournamentRepository.find({
      where: { status: TournamentStatus.IN_PROGRESS },
    });

    for (const tournament of tournamentsInProgress) {
      const matchesToStart = await this.matchRepository.find({
        where: {
          tournamentId: tournament.id,
          round: tournament.currentRound,
          status: MatchStatus.READY,
          scheduledAt: LessThanOrEqual(now),
        },
        relations: ['player1', 'player2'],
      });

      this.logger.log(
        `🔍 [autoStartMatches] Torneio ${tournament.name} - Rodada ${tournament.currentRound}: ${matchesToStart.length} partida(s) READY`,
      );

      for (const match of matchesToStart) {
        try {
          await this.tryStartMatchDuel(match);
        } catch (error) {
          this.logger.error(`Erro ao iniciar partida ${match.id}:`, error);
        }
      }
    }
  }

  /**
   * Recupera partida cujo duelo já foi finalizado, mas o processo caiu antes
   * de atualizar o resultado da chave. É seguro repetir graças ao claim de status.
   */
  private async reconcileFinishedDuelMatches(): Promise<void> {
    const pending = await this.matchRepository.find({
      where: { status: MatchStatus.IN_PROGRESS },
      select: ['id', 'duelId'],
    });
    const duelRepo = this.tournamentRepository.manager.getRepository(Duel);
    for (const match of pending) {
      if (!match.duelId) continue;
      try {
        const duel = await duelRepo.findOne({
          where: { id: match.duelId },
          select: ['id', 'status', 'winnerId', 'result'],
        });
        if (duel?.status !== DuelStatus.FINISHED || !duel.winnerId || !duel.result) continue;
        await this.updateTournamentMatchFromDuel(duel.id, duel.winnerId, duel.result);
      } catch (error) {
        this.logger.error(`Falha ao recuperar resultado da partida ${match.id}`, error);
      }
    }
  }

  /** Somente torneios marcados pela nova rotina podem receber tentativas automáticas. */
  private async reconcilePendingAwards(): Promise<void> {
    const finished = await this.tournamentRepository.find({
      where: { status: TournamentStatus.FINISHED },
    });
    for (const tournament of finished) {
      const details = tournament.prizeDetails as Record<string, any> | null;
      if (details?._automaticAwardsVersion !== 2) continue;
      try {
        await this.distributePrizes(tournament);
      } catch (error) {
        this.logger.error(`Falha ao conciliar prêmios do torneio ${tournament.id}`, error);
      }
    }
  }

  /**
   * Avança fases automaticamente quando rodada termina
   */
  private async autoAdvancePhases() {
    const tournamentsInProgress = await this.tournamentRepository.find({
      where: { status: TournamentStatus.IN_PROGRESS },
    });

    for (const tournament of tournamentsInProgress) {
      try {
        await this.checkAndAdvanceRound(tournament.id);
      } catch (error) {
        this.logger.error(
          `Erro ao avançar fases do torneio ${tournament.id}:`,
          error,
        );
      }
    }
  }

  /**
   * Autoriza interromper outros duelos somente quando uma partida real da
   * chave, com estes dois duelistas, já alcançou seu horário oficial.
   */
  async isScheduledMatchDue(player1Id: number, player2Id: number): Promise<boolean> {
    // Inclui IN_PROGRESS sem duelId (partida já reivindicada pelo claim atômico)
    const matches = await this.matchRepository.find({
      where: [
        {
          status: MatchStatus.READY,
          scheduledAt: LessThanOrEqual(new Date()),
        },
        {
          status: MatchStatus.IN_PROGRESS,
          scheduledAt: LessThanOrEqual(new Date()),
          duelId: IsNull(),
        },
      ],
    });
    return matches.some(
      (match) =>
        !match.duelId &&
        ((match.player1Id === player1Id && match.player2Id === player2Id) ||
          (match.player1Id === player2Id && match.player2Id === player1Id)),
    );
  }

  /**
   * Reserva a partida (READY → IN_PROGRESS) antes de createDuel para o cron
   * não recriar duelo no minuto seguinte / em corrida com outro worker.
   */
  private async tryStartMatchDuel(match: TournamentMatch): Promise<boolean> {
    if (!match.player1Id || !match.player2Id || match.duelId) return false;
    if (match.status !== MatchStatus.READY) return false;
    if (new Date(match.scheduledAt).getTime() > Date.now()) return false;

    if (match.player1Id === match.player2Id) {
      match.winnerId = match.player1Id;
      match.status = MatchStatus.WALKOVER;
      match.finishedAt = new Date();
      await this.matchRepository.save(match);
      this.logger.warn(
        `⚠️ Partida ${match.matchNumber} com o mesmo jogador nos dois lados — W.O.`,
      );
      return true;
    }

    // Claim atômico: só um processo inicia esta partida
    const claim = await this.matchRepository.update(
      {
        id: match.id,
        status: MatchStatus.READY,
        duelId: IsNull(),
      },
      {
        status: MatchStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    );
    if (!claim.affected) {
      this.logger.debug(
        `Partida ${match.id} já foi reivindicada por outro processo — pulando`,
      );
      return false;
    }

    try {
      // Se algum jogador já está em duelo de torneio, devolve a partida para READY
      const busy = await this.playerHasActiveTournamentDuel(
        match.player1Id,
        match.player2Id,
      );
      if (busy) {
        await this.matchRepository.update(
          { id: match.id, status: MatchStatus.IN_PROGRESS, duelId: IsNull() },
          { status: MatchStatus.READY, startedAt: null as any },
        );
        this.logger.warn(
          `⏳ Partida ${match.matchNumber}: jogador ainda em outro duelo de torneio — reagendando`,
        );
        return false;
      }

      const duel = await this.duelsService.createDuel(
        match.player1Id,
        match.player2Id,
        DuelOrigin.TOURNAMENT,
      );
      if (duel?.id) {
        await this.matchRepository.update(
          { id: match.id },
          { duelId: duel.id },
        );
        match.duelId = duel.id;
        match.status = MatchStatus.IN_PROGRESS;
        this.logger.log(
          `⚔️ Duelo iniciado: partida ${match.matchNumber} (${match.player1Id} vs ${match.player2Id}) → ${duel.id}`,
        );
        return true;
      }

      await this.matchRepository.update(
        { id: match.id, status: MatchStatus.IN_PROGRESS, duelId: IsNull() },
        { status: MatchStatus.READY, startedAt: null as any },
      );
    } catch (error) {
      await this.matchRepository.update(
        { id: match.id, status: MatchStatus.IN_PROGRESS, duelId: IsNull() },
        { status: MatchStatus.READY, startedAt: null as any },
      );
      this.logger.error(`Erro ao iniciar duelo da partida ${match.id}:`, error);
    }
    return false;
  }

  /** True se P1 ou P2 já tem duelo de torneio WAITING/IN_PROGRESS. */
  private async playerHasActiveTournamentDuel(
    player1Id: number,
    player2Id: number,
  ): Promise<boolean> {
    return this.duelsService.hasActiveTournamentDuelForPlayers([
      player1Id,
      player2Id,
    ]);
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
      roundIntervalMinutes: tournamentData.roundIntervalMinutes === undefined
        ? DEFAULT_ROUND_INTERVAL_MINUTES
        : validateRoundIntervalMinutes(tournamentData.roundIntervalMinutes),
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
   * Administração: ocupa vagas livres usando contas de bots existentes.
   * Operação transacional, serializada por bloqueio de linha no torneio.
   * Bots não pagam taxa (contas internas), mas devem ter deck e nível elegível.
   */
  async fillWithBots(tournamentId: string) {
    const result = await this.tournamentRepository.manager.transaction(async (manager) => {
      const tournamentRepo = manager.getRepository(Tournament);
      const participantRepo = manager.getRepository(TournamentParticipant);
      const botRepo = manager.getRepository(ManagedBot);
      const userRepo = manager.getRepository(User);

      const tournament = await tournamentRepo.createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: tournamentId })
        .getOne();
      if (!tournament) throw new NotFoundException('Torneio não encontrado');
      if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
        throw new BadRequestException('Somente torneios com inscrições abertas podem receber bots');
      }
      const existing = await participantRepo.find({ where: { tournament: { id: tournamentId } } });
      const occupied = existing.length;
      const vacant = Math.max(0, tournament.maxParticipants - occupied);
      if (vacant === 0) throw new BadRequestException('O torneio já está completo');

      const existingIds = new Set(existing.map((p) => p.userId));
      const bots = await botRepo.find({ where: { enabled: true }, order: { createdAt: 'ASC' } });
      const candidates: Array<{ bot: ManagedBot; user: User }> = [];
      for (const bot of bots) {
        if (existingIds.has(bot.userId)) continue;
        const user = await userRepo.findOne({ where: { id: bot.userId } });
        if (!user || user.isBanned || !bot.botDeckId) continue;
        if ((user.level ?? 1) < (tournament.minLevel ?? 1)) continue;
        if (tournament.maxLevel != null && (user.level ?? 1) > tournament.maxLevel) continue;
        candidates.push({ bot, user });
        if (candidates.length >= vacant) break;
      }
      if (!candidates.length) {
        throw new BadRequestException('Nenhum bot habilitado e elegível está disponível. Crie ou habilite bots no painel de bots.');
      }

      for (const { user } of candidates) {
        await participantRepo.save(participantRepo.create({
          tournament,
          userId: user.id,
          status: ParticipantStatus.REGISTERED,
          wins: 0,
          losses: 0,
          draws: 0,
        }));
      }
      tournament.currentParticipants = occupied + candidates.length;
      const filled = tournament.currentParticipants >= tournament.maxParticipants;
      if (filled) tournament.status = TournamentStatus.REGISTRATION_CLOSED;
      await tournamentRepo.save(tournament);
      return {
        tournamentId,
        added: candidates.length,
        remaining: tournament.maxParticipants - tournament.currentParticipants,
        total: tournament.currentParticipants,
        maxParticipants: tournament.maxParticipants,
        filled,
      };
    });
    if (result.filled) {
      try {
        await this.ensureBracketGenerated(tournamentId);
      } catch (error: any) {
        this.logger.error(`Falha ao gerar chave do torneio ${tournamentId}: ${error?.message || error}`);
        throw new BadRequestException('As vagas foram preenchidas, mas houve erro ao gerar a chave. Use Gerar chave no painel administrativo.');
      }
    }
    return result;
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

    // Regras de status/vagas/duplicidade/saldo são validadas novamente dentro da transação
    // com lock pessimista para evitar condição de corrida em alta concorrência.

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
      const registrationResult = await this.tournamentRepository.manager.transaction(async (manager) => {
        const tournamentRepo = manager.getRepository(Tournament);
        const participantRepo = manager.getRepository(TournamentParticipant);
        const userRepo = manager.getRepository(User);

        const lockedTournament = await tournamentRepo
          .createQueryBuilder('tournament')
          .setLock('pessimistic_write')
          .where('tournament.id = :id', { id: tournamentIdValue })
          .getOne();

        if (!lockedTournament) {
          throw new NotFoundException('Torneio não encontrado');
        }
        if (lockedTournament.status !== TournamentStatus.REGISTRATION_OPEN) {
          throw new BadRequestException('Inscrições não estão abertas');
        }
        if (lockedTournament.currentParticipants >= lockedTournament.maxParticipants) {
          throw new BadRequestException('Torneio está cheio');
        }

        const existingAgain = await participantRepo.findOne({
          where: { tournament: { id: tournamentIdValue }, userId: userIdValue },
        });
        if (existingAgain) {
          throw new BadRequestException('Você já está inscrito neste torneio');
        }

        const lockedUser = await userRepo
          .createQueryBuilder('user')
          .setLock('pessimistic_write')
          .where('user.id = :id', { id: userIdValue })
          .getOne();

        if (!lockedUser) {
          throw new NotFoundException('Usuário não encontrado');
        }
        const minLevel = lockedTournament.minLevel ?? 1;
        if ((lockedUser.level ?? 1) < minLevel) {
          throw new BadRequestException(`Nível mínimo para este torneio: ${minLevel}`);
        }
        const maxLevel = lockedTournament.maxLevel;
        if (maxLevel != null && (lockedUser.level ?? 1) > maxLevel) {
          throw new BadRequestException(`Nível máximo para este torneio: ${maxLevel}`);
        }

        const feeType = (lockedTournament as any).entryFeeType === 'cash' ? 'cash' : 'credit';
        if (lockedTournament.entryFee > 0) {
          if (feeType === 'cash') {
            if ((lockedUser.cash ?? 0) < lockedTournament.entryFee) {
              throw new BadRequestException('Cash insuficiente para a taxa de inscrição');
            }
            lockedUser.cash = (lockedUser.cash ?? 0) - lockedTournament.entryFee;
          } else {
            if ((lockedUser.credits || 0) < lockedTournament.entryFee) {
              throw new BadRequestException('Créditos insuficientes');
            }
            lockedUser.credits = (lockedUser.credits || 0) - lockedTournament.entryFee;
          }
          await userRepo.save(lockedUser);
        }

        const participant = participantRepo.create({
          tournament: lockedTournament,
          userId: userIdValue,
          status: ParticipantStatus.REGISTERED,
          wins: 0,
          losses: 0,
          draws: 0,
        });
        const savedParticipant = await participantRepo.save(participant);
        this.logger.log(`✅ Participante inserido com sucesso.`);

        lockedTournament.currentParticipants++;
        if (lockedTournament.currentParticipants >= lockedTournament.maxParticipants) {
          lockedTournament.status = TournamentStatus.REGISTRATION_CLOSED;
          this.logger.log(`🔒 Torneio ${lockedTournament.name} atingiu capacidade máxima`);
        }
        await tournamentRepo.save(lockedTournament);

        return {
          participantId: savedParticipant.id,
          filled: lockedTournament.currentParticipants >= lockedTournament.maxParticipants,
        };
      });

      const saved = await this.participantRepository.findOne({
        where: { id: registrationResult.participantId },
        relations: ['user', 'tournament'],
      });
      if (!saved) {
        throw new BadRequestException('Inscrição feita, mas não foi possível carregar o registro.');
      }

      // Vagas preenchidas → gerar chave imediatamente para divulgação
      if (registrationResult.filled) {
        try {
          await this.ensureBracketGenerated(tournamentIdValue);
        } catch (bracketErr: any) {
          this.logger.error(
            `Erro ao gerar chave após lotar torneio ${tournamentIdValue}:`,
            bracketErr?.message || bracketErr,
          );
        }
      }

      try {
        await this.missionsService.trackEvent(
          userIdValue,
          MissionObjectiveType.REGISTER_TOURNAMENT,
          1,
        );
      } catch (missionErr: any) {
        this.logger.warn(`Missão inscrição torneio: ${missionErr?.message || missionErr}`);
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
   * Garante chave completa com todos os participantes elegíveis.
   * Regenera se a chave estiver ausente ou incompleta (ex.: alguém entrou depois).
   */
  async ensureBracketGenerated(tournamentId: string): Promise<TournamentMatch[]> {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });
    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    const eligible = (tournament.participants || []).filter(
      (p) =>
        p.status === ParticipantStatus.REGISTERED ||
        p.status === ParticipantStatus.ACTIVE,
    );
    if (eligible.length < 2) {
      throw new BadRequestException('Torneio precisa de pelo menos 2 participantes');
    }

    const existing = await this.matchRepository.find({ where: { tournamentId } });
    if (existing.length === 0) {
      return this.generateBracket(tournamentId);
    }

    const playerIdsInMatches = new Set<number>();
    for (const m of existing) {
      if (m.player1Id) playerIdsInMatches.add(m.player1Id);
      if (m.player2Id) playerIdsInMatches.add(m.player2Id);
    }
    const missingPlayers = eligible.some((p) => !playerIdsInMatches.has(p.userId));

    const totalRounds = Math.max(1, Math.ceil(Math.log2(Math.max(tournament.maxParticipants, eligible.length, 2))));
    const expectedRound1Slots = Math.pow(2, totalRounds - 1);
    const round1 = existing.filter((m) => m.round === 1 && !m.isThirdPlaceMatch);
    const incompleteStructure =
      tournament.format !== TournamentFormat.ROUND_ROBIN &&
      round1.length < expectedRound1Slots;

    if (!missingPlayers && !incompleteStructure) {
      return existing;
    }

    const hasLiveOrFinished = existing.some(
      (m) =>
        m.status === MatchStatus.IN_PROGRESS ||
        m.status === MatchStatus.FINISHED ||
        m.status === MatchStatus.WALKOVER ||
        !!m.duelId,
    );
    if (hasLiveOrFinished) {
      this.logger.warn(
        `Chave incompleta em ${tournament.name}, mas já há partidas iniciadas/finalizadas — não regenera automaticamente.`,
      );
      return existing;
    }

    this.logger.log(`♻️ Regenerando chave incompleta de ${tournament.name}`);
    await this.matchRepository.delete({ tournamentId });
    return this.generateBracket(tournamentId);
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

    // Inclui REGISTERED e ACTIVE (re-sorteio / regeneração)
    const participants = tournament.participants.filter(
      (p) =>
        p.status === ParticipantStatus.REGISTERED ||
        p.status === ParticipantStatus.ACTIVE,
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

    // Mata-mata com byes até a próxima potência de 2 (baseado em maxParticipants ou N)
    const bracketSize = Math.max(
      2,
      Math.pow(2, Math.ceil(Math.log2(Math.max(tournament.maxParticipants, shuffled.length)))),
    );
    const totalRounds = Math.ceil(Math.log2(bracketSize));
    const firstRoundSlots = Math.pow(2, totalRounds - 1); // nº de partidas na R1

    const slotPlayers: Array<number | null> = shuffled.map((p) => p.userId);
    while (slotPlayers.length < firstRoundSlots * 2) {
      slotPlayers.push(null); // bye
    }

    const matchesFirstRound: Partial<TournamentMatch>[] = [];
    for (let i = 0; i < firstRoundSlots; i++) {
      const p1 = slotPlayers[i * 2];
      const p2 = slotPlayers[i * 2 + 1];
      if (p1 != null && p2 != null) {
        matchesFirstRound.push({
          tournamentId: tournament.id,
          round: 1,
          matchNumber: i + 1,
          player1Id: p1,
          player2Id: p2,
          status: MatchStatus.READY,
          scheduledAt: startTime,
        });
      } else {
        // Bye: um jogador avança automaticamente
        const advancer = p1 ?? p2;
        matchesFirstRound.push({
          tournamentId: tournament.id,
          round: 1,
          matchNumber: i + 1,
          player1Id: advancer ?? undefined,
          player2Id: undefined,
          winnerId: advancer ?? undefined,
          status: advancer != null ? MatchStatus.WALKOVER : MatchStatus.SCHEDULED,
          scheduledAt: startTime,
          finishedAt: advancer != null ? new Date() : undefined,
        });
      }
    }

    const createdMatches = await this.matchRepository.save(matchesFirstRound);
    await this.createNextRoundStructure(tournament, createdMatches);

    // Propagar vencedores de bye para a próxima rodada
    for (const match of createdMatches) {
      if (match.status === MatchStatus.WALKOVER && match.winnerId && match.nextMatchId) {
        const next = await this.matchRepository.findOne({ where: { id: match.nextMatchId } });
        if (next) {
          if (!next.player1Id) next.player1Id = match.winnerId;
          else if (!next.player2Id) next.player2Id = match.winnerId;
          if (next.player1Id && next.player2Id) next.status = MatchStatus.READY;
          await this.matchRepository.save(next);
        }
      }
    }

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
          scheduledAt: roundScheduledAt(startTime, r + 1, tournament.roundIntervalMinutes),
        });
      });
    }

    return await this.matchRepository.save(matchesToCreate);
  }

  /**
   * Cria estrutura das próximas rodadas
   */
  private async createNextRoundStructure(tournament: Tournament, previousMatches: TournamentMatch[]) {
    const bracketSize = Math.max(
      2,
      Math.pow(2, Math.ceil(Math.log2(Math.max(tournament.maxParticipants, previousMatches.length * 2)))),
    );
    const totalRounds = Math.ceil(Math.log2(bracketSize));

    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = Math.pow(2, totalRounds - round);
      const nextRoundMatches: Partial<TournamentMatch>[] = [];

      for (let i = 0; i < matchesInRound; i++) {
        const match = this.matchRepository.create({
          tournamentId: tournament.id,
          round,
          matchNumber: i + 1,
          status: MatchStatus.SCHEDULED,
          scheduledAt: roundScheduledAt(tournament.startAt, round, tournament.roundIntervalMinutes),
          isThirdPlaceMatch: false,
        });
        nextRoundMatches.push(match);
      }

      const savedMatches = await this.matchRepository.save(nextRoundMatches);

      // Disputa de 3º lugar: semi com 2 partidas → criar jogo de 3º
      if (round === totalRounds && totalRounds >= 2 && previousMatches.length === 2) {
        const thirdPlaceMatch = this.matchRepository.create({
          tournamentId: tournament.id,
          round: totalRounds,
          matchNumber: savedMatches.length + 1,
          status: MatchStatus.SCHEDULED,
          scheduledAt: roundScheduledAt(tournament.startAt, round, tournament.roundIntervalMinutes),
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

    if (
      match.status === MatchStatus.FINISHED ||
      match.status === MatchStatus.WALKOVER
    ) {
      this.logger.warn(
        `⚠️ [updateTournamentMatchFromDuel] Partida ${match.id} já finalizada — ignorando`,
      );
      return;
    }

    const tournament = match.tournament;
    const isRoundRobin = tournament?.format === TournamentFormat.ROUND_ROBIN;
    const winnerIdNum = Number(winnerId);

    const claimed = await this.matchRepository.update(
      { id: match.id, status: In([MatchStatus.IN_PROGRESS, MatchStatus.READY]) },
      { winnerId: winnerIdNum, status: MatchStatus.FINISHED, finishedAt: new Date() },
    );
    if (!claimed.affected) {
      this.logger.debug(`Partida ${match.id} já processada por outra instância`);
      return;
    }
    match.winnerId = winnerIdNum;
    match.status = MatchStatus.FINISHED;

    const loserId = match.player1Id === winnerIdNum ? match.player2Id : match.player1Id;

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
      where: { tournament: { id: match.tournamentId }, userId: winnerIdNum },
    });
    if (winnerParticipant) {
      winnerParticipant.wins = (winnerParticipant.wins || 0) + 1;
      await this.participantRepository.save(winnerParticipant);
    }

    this.logger.log(`✅ [updateTournamentMatchFromDuel] Partida ${match.id} (Rodada ${match.round}) finalizada. Vencedor: ${winnerIdNum}`);

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
          if (nextMatch.player1Id && nextMatch.player1Id !== winnerIdNum) {
            this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] player1Id já está ocupado (${nextMatch.player1Id}), mas vencedor ${winnerIdNum} também precisa ir para lá. Substituindo...`);
          }
          nextMatch.player1Id = winnerIdNum;
          this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerIdNum} atribuído ao player1Id da próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round})`);
        } else {
          if (nextMatch.player2Id && nextMatch.player2Id !== winnerIdNum) {
            this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] player2Id já está ocupado (${nextMatch.player2Id}), mas vencedor ${winnerIdNum} também precisa ir para lá. Substituindo...`);
          }
          // Evitar colocar o mesmo jogador nos dois lados (ex.: bye mal preenchido)
          if (nextMatch.player1Id === winnerIdNum) {
            this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] Vencedor ${winnerIdNum} já está em player1Id da próxima partida. Marcando partida como W.O.`);
            nextMatch.winnerId = winnerIdNum;
            nextMatch.status = MatchStatus.WALKOVER;
            nextMatch.finishedAt = new Date();
          } else {
            nextMatch.player2Id = winnerIdNum;
            this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerIdNum} atribuído ao player2Id da próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round})`);
          }
        }

        // Se ambos os jogadores estão definidos e ainda não é W.O., marcar como READY
        if (
          nextMatch.status !== MatchStatus.WALKOVER &&
          nextMatch.player1Id &&
          nextMatch.player2Id
        ) {
          nextMatch.status = MatchStatus.READY;
          this.logger.log(`✅ [updateTournamentMatchFromDuel] Próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round}) está pronta com ambos os jogadores: ${nextMatch.player1Id} vs ${nextMatch.player2Id}`);
        } else if (nextMatch.status !== MatchStatus.WALKOVER) {
          this.logger.log(`⏳ [updateTournamentMatchFromDuel] Próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round}) aguardando outro jogador. Atual: player1Id=${nextMatch.player1Id}, player2Id=${nextMatch.player2Id}`);
        }

        await this.matchRepository.save(nextMatch);
        this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerIdNum} avançou para próxima fase (Partida ${nextMatch.matchNumber} - Rodada ${nextMatch.round})`);
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
        { tournament: { id: match.tournamentId }, userId: winnerIdNum },
        { finalPosition: 3 },
      );
      await this.participantRepository.update(
        { tournament: { id: match.tournamentId }, userId: loserId },
        { finalPosition: 4 },
      );
      this.logger.log(`🏅 [updateTournamentMatchFromDuel] 3º lugar: ${winnerIdNum}, 4º lugar: ${loserId}`);

      // Se o torneio já terminou (final antes do 3º), entregar prêmios de 3º/4º agora
      const tNow = await this.tournamentRepository.findOne({ where: { id: match.tournamentId } });
      if (tNow?.status === TournamentStatus.FINISHED) {
        await this.distributePrizes(tNow, [3, 4]);
      }
    }

    // Verificar se todas as partidas da rodada atual terminaram para avançar fase
    await this.checkAndAdvanceRound(match.tournamentId);
  }

  /**
   * Partidas da rodada que realmente precisam terminar.
   * 3º lugar vazio (sem os 2 jogadores) não bloqueia a finalização.
   */
  private matchesRequiredToFinishRound(matches: TournamentMatch[]): TournamentMatch[] {
    return matches.filter((m) => {
      if (!m.isThirdPlaceMatch) return true;
      if (
        m.status === MatchStatus.FINISHED ||
        m.status === MatchStatus.WALKOVER ||
        m.status === MatchStatus.IN_PROGRESS ||
        m.status === MatchStatus.CANCELLED
      ) {
        return m.status !== MatchStatus.CANCELLED;
      }
      // READY/SCHEDULED: só conta se ambos os jogadores estão definidos
      return !!(m.player1Id && m.player2Id);
    });
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

    if (tournament.status === TournamentStatus.FINISHED) {
      return;
    }

    // Round-robin não usa nextMatchId. Cada rodada termina quando seus duelos
    // terminam, e o torneio só termina após TODAS as partidas de TODAS as fases.
    if (tournament.format === TournamentFormat.ROUND_ROBIN) {
      const allMatches = tournament.matches;
      if (!allMatches.length) return;
      const done = (m: TournamentMatch) =>
        [MatchStatus.FINISHED, MatchStatus.WALKOVER, MatchStatus.CANCELLED].includes(m.status);
      if (allMatches.every(done)) {
        await this.checkRoundRobinTournamentFinished(tournament.id);
        return;
      }
      const maxRound = Math.max(...allMatches.map((m) => m.round));
      const roundMatches = allMatches.filter((m) => m.round === tournament.currentRound);
      if (roundMatches.length && roundMatches.every(done) && tournament.currentRound < maxRound) {
        await this.advanceToNextRound(tournament.id);
      }
      return;
    }

    const currentRoundMatches = tournament.matches.filter(
      (m) => m.round === tournament.currentRound,
    );

    // Cancelar disputa de 3º sem jogadores para não travar o torneio
    for (const m of currentRoundMatches) {
      if (
        m.isThirdPlaceMatch &&
        (m.status === MatchStatus.SCHEDULED || m.status === MatchStatus.READY) &&
        (!m.player1Id || !m.player2Id)
      ) {
        const championshipDone = currentRoundMatches
          .filter((x) => !x.isThirdPlaceMatch)
          .every(
            (x) =>
              x.status === MatchStatus.FINISHED || x.status === MatchStatus.WALKOVER,
          );
        if (championshipDone) {
          m.status = MatchStatus.CANCELLED;
          m.finishedAt = new Date();
          await this.matchRepository.save(m);
          this.logger.log(
            `🚫 [checkAndAdvanceRound] Disputa de 3º cancelada (sem jogadores) — torneio ${tournament.name}`,
          );
        }
      }
    }

    const requiredMatches = this.matchesRequiredToFinishRound(currentRoundMatches);

    this.logger.log(
      `🔍 [checkAndAdvanceRound] Rodada ${tournament.currentRound} de ${tournament.name}: ${requiredMatches.length}/${currentRoundMatches.length} partida(s) relevantes`,
    );

    const allFinished =
      requiredMatches.length > 0 &&
      requiredMatches.every(
        (m) =>
          m.status === MatchStatus.FINISHED ||
          m.status === MatchStatus.WALKOVER ||
          m.status === MatchStatus.CANCELLED,
      );

    this.logger.log(`✅ [checkAndAdvanceRound] Todas as partidas relevantes terminaram? ${allFinished}`);

    if (allFinished) {
      const championshipMatches = requiredMatches.filter((m) => !m.isThirdPlaceMatch);
      const hasNextRound = championshipMatches.some((m) => m.nextMatchId);

      this.logger.log(`🔍 [checkAndAdvanceRound] Tem próxima rodada? ${hasNextRound}`);

      if (hasNextRound) {
        await this.advanceToNextRound(tournament.id);

        const updatedTournament = await this.tournamentRepository.findOne({
          where: { id: tournament.id },
        });

        if (!updatedTournament) {
          this.logger.error(`❌ [checkAndAdvanceRound] Não foi possível buscar torneio atualizado após avançar rodada`);
          return;
        }

        const nextRound = updatedTournament.currentRound;
        this.logger.log(`📈 [checkAndAdvanceRound] Avançou para rodada ${nextRound}. Buscando partidas prontas...`);

        const nextRoundMatches = await this.matchRepository.find({
          where: { tournamentId: tournament.id, round: nextRound },
        });

        const readyMatches = nextRoundMatches.filter((m) => m.status === MatchStatus.READY);
        this.logger.log(`✅ [checkAndAdvanceRound] Partidas prontas (READY): ${readyMatches.length}`);

        for (const nextMatch of readyMatches) {
          await this.tryStartMatchDuel(nextMatch);
        }
        // Reavalia: próxima rodada pode já estar toda em W.O./bye
        await this.checkAndAdvanceRound(tournament.id);
      } else {
        this.logger.log(`🏆 [checkAndAdvanceRound] Torneio ${tournament.name} terminou! Finalizando...`);
        await this.finishTournament(tournament.id);
      }
    } else if (currentRoundMatches.length > 0) {
      // Iniciar partidas READY que ainda não têm duelo (ex.: 3º lugar liberado no meio da rodada)
      const readyToStart = currentRoundMatches.filter(
        (m) =>
          m.status === MatchStatus.READY &&
          m.player1Id &&
          m.player2Id &&
          !m.duelId,
      );
      for (const m of readyToStart) {
        await this.tryStartMatchDuel(m);
      }

      const unfinishedMatches = requiredMatches.filter(
        (m) =>
          m.status !== MatchStatus.FINISHED &&
          m.status !== MatchStatus.WALKOVER &&
          m.status !== MatchStatus.CANCELLED,
      );
      this.logger.log(
        `⏳ [checkAndAdvanceRound] Aguardando ${unfinishedMatches.length} partida(s):`,
        unfinishedMatches.map((m) => `Match ${m.matchNumber} (${m.status})`),
      );
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
    tournament.prizeDetails = {
      ...(tournament.prizeDetails ?? {}),
      _automaticAwardsVersion: 2,
    } as Tournament['prizeDetails'];
    await this.tournamentRepository.save(tournament);

    await this.distributePrizes(tournament);
    this.logger.log(`🏆 Torneio pontos corridos ${tournament.name} finalizado! Campeão: ${tournament.winnerId}`);
  }

  /**
   * Finaliza torneio. Quem vencer a final é o campeão (winnerId).
   * Entrega premiações e marca status finished.
   */
  private async finishTournament(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status === TournamentStatus.FINISHED) {
      this.logger.log(`ℹ️ [finishTournament] Torneio ${tournament.name} já estava finalizado`);
      return;
    }

    const allMatches = await this.matchRepository.find({ where: { tournamentId } });
    const finalMatch = allMatches
      .filter(
        (m) =>
          !m.isThirdPlaceMatch &&
          !m.nextMatchId &&
          (m.status === MatchStatus.FINISHED || m.status === MatchStatus.WALKOVER) &&
          m.winnerId != null,
      )
      .sort((a, b) => b.round - a.round)[0];

    if (!finalMatch?.winnerId) {
      this.logger.error(
        `❌ [finishTournament] Torneio ${tournament.name}: final sem vencedor — não foi possível finalizar`,
      );
      return;
    }

    tournament.winnerId = finalMatch.winnerId;
    tournament.status = TournamentStatus.FINISHED;
    tournament.finishedAt = new Date();
    tournament.prizeDetails = {
      ...(tournament.prizeDetails ?? {}),
      _automaticAwardsVersion: 2,
    } as Tournament['prizeDetails'];

    const loserId =
      finalMatch.player1Id === finalMatch.winnerId
        ? finalMatch.player2Id
        : finalMatch.player1Id;
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

    // Garantir 3º/4º se a disputa de 3º já tiver terminado
    const thirdPlaceMatch = allMatches.find(
      (m) =>
        m.isThirdPlaceMatch &&
        (m.status === MatchStatus.FINISHED || m.status === MatchStatus.WALKOVER) &&
        m.winnerId != null,
    );
    if (thirdPlaceMatch?.winnerId) {
      const thirdLoser =
        thirdPlaceMatch.player1Id === thirdPlaceMatch.winnerId
          ? thirdPlaceMatch.player2Id
          : thirdPlaceMatch.player1Id;
      await this.participantRepository.update(
        { tournament: { id: tournamentId }, userId: thirdPlaceMatch.winnerId },
        { finalPosition: 3 },
      );
      if (thirdLoser) {
        await this.participantRepository.update(
          { tournament: { id: tournamentId }, userId: thirdLoser },
          { finalPosition: 4 },
        );
      }
    }

    await this.tournamentRepository.save(tournament);

    await this.distributePrizes(tournament);

    this.logger.log(
      `🏆 Torneio ${tournament.name} finalizado! Campeão userId=${tournament.winnerId}`,
    );
  }

  /** Pontos por posição final (1º, 2º, 3º, 4º) para o ranking de torneios */
  private static readonly POINTS_BY_PLACE: Record<number, number> = {
    1: 100,
    2: 50,
    3: 25,
    4: 10,
  };

  private async awardTournamentPoints(tournamentId: string, onlyPlaces?: number[]) {
    const full = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['participants'],
    });
    if (!full?.participants?.length) return;
    for (const p of full.participants) {
      const place = p.finalPosition;
      if (place == null) continue;
      if (onlyPlaces && !onlyPlaces.includes(place)) continue;
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
   * Distribui prêmios. onlyPlaces limita a lugares específicos (ex.: 3º/4º tardios).
   * Idempotente via prizeDetails._awardedPlaces.
   */
  private async distributePrizes(tournament: Tournament, onlyPlaces?: number[]) {
    const fullTournament = await this.tournamentRepository.findOne({
      where: { id: tournament.id },
      relations: ['participants', 'participants.user'],
    });
    if (!fullTournament) return;

    const details = { ...(fullTournament.prizeDetails ?? {}) } as Record<string, any>;
    const awardedPlaces: number[] = Array.isArray(details._awardedPlaces)
      ? [...details._awardedPlaces]
      : [];
    const places = ([1, 2, 3, 4] as const).filter(
      (place) => !onlyPlaces || onlyPlaces.includes(place),
    );

    for (const place of places) {
      if (awardedPlaces.includes(place)) {
        this.logger.log(`ℹ️ Prêmio ${place}º já entregue no torneio ${fullTournament.name}, pulando`);
        continue;
      }

      const participants = fullTournament.participants?.filter((p) => p.finalPosition === place) ?? [];
      if (participants.length === 0) continue;

      const prize = details[place];
      const creditLegacy = place === 1 ? fullTournament.prizeFirst : place === 2 ? fullTournament.prizeSecond : place === 3 ? fullTournament.prizeThird : 0;
      const credit = prize?.credit ?? (place <= 3 ? creditLegacy : 0);
      const cash = prize?.cash ?? 0;
      const cardIds = prize?.cardIds ?? [];
      const trophyTitle = prize?.trophyTitle;
      const trophyIcon = prize?.trophyIcon;
      const stars = Math.max(0, prize?.stars ?? 0);

      let awardedAny = false;
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
              metadata: {
                tournamentId: fullTournament.id,
                place,
                tournamentName: fullTournament.name,
              },
            });
            this.logger.log(`🏆 Troféu ${place}º: ${trophyTitle} -> userId ${userId}`);
          }
          awardedAny = true;
        } catch (err) {
          this.logger.error(`Erro ao distribuir prêmio ${place}º para userId ${userId}:`, err);
        }
      }

      if (awardedAny || participants.length > 0) {
        awardedPlaces.push(place);
      }
    }

    details._awardedPlaces = awardedPlaces;
    fullTournament.prizeDetails = details;
    await this.tournamentRepository.save(fullTournament);
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
    // A tela de detalhes usa apenas os dados do torneio e do campeão.
    // Carregar participantes + todas as partidas com usuários no mesmo SELECT
    // multiplica joins e pode falhar/ficar extremamente lento após gerar a chave.
    // Chave e pódio possuem endpoints próprios.
    // Consultar torneio sem JOINs: bancos legados podem ter relacionamentos
    // com tipos divergentes (integer = uuid), provocando erro 500 no PostgreSQL.
    const tournament = await this.tournamentRepository
      .createQueryBuilder('tournament')
      .where('tournament.id = :id', { id })
      .getOne();

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    // O campeão é opcional. Buscar separadamente impede que um JOIN inválido
    // bloqueie a visualização do torneio inteiro.
    let winner: User | null = null;
    if (tournament.winnerId != null) {
      try {
        winner = await this.tournamentRepository.manager.getRepository(User)
          .findOne({ where: { id: tournament.winnerId } });
      } catch (error: any) {
        this.logger.warn(`Não foi possível obter campeão do torneio ${id}: ${error?.message || error}`);
      }
    }
    return { ...tournament, winner };
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

    const newInterval = tournamentData.roundIntervalMinutes === undefined
      ? (tournament.roundIntervalMinutes ?? DEFAULT_ROUND_INTERVAL_MINUTES)
      : validateRoundIntervalMinutes(tournamentData.roundIntervalMinutes);
    const newStartAt = tournamentData.startAt === undefined
      ? new Date(tournament.startAt)
      : new Date(tournamentData.startAt);
    if (!Number.isFinite(newStartAt.getTime())) {
      throw new BadRequestException('Horário inicial do torneio inválido.');
    }
    const scheduleChanged =
      newInterval !== (tournament.roundIntervalMinutes ?? DEFAULT_ROUND_INTERVAL_MINUTES) ||
      newStartAt.getTime() !== new Date(tournament.startAt).getTime();

    const { id: _id, createdAt, createdBy, ...safeData } = tournamentData as Partial<Tournament> & { id?: string; createdAt?: Date; createdBy?: number };

    if (!scheduleChanged) {
      Object.assign(tournament, { ...safeData, format, roundIntervalMinutes: newInterval });
      return this.tournamentRepository.save(tournament);
    }

    // A edição do cronograma deve atualizar a chave que já foi gerada.
    // Bloqueamos a edição após início dos duelos para não alterar prazos reais.
    return this.tournamentRepository.manager.transaction(async (manager) => {
      const tournaments = manager.getRepository(Tournament);
      const matches = manager.getRepository(TournamentMatch);
      const locked = await tournaments.createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: tournamentId })
        .getOne();
      if (!locked) throw new NotFoundException('Torneio não encontrado');

      const bracket = await matches.find({ where: { tournamentId }, select: ['id', 'round', 'status', 'duelId'] });
      if (bracket.length && (
        [TournamentStatus.IN_PROGRESS, TournamentStatus.FINISHED, TournamentStatus.CANCELLED].includes(locked.status) ||
        bracket.some((match) =>
          match.status === MatchStatus.IN_PROGRESS ||
          match.status === MatchStatus.FINISHED ||
          !!match.duelId
        )
      )) {
        throw new BadRequestException(
          'Não é possível mudar o intervalo ou início após o começo dos duelos do torneio.',
        );
      }

      Object.assign(locked, {
        ...safeData,
        format,
        startAt: newStartAt,
        roundIntervalMinutes: newInterval,
      });
      const saved = await tournaments.save(locked);
      const rounds = [...new Set(bracket.map((m) => m.round))];
      for (const round of rounds) {
        await matches.update(
          { tournamentId, round },
          { scheduledAt: roundScheduledAt(newStartAt, round, newInterval) },
        );
      }
      return saved;
    });
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
   * Obter pódio do torneio (1º–4º) com base em finalPosition dos participantes.
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

    const prizeByPlace: Record<number, number> = {
      1: tournament.prizeFirst,
      2: tournament.prizeSecond,
      3: tournament.prizeThird,
      4: tournament.prizeDetails?.[4]?.credit ?? 0,
    };

    const byPosition = (tournament.participants ?? [])
      .filter((p) => p.finalPosition != null && p.finalPosition >= 1 && p.finalPosition <= 4)
      .sort((a, b) => (a.finalPosition ?? 99) - (b.finalPosition ?? 99));

    if (byPosition.length > 0) {
      const top: Array<{ position: number; user: any; prize: number }> = [];
      for (const p of byPosition) {
        const u = p.user ?? (await this.usersService.findById(p.userId));
        if (u) {
          const place = p.finalPosition!;
          const detailCredit = tournament.prizeDetails?.[place]?.credit;
          top.push({
            position: place,
            user: { id: u.id, nickname: u.nickname, profileImage: u.profileImage },
            prize: detailCredit ?? prizeByPlace[place] ?? 0,
          });
        }
      }
      return top;
    }

    // Fallback mata-mata pela chave (torneios antigos sem finalPosition)
    const allMatches = await this.matchRepository.find({
      where: { tournamentId },
      relations: ['player1', 'player2', 'winner'],
    });
    const finished = allMatches.filter(
      (m) => m.status === MatchStatus.FINISHED || m.status === MatchStatus.WALKOVER,
    );
    const finalMatch = finished
      .filter((m) => !m.nextMatchId && !m.isThirdPlaceMatch && m.winnerId != null)
      .sort((a, b) => b.round - a.round)[0];

    const top3: Array<{ position: number; user: any; prize: number }> = [];

    if (finalMatch?.winnerId) {
      const winner = await this.usersService.findById(finalMatch.winnerId);
      top3.push({
        position: 1,
        user: { id: winner.id, nickname: winner.nickname, profileImage: winner.profileImage },
        prize: tournament.prizeFirst,
      });
      const loserId =
        finalMatch.player1Id === finalMatch.winnerId
          ? finalMatch.player2Id
          : finalMatch.player1Id;
      if (loserId) {
        const loser = await this.usersService.findById(loserId);
        top3.push({
          position: 2,
          user: { id: loser.id, nickname: loser.nickname, profileImage: loser.profileImage },
          prize: tournament.prizeSecond,
        });
      }
    }

    const thirdPlaceMatch = finished.find(
      (m) => m.isThirdPlaceMatch && m.winnerId != null,
    );
    if (thirdPlaceMatch?.winnerId) {
      const third = await this.usersService.findById(thirdPlaceMatch.winnerId);
      top3.push({
        position: 3,
        user: { id: third.id, nickname: third.nickname, profileImage: third.profileImage },
        prize: tournament.prizeThird,
      });
      const fourthId =
        thirdPlaceMatch.player1Id === thirdPlaceMatch.winnerId
          ? thirdPlaceMatch.player2Id
          : thirdPlaceMatch.player1Id;
      if (fourthId) {
        const fourth = await this.usersService.findById(fourthId);
        top3.push({
          position: 4,
          user: { id: fourth.id, nickname: fourth.nickname, profileImage: fourth.profileImage },
          prize: tournament.prizeDetails?.[4]?.credit ?? 0,
        });
      }
    } else if (finalMatch) {
      const semifinals = finished.filter((m) => m.nextMatchId === finalMatch.id);
      const finalPlayers = [finalMatch.player1Id, finalMatch.player2Id].filter(Boolean);
      const semifinalLosers = semifinals
        .map((m) => (m.player1Id === m.winnerId ? m.player2Id : m.player1Id))
        .filter((id) => id != null && !finalPlayers.includes(id));
      if (semifinalLosers[0]) {
        const thirdPlace = await this.usersService.findById(semifinalLosers[0]!);
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
