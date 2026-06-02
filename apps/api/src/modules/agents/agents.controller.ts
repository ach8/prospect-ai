import { Controller, Post, Get, Body, UseGuards, Req, Param, NotFoundException } from '@nestjs/common';
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
import { CleanerAgentService } from './services/cleaner-agent.service';
import { SourcingLoopManagerService } from './services/sourcing-loop-manager.service';
import { DeepResearchLoopService } from './services/deep-research-loop.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors, UploadedFile, BadRequestException, Res } from '@nestjs/common';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { Response } from 'express';

class RunResearchDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  listName?: string;

  @IsOptional()
  weblessOnly?: boolean;
}

class AsyncResearchDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsString()
  @IsOptional()
  listId?: string;

  @IsOptional()
  targetCount?: number;

  @IsOptional()
  excludeListIds?: string[];

  @IsOptional()
  weblessOnly?: boolean;
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
    private readonly prospectsService: ProspectsService,
    private readonly cleanerAgentService: CleanerAgentService,
    private readonly sourcingLoopManager: SourcingLoopManagerService,
    private readonly deepResearchLoopService: DeepResearchLoopService
  ) { }

  @Post('research')
  async runResearch(@Body() dto: RunResearchDto, @CurrentTenant() tenantId: string) {
    const result = await this.researchAgent.runResearch(dto.prompt, tenantId, dto.listName, dto.weblessOnly);
    return result;
  }

  @Post('research/async')
  async runAsyncResearch(@Body() dto: AsyncResearchDto, @CurrentTenant() tenantId: string) {
    const job = await this.sourcingLoopManager.startSourcingJob(
      tenantId, 
      dto.prompt, 
      dto.targetCount || 100,
      dto.listId,
      dto.excludeListIds,
      dto.weblessOnly
    );
    return { success: true, jobId: job.id };
  }

  @Post('deep-research/async')
  async runDeepResearchAsync(@Body() dto: AsyncResearchDto, @CurrentTenant() tenantId: string) {
    const job = await this.deepResearchLoopService.startDeepResearchJob(
      tenantId, 
      dto.prompt, 
      dto.targetCount || 50,
      dto.listId,
      dto.excludeListIds
    );
    return { success: true, jobId: job.id };
  }

  @Get('research/jobs')
  async getResearchJobs(@CurrentTenant() tenantId: string) {
    const jobs = await this.prospectsService['prisma'].researchJob.findMany({
      where: { 
        tenantId, 
        NOT: { options: { path: ['isExpert'], equals: true } } 
      },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, jobs };
  }

  @Get('deep-research/jobs')
  async getDeepResearchJobs(@CurrentTenant() tenantId: string) {
    const jobs = await this.prospectsService['prisma'].researchJob.findMany({
      where: { tenantId, options: { path: ['isExpert'], equals: true } },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, jobs };
  }

  @Get('research/:id/export')
  async exportResearchJob(
    @Param('id') jobId: string,
    @CurrentTenant() tenantId: string,
    @Res() res: Response
  ) {
    const job = await this.prospectsService['prisma'].researchJob.findFirst({
      where: { id: jobId, tenantId },
      include: {
        prospects: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Tâche de recherche non trouvée');
    }

    if (!job.prospects || job.prospects.length === 0) {
      throw new BadRequestException('Aucun prospect trouvé pour cette tâche');
    }

    const headers = ['Prénom', 'Nom', 'Entreprise', 'Site Web', 'Titre', 'Email', 'LinkedIn', 'Statut Email', 'Score Confiance'];
    
    const records = job.prospects.map(p => [
      p.firstName || '',
      p.lastName || '',
      p.companyName || '',
      p.companyDomain || '',
      p.jobTitle || '',
      p.email || '',
      p.linkedinUrl || '',
      p.emailVerified ? 'Vérifié' : (p.email ? 'Non vérifié' : 'Introuvable'),
      p.emailConfidence ? `${p.emailConfidence}%` : ''
    ]);

    const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;
    
    const csvOutput = [
      headers.join(','),
      ...records.map(row => row.map(escapeCsv).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="prospects_recherche_${jobId}.csv"`);
    res.send('\uFEFF' + csvOutput); // BOM for Excel
  }

  @Get('research/:id/prospects')
  async getResearchJobProspects(
    @Param('id') jobId: string,
    @CurrentTenant() tenantId: string
  ) {
    const job = await this.prospectsService['prisma'].researchJob.findFirst({
      where: { id: jobId, tenantId },
      include: {
        prospects: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Tâche de recherche non trouvée');
    }

    return { success: true, prospects: job.prospects || [] };
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
              dto.domain,
              dto.companyName || ''
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

  @Post('clean-list')
  async cleanList(
    @Body() body: { listId: string, targetAudience: string },
    @CurrentTenant() tenantId: string
  ) {
    if (!body.listId || !body.targetAudience) {
      throw new BadRequestException('listId et targetAudience sont requis');
    }

    // Récupérer les prospects de la liste
    const listEntries = await this.prospectsService['prisma'].prospectListEntry.findMany({
      where: { prospectListId: body.listId },
      include: { prospect: true }
    });

    const prospects = listEntries.map(e => e.prospect);
    let rejectedCount = 0;
    const rejectedProspects = [];

    // On pourrait paralléliser, mais on le fait en série pour ne pas exploser les limites d'API Gemini
    for (const entry of listEntries) {
      const result = await this.cleanerAgentService.evaluateProspect(entry.prospect, body.targetAudience);
      if (!result.isMatch) {
        // Retirer de la liste courante
        await this.prospectsService['prisma'].prospectListEntry.delete({
          where: {
            prospectId_prospectListId: {
              prospectId: entry.prospectId,
              prospectListId: body.listId
            }
          }
        });
        
        rejectedProspects.push({
          ...entry.prospect,
          reason: result.reason
        });
        rejectedCount++;
      } else if (result.deepResearchResult) {
        // Prospect gardé ET on a des infos supplémentaires
        let enrichmentData: any = entry.prospect.enrichmentData || {};
        enrichmentData.deepResearch = result.deepResearchResult;
        await this.prospectsService['prisma'].prospect.update({
          where: { id: entry.prospectId },
          data: { enrichmentData }
        });
      }
    }

    // Sauvegarder dans la liste "Prospects Rejetés"
    if (rejectedProspects.length > 0) {
      await this.cleanerAgentService.saveRejectedProspects(tenantId, rejectedProspects);
    }

    return { 
      success: true, 
      totalEvaluated: prospects.length,
      rejectedCount,
      keptCount: prospects.length - rejectedCount,
      message: `${rejectedCount} prospects retirés de la liste et ajoutés à la liste des rejetés.`
    };
  }

  @Post('clean-csv')
  async cleanCsv(
    @Body() body: { rows: any[], mapping: Record<string, string>, targetAudience: string, listId: string, filename?: string },
    @CurrentTenant() tenantId: string,
  ) {
    const { rows, mapping, targetAudience, listId, filename } = body;
    if (!rows || !mapping) throw new BadRequestException('rows et mapping requis');
    if (!targetAudience) throw new BadRequestException('targetAudience est requis');
    if (!listId) throw new BadRequestException('listId est requis');

    const csvJob = await this.cleanerAgentService.startCleanerJob(tenantId, listId, rows, mapping, targetAudience, filename || 'Nettoyage IA');
    
    return {
      success: true,
      jobId: csvJob.id,
      message: 'Fichier en cours de nettoyage',
    };
  }

  @Post('verify-email')
  async verifyEmail(
    @Body() body: { email: string },
    @CurrentTenant() tenantId: string,
  ) {
    if (!body.email) {
      throw new BadRequestException('email est requis');
    }

    try {
      const validationResult = await this.emailDiscoveryService.verifyEmail(body.email);
      return { success: true, result: validationResult };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erreur lors de la vérification' };
    }
  }
}

