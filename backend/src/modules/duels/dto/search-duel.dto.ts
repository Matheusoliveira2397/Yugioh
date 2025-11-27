import { IsNumber } from 'class-validator';

export class SearchDuelDto {
  @IsNumber()
  userId: number;
}

export class DuelFoundDto {
  duelId: number;
  opponent: {
    id: number;
    username: string;
    clanTag?: string;
    level: number;
    avatar?: string;
  };
  yourTurn: boolean;
}

export class DuelActionDto {
  duelId: number;
  actionType: string;
  data?: any;
}

export class DuelChatDto {
  duelId: number;
  message: string;
}
