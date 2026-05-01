import { Controller, Post, Get, Param, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EnrichmentService } from './enrichment.service';
import { Express } from 'express';
import { EnrichmentOptions } from '../agents/services/data-enrichment-agent.service';

class UploadCsvDto {
  tenantId: string;
  options: string; // JSON string of EnrichmentOptions
}

@Controller('enrichment')
export class EnrichmentController {
  constructor(private readonly enrichmentService: EnrichmentService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadCsvDto,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni.');
    }
    if (!body.tenantId) {
      throw new BadRequestException('tenantId est requis.');
    }

    let options: EnrichmentOptions = {};
    try {
      if (body.options) {
        options = JSON.parse(body.options);
      }
    } catch (e) {
      throw new BadRequestException('Options JSON invalides.');
    }

    const job = await this.enrichmentService.processCsvFile(file.buffer, file.originalname, body.tenantId, options);
    return {
      success: true,
      jobId: job.id,
      message: 'Fichier reçu et en cours de traitement',
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
}
