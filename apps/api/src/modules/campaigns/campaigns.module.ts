import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { SequenceProcessor } from './sequence.processor';

import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'sequence-generation',
    }),
    AgentsModule,
  ],
  providers: [CampaignsService, SequenceProcessor],
  controllers: [CampaignsController],
  exports: [CampaignsService],
})
export class CampaignsModule {}
