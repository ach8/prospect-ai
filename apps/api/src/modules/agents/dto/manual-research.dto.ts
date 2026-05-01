import { IsString, IsArray, ArrayMinSize, IsIn, IsNotEmpty } from 'class-validator';

export const AVAILABLE_TOOLS = ['GOOGLE_PLACES', 'WEB_SEARCH', 'ENRICHER'] as const;
export type ToolType = typeof AVAILABLE_TOOLS[number];

export class ManualResearchDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(AVAILABLE_TOOLS, { each: true })
  tools: ToolType[];
}
