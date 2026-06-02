import { Controller, Get, Post, Body, Param, Put, Delete, Patch, UseGuards, Query } from '@nestjs/common';
import { ProspectsService } from './prospects.service';
import { CreateProspectDto, UpdateProspectDto } from './dto/prospect.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('prospects')
export class ProspectsController {
  constructor(private readonly prospectsService: ProspectsService) {}

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('folderId') folderId?: string,
    @Query('listId') listId?: string,
  ) {
    return this.prospectsService.findAll(tenantId, folderId, listId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.prospectsService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreateProspectDto, @CurrentTenant() tenantId: string) {
    return this.prospectsService.create(dto, tenantId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProspectDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.prospectsService.update(id, dto, tenantId);
  }

  @Patch(':id/call-status')
  updateCallStatus(
    @Param('id') id: string,
    @Body() dto: { callStatus: any, callNotes?: string },
    @CurrentTenant() tenantId: string,
  ) {
    return this.prospectsService.updateCallStatus(id, dto.callStatus, dto.callNotes, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.prospectsService.remove(id, tenantId);
  }

  @Delete()
  removeMany(@Body('ids') ids: string[], @CurrentTenant() tenantId: string) {
    if (!ids || ids.length === 0) {
      return { success: false, message: 'Aucun ID fourni' };
    }
    return this.prospectsService.removeMany(ids, tenantId);
  }
}
