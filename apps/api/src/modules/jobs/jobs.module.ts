import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'enrichment',
    }),
    BullModule.registerQueue({
      name: 'cleaner',
    }),
    BullModule.registerQueue({
      name: 'research',
    }),
  ],
  controllers: [JobsController],
})
export class JobsModule {}
