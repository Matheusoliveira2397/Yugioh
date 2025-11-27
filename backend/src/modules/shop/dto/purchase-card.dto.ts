import { IsString, IsNotEmpty, IsIn } from 'class-validator';

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
}
