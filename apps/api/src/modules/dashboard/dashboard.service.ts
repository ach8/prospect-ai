import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailEventType, CampaignProspectStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId: string) {
    // 1. Total Prospects
    const totalProspects = await this.prisma.prospect.count({
      where: { tenantId },
    });

    // 2. Emails Envoyés & Taux d'Ouverture
    const emailStats = await this.prisma.emailEvent.groupBy({
      by: ['eventType'],
      where: {
        campaignProspect: {
          campaign: { tenantId }
        }
      },
      _count: true,
    });

    let sent = 0;
    let opened = 0;

    emailStats.forEach((stat) => {
      if (stat.eventType === EmailEventType.SENT) sent += stat._count;
      if (stat.eventType === EmailEventType.OPENED) opened += stat._count;
    });

    const openRate = sent > 0 ? (opened / sent) * 100 : 0;

    // 3. Leads Générés (REPLIED or CONVERTED)
    const leadsGenerated = await this.prisma.campaignProspect.count({
      where: {
        campaign: { tenantId },
        status: {
          in: [CampaignProspectStatus.REPLIED, CampaignProspectStatus.CONVERTED],
        },
      },
    });

    // 4. Activité Récente (Agent Tasks)
    const recentActivity = await this.prisma.agentTask.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        agentName: true,
        status: true,
        createdAt: true,
      }
    });

    return {
      totalProspects,
      emailsSent: sent,
      openRate: openRate.toFixed(1),
      leadsGenerated,
      recentActivity,
    };
  }
}
