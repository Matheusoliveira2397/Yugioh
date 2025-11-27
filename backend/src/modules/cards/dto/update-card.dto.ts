import { PartialType } from '@nestjs/mapped-types';
import { IsOptional } from 'class-validator';
import { CreateCardDto } from './create-card.dto';

// Usar PartialType torna todos os campos opcionais
export class UpdateCardDto extends PartialType(CreateCardDto) {
  // Todos os campos são opcionais na atualização
}
