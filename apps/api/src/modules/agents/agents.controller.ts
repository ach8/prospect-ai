import { Controller, Post, Body, UseGuards, Req, Param, NotFoundException } from '@nestjs/common';
import { LeadResearchAgentService } from './services/research-agent.service';
import { GooglePlacesService } from './services/google-places.service';
import { WebSearchAgentService } from './services/web-search-agent.service';
import { EnricherAgentService } from './services/enricher-agent.service';
import { DataEnrichmentAgentService, EnrichmentOptions } from './services/data-enrichment-agent.service';
import { EmailDiscoveryService } from './services/email-discovery.service';
import { ProspectsService } from '../prospects/prospects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ManualResearchDto } from './dto/manual-research.dto';

class RunResearchDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  listName?: string;
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly researchAgent: LeadResearchAgentService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly webSearchService: WebSearchAgentService,
    private readonly enricherService: EnricherAgentService,
    private readonly dataEnrichmentService: DataEnrichmentAgentService,
    private readonly emailDiscoveryService: EmailDiscoveryService,
    private readonly prospectsService: ProspectsService
  ) {}

  @Post('research')
  async runResearch(@Body() dto: RunResearchDto, @CurrentTenant() tenantId: string) {
    const result = await this.researchAgent.runResearch(dto.prompt, tenantId, dto.listName);
    return result;
  }

  @Post('enrich/:prospectId')
  async enrichProspect(@Param('prospectId') prospectId: string, @CurrentTenant() tenantId: string) {
    const prospect = await this.prospectsService.findOne(prospectId, tenantId);
    if (!prospect) throw new NotFoundException('Prospect non trouvé');

    const enrichmentData = (prospect.enrichmentData as any) || {};
    
    const options: EnrichmentOptions = {
      findEmail: !prospect.email || prospect.email.includes('inconnu'),
      findPhone: !enrichmentData.phone,
      findDirectorName: !prospect.firstName || prospect.firstName === 'Inconnu' || !prospect.lastName || prospect.lastName === 'Inconnu',
      findLinkedin: !enrichmentData.linkedinUrl,
      findWebsite: !prospect.companyDomain || prospect.companyDomain === 'inconnu.com',
    };

    if (!Object.values(options).some(v => v)) {
      return { success: true, message: 'Rien à enrichir, profil déjà complet.', prospect };
    }

    try {
      const result = await this.dataEnrichmentService.enrichRow(prospect, options);

      if (result.success && result.data) {
        const updateData: any = { enrichmentData: { ...enrichmentData } };
        const { data } = result;

        if (data.email && options.findEmail) updateData.email = data.email;
        if (data.firstName && options.findDirectorName) updateData.firstName = data.firstName;
        if (data.lastName && options.findDirectorName) updateData.lastName = data.lastName;
        if (data.jobTitle) updateData.jobTitle = data.jobTitle;
        if (data.website && options.findWebsite) {
           updateData.companyDomain = data.website.replace(/^https?:\/\//, '').split('/')[0];
        }
        if (data.phone && options.findPhone) updateData.enrichmentData.phone = data.phone;
        if (data.linkedinUrl && options.findLinkedin) updateData.enrichmentData.linkedinUrl = data.linkedinUrl;

        // Ensure enrichmentData isn't empty object if nothing was added
        if (Object.keys(updateData.enrichmentData).length === 0) delete updateData.enrichmentData;

        const updated = await this.prospectsService.update(prospectId, updateData, tenantId);
        return { success: true, prospect: updated };
      }

      return { success: false, message: result.error || 'Erreur lors de l\'enrichissement', prospect };
    } catch (error: any) {
      console.error(`Erreur d'enrichissement IA : ${error.message}`, error.stack);
      return { success: false, message: `L'IA a échoué: ${error.message}`, error: error.message };
    }
  }

  @Post('manual')
  async runManualResearch(@Body() dto: ManualResearchDto) {
    const { query, tools } = dto;
    const results: any = {};

    const promises = tools.map(async (tool) => {
      try {
        switch (tool) {
          case 'GOOGLE_PLACES':
            results.googlePlaces = await this.googlePlacesService.searchBusinesses(query, 5);
            break;
          case 'WEB_SEARCH':
            results.webSearch = await this.webSearchService.answerQuery(query);
            break;
          case 'ENRICHER':
            results.enricher = await this.enricherService.enrichCompany(query);
            break;
          case 'EMAIL_DISCOVERY':
            if (!dto.firstName || !dto.lastName || !dto.domain) {
              throw new Error('firstName, lastName et domain sont requis pour la découverte d\'email');
            }
            results.emailDiscovery = await this.emailDiscoveryService.findValidEmail(
              dto.firstName,
              dto.lastName,
              dto.domain
            );
            break;
          default:
            break;
        }
      } catch (err: any) {
        results[`${tool}_error`] = err.message || 'Une erreur est survenue avec cet outil';
      }
    });

    await Promise.allSettled(promises);
    return { success: true, results };
  }
}

