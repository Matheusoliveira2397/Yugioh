/** Tipos de objetivos que o admin pode escolher ao criar missões */
export enum MissionObjectiveType {
  /** Vencer X duelos em qualquer modo */
  WIN_ANY_DUEL = 'WIN_ANY_DUEL',
  /** Vencer X duelos aleatórios (Random) */
  WIN_RANDOM_DUEL = 'WIN_RANDOM_DUEL',
  /** Vencer X duelos na Arena de Desafios */
  WIN_ARENA_DUEL = 'WIN_ARENA_DUEL',
  /** Vencer X duelos em torneio */
  WIN_TOURNAMENT_DUEL = 'WIN_TOURNAMENT_DUEL',
  /** Vencer X duelos por desafio (chat/direto) */
  WIN_CHAT_DUEL = 'WIN_CHAT_DUEL',
  /** Vencer X duelos Random Animes */
  WIN_RANDOM_ANIME_DUEL = 'WIN_RANDOM_ANIME_DUEL',
  /** Jogar X duelos (vitória ou derrota), qualquer modo */
  PLAY_ANY_DUEL = 'PLAY_ANY_DUEL',
  /** Jogar X duelos aleatórios */
  PLAY_RANDOM_DUEL = 'PLAY_RANDOM_DUEL',
  /** Jogar X duelos na Arena */
  PLAY_ARENA_DUEL = 'PLAY_ARENA_DUEL',
  /** Jogar X duelos em torneio */
  PLAY_TOURNAMENT_DUEL = 'PLAY_TOURNAMENT_DUEL',
  /** Entrar em um clã */
  JOIN_CLAN = 'JOIN_CLAN',
  /** Criar um clã */
  CREATE_CLAN = 'CREATE_CLAN',
  /** Inscrever-se em X torneios */
  REGISTER_TOURNAMENT = 'REGISTER_TOURNAMENT',
  /**
   * Ficar no top N da Arena de Desafios.
   * targetAmount = quantas vezes; meta.maxPosition = N (ex.: 5 = top 5)
   */
  ARENA_TOP_N = 'ARENA_TOP_N',
  /** Abrir X loot boxes */
  OPEN_LOOT_BOX = 'OPEN_LOOT_BOX',
  /** Comprar X cartas na loja */
  BUY_SHOP_CARD = 'BUY_SHOP_CARD',
  /** Enviar X solicitações de amizade / adicionar amigos */
  ADD_FRIEND = 'ADD_FRIEND',
  /** Ganhar X de score (totalScore) */
  EARN_SCORE = 'EARN_SCORE',
  /** Completar o perfil (nickname + avatar) — targetAmount normalmente 1 */
  COMPLETE_PROFILE = 'COMPLETE_PROFILE',
  /** Fazer login X dias distintos no período */
  LOGIN_DAYS = 'LOGIN_DAYS',
}

export type MissionResetType = 'none' | 'daily' | 'weekly' | 'season' | 'manual';

export type MissionRewardType =
  | 'none'
  | 'credits'
  | 'cash'
  | 'card'
  /** XP do Battle Pass (season ativa) — free e premium avançam juntos */
  | 'battle_pass_xp';

export interface MissionObjectiveMeta {
  /** Para ARENA_TOP_N: posição máxima aceita (1 = 1º lugar, 5 = top 5) */
  maxPosition?: number;
}

export interface MissionObjectiveDefinition {
  type: MissionObjectiveType;
  label: string;
  description: string;
  /** Se true, o admin pode definir meta.maxPosition */
  supportsMaxPosition?: boolean;
  defaultTarget: number;
}

export const MISSION_OBJECTIVE_CATALOG: MissionObjectiveDefinition[] = [
  {
    type: MissionObjectiveType.WIN_ANY_DUEL,
    label: 'Vencer duelos (qualquer modo)',
    description: 'Conta vitórias em Random, Arena, Torneio, Chat, etc.',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.WIN_RANDOM_DUEL,
    label: 'Vencer duelos aleatórios',
    description: 'Vitórias no Random Duel',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.WIN_ARENA_DUEL,
    label: 'Vencer duelos na Arena',
    description: 'Vitórias na Arena de Desafios',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.WIN_TOURNAMENT_DUEL,
    label: 'Vencer duelos em torneio',
    description: 'Vitórias em partidas de torneio',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.WIN_CHAT_DUEL,
    label: 'Vencer duelos por desafio',
    description: 'Vitórias em desafios via chat / direto',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.WIN_RANDOM_ANIME_DUEL,
    label: 'Vencer duelos Random Animes',
    description: 'Vitórias no modo Random Animes Deck',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.PLAY_ANY_DUEL,
    label: 'Jogar duelos (qualquer modo)',
    description: 'Participar de duelos (vitória ou derrota)',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.PLAY_RANDOM_DUEL,
    label: 'Jogar duelos aleatórios',
    description: 'Participar de Random Duels',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.PLAY_ARENA_DUEL,
    label: 'Jogar duelos na Arena',
    description: 'Participar de duelos na Arena de Desafios',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.PLAY_TOURNAMENT_DUEL,
    label: 'Jogar duelos em torneio',
    description: 'Participar de partidas de torneio',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.JOIN_CLAN,
    label: 'Entrar em um clã',
    description: 'Entrar como membro em um clã',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.CREATE_CLAN,
    label: 'Criar um clã',
    description: 'Criar um novo clã',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.REGISTER_TOURNAMENT,
    label: 'Inscrever-se em torneios',
    description: 'Registrar-se em torneios',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.ARENA_TOP_N,
    label: 'Ficar no Top N da Arena',
    description: 'Terminar a Arena de Desafios dentro do Top N (ex.: Top 5)',
    supportsMaxPosition: true,
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.OPEN_LOOT_BOX,
    label: 'Abrir loot boxes',
    description: 'Abrir caixas de loot',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.BUY_SHOP_CARD,
    label: 'Comprar cartas na loja',
    description: 'Comprar cartas na loja de cartas',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.ADD_FRIEND,
    label: 'Adicionar amigos',
    description: 'Aceitar ou enviar amizades',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.EARN_SCORE,
    label: 'Ganhar score',
    description: 'Acumular pontos de score',
    defaultTarget: 10,
  },
  {
    type: MissionObjectiveType.COMPLETE_PROFILE,
    label: 'Completar perfil',
    description: 'Ter nickname e avatar definidos',
    defaultTarget: 1,
  },
  {
    type: MissionObjectiveType.LOGIN_DAYS,
    label: 'Dias de login',
    description: 'Fazer login em dias distintos no período da missão',
    defaultTarget: 1,
  },
];

export function isValidObjectiveType(value: string): value is MissionObjectiveType {
  return Object.values(MissionObjectiveType).includes(value as MissionObjectiveType);
}
