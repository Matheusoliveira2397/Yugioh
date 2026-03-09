import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class PurchaseTalismanDto {
  @IsString()
  @IsNotEmpty()
  talismanTemplateId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['credits', 'cash'])
  paymentMethod: string;
}
