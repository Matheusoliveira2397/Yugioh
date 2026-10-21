import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteGoogleProfileDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  nickname: string;
}
