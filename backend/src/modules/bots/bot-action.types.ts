/** Ação executável pelo BotRunner (gateway.handleDuelAction). */
export interface BotActionCandidate {
  id: string;
  actionType: string;
  actionData: Record<string, any>;
  label: string;
  category: 'spell' | 'trap' | 'summon' | 'monster_effect' | 'attack' | 'phase';
}

export interface BotLesson {
  id: string;
  situationKey: string;
  actionType: string;
  actionData: Record<string, any>;
  label: string;
  reward: number;
  difficulty: string;
  createdAt: string;
}

export interface BotAiDecision {
  action: BotActionCandidate;
  reason: string;
  source: 'llm' | 'heuristic' | 'memory';
}
