import { Controller, Get, Post, Delete, Param, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('jobs')
@UseGuards(JwtAuthGuard, TenantGuard)
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('enrichment') private readonly enrichmentQueue: Queue,
    @InjectQueue('cleaner') private readonly cleanerQueue: Queue,
    @InjectQueue('research') private readonly researchQueue: Queue,
  ) {}

  @Get()
  async getAllJobs(@CurrentTenant() tenantId: string) {
    const [csvJobs, researchJobs] = await Promise.all([
      this.prisma.csvImportJob.findMany({
        where: { tenantId },
        include: { list: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.researchJob.findMany({
        where: { tenantId },
        include: { 
          list: true,
          _count: {
            select: {
              prospects: {
                where: { emailVerified: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    ]);

    const mappedResearchJobs = researchJobs.map(rj => ({
      id: rj.id,
      jobType: 'SOURCING',
      filename: rj.prompt.length > 50 ? rj.prompt.substring(0, 50) + '...' : rj.prompt,
      status: rj.status,
      totalRows: rj.foundCount, // foundCount is how many were actually found and queued
      processedRows: rj.processedCount, // processed by worker
      enrichedRows: (rj as any)._count?.prospects || 0, // Emails found (emailVerified: true)
      emailsNotFound: rj.processedCount - ((rj as any)._count?.prospects || 0),
      emailsFoundSearch: 0,
      emailsFoundAnymail: 0,
      emailsFoundDatabase: 0,
      createdAt: rj.createdAt,
      list: rj.list,
    }));

    const allJobs = [...csvJobs, ...mappedResearchJobs]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50);

    return allJobs;
  }

  @Get(':id')
  async getJobDetails(@Param('id') jobId: string, @CurrentTenant() tenantId: string) {
    // Try CSV Import Job first
    const csvJob = await this.prisma.csvImportJob.findFirst({
      where: { id: jobId, tenantId },
      include: {
        list: true,
        prospects: {
          orderBy: { updatedAt: 'desc' },
          take: 100 // Limit to avoid heavy payloads, UI is a preview
        }
      }
    });

    if (csvJob) return csvJob;

    // Try Research Job
    const researchJob = await this.prisma.researchJob.findFirst({
      where: { id: jobId, tenantId },
      include: {
        list: true,
        _count: {
          select: {
            prospects: {
              where: { emailVerified: true }
            }
          }
        },
        prospects: {
          orderBy: { createdAt: 'desc' },
          take: 100
        }
      }
    });

    if (!researchJob) {
      throw new NotFoundException('Tâche non trouvée');
    }

    return {
      id: researchJob.id,
      jobType: 'SOURCING',
      filename: researchJob.prompt,
      status: researchJob.status,
      totalRows: researchJob.foundCount,
      processedRows: researchJob.processedCount,
      enrichedRows: (researchJob as any)._count?.prospects || 0,
      createdAt: researchJob.createdAt,
      list: researchJob.list,
      prospects: researchJob.prospects
    };
  }

  @Post('cancel-all')
  async cancelAllJobs(@CurrentTenant() tenantId: string) {
    await this.prisma.csvImportJob.updateMany({
      where: { tenantId, status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });

    await this.prisma.researchJob.updateMany({
      where: { tenantId, status: 'PROCESSING' },
      data: { status: 'FAILED' },
    });

    await this.enrichmentQueue.drain();
    await this.cleanerQueue.drain();
    await this.researchQueue.drain();

    return { success: true };
  }

  @Post(':id/cancel')
  async cancelJob(@Param('id') jobId: string, @CurrentTenant() tenantId: string) {
    let isResearchJob = false;
    let job: any = await this.prisma.csvImportJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      job = await this.prisma.researchJob.findFirst({
        where: { id: jobId, tenantId },
      });
      isResearchJob = !!job;
    }

    if (!job) {
      throw new NotFoundException('Tâche non trouvée');
    }

    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      throw new BadRequestException('Impossible d\'annuler une tâche déjà terminée ou échouée');
    }

    let updatedJob;
    if (isResearchJob) {
      updatedJob = await this.prisma.researchJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      });
      // We could also try to clean the 'research' queue here, but the queue usually runs fast.
    } else {
      updatedJob = await this.prisma.csvImportJob.update({
        where: { id: jobId },
        data: { status: 'FAILED' },
      });

      // 2. Remove waiting/delayed jobs from BullMQ
      const queueToClean = job.jobType === 'CLEANER' ? this.cleanerQueue : this.enrichmentQueue;
      
      const bullJobs = await queueToClean.getJobs(['waiting', 'delayed']);
      let removedCount = 0;
      for (const bullJob of bullJobs) {
        if (bullJob.data && bullJob.data.csvJobId === jobId) {
          await bullJob.remove();
          removedCount++;
        }
      }
    }

    return { success: true, message: `Tâche arrêtée avec succès.`, job: updatedJob };
  }

  @Delete(':id')
  async deleteJob(@Param('id') jobId: string, @CurrentTenant() tenantId: string) {
    let isResearchJob = false;
    let job: any = await this.prisma.csvImportJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      job = await this.prisma.researchJob.findFirst({
        where: { id: jobId, tenantId },
      });
      isResearchJob = !!job;
    }

    if (!job) {
      throw new NotFoundException('Tâche non trouvée');
    }

    if (isResearchJob) {
      await this.prisma.researchJob.delete({ where: { id: jobId } });
    } else {
      if (job.status === 'PENDING' || job.status === 'PROCESSING') {
         const queueToClean = job.jobType === 'CLEANER' ? this.cleanerQueue : this.enrichmentQueue;
         const bullJobs = await queueToClean.getJobs(['waiting', 'delayed', 'active']);
         for (const bullJob of bullJobs) {
           if (bullJob.data && bullJob.data.csvJobId === jobId) {
             await bullJob.remove().catch(() => {});
           }
         }
      }
      await this.prisma.csvImportJob.delete({ where: { id: jobId } });
    }

    return { success: true, message: 'Tâche supprimée avec succès' };
  }
}
