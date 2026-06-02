import { Controller, Post, Get, Param, UseInterceptors, UploadedFile, Body, BadRequestException, Res, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EnrichmentService, AnalyzeCsvDto, StartEnrichmentDto } from './enrichment.service';
import { Express, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { SaveSelectionDto } from './enrichment.service';

class UploadCsvDto {
  tenantId: string;
  options: string; // JSON string
  mapping: string; // JSON string
  duplicateAction: 'skip' | 'update';
}

@Controller('enrichment')
@UseGuards(JwtAuthGuard, TenantGuard)
export class EnrichmentController {
  constructor(private readonly enrichmentService: EnrichmentService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier fourni.');
    return this.enrichmentService.previewCsv(file.buffer);
  }

  @Post('analyze')
  async analyzeMissingData(@Body() body: AnalyzeCsvDto, @CurrentTenant() tenantId: string) {
    if (!body.rows || !body.mapping) throw new BadRequestException('rows et mapping requis');
    body.tenantId = tenantId;
    return this.enrichmentService.analyzeMissingData(body);
  }

  @Post('upload')
  async startEnrichment(@Body() body: StartEnrichmentDto, @CurrentTenant() tenantId: string) {
    if (!body.rows || !body.mapping) {
      throw new BadRequestException('Données incomplètes');
    }
    body.tenantId = tenantId;
    const job = await this.enrichmentService.startEnrichmentJob(body, 'import_manuel');
    return {
      success: true,
      jobId: job.id,
      message: 'Fichier en cours de traitement',
    };
  }

  @Post('existing')
  async startEnrichmentForExisting(@Body() body: any, @CurrentTenant() tenantId: string) {
    if (!body.prospectIds || !Array.isArray(body.prospectIds)) {
      throw new BadRequestException('Un tableau prospectIds est requis');
    }
    const options = body.options || { findEmail: true };
    const job = await this.enrichmentService.startEnrichmentForExistingProspects(body.prospectIds, options, tenantId);
    
    if (!job) {
      throw new BadRequestException('Aucun prospect trouvé à enrichir.');
    }
    
    return {
      success: true,
      jobId: job.id,
      message: `${body.prospectIds.length} prospects en cours d'enrichissement`,
    };
  }
  @Get('job/:id')
  async getJobStatus(@Param('id') id: string) {
    const job = await this.enrichmentService.getJobStatus(id);
    if (!job) {
      throw new BadRequestException('Job introuvable.');
    }
    return job;
  }

  @Get('job/:id/export')
  async exportJobCsv(@Param('id') id: string, @Res() res: Response) {
    const csvBuffer = await this.enrichmentService.exportJobCsv(id);
    if (!csvBuffer) {
      throw new BadRequestException('Job introuvable ou aucun prospect associé.');
    }
    
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="enrichment-${id}.csv"`,
    });
    
    return res.send(csvBuffer);
  }
  @Post('job/:id/save-selection')
  async saveJobSelection(@Param('id') id: string, @Body() body: SaveSelectionDto, @CurrentTenant() tenantId: string) {
    if (!body.selectedProspectIds || !Array.isArray(body.selectedProspectIds)) {
      throw new BadRequestException('Veuillez fournir un tableau selectedProspectIds.');
    }
    
    // Par défaut, deleteUnselected est faux (on garde toujours les leads non sélectionnés)
    const deleteUnselected = body.deleteUnselected !== undefined ? body.deleteUnselected : false;
    
    const result = await this.enrichmentService.saveJobSelection(id, tenantId, body.selectedProspectIds, body.listId, deleteUnselected);
    if (!result) {
      throw new BadRequestException('Job introuvable.');
    }
    
    return result;
  }
}
