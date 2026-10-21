import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CreditPackagesService } from './credit-packages.service';

@Controller('credit-packages')
export class CreditPackagesController {
  constructor(private readonly creditPackagesService: CreditPackagesService) {}

  /** Pacotes exibidos na página “Comprar créditos” (somente ativos). */
  @Public()
  @Get()
  findPublic() {
    return this.creditPackagesService.findPublicActive();
  }
}
