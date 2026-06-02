import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Req } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { UpdateSequenceDto, UpdateGeneratedMessageDto, RegenerateMessageDto } from './dto/sequence.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant, CurrentUser } from '../../common/decorators/tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@CurrentTenant() tenantId: string) {
    return this.campaignsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.campaignsService.findOne(id, tenantId);
  }

  @Get(':id/prospects')
  getProspects(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.campaignsService.getProspects(id, tenantId);
  }

  @Post()
  create(
    @Body() dto: CreateCampaignDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.campaignsService.create(dto, tenantId, user.id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.campaignsService.update(id, dto, tenantId);
  }

  @Put(':id/steps')
  updateSteps(
    @Param('id') id: string,
    @Body() dto: UpdateSequenceDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.campaignsService.updateSteps(id, dto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.campaignsService.remove(id, tenantId);
  }

  @Delete(':id/prospects/:prospectId')
  removeProspect(
    @Param('id') campaignId: string,
    @Param('prospectId') prospectId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.removeProspect(campaignId, prospectId, tenantId);
  }

  @Delete(':id/prospects')
  removeProspectsBulk(
    @Param('id') campaignId: string,
    @Body('prospectIds') prospectIds: string[],
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.removeProspectsBulk(campaignId, prospectIds, tenantId);
  }

  @Post(':id/start-cleaning')
  startCleaning(
    @Param('id') campaignId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.startCleaning(campaignId, tenantId);
  }

  @Get(':id/cleaning-status')
  getCleaningStatus(
    @Param('id') campaignId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.getCleaningStatus(campaignId, tenantId);
  }

  @Get(':id/export')
  exportCampaign(
    @Param('id') campaignId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.exportCampaign(campaignId, tenantId);
  }

  @Post(':id/generate')
  generateSequence(
    @Param('id') campaignId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.generateSequence(campaignId, tenantId);
  }

  @Get(':id/status')
  getGenerationStatus(
    @Param('id') campaignId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.getGenerationStatus(campaignId, tenantId);
  }

  @Post(':id/stop')
  stopGeneration(
    @Param('id') campaignId: string,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.stopGeneration(campaignId, tenantId);
  }

  @Put(':id/messages/:messageId')
  updateMessage(
    @Param('id') campaignId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateGeneratedMessageDto,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.updateMessage(campaignId, messageId, dto, tenantId);
  }

  @Post(':id/messages/:messageId/regenerate')
  regenerateMessage(
    @Param('id') campaignId: string,
    @Param('messageId') messageId: string,
    @Body() dto: RegenerateMessageDto,
    @CurrentTenant() tenantId: string
  ) {
    return this.campaignsService.regenerateMessage(campaignId, messageId, dto, tenantId);
  }
}
