import { IsString, IsOptional } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;
}
