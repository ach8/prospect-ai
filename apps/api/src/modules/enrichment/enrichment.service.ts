import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EnrichmentOptions } from '../agents/services/data-enrichment-agent.service';

export interface EnrichmentJobData {
  csvJobId: string;
  tenantId: string;
  rowData: any;
  options: EnrichmentOptions;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @InjectQueue('enrichment') private enrichmentQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async processCsvFile(fileBuffer: Buffer, filename: string, tenantId: string, options: EnrichmentOptions) {
    const results: any[] = [];
    
    // Parse CSV
    const stream = Readable.from(fileBuffer);
    
    return new Promise<any>((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          this.logger.log(`CSV parsé: ${results.length} lignes trouvées.`);
          
          try {
            // Créer le job dans Prisma
            const csvJob = await this.prisma.csvImportJob.create({
              data: {
                tenantId,
                filename,
                totalRows: results.length,
                status: 'PROCESSING'
              }
            });

            // Ajouter chaque ligne dans la file d'attente
            const jobs = results.map(row => ({
              name: 'enrich-row',
              data: {
                csvJobId: csvJob.id,
                tenantId,
                rowData: row,
                options
              } as EnrichmentJobData
            }));

            await this.enrichmentQueue.addBulk(jobs);
            this.logger.log(`Ajouté ${jobs.length} jobs dans la file d'attente.`);

            resolve(csvJob);
          } catch (e) {
            this.logger.error("Erreur lors de la création des jobs d'enrichissement:", e);
            reject(e);
          }
        })
        .on('error', (error) => {
          this.logger.error("Erreur de parsing CSV:", error);
          reject(error);
        });
    });
  }

  async getJobStatus(jobId: string) {
    const job = await this.prisma.csvImportJob.findUnique({
      where: { id: jobId }
    });
    if (!job) return null;
    return job;
  }
}
