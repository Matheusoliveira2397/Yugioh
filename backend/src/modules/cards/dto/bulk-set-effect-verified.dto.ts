import { IsArray, ArrayMaxSize, IsBoolean, IsString } from 'class-validator';

export class BulkSetEffectVerifiedDto {
  /** Nomes das cartas (efeito é por nome; todas as skins ativas são atualizadas). */
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  names: string[];

  @IsBoolean()
  effectVerified: boolean;
}
