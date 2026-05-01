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
import { ProspectsModule } from '../prospects/prospects.module';

import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [ProspectsModule, PrismaModule],
  controllers: [AgentsController],
  providers: [
    LeadResearchAgentService, 
    EmailDiscoveryService, 
    GooglePlacesService, 
    WebScraperService, 
    OpenDataService, 
    DataEnrichmentAgentService,
    WebSearchAgentService,
    EnricherAgentService
  ],
  exports: [
    LeadResearchAgentService, 
    EmailDiscoveryService, 
    GooglePlacesService, 
    WebScraperService, 
    OpenDataService, 
    DataEnrichmentAgentService,
    WebSearchAgentService,
    EnricherAgentService
  ],
})
export class AgentsModule {}
