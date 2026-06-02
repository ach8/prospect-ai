import { Controller, Get, Post, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { ListsService } from './lists.service';
import { CreateListDto, AddProspectsToListDto } from './dto/list.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('lists')
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.listsService.findAll(tenantId);
  }

  @Post()
  create(@Body() createListDto: CreateListDto, @CurrentTenant() tenantId: string) {
    return this.listsService.create(createListDto, tenantId);
  }

  @Post(':id/prospects')
  addProspects(
    @Param('id') id: string,
    @Body() dto: AddProspectsToListDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.listsService.addProspects(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.listsService.remove(id, tenantId);
  }
}
