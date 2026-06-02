import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProspectDto, UpdateProspectDto } from './dto/prospect.dto';

@Injectable()
export class ProspectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, folderId?: string, listId?: string) {
    const whereClause: any = { tenantId };

    if (listId) {
      whereClause.lists = {
        some: {
          prospectListId: listId,
        },
      };
    } else if (folderId) {
      whereClause.lists = {
        some: {
          prospectList: {
            folderId: folderId,
          },
        },
      };
    }

    const prospects = await this.prisma.prospect.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 2000, // Limite de sécurité pour éviter de geler le navigateur
      include: {
        _count: {
          select: { campaignProspects: true }
        }
      }
    });

    return prospects.map(p => {
      const { _count, ...rest } = p as any;
      return {
        ...rest,
        hasGeneratedEmails: (_count?.campaignProspects || 0) > 0
      };
    });
  }

  async findOne(id: string, tenantId: string) {
    const prospect = await this.prisma.forTenant(tenantId).prospect.findUnique({
      where: { id },
    });
    if (!prospect) {
      throw new NotFoundException('Prospect non trouvé');
    }
    return prospect;
  }

  async create(dto: CreateProspectDto, tenantId: string) {
    const { listId, ...prospectData } = dto;
    
    const prospect = await this.prisma.forTenant(tenantId).prospect.create({
      data: {
        ...prospectData,
        tenantId,
      },
    });

    if (listId) {
      // Create the list entry if listId is provided
      await this.prisma.prospectListEntry.create({
        data: {
          prospectId: prospect.id,
          prospectListId: listId,
        }
      });
    }

    return prospect;
  }

  async update(id: string, dto: UpdateProspectDto, tenantId: string) {
    await this.findOne(id, tenantId); // ensure it exists and belongs to tenant
    return this.prisma.forTenant(tenantId).prospect.update({
      where: { id },
      data: dto,
    });
  }

  async updateCallStatus(id: string, callStatus: any, callNotes: string | undefined, tenantId: string) {
    return this.prisma.prospect.update({
      where: { id, tenantId },
      data: {
        callStatus,
        callNotes: callNotes !== undefined ? callNotes : undefined,
        lastCalledAt: new Date(),
      },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // ensure it exists and belongs to tenant
    return this.prisma.forTenant(tenantId).prospect.delete({
      where: { id },
    });
  }

  async removeMany(ids: string[], tenantId: string) {
    return this.prisma.forTenant(tenantId).prospect.deleteMany({
      where: {
        id: { in: ids },
        tenantId,
      },
    });
  }
}
