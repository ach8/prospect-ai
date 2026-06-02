import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateListDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  folderId?: string;
}

export class AddProspectsToListDto {
  @IsArray()
  @IsString({ each: true })
  prospectIds: string[];
}
