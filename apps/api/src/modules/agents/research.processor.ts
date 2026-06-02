import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EnricherAgentService } from './services/enricher-agent.service';
import { EmailDiscoveryService } from './services/email-discovery.service';
import { ProspectsService } from '../prospects/prospects.service';
import { WebScraperService } from './services/web-scraper.service';
import { WebSearchAgentService } from './services/web-search-agent.service';
import { generateText } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';

interface ResearchJobData {
  researchJobId: string;
  tenantId: string;
  listId?: string;
  companyName: string;
  domain: string;
  sourcePrompt: string;
}

@Processor('research', { concurrency: 5 })
export class ResearchProcessor extends WorkerHost {
  private readonly logger = new Logger(ResearchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enricherAgent: EnricherAgentService,
    private readonly emailDiscovery: EmailDiscoveryService,
    private readonly prospectsService: ProspectsService,
    private readonly webScraper: WebScraperService,
    private readonly webSearch: WebSearchAgentService,
  ) {
    super();
  }

  async process(job: Job<ResearchJobData>) {
    if (job.name === 'expert-research-company') {
      return this.processExpert(job);
    }
    return this.processStandard(job);
  }

  async processStandard(job: Job<ResearchJobData>) {
    const { researchJobId, tenantId, listId, companyName, domain, sourcePrompt } = job.data;
    this.logger.debug(`Traitement deep-research pour l'entreprise ${companyName} (${domain})`);

    try {
      // 1. Check DB first (Pre-flight)
      const domainPrefix = domain.split('.')[0];
      const existingProspect = await this.prisma.prospect.findFirst({
        where: { 
          tenantId, 
          OR: [
            { companyName: { contains: domainPrefix, mode: 'insensitive' } },
            { companyDomain: { contains: domainPrefix, mode: 'insensitive' } },
            { companyDomain: { contains: domain, mode: 'insensitive' } }
          ]
        }
      });

      if (existingProspect) {
        this.logger.log(`Entreprise ${companyName} (${domain}) déjà en base. On ignore.`);
        return;
      }

      // 2. Find the founder/director via EnricherAgent (or specialized AI)
      this.logger.log(`Recherche du dirigeant pour ${companyName}...`);
      
      const directorInfoResult = await generateText({
        model: vertex('gemini-3.5-flash'),
        system: `Tu dois trouver le ou la dirigeante (CEO, Fondateur, Directeur) de l'entreprise ciblée.
Utilise tes connaissances ou l'outil de recherche web.
Tu DOIS renvoyer un objet JSON valide avec les propriétés suivantes:
- "found" (boolean): true si un prénom et nom humain a été trouvé
- "firstName" (string, optionnel)
- "lastName" (string, optionnel)
- "jobTitle" (string, optionnel)
- "industry" (string, optionnel): Le secteur d'activité de l'entreprise

Ne renvoie que le JSON brut sans autre texte.`,
        prompt: `Trouve le dirigeant de l'entreprise "${companyName}" (site web: ${domain}). Cherche sur LinkedIn ou via une recherche web.`,
        tools: {
           // @ts-ignore
           google_search: vertex.tools.googleSearch({}),
        },
        maxSteps: 3
      });

      let directorInfo: any = { found: false };
      try {
        let cleanText = directorInfoResult.text.replace(/```json/gi, '').replace(/```/gi, '').trim();
        directorInfo = JSON.parse(cleanText);
      } catch (e) {
        this.logger.error(`Erreur de parsing JSON pour le dirigeant de ${companyName}`);
      }

      let firstName = '';
      let lastName = '';
      let jobTitle = 'Dirigeant';
      let industry = 'Inconnu';
      let email = null;

      if (!directorInfo.found || !directorInfo.firstName) {
        this.logger.warn(`Aucun dirigeant précis trouvé pour ${companyName}, mais on sauvegarde quand même l'entreprise.`);
      } else {
        firstName = directorInfo.firstName;
        lastName = directorInfo.lastName || '';
        jobTitle = directorInfo.jobTitle || 'Dirigeant';
        industry = directorInfo.industry || 'Inconnu';

        // 3. Find Email
        this.logger.log(`Recherche d'email pour ${firstName} ${lastName} @ ${domain}`);
        const emailResult = await this.emailDiscovery.findValidEmail(firstName, lastName, domain, companyName);

        if (emailResult && emailResult.email) {
          email = emailResult.email;
        } else {
          this.logger.warn(`Aucun email valide trouvé pour ${firstName} ${lastName} @ ${domain}. Sauvegarde du prospect sans email.`);
        }
      }

      // 4. Save to DB
      this.logger.log(`✅ Création du prospect: ${companyName} (${email || 'Sans email'})`);
      const prospectData = {
        firstName: firstName || 'Inconnu',
        lastName: lastName || '',
        companyName,
        companyDomain: domain,
        email: email || '',
        jobTitle,
        industry,
        source: 'GOOGLE_SEARCH' as any,
        emailVerified: !!email,
        researchJobId, // Add this
      };

      const created = await this.prospectsService.create(prospectData as any, tenantId);

      // Link to list
      if (created && listId) {
        try {
          await this.prisma.prospectListEntry.create({
            data: {
              prospectId: created.id,
              prospectListId: listId
            }
          });
        } catch (e: any) {
           // Ignore duplicate entry errors
        }
      }

    } catch (error: any) {
      this.logger.error(`Erreur process deep-research pour ${companyName}:`, error.stack);
      throw error;
    } finally {
      // Increment processedCount regardless of success or failure
      try {
        await this.prisma.researchJob.update({
          where: { id: researchJobId },
          data: { processedCount: { increment: 1 } }
        });
      } catch (e: any) {
        this.logger.error(`Failed to increment processedCount for job ${researchJobId}: ${e.message}`);
      }
    }
  }

  async processExpert(job: Job<ResearchJobData>) {
    const { researchJobId, tenantId, listId, companyName, domain, sourcePrompt } = job.data;
    this.logger.debug(`[EXPERT] Traitement pour l'entreprise ${companyName} (${domain})`);

    try {
      // 1. Scraping and Verification (The anti-hallucination / strict criteria check)
      this.logger.log(`[EXPERT] Scraping de ${domain} pour vérification...`);
      const websiteContent = await this.webScraper.scrapeWebsite(domain);

      const verificationResult = await generateText({
        model: vertex('gemini-3.5-flash'),
        system: `Tu es un auditeur strict. L'utilisateur cherche des prospects avec cette requête: "${sourcePrompt}".
Tu dois analyser le contenu du site web de l'entreprise "${companyName}" et vérifier si elle correspond PARFAITEMENT aux critères de l'utilisateur.
Si la requête demande des sites e-commerce qui vendent des produits (et pas de services), vérifie la présence de panier, produits physiques, et l'absence de mentions "nos services", "agence", "consulting".
Si la requête demande d'éviter les grandes marques, vérifie si c'est une multinationale.

Tu DOIS renvoyer un objet JSON valide:
- "isValid" (boolean): true si ça correspond parfaitement, false sinon.
- "reason" (string): Pourquoi (en 1 phrase brève).

Contenu du site:
${websiteContent.substring(0, 15000)}`,
        prompt: `L'entreprise correspond-elle aux critères ?`,
      });

      let verification: any = { isValid: false, reason: "Erreur de vérification" };
      try {
        let cleanText = verificationResult.text.replace(/```json/gi, '').replace(/```/gi, '').trim();
        verification = JSON.parse(cleanText);
      } catch (e) {
        this.logger.warn(`[EXPERT] Impossible de parser la vérification, on rejette par sécurité.`);
      }

      if (!verification.isValid) {
        this.logger.log(`[EXPERT] ❌ Rejeté: ${companyName}. Raison: ${verification.reason}`);
        return; // Stop processing this company, it doesn't match
      }
      this.logger.log(`[EXPERT] ✅ Validé: ${companyName}. Raison: ${verification.reason}`);

      // 2. Find the founder/director (Using Deep Web Search / Sirene if needed)
      this.logger.log(`[EXPERT] Recherche du dirigeant pour ${companyName}...`);
      
      const directorInfoResult = await generateText({
        model: vertex('gemini-3.5-flash'),
        system: `Trouve le dirigeant (CEO, Fondateur) de l'entreprise. 
Renvoie un JSON valide: {"found": true/false, "firstName": "...", "lastName": "...", "jobTitle": "...", "linkedinUrl": "...", "industry": "..."}`,
        prompt: `Trouve le CEO de "${companyName}" (${domain}).`,
        tools: {
           // @ts-ignore
           google_search: vertex.tools.googleSearch({}),
        },
        maxSteps: 3
      });

      let directorInfo: any = { found: false };
      try {
        let cleanText = directorInfoResult.text.replace(/```json/gi, '').replace(/```/gi, '').trim();
        directorInfo = JSON.parse(cleanText);
      } catch (e) {}

      if (!directorInfo.found || !directorInfo.firstName) {
        this.logger.warn(`[EXPERT] Dirigeant introuvable pour ${companyName}, prospect ignoré (exigence de haute qualité).`);
        return; 
      }

      // 3. Find Email using advanced WebSearchEmail + Discovery
      let email = null;
      this.logger.log(`[EXPERT] Recherche email nominatif pour ${directorInfo.firstName} ${directorInfo.lastName}`);
      
      const emailResult = await this.emailDiscovery.findValidEmail(directorInfo.firstName, directorInfo.lastName, domain, companyName);
      if (emailResult && emailResult.email) {
        email = emailResult.email;
      } else {
         // Fallback WebSearchAgent
         const webEmail = await this.webSearch.findPersonalEmail(directorInfo.firstName, directorInfo.lastName, companyName, domain, directorInfo.linkedinUrl);
         if (webEmail) email = webEmail;
      }

      if (!email) {
        this.logger.warn(`[EXPERT] Aucun email trouvé pour ${companyName}, prospect ignoré (exigence de haute qualité).`);
        return; // Only save if we have an email in expert mode
      }

      // 4. Save to DB
      this.logger.log(`[EXPERT] 🎉 Création du super-prospect: ${companyName} (${email})`);
      const prospectData = {
        firstName: directorInfo.firstName,
        lastName: directorInfo.lastName || '',
        companyName,
        companyDomain: domain,
        email: email,
        jobTitle: directorInfo.jobTitle || 'CEO',
        industry: directorInfo.industry || 'Inconnu',
        source: 'SCRAPING' as any,
        emailVerified: true, // We assume high confidence
        researchJobId,
        linkedinUrl: directorInfo.linkedinUrl || null,
        enrichmentData: {
           expertReason: verification.reason,
           expertVerified: true
        }
      };

      const created = await this.prospectsService.create(prospectData as any, tenantId);

      if (created && listId) {
        try {
          await this.prisma.prospectListEntry.create({
            data: { prospectId: created.id, prospectListId: listId }
          });
        } catch (e: any) {}
      }

      // Success : on incrémente processedCount
      await this.prisma.researchJob.update({
        where: { id: researchJobId },
        data: { processedCount: { increment: 1 } }
      });

    } catch (error: any) {
      this.logger.error(`Erreur process EXPERT pour ${companyName}:`, error.stack);
      throw error;
    } finally {
      try {
        const jobRecord = await this.prisma.researchJob.findUnique({ where: { id: researchJobId } });
        if (jobRecord) {
          const options = jobRecord.options as any || {};
          options.evaluatedCount = (options.evaluatedCount || 0) + 1;
          await this.prisma.researchJob.update({
            where: { id: researchJobId },
            data: { options }
          });
        }
      } catch (e: any) {}
    }
  }
}
