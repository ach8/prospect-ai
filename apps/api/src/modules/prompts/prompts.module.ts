import { Module } from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { PromptsController } from './prompts.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService]
})
export class PromptsModule {}
