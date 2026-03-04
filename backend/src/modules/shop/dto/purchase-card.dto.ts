import { IsString, IsNotEmpty, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  COINS = 'coins',
  CREDITS = 'credits',
  CASH = 'cash',
}

export class PurchaseCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['coins', 'credits', 'cash'])
  paymentMethod: string; // coins, credits ou cash

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number; // quantidade de cópias (default 1)
}
