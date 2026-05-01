import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataEnrichmentAgentService } from '../agents/services/data-enrichment-agent.service';
import { ProspectsService } from '../prospects/prospects.service';
import { EnrichmentJobData } from './enrichment.service';

@Processor('enrichment')
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentAgent: DataEnrichmentAgentService,
    private readonly prospectsService: ProspectsService,
  ) {
    super();
  }

  async process(job: Job<EnrichmentJobData>) {
    this.logger.debug(`Traitement du job ${job.id} pour le CSV ${job.data.csvJobId}`);
    
    const { csvJobId, tenantId, rowData, options } = job.data;

    try {
      const enrichmentResult = await this.enrichmentAgent.enrichRow(rowData, options);
      
      if (enrichmentResult.success && enrichmentResult.data) {
        // Enregistrer ou mettre à jour le prospect
        const data = enrichmentResult.data;
        
        await this.prospectsService.create({
          firstName: data.firstName || 'Inconnu',
          lastName: data.lastName || 'Inconnu',
          companyName: data.companyName || rowData.companyName || rowData.company || 'Inconnu',
          email: data.email,
          phone: data.phone,
          linkedinUrl: data.linkedinUrl,
          jobTitle: data.jobTitle,
          companyDomain: data.website ? new URL(data.website).hostname.replace('www.', '') : null,
          emailVerified: (data.emailConfidence || 0) > 0,
          source: 'API_IMPORT',
          enrichmentData: data, // Sauvegarde la raw data
        } as any, tenantId);

        // Mettre à jour les compteurs du job
        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: {
            processedRows: { increment: 1 },
            enrichedRows: { increment: 1 }
          }
        });
      } else {
        // Mettre à jour compteur échec
        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: {
            processedRows: { increment: 1 },
            failedRows: { increment: 1 }
          }
        });
      }
      
      await this.checkJobCompletion(csvJobId);
      
    } catch (error) {
      this.logger.error(`Erreur d'enrichissement pour la ligne ${job.id}:`, error);
      await this.prisma.csvImportJob.update({
        where: { id: csvJobId },
        data: {
          processedRows: { increment: 1 },
          failedRows: { increment: 1 }
        }
      });
      await this.checkJobCompletion(csvJobId);
      throw error;
    }
  }

  private async checkJobCompletion(csvJobId: string) {
    const job = await this.prisma.csvImportJob.findUnique({ where: { id: csvJobId }});
    if (job && job.processedRows >= job.totalRows) {
      await this.prisma.csvImportJob.update({
        where: { id: csvJobId },
        data: { status: 'COMPLETED' }
      });
      this.logger.log(`🎉 Job CSV ${csvJobId} complété !`);
    }
  }
}
