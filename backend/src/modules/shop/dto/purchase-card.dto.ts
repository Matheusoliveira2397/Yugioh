import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum PaymentMethod {
  COINS = 'coins',
  CREDITS = 'credits',
  CASH = 'cash',
}

export class PurchaseCardDto {
  @IsString()
  @IsNotEmpty()
  cardId: string;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod; // coins, credits ou cash
}
