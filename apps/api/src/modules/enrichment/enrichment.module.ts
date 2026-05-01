import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnrichmentController } from './enrichment.controller';
import { EnrichmentService } from './enrichment.service';
import { EnrichmentProcessor } from './enrichment.processor';
import { AgentsModule } from '../agents/agents.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ProspectsModule } from '../prospects/prospects.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'enrichment',
    }),
    AgentsModule,
    PrismaModule,
    ProspectsModule
  ],
  controllers: [EnrichmentController],
  providers: [EnrichmentService, EnrichmentProcessor],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
