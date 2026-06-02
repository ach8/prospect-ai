import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';
import { CampaignStatus } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  listId?: string;

  @IsString()
  @IsOptional()
  goal?: string;

  @IsObject()
  @IsOptional()
  aiConfig?: any;
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(CampaignStatus)
  @IsOptional()
  status?: CampaignStatus;

  @IsObject()
  @IsOptional()
  aiConfig?: any;
}
