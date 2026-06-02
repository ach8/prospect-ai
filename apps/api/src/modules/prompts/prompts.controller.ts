import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { PromptsService } from './prompts.service';
import { CreatePromptDto, UpdatePromptDto } from './dto/prompt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';

@Controller('prompts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    await this.promptsService.ensureDefaultPromptsExist(tenantId);
    return this.promptsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.promptsService.findOne(id, tenantId);
  }

  @Post()
  create(@Body() dto: CreatePromptDto, @CurrentTenant() tenantId: string) {
    return this.promptsService.create(dto, tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromptDto, @CurrentTenant() tenantId: string) {
    return this.promptsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.promptsService.remove(id, tenantId);
  }
}
