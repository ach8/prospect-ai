import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  create(@Body() createFolderDto: CreateFolderDto, @CurrentTenant() tenantId: string) {
    return this.foldersService.create(createFolderDto, tenantId);
  }

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.foldersService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.foldersService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateFolderDto: UpdateFolderDto,
    @CurrentTenant() tenantId: string
  ) {
    return this.foldersService.update(id, updateFolderDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.foldersService.remove(id, tenantId);
  }
}
