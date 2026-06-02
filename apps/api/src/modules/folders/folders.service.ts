import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class FoldersService {
  constructor(private prisma: PrismaService) {}

  async create(createFolderDto: CreateFolderDto, tenantId: string) {
    return this.prisma.forTenant(tenantId).folder.create({
      data: {
        ...createFolderDto,
        tenantId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.forTenant(tenantId).folder.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { prospectLists: true, campaigns: true }
        }
      }
    });
  }

  async findOne(id: string, tenantId: string) {
    const folder = await this.prisma.forTenant(tenantId).folder.findUnique({
      where: { id },
      include: {
        prospectLists: true,
        campaigns: true,
      }
    });

    if (!folder) {
      throw new NotFoundException('Dossier non trouvé');
    }

    return folder;
  }

  async update(id: string, updateFolderDto: UpdateFolderDto, tenantId: string) {
    await this.findOne(id, tenantId); // S'assure que le dossier existe et appartient au tenant

    return this.prisma.forTenant(tenantId).folder.update({
      where: { id },
      data: updateFolderDto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // S'assure que le dossier existe et appartient au tenant

    return this.prisma.forTenant(tenantId).folder.delete({
      where: { id },
    });
  }
}
