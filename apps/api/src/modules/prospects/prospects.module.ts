import { Module } from '@nestjs/common';
import { ProspectsService } from './prospects.service';
import { ProspectsController } from './prospects.controller';

@Module({
  providers: [ProspectsService],
  controllers: [ProspectsController],
  exports: [ProspectsService],
})
export class ProspectsModule {}
