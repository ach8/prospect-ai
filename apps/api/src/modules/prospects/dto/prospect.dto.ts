import { IsString, IsEmail, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ProspectSource } from '@prisma/client';

export class CreateProspectDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  companyName: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @IsString()
  @IsOptional()
  companyDomain?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsEnum(ProspectSource)
  @IsOptional()
  source?: ProspectSource;

  @IsString()
  @IsOptional()
  listId?: string;

  @IsBoolean()
  @IsOptional()
  emailVerified?: boolean;

  @IsOptional()
  enrichmentData?: any;
}

export class UpdateProspectDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  companyName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;
}
