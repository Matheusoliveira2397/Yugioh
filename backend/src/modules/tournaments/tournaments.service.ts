import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Tournament, TournamentStatus, TournamentFormat } from './entities/tournament.entity';
import { TournamentParticipant, ParticipantStatus } from './entities/tournament-participant.entity';
import { TournamentMatch, MatchStatus } from './entities/tournament-match.entity';
import { DuelsService } from '../duels/duels.service';
import { DuelOrigin, DuelResult } from '../duels/entities/duel.entity';
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
    @Inject(forwardRef(() => DuelsService))
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
   * Fecha inscrições automaticamente e faz sorteio se necessário
   */
  private async autoCloseRegistrations(now: Date) {
    const tournamentsToClose = await this.tournamentRepository.find({
      where: {
        status: TournamentStatus.REGISTRATION_OPEN,
        registrationCloseAt: LessThan(now),
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
        startAt: LessThan(now),
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
          scheduledAt: LessThan(now),
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
        scheduledAt: LessThan(now),
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

  /**
   * Cria um novo torneio
   */
  async create(userId: number, tournamentData: Partial<Tournament>) {
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
      where: { tournamentId, userId },
    });

    if (existing) {
      throw new BadRequestException('Você já está inscrito neste torneio');
    }

    // Cobrar taxa de inscrição (usando credits agora)
    if (tournament.entryFee > 0) {
      const user = await this.usersService.findById(userId);
      if ((user.credits || 0) < tournament.entryFee) {
        throw new BadRequestException('Créditos insuficientes');
      }
      await this.usersService.update(userId, {
        credits: (user.credits || 0) - tournament.entryFee
      });
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

    // Usar insert direto via query builder com valores explícitos
    try {
      const insertResult = await this.participantRepository
        .createQueryBuilder()
        .insert()
        .into(TournamentParticipant)
        .values({
          tournamentId: tournamentIdValue,
          userId: userIdValue,
          status: ParticipantStatus.REGISTERED,
          wins: 0,
          losses: 0,
          draws: 0,
        })
        .execute();

      this.logger.log(`✅ Participante inserido com sucesso. Insert result:`, insertResult);

      // Buscar o participante criado para retornar
      const participant = await this.participantRepository.findOne({
        where: { 
          tournamentId: tournamentIdValue, 
          userId: userIdValue 
        },
        relations: ['user', 'tournament'],
      });

      if (!participant) {
        this.logger.error(`❌ Participante não encontrado após inserção. TournamentId: ${tournamentIdValue}, UserId: ${userIdValue}`);
        throw new BadRequestException('Erro ao criar participante: não foi encontrado após inserção');
      }

      if (!participant.tournamentId || participant.tournamentId !== tournamentIdValue) {
        this.logger.error(`❌ TournamentId não foi salvo corretamente. Esperado: ${tournamentIdValue}, Recebido: ${participant.tournamentId}`);
        throw new BadRequestException('Erro ao criar participante: tournamentId não foi salvo corretamente');
      }

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
    } catch (error: any) {
      this.logger.error(`❌ Erro ao registrar participante:`, error);
      
      // Se já existe, verificar se é o mesmo usuário
      if (error.code === '23505') { // Unique constraint violation
        throw new BadRequestException('Você já está inscrito neste torneio');
      }
      
      // Se for erro de null constraint, tentar método alternativo com raw SQL
      if (error.message && (error.message.includes('null value in column "tournamentId"') || error.message.includes('tournamentId'))) {
        this.logger.warn(`⚠️ Erro de tournamentId, tentando método alternativo com raw SQL`);
        
        try {
          // Usar raw SQL para garantir que o valor seja inserido
          await this.participantRepository.query(
            `INSERT INTO tournament_participants ("tournamentId", "userId", status, wins, losses, draws, "registeredAt")
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT DO NOTHING`,
            [tournamentIdValue, userIdValue, ParticipantStatus.REGISTERED, 0, 0, 0]
          );

          // Buscar o participante criado
          const participant = await this.participantRepository.findOne({
            where: { 
              tournamentId: tournamentIdValue, 
              userId: userIdValue 
            },
            relations: ['user', 'tournament'],
          });

          if (!participant) {
            throw new BadRequestException('Erro ao criar participante após tentativa alternativa');
          }

          // Atualizar contador
          tournament.currentParticipants++;
          await this.tournamentRepository.save(tournament);

          if (tournament.currentParticipants >= tournament.maxParticipants) {
            tournament.status = TournamentStatus.REGISTRATION_CLOSED;
            await this.tournamentRepository.save(tournament);
          }

          return participant;
        } catch (rawError: any) {
          this.logger.error(`❌ Erro no método alternativo:`, rawError);
          throw new BadRequestException(`Erro ao se inscrever no torneio: ${rawError.message || 'Erro desconhecido'}`);
        }
      }
      
      throw error;
    }
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
          tournamentId: tournament.id,
          round: 1,
          matchNumber: Math.floor(i / 2) + 1,
          player1Id: shuffled[i].userId,
          player2Id: shuffled[i + 1].userId,
          status: MatchStatus.READY,
          scheduledAt: startTime, // Todas as partidas da primeira rodada começam no mesmo horário
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
   * Atualiza partida do torneio quando duelo termina
   */
  async updateTournamentMatchFromDuel(duelId: string, winnerId: number, result: DuelResult): Promise<void> {
    // Validar formato UUID antes de fazer a query
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(duelId)) {
      this.logger.error(`❌ [updateTournamentMatchFromDuel] ID inválido (não é UUID): ${duelId}`);
      return;
    }
    
    // Buscar partida do torneio pelo duelId
    const match = await this.matchRepository.findOne({
      where: { duelId },
      relations: ['tournament'],
    });

    if (!match) {
      this.logger.warn(`⚠️ [updateTournamentMatchFromDuel] Partida não encontrada para duelo ${duelId}`);
      return;
    }

    // Atualizar partida com vencedor
    match.winnerId = winnerId;
    match.status = MatchStatus.FINISHED;
    match.finishedAt = new Date();
    await this.matchRepository.save(match);

    this.logger.log(`✅ [updateTournamentMatchFromDuel] Partida ${match.id} (Rodada ${match.round}) finalizada. Vencedor: ${winnerId}`);

    // Avançar vencedor para próxima fase
    if (match.nextMatchId) {
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
          nextMatch.player2Id = winnerId;
          this.logger.log(`✅ [updateTournamentMatchFromDuel] Vencedor ${winnerId} atribuído ao player2Id da próxima partida (Match ${nextMatch.matchNumber} - Round ${nextMatch.round})`);
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
   * Finaliza torneio
   */
  private async finishTournament(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches'],
    });

    if (!tournament) {
      throw new Error('Tournament not found');
    }

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
      const user = await this.usersService.findById(tournament.winnerId);
      await this.usersService.update(tournament.winnerId, {
        credits: (user.credits || 0) + tournament.prizeFirst
      });
      this.logger.log(`💰 Prêmio de ${tournament.prizeFirst} créditos entregue ao vencedor`);
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

  /**
   * Atualizar torneio
   */
  async update(id: string, tournamentData: Partial<Tournament>) {
    const tournament = await this.tournamentRepository.findOne({ where: { id } });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    Object.assign(tournament, tournamentData);
    return await this.tournamentRepository.save(tournament);
  }

  /**
   * Excluir torneio
   */
  async remove(id: string) {
    const tournament = await this.tournamentRepository.findOne({ where: { id } });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    await this.tournamentRepository.remove(tournament);
    return { message: 'Torneio excluído com sucesso' };
  }

  /**
   * Obter top 3 do torneio
   */
  async getTop3(tournamentId: string) {
    const tournament = await this.tournamentRepository.findOne({
      where: { id: tournamentId },
      relations: ['matches'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    if (tournament.status !== TournamentStatus.FINISHED) {
      throw new BadRequestException('Torneio ainda não foi finalizado');
    }

    // Buscar todas as partidas finalizadas
    const allMatches = await this.matchRepository.find({
      where: { tournamentId, status: MatchStatus.FINISHED },
      relations: ['player1', 'player2', 'winner'],
    });

    // Buscar partida final (sem nextMatchId)
    const finalMatch = allMatches.find(m => !m.nextMatchId);

    const top3: Array<{ position: number; user: any; prize: number }> = [];

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
