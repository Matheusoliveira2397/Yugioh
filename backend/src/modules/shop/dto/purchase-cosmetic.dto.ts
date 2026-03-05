import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class PurchaseSleeveDto {
  @IsString()
  @IsNotEmpty()
  sleeveId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['credits', 'cash'])
  paymentMethod: string;
}

export class PurchasePlaymatDto {
  @IsString()
  @IsNotEmpty()
  playmatId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['credits', 'cash'])
  paymentMethod: string;
}
