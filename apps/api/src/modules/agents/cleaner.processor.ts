import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CleanerAgentService } from './services/cleaner-agent.service';
import { ProspectsService } from '../prospects/prospects.service';

interface CleanerJobData {
  csvJobId: string;
  tenantId: string;
  listId: string;
  rowData: any;
  targetAudience: string;
}

@Processor('cleaner', { concurrency: 3 })
export class CleanerProcessor extends WorkerHost {
  private readonly logger = new Logger(CleanerProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cleanerAgent: CleanerAgentService,
    private readonly prospectsService: ProspectsService,
  ) {
    super();
  }

  async process(job: Job<CleanerJobData>) {
    this.logger.debug(`Traitement nettoyage job ${job.id} pour le CSV ${job.data.csvJobId}`);
    
    const { csvJobId, tenantId, listId, rowData, targetAudience } = job.data;

    try {
      const result = await this.cleanerAgent.evaluateProspect(rowData, targetAudience);
      
      if (result.isMatch) {
        // Enregistrer le prospect validé
        const prospectData = {
          firstName: rowData.firstName || 'Inconnu',
          lastName: rowData.lastName || 'Inconnu',
          companyName: rowData.companyName || 'Inconnu',
          email: rowData.email || null,
          phone: rowData.phone || null,
          linkedinUrl: rowData.linkedinUrl || null,
          jobTitle: rowData.jobTitle || null,
          companyDomain: rowData.companyDomain || null,
          industry: rowData.industry || null,
          source: 'API_IMPORT' as any,
          enrichmentData: { 
            ...(rowData._customData || {}),
            deep_research_data: result.deepResearchResult || '' 
          },
          csvImportJobId: csvJobId,
        };

        const created = await this.prospectsService.create(prospectData as any, tenantId);

        // Lier à la liste
        if (created && listId) {
          try {
            await this.prisma.prospectListEntry.create({
              data: {
                prospectId: created.id,
                prospectListId: listId
              }
            });
          } catch (e: any) {
            this.logger.error(`Erreur liaison prospect/liste: ${e.message}`);
          }
        }

        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: {
            processedRows: { increment: 1 },
            enrichedRows: { increment: 1 } // enrichedRows can be used as "kept rows"
          }
        });
      } else {
        // Prospect rejeté
        await this.cleanerAgent.saveRejectedProspects(tenantId, [{ ...rowData, reason: result.reason }]);
        
        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: {
            processedRows: { increment: 1 },
            failedRows: { increment: 1 } // failedRows can be used as "rejected rows"
          }
        });
      }
      
      await this.checkJobCompletion(csvJobId);
      
    } catch (error) {
      this.logger.error(`Erreur nettoyage pour la ligne ${job.id}:`, error);
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
      this.logger.log(`🎉 Job CSV Cleaner ${csvJobId} complété !`);
    }
  }
}
