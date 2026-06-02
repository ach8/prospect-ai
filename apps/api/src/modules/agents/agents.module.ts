import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { LeadResearchAgentService } from './services/research-agent.service';
import { EmailDiscoveryService } from './services/email-discovery.service';
import { GooglePlacesService } from './services/google-places.service';
import { WebScraperService } from './services/web-scraper.service';
import { OpenDataService } from './services/open-data.service';
import { DataEnrichmentAgentService } from './services/data-enrichment-agent.service';
import { WebSearchAgentService } from './services/web-search-agent.service';
import { EnricherAgentService } from './services/enricher-agent.service';
import { DeepResearchAgentService } from './services/deep-research-agent.service';
import { CleanerAgentService } from './services/cleaner-agent.service';
import { VisualAuditAgentService } from './services/visual-audit-agent.service';
import { ProspectsModule } from '../prospects/prospects.module';

import { PrismaModule } from '../../common/prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { CleanerProcessor } from './cleaner.processor';
import { SourcingLoopManagerService } from './services/sourcing-loop-manager.service';
import { ResearchProcessor } from './research.processor';
import { DeepResearchLoopService } from './services/deep-research-loop.service';

@Module({
  imports: [
    ProspectsModule, 
    PrismaModule,
    BullModule.registerQueue({
      name: 'cleaner',
    }),
    BullModule.registerQueue({
      name: 'research',
    }),
  ],
  controllers: [AgentsController],
  providers: [
    LeadResearchAgentService, 
    EmailDiscoveryService, 
    GooglePlacesService, 
    WebScraperService, 
    OpenDataService, 
    DataEnrichmentAgentService,
    WebSearchAgentService,
    EnricherAgentService,
    DeepResearchAgentService,
    CleanerAgentService,
    VisualAuditAgentService,
    CleanerProcessor,
    SourcingLoopManagerService,
    ResearchProcessor,
    DeepResearchLoopService
  ],
  exports: [
    LeadResearchAgentService, 
    EmailDiscoveryService, 
    GooglePlacesService, 
    WebScraperService, 
    OpenDataService, 
    DataEnrichmentAgentService,
    WebSearchAgentService,
    EnricherAgentService,
    DeepResearchAgentService,
    CleanerAgentService,
    VisualAuditAgentService,
    SourcingLoopManagerService,
    DeepResearchLoopService
  ],
})
export class AgentsModule {}
