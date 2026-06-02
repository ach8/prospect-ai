import { IsString, IsArray, ArrayMinSize, IsIn, IsNotEmpty, IsOptional } from 'class-validator';

export const AVAILABLE_TOOLS = ['GOOGLE_PLACES', 'WEB_SEARCH', 'ENRICHER', 'EMAIL_DISCOVERY'] as const;
export type ToolType = typeof AVAILABLE_TOOLS[number];

export class ManualResearchDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(AVAILABLE_TOOLS, { each: true })
  tools: ToolType[];

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  domain?: string;

  @IsString()
  @IsOptional()
  companyName?: string;
}
