import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditPackage } from './entities/credit-package.entity';
import { CreditPaymentContact } from './entities/credit-payment-contact.entity';
import { CreditPackagesService } from './credit-packages.service';
import { CreditPackagesController } from './credit-packages.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CreditPackage, CreditPaymentContact])],
  providers: [CreditPackagesService],
  controllers: [CreditPackagesController],
  exports: [CreditPackagesService],
})
export class CreditPackagesModule {}
