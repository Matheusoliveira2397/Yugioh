import { IsString, IsNotEmpty, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateDeckDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayMinSize(40)
  @ArrayMaxSize(60)
  cards: string[];
}
