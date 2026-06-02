import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as csv from 'csv-parser';
import { Readable } from 'stream';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EnrichmentOptions } from '../agents/services/data-enrichment-agent.service';
import { IsArray, IsObject, IsString, IsOptional, IsEnum } from 'class-validator';

export interface EnrichmentJobData {
  csvJobId: string;
  tenantId: string;
  listId: string;
  rowData: any;
  options: EnrichmentOptions;
  duplicateAction?: 'skip' | 'update';
  prospectId?: string;
}

export class AnalyzeCsvDto {
  @IsArray()
  rows: Record<string, string>[];

  @IsObject()
  mapping: Record<string, string>;

  @IsString()
  @IsOptional()
  tenantId: string;
}

export class StartEnrichmentDto {
  @IsArray()
  rows: Record<string, string>[];

  @IsObject()
  mapping: Record<string, string>;

  @IsObject()
  @IsOptional()
  options: EnrichmentOptions;

  @IsString()
  @IsOptional()
  tenantId: string;

  @IsString()
  listId: string;

  @IsString()
  @IsOptional()
  duplicateAction: 'skip' | 'update';
}

export class SaveSelectionDto {
  @IsArray()
  selectedProspectIds: string[];

  @IsString()
  @IsOptional()
  listId?: string;

  @IsOptional()
  deleteUnselected?: boolean;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @InjectQueue('enrichment') private enrichmentQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Parse le CSV brut et retourne les headers et les 5 premières lignes
   */
  async previewCsv(fileBuffer: Buffer) {
    const csvContent = fileBuffer.toString('utf-8');
    const separator = csvContent.split('\n')[0]?.includes(';') ? ';' : ',';
    
    return new Promise<any>((resolve, reject) => {
      const results: any[] = [];
      let headers: string[] = [];

      Readable.from(fileBuffer)
        .pipe(csv({ separator }))
        .on('headers', (hdr) => { headers = hdr; })
        .on('data', (data) => {
          results.push(data);
        })
        .on('end', () => {
          resolve({
            headers,
            rows: results.slice(0, 5), // Preview 5 rows
            totalRows: results.length,
            allRows: results // Return all rows for the frontend to hold in state
          });
        })
        .on('error', reject);
    });
  }

  /**
   * Analyse les lignes mappées pour compter ce qui manque
   * et vérifier les doublons potentiels
   */
  async analyzeMissingData(dto: AnalyzeCsvDto) {
    const { rows, mapping, tenantId } = dto;
    let missingEmail = 0;
    let missingPhone = 0;
    let missingDirector = 0;
    let missingWebsite = 0;
    let missingLinkedin = 0;

    // 1. Mettre en forme les rows selon le mapping (comme dans startEnrichmentJob)
    const mappedRows = rows.map(row => {
      const newRow: any = { _raw: row, _customData: {} };
      for (const [csvCol, prospectField] of Object.entries(mapping)) {
        if (prospectField !== 'ignore') {
          if (prospectField.startsWith('custom:')) {
            const customTag = prospectField.split(':')[1];
            if (customTag) {
              newRow._customData[customTag] = row[csvCol];
            }
          } else {
            newRow[prospectField] = row[csvCol];
          }
        }
      }
      return newRow;
    });
    
    // Check duplicates accurately by pre-fetching potential matches
    const emailsToCheck = mappedRows.map(r => r.email?.toLowerCase().trim()).filter(Boolean);
    const firstNamesToCheck = mappedRows.map(r => r.firstName?.trim()).filter(Boolean);
    const lastNamesToCheck = mappedRows.map(r => r.lastName?.trim()).filter(Boolean);

    let duplicatesCount = 0;
    
    if (emailsToCheck.length > 0 || (firstNamesToCheck.length > 0 && lastNamesToCheck.length > 0)) {
      const orConditions: any[] = [];
      if (emailsToCheck.length > 0) orConditions.push({ email: { in: emailsToCheck } });
      if (firstNamesToCheck.length > 0 && lastNamesToCheck.length > 0) {
        orConditions.push({
          firstName: { in: firstNamesToCheck },
          lastName: { in: lastNamesToCheck }
        });
      }

      const existingProspects = await this.prisma.prospect.findMany({
        where: { tenantId, OR: orConditions },
        select: { id: true, email: true, firstName: true, lastName: true, companyName: true, companyDomain: true }
      });

      // Strict memory matching for each row
      for (const row of mappedRows) {
        const email = row.email?.toLowerCase().trim();
        const firstName = row.firstName?.trim()?.toLowerCase();
        const lastName = row.lastName?.trim()?.toLowerCase();
        const companyName = row.companyName?.trim()?.toLowerCase();
        const companyDomain = row.companyDomain?.trim()?.toLowerCase();

        const isDuplicate = existingProspects.some(p => {
          if (email && p.email?.toLowerCase() === email) return true;
          
          if (firstName && lastName && p.firstName?.toLowerCase() === firstName && p.lastName?.toLowerCase() === lastName) {
             if (companyName && p.companyName?.toLowerCase() === companyName) return true;
             if (companyDomain && p.companyDomain?.toLowerCase() === companyDomain) return true;
          }
          return false;
        });

        if (isDuplicate) {
          duplicatesCount++;
        }
      }
    }

    for (const row of mappedRows) {
      const mappedEmail = row.email;
      const mappedPhone = row.phone;
      const mappedFirstName = row.firstName;
      const mappedLastName = row.lastName;
      const mappedDomain = row.companyDomain;
      const mappedLinkedin = row.linkedinUrl;

      if (!mappedEmail || mappedEmail.trim() === '') missingEmail++;
      if (!mappedPhone || mappedPhone.trim() === '') missingPhone++;
      if ((!mappedFirstName || mappedFirstName.trim() === '') && (!mappedLastName || mappedLastName.trim() === '')) missingDirector++;
      if (!mappedDomain || mappedDomain.trim() === '') missingWebsite++;
      if (!mappedLinkedin || mappedLinkedin.trim() === '') missingLinkedin++;
    }

    return {
      totalRows: rows.length,
      duplicatesCount,
      missingEmail,
      missingPhone,
      missingDirector,
      missingWebsite,
      missingLinkedin,
      suggestedTools: [
        { id: 'findEmail', label: 'Découverte Email vérifié', missing: missingEmail, tools: ['Reacher SMTP'], estimatedTime: missingEmail > 0 ? `~${Math.ceil((missingEmail * 20)/60)} min` : '0 min' },
        { id: 'findDirectorName', label: 'Nom du Dirigeant', missing: missingDirector, tools: ['OpenData', 'Google Search'], estimatedTime: missingDirector > 0 ? `~${Math.ceil((missingDirector * 10)/60)} min` : '0 min' },
        { id: 'findPhone', label: 'Téléphone Entreprise', missing: missingPhone, tools: ['Google Places'], estimatedTime: missingPhone > 0 ? `~${Math.ceil((missingPhone * 5)/60)} min` : '0 min' },
        { id: 'findLinkedin', label: 'Profil LinkedIn', missing: missingLinkedin, tools: ['Web Search'], estimatedTime: missingLinkedin > 0 ? `~${Math.ceil((missingLinkedin * 5)/60)} min` : '0 min' }
      ]
    };
  }

  /**
   * Lance le job d'enrichissement
   */
  async startEnrichmentJob(dto: StartEnrichmentDto, filename: string) {
    const { rows, mapping, tenantId, listId, options, duplicateAction } = dto;
    
    // Mettre en forme les rows selon le mapping
    const mappedRows = rows.map(row => {
      const newRow: any = { _raw: row, _customData: {} };
      for (const [csvCol, prospectField] of Object.entries(mapping)) {
        if (prospectField !== 'ignore') {
          if (prospectField.startsWith('custom:')) {
            const customTag = prospectField.split(':')[1];
            if (customTag) {
              newRow._customData[customTag] = row[csvCol];
            }
          } else {
            newRow[prospectField] = row[csvCol];
          }
        }
      }
      return newRow;
    });

    try {
      const csvJob = await this.prisma.csvImportJob.create({
        data: {
          tenantId,
          filename,
          jobType: 'ENRICHMENT',
          listId,
          totalRows: mappedRows.length,
          status: 'PROCESSING'
        }
      });

      const jobs = mappedRows.map(row => ({
        name: 'enrich-row',
        data: {
          csvJobId: csvJob.id,
          tenantId,
          listId,
          rowData: row,
          options,
          duplicateAction
        } as EnrichmentJobData
      }));

      await this.enrichmentQueue.addBulk(jobs);
      this.logger.log(`Ajouté ${jobs.length} jobs dans la file d'attente.`);

      return csvJob;
    } catch (e) {
      this.logger.error("Erreur création job d'enrichissement:", e);
      throw e;
    }
  }

  /**
   * Lance le job d'enrichissement pour des prospects déjà en base de données.
   */
  async startEnrichmentForExistingProspects(prospectIds: string[], options: EnrichmentOptions, tenantId: string) {
    if (!prospectIds || prospectIds.length === 0) return null;

    const prospects = await this.prisma.prospect.findMany({
      where: {
        id: { in: prospectIds },
        tenantId
      }
    });

    if (prospects.length === 0) return null;

    try {
      const csvJob = await this.prisma.csvImportJob.create({
        data: {
          tenantId,
          filename: 'Enrichissement Campagne',
          totalRows: prospects.length,
          status: 'PROCESSING'
        }
      });

      const jobs = prospects.map(p => ({
        name: 'enrich-row',
        data: {
          csvJobId: csvJob.id,
          tenantId,
          rowData: {
            firstName: p.firstName,
            lastName: p.lastName,
            companyName: p.companyName,
            email: p.email,
            phone: p.phone,
            linkedinUrl: p.linkedinUrl,
            jobTitle: p.jobTitle,
            companyDomain: p.companyDomain,
          },
          options,
          duplicateAction: 'update',
          prospectId: p.id
        } as EnrichmentJobData
      }));

      await this.enrichmentQueue.addBulk(jobs);
      this.logger.log(`Ajouté ${jobs.length} jobs d'enrichissement pour prospects existants.`);

      return csvJob;
    } catch (e) {
      this.logger.error("Erreur création job enrichissement existants:", e);
      throw e;
    }
  }

  async getJobStatus(jobId: string) {
    const job = await this.prisma.csvImportJob.findUnique({
      where: { id: jobId },
      include: {
        prospects: {
          select: { id: true, firstName: true, lastName: true, companyName: true, email: true, emailConfidence: true, phone: true, jobTitle: true, companyDomain: true, linkedinUrl: true }
        }
      } // Inclus les prospects pour la Live Table frontend
    });
    if (!job) return null;
    return job;
  }

  async exportJobCsv(jobId: string): Promise<Buffer | null> {
    const job = await this.prisma.csvImportJob.findUnique({
      where: { id: jobId },
      include: { prospects: true }
    });
    
    if (!job || job.prospects.length === 0) return null;

    const headers = [
      'Prenom', 'Nom', 'Entreprise', 'Domaine', 'Poste', 'Email', 'Confiance_Email', 'Telephone', 'LinkedIn'
    ];

    const rows = job.prospects.map(p => [
      p.firstName || '',
      p.lastName || '',
      p.companyName || '',
      p.companyDomain || '',
      p.jobTitle || '',
      p.email || '',
      p.emailConfidence?.toString() || '',
      p.phone || '',
      p.linkedinUrl || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    return Buffer.from(csvContent, 'utf-8');
  }

  async saveJobSelection(jobId: string, tenantId: string, selectedProspectIds: string[], listId?: string, deleteUnselected: boolean = true) {
    const job = await this.prisma.csvImportJob.findUnique({ where: { id: jobId, tenantId }});
    if (!job) return null;

    // Si une liste est fournie, on y ajoute les leads sélectionnés
    if (listId) {
      const listEntries = selectedProspectIds.map(prospectId => ({
        prospectId,
        prospectListId: listId
      }));
      
      if (listEntries.length > 0) {
        await this.prisma.prospectListEntry.createMany({
          data: listEntries,
          skipDuplicates: true
        });
      }
    }

    // Supprimer de la base de données globale tous les prospects de ce job qui n'ont pas été cochés
    if (deleteUnselected) {
      await this.prisma.prospect.deleteMany({
        where: {
          csvImportJobId: jobId,
          tenantId,
          id: { notIn: selectedProspectIds }
        }
      });
    }

    return { success: true, countSaved: selectedProspectIds.length };
  }
}
