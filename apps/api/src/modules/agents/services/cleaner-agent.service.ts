import { Injectable, Logger } from '@nestjs/common';
import { generateObjectWithGroq } from './ai-model.provider';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DeepResearchAgentService } from './deep-research-agent.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INDUSTRIES } from '../../../common/constants/industries';

@Injectable()
export class CleanerAgentService {
  private readonly logger = new Logger(CleanerAgentService.name);

  constructor(
    private prisma: PrismaService,
    private deepResearchAgent: DeepResearchAgentService,
    @InjectQueue('cleaner') private cleanerQueue: Queue,
  ) {}

  async startCleanerJob(tenantId: string, listId: string, rows: any[], mapping: Record<string, string>, targetAudience: string, filename: string = 'Nettoyage IA') {
    // 1. Créer le job en DB
    const csvJob = await this.prisma.csvImportJob.create({
      data: {
        tenantId,
        filename,
        jobType: 'CLEANER',
        listId,
        totalRows: rows.length,
        status: 'PROCESSING'
      }
    });

    // 2. Mettre en forme les rows selon le mapping (comme dans l'Enrichissement)
    const mappedRows = rows.map(row => {
      const p: any = { _customData: {}, _raw: row };
      for (const [csvCol, prospectField] of Object.entries(mapping)) {
        if (prospectField !== 'ignore') {
          if (prospectField.startsWith('custom:')) {
            const customTag = prospectField.split(':')[1];
            if (customTag) {
              p._customData[customTag] = row[csvCol];
            }
          } else {
            p[prospectField] = row[csvCol];
          }
        }
      }
      return p;
    });

    // 3. Envoyer à BullMQ
    const jobs = mappedRows.map((row, index) => ({
      name: 'clean-row',
      data: {
        csvJobId: csvJob.id,
        tenantId,
        listId,
        rowData: row,
        targetAudience,
      }
    }));

    await this.cleanerQueue.addBulk(jobs);

    return csvJob;
  }

  /**
   * Évalue si un prospect correspond à la cible visée.
   * @param allowDeepResearch Si true, l'agent peut lancer une recherche web pour vérifier s'il manque d'infos.
   */
  async evaluateProspect(prospect: any, targetIndustry: string, allowDeepResearch: boolean = true): Promise<{ isMatch: boolean, reason: string, deepResearchResult?: string }> {
    this.logger.log(`Évaluation du prospect ${prospect.firstName} ${prospect.lastName} par rapport au secteur cible: "${targetIndustry}"`);
    
    // COUCHE 1 : FAST LANE (Comparaison stricte sans IA)
    if (prospect.industry && prospect.industry === targetIndustry) {
      this.logger.log(`[FAST LANE] Prospect validé automatiquement (Secteur identique: ${targetIndustry})`);
      return { isMatch: true, reason: `Le prospect appartient exactement au secteur cible: ${targetIndustry}` };
    }

    try {
      let promptData = `
SECTEUR CIBLE ATTENDU :
${targetIndustry}

LISTE OFFICIELLE DES SECTEURS :
${INDUSTRIES.map((i: string) => `- ${i}`).join('\n')}

INFORMATIONS DU PROSPECT :
Nom: ${prospect.firstName || ''} ${prospect.lastName || ''}
Entreprise: ${prospect.companyName || ''}
Secteur/Industrie actuel: ${prospect.industry || prospect.companyDomain || 'Inconnu'}
Job Title: ${prospect.jobTitle || 'Inconnu'}
`;

      // Ajouter les données custom si existantes
      if (prospect._customData && Object.keys(prospect._customData).length > 0) {
        promptData += `\nDONNÉES SUPPLÉMENTAIRES DU FICHIER :\n${JSON.stringify(prospect._customData, null, 2)}\n`;
      }
      
      // Ajouter les données d'enrichissement si existantes
      if (prospect.enrichmentData && Object.keys(prospect.enrichmentData).length > 0) {
        promptData += `\nDONNÉES D'ENRICHISSEMENT :\n${JSON.stringify(prospect.enrichmentData, null, 2)}\n`;
      }

      promptData += `\nCe prospect appartient-il au secteur cible attendu ?`;

      const result = await generateObjectWithGroq({
        schema: z.object({
          isMatch: z.boolean().describe("true si le prospect correspond EXACTEMENT au secteur cible, false sinon"),
          classifiedIndustry: z.enum(INDUSTRIES as unknown as [string, ...string[]]).optional().describe("Le secteur officiel dans lequel tu classes ce prospect. Doit être strictement l'un des secteurs de la liste officielle. Omettre si impossible à déterminer."),
          reason: z.string().describe("Brève explication de la décision"),
          needsMoreInfo: z.boolean().describe("true UNIQUEMENT si les informations sont vraiment trop faibles pour le classer avec certitude")
        }),
        system: `Tu es un expert en qualification B2B (Agent Nettoyeur).
Ton rôle est de lire les informations d'un prospect, de le classer dans l'un des secteurs de la 'LISTE OFFICIELLE', et de déterminer s'il correspond au 'SECTEUR CIBLE ATTENDU'.
Lis ATTENTIVEMENT les informations fournies.
Si les informations ne permettent pas de conclure (secteur inconnu ou trop vague), mets needsMoreInfo à true.
Si tu as assez d'infos, classe-le (classifiedIndustry), tranche (isMatch) et mets needsMoreInfo à false.`,
        prompt: promptData
      });

      // Mettre à jour l'industrie si trouvée par l'IA
      if (result.object.classifiedIndustry) {
        prospect.industry = result.object.classifiedIndustry;
        // On devrait idéalement sauvegarder ça en DB, mais c'est fait en aval si besoin.
      }

      if (result.object.needsMoreInfo && allowDeepResearch) {
        this.logger.log(`Plus d'infos requises pour le prospect ${prospect.firstName}. Lancement de Deep Research...`);
        const deepResearchResult = await this.deepResearchAgent.runDeepResearch({
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          companyName: prospect.companyName,
          industry: prospect.industry,
          linkedinUrl: prospect.linkedinUrl,
          companyDomain: prospect.companyDomain
        });

        if (deepResearchResult) {
          let secondPromptData = `
SECTEUR CIBLE ATTENDU :
${targetIndustry}

LISTE OFFICIELLE DES SECTEURS :
${INDUSTRIES.map((i: string) => `- ${i}`).join('\n')}

INFORMATIONS DE BASE :
Nom: ${prospect.firstName || ''} ${prospect.lastName || ''}
Entreprise: ${prospect.companyName || ''}
`;

          if (prospect._customData && Object.keys(prospect._customData).length > 0) {
            secondPromptData += `\nDONNÉES SUPPLÉMENTAIRES :\n${JSON.stringify(prospect._customData, null, 2)}\n`;
          }

          secondPromptData += `
RÉSULTATS DE LA RECHERCHE WEB SUR LE PROSPECT :
${deepResearchResult}

Ce prospect appartient-il au secteur cible attendu ?`;

          // Deuxième passe avec les nouvelles infos
          const secondResult = await generateObjectWithGroq({
            schema: z.object({
              isMatch: z.boolean().describe("true si le prospect correspond EXACTEMENT au secteur cible, false sinon"),
              classifiedIndustry: z.enum(INDUSTRIES as unknown as [string, ...string[]]).optional().describe("Le secteur officiel dans lequel tu classes ce prospect. Doit être strictement l'un des secteurs de la liste officielle."),
              reason: z.string().describe("Brève explication de la décision")
            }),
            system: `Tu es un expert en qualification B2B. Classe le prospect dans l'un des secteurs de la 'LISTE OFFICIELLE', et détermine s'il correspond au 'SECTEUR CIBLE ATTENDU'.`,
            prompt: secondPromptData
          });

          // Mettre à jour l'industrie si trouvée par l'IA
          if (secondResult.object.classifiedIndustry) {
            prospect.industry = secondResult.object.classifiedIndustry;
          }

          return { 
            isMatch: secondResult.object.isMatch, 
            reason: secondResult.object.reason, 
            deepResearchResult 
          };
        }
      }

      return {
        isMatch: result.object.isMatch,
        reason: result.object.reason
      };
    } catch (error: any) {
      this.logger.error(`Erreur lors de l'Ã©valuation du prospect: ${error.message}`);
      // En cas d'erreur de l'IA, on garde le prospect par sÃ©curitÃ©
      return { isMatch: true, reason: "Erreur IA, prospect conservÃ© par dÃ©faut." };
    }
  }

  /**
   * Ajoute les prospects rejetÃ©s Ã  une liste "Prospects RejetÃ©s" sans crÃ©er de doublons dans la DB.
   */
  async saveRejectedProspects(tenantId: string, rejectedProspects: any[]) {
    if (!rejectedProspects.length) return;

    // 1. Trouver ou crÃ©er la liste "Prospects RejetÃ©s"
    let rejectedList = await this.prisma.prospectList.findFirst({
      where: { tenantId, name: 'Prospects RejetÃ©s' }
    });

    if (!rejectedList) {
      rejectedList = await this.prisma.prospectList.create({
        data: {
          tenantId,
          name: 'Prospects RejetÃ©s'
        }
      });
    }

    // 2. Traiter chaque prospect rejetÃ© pour faire un upsert
    for (const p of rejectedProspects) {
      if (!p.firstName || !p.companyName) continue; // Skip bad data

      let dbProspect = null;

      // Chercher par email d'abord si prÃ©sent
      if (p.email) {
        dbProspect = await this.prisma.prospect.findFirst({
          where: { tenantId, email: p.email }
        });
      }

      // Chercher par Nom + Prenom + Entreprise
      if (!dbProspect) {
        dbProspect = await this.prisma.prospect.findFirst({
          where: {
            tenantId,
            firstName: p.firstName,
            lastName: p.lastName,
            companyName: p.companyName
          }
        });
      }

      // CrÃ©er s'il n'existe pas
      if (!dbProspect) {
        dbProspect = await this.prisma.prospect.create({
          data: {
            tenantId,
            firstName: p.firstName,
            lastName: p.lastName || '',
            companyName: p.companyName,
            email: p.email || null,
            industry: p.industry || null,
            jobTitle: p.jobTitle || null,
            source: 'API_IMPORT',
            enrichmentData: p.reason ? { cleanerRejectionReason: p.reason } : {}
          }
        });
      } else {
        // Mettre à jour l'industrie et la raison de rejet pour un prospect existant
        const currentEnrichment = dbProspect.enrichmentData || {};
        dbProspect = await this.prisma.prospect.update({
          where: { id: dbProspect.id },
          data: {
            industry: p.industry || dbProspect.industry,
            enrichmentData: {
              ...(currentEnrichment as any),
              cleanerRejectionReason: p.reason || (currentEnrichment as any).cleanerRejectionReason
            }
          }
        });
      }

      // 3. Ajouter Ã  la liste (ignorer si dÃ©jÃ  dedans grÃ¢ce au try/catch ou upsert)
      try {
        await this.prisma.prospectListEntry.create({
          data: {
            prospectId: dbProspect.id,
            prospectListId: rejectedList.id
          }
        });
      } catch (e) {
        // DÃ©jÃ  dans la liste (contrainte d'unicitÃ©)
      }
    }
  }
}
