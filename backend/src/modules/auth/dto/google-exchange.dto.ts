import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class GoogleExchangeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(16)
  code: string;
}
