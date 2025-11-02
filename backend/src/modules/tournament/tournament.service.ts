import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament } from './entities/tournament.entity';
import { TournamentParticipant } from './entities/tournament-participant.entity';

@Injectable()
export class TournamentService {
  constructor(
    @InjectRepository(Tournament)
    private tournamentRepository: Repository<Tournament>,
    @InjectRepository(TournamentParticipant)
    private participantRepository: Repository<TournamentParticipant>,
  ) {}

  async create(data: Partial<Tournament>): Promise<Tournament> {
    const tournament = this.tournamentRepository.create(data);
    return this.tournamentRepository.save(tournament);
  }

  async findAll(): Promise<Tournament[]> {
    return this.tournamentRepository.find({
      where: { status: 'upcoming' },
      relations: ['participants'],
    });
  }

  async findOne(id: string): Promise<Tournament | null> {
    return this.tournamentRepository.findOne({
      where: { id },
      relations: ['participants', 'participants.user'],
    });
  }

  async join(tournamentId: string, userId: string): Promise<void> {
    const tournament = await this.findOne(tournamentId);
    
    if (!tournament) {
      throw new Error('Tournament not found');
    }
    
    if (tournament.participants.length >= tournament.maxParticipants) {
      throw new Error('Tournament is full');
    }

    const participant = this.participantRepository.create({
      tournamentId,
      userId,
    });

    await this.participantRepository.save(participant);
  }

  async start(id: string): Promise<Tournament | null> {
    await this.tournamentRepository.update(id, { status: 'active' });
    return this.findOne(id);
  }
}
