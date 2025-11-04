import { IsUUID } from 'class-validator';

export class SearchDuelDto {
  @IsUUID()
  userId: string;
}

export class DuelFoundDto {
  duelId: string;
  opponent: {
    id: string;
    username: string;
    clanTag?: string;
    level: number;
    avatar?: string;
  };
  yourTurn: boolean;
}

export class DuelActionDto {
  duelId: string;
  actionType: string;
  data?: any;
}

export class DuelChatDto {
  duelId: string;
  message: string;
}
