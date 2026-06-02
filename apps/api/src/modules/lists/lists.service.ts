import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateListDto, AddProspectsToListDto } from './dto/list.dto';

@Injectable()
export class ListsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.forTenant(tenantId).prospectList.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { prospects: true }
        }
      }
    });
  }

  async create(dto: CreateListDto, tenantId: string) {
    return this.prisma.forTenant(tenantId).prospectList.create({
      data: {
        name: dto.name,
        folderId: dto.folderId,
        tenantId,
      },
    });
  }

  async addProspects(listId: string, dto: AddProspectsToListDto, tenantId: string) {
    // Check if the list belongs to the tenant
    const list = await this.prisma.forTenant(tenantId).prospectList.findUnique({
      where: { id: listId },
    });

    if (!list) {
      throw new Error('Liste non trouvée');
    }

    // Verify all prospects belong to the tenant
    const validProspects = await this.prisma.forTenant(tenantId).prospect.findMany({
      where: {
        id: { in: dto.prospectIds }
      },
      select: { id: true }
    });

    const validIds = validProspects.map(p => p.id);

    // Create entries, skip duplicates
    if (validIds.length > 0) {
      await this.prisma.prospectListEntry.createMany({
        data: validIds.map(id => ({
          prospectId: id,
          prospectListId: listId,
        })),
        skipDuplicates: true,
      });
    }

    return { added: validIds.length };
  }

  async remove(id: string, tenantId: string) {
    const list = await this.prisma.forTenant(tenantId).prospectList.findUnique({
      where: { id },
    });

    if (!list) {
      throw new NotFoundException('Liste non trouvée');
    }

    return this.prisma.forTenant(tenantId).prospectList.delete({
      where: { id },
    });
  }
}
