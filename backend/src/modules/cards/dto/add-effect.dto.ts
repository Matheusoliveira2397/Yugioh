import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray } from 'class-validator';

export class AddEffectDto {
  @IsString()
  @IsNotEmpty()
  cardName: string; // Nome da carta para buscar

  @IsEnum(['continuous', 'trigger', 'ignition', 'quick', 'flip'])
  effectType: 'continuous' | 'trigger' | 'ignition' | 'quick' | 'flip';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  timing?: string[]; // Quando o efeito é ativado

  @IsOptional()
  @IsString()
  condition?: string; // Condição para ativar

  @IsString()
  @IsNotEmpty()
  action: string; // O que o efeito faz

  @IsOptional()
  @IsString()
  target?: string; // Alvo do efeito

  @IsOptional()
  params?: any; // Parâmetros adicionais

  @IsOptional()
  cost?: any; // Custo para ativar
}
