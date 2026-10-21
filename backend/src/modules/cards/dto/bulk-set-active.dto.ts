import { IsArray, ArrayMaxSize, IsBoolean, IsString } from 'class-validator';

export class BulkSetActiveDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids: string[];

  @IsBoolean()
  isActive: boolean;
}
