import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.forTenant(tenantId).campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { prospects: true }
        }
      }
    });
  }

  async findOne(id: string, tenantId: string) {
    const campaign = await this.prisma.forTenant(tenantId).campaign.findUnique({
      where: { id },
      include: {
        steps: true,
      }
    });
    if (!campaign) {
      throw new NotFoundException('Campagne non trouvée');
    }
    return campaign;
  }

  async create(dto: CreateCampaignDto, tenantId: string, userId: string) {
    return this.prisma.forTenant(tenantId).campaign.create({
      data: {
        ...dto,
        userId,
        tenantId,
      },
    });
  }

  async update(id: string, dto: UpdateCampaignDto, tenantId: string) {
    await this.findOne(id, tenantId); // vérifie existence
    return this.prisma.forTenant(tenantId).campaign.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.forTenant(tenantId).campaign.delete({
      where: { id },
    });
  }
}
