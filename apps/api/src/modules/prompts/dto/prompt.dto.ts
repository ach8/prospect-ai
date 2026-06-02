import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreatePromptDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  globalContext?: string;

  @IsString()
  @IsOptional()
  visualAuditPrompt?: string;

  @IsString()
  @IsOptional()
  campaignObjective?: string;

  @IsOptional()
  steps?: any;

  @IsString()
  @IsOptional()
  subjectPrompt?: string;

  @IsString()
  @IsOptional()
  firstTouchPrompt?: string;

  @IsString()
  @IsOptional()
  followUpPrompt?: string;

  @IsString()
  @IsOptional()
  closerPrompt?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdatePromptDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  globalContext?: string;

  @IsString()
  @IsOptional()
  visualAuditPrompt?: string;

  @IsString()
  @IsOptional()
  campaignObjective?: string;

  @IsOptional()
  steps?: any;

  @IsString()
  @IsOptional()
  subjectPrompt?: string;

  @IsString()
  @IsOptional()
  firstTouchPrompt?: string;

  @IsString()
  @IsOptional()
  followUpPrompt?: string;

  @IsString()
  @IsOptional()
  closerPrompt?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
