import { IsString, IsOptional } from 'class-validator';

export class UpdateFolderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  color?: string;
}
