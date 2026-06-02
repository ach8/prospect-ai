import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Channel, TemplateType, AgentType } from '@prisma/client';

export class SequenceStepDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsNumber()
  @IsNotEmpty()
  stepOrder: number;

  @IsEnum(Channel)
  @IsOptional()
  channel?: Channel;

  @IsEnum(TemplateType)
  @IsOptional()
  templateType?: TemplateType;

  @IsEnum(AgentType)
  @IsOptional()
  agentType?: AgentType;

  @IsString()
  @IsOptional()
  aiPrompt?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  manualContent?: string;

  @IsNumber()
  @IsOptional()
  delayHours?: number;
}

export class UpdateSequenceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SequenceStepDto)
  steps: SequenceStepDto[];
}

export class UpdateGeneratedMessageDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  body: string;
}

export class RegenerateMessageDto {
  @IsString()
  @IsNotEmpty()
  instruction: string;
}
