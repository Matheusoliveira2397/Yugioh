import { IsString, IsOptional, IsInt, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSleeveDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  priceCredits?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  priceCash?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isForSale?: boolean;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  stock?: number;
}

