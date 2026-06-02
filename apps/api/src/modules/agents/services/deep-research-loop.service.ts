// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { generateTextWithGroq } from './ai-model.provider';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WebSearchAgentService } from './web-search-agent.service';

@Injectable()
export class DeepResearchLoopService {
  private readonly logger = new Logger(DeepResearchLoopService.name);

  constructor(
    private prisma: PrismaService,
    private readonly webSearchService: WebSearchAgentService,
    @InjectQueue('research') private researchQueue: Queue,
  ) {}

  async startDeepResearchJob(tenantId: string, prompt: string, targetCount: number, listId?: string, excludeListIds?: string[]) {
    this.logger.log(`Starting Expert/Deep Research Job for tenant ${tenantId}. Prompt: "${prompt}", Target: ${targetCount}`);

    // 0. Pre-fetch excluded domains if any
    let initialBlacklist: string[] = [];
    if (excludeListIds && excludeListIds.length > 0) {
      const prospectsToExclude = await this.prisma.prospect.findMany({
        where: {
          tenantId,
          lists: {
            some: {
              prospectListId: { in: excludeListIds }
            }
          },
          companyDomain: { not: null }
        },
        select: { companyDomain: true }
      });
      
      const uniqueDomains = Array.from(new Set(prospectsToExclude.map(p => p.companyDomain).filter(d => d)));
      initialBlacklist = uniqueDomains as string[];
      this.logger.log(`Initialized blacklist with ${initialBlacklist.length} domains from excluded lists.`);
    }

    // 1. Create the Research Job
    const job = await this.prisma.researchJob.create({
      data: {
        tenantId,
        prompt,
        targetCount,
        listId,
        blacklistedDomains: initialBlacklist,
        options: { isExpert: true, evaluatedCount: 0 },
        status: 'PROCESSING',
      }
    });

    // 2. Start the asynchronous compilation loop
    this.runCompilationLoop(job.id, prompt, targetCount, tenantId, listId).catch(err => {
      this.logger.error(`Error in compilation loop for job ${job.id}: ${err.message}`);
      this.prisma.researchJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' }
      }).catch(e => console.error(e));
    });

    return job;
  }

  private async runCompilationLoop(jobId: string, prompt: string, targetCount: number, tenantId: string, listId?: string) {
    let foundCount = 0;
    let loopIteration = 0;
    const MAX_LOOPS = 30; // Augmenté pour garantir qu'on atteigne de gros objectifs (ex: 100 validés = ~600 bruts)
    let allGeneratedDomains: string[] = [];

    // On pré-récupère tous les domaines du tenant pour le dédoublonnage à coût zéro
    const existingProspects = await this.prisma.prospect.findMany({
      where: { tenantId, companyDomain: { not: null } },
      select: { companyDomain: true }
    });
    const blacklistedDomains = Array.from(new Set(existingProspects.map(p => p.companyDomain).filter(d => d))) as string[];
    
    // Add domains from job.blacklistedDomains (exclusion lists)
    const jobBlacklist = (await this.prisma.researchJob.findUnique({ where: { id: jobId } }))?.blacklistedDomains as string[] || [];
    for (const d of jobBlacklist) {
      if (!blacklistedDomains.includes(d)) blacklistedDomains.push(d);
    }

    while (loopIteration < MAX_LOOPS) {
      loopIteration++;
      
      let currentJob = await this.prisma.researchJob.findUnique({ where: { id: jobId } });
      if (!currentJob || currentJob.status === 'FAILED' || currentJob.status === 'COMPLETED' || currentJob.status === 'CANCELLED' as any) {
        break;
      }

      // Check if we already reached our target of validated prospects
      if (currentJob.processedCount >= targetCount) {
        this.logger.log(`[Job ${jobId}] Objectif atteint ! (${currentJob.processedCount}/${targetCount})`);
        break;
      }

      this.logger.log(`[Job ${jobId}] Loop ${loopIteration}: Calling Gemini to find target companies...`);

      const queriesResult = await generateTextWithGroq({
        system: `Tu es un expert en OSINT et recherche d'entreprises. 
L'utilisateur veut une liste d'entreprises très spécifiques. 
Utilise ta recherche web Google pour trouver des entreprises qui correspondent EXACTEMENT aux critères.
Ne renvoie JAMAIS de sites qui sont déjà dans cette liste : ${allGeneratedDomains.slice(-150).join(', ')}

IMPORTANT: Renvoie UNIQUEMENT un tableau JSON d'objets avec "name" et "domain". 
Exemple: [{"name": "L'Oréal", "domain": "loreal.com"}, {"name": "Alan", "domain": "alan.com"}]
Si tu n'en trouves plus, renvoie un tableau vide [].`,
        prompt: `Recherche et donne moi 40 nouvelles entreprises pour la requête suivante : "${prompt}"`,
        tools: {
          google_search: tool({
            description: 'Search Google for web results.',
            inputSchema: z.object({
              query: z.string().describe("La requête précise à rechercher")
            }),
            execute: async (args: any) => {
              const q = args?.query || args?.q || args?.search || args?.recherche || Object.values(args)[0] || '';
              return await this.webSearchService.answerQuery(q);
            },
          }),
        },
        maxSteps: 3
      });

      let newCompanies: { name: string, domain: string }[] = [];
      try {
        let cleanText = queriesResult.text.replace(/```json/gi, '').replace(/```/gi, '').trim();
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed)) {
          newCompanies = parsed.filter(c => c.name && c.domain);
        }
      } catch (e) {
        this.logger.warn(`[Job ${jobId}] Failed to parse companies from AI: ${queriesResult.text}`);
      }

      if (newCompanies.length === 0) {
        this.logger.warn(`[Job ${jobId}] IA n'a pas pu trouver de nouvelles entreprises.`);
        break; // Stop loop if AI is exhausted
      }

      // Dédoublonnage et filtrage (Coût Zéro)
      let validCompanies = [];
      for (const comp of newCompanies) {
        try {
          const domainStr = new URL(comp.domain.startsWith('http') ? comp.domain : `https://${comp.domain}`).hostname.replace('www.', '');
          
          if (blacklistedDomains.includes(domainStr) || allGeneratedDomains.includes(domainStr)) {
            continue; // Déjà en base ou déjà généré dans cette session
          }
          
          allGeneratedDomains.push(domainStr);
          blacklistedDomains.push(domainStr);
          validCompanies.push({ name: comp.name, domain: domainStr });
        } catch (e) {
          // ignore invalid domains
        }
      }

      if (validCompanies.length === 0) {
         continue; // Try again
      }

      // Ne plus limiter au foundCount (puisqu'on veut targetCount validés, pas trouvés bruts)
      // On prend tous les validCompanies de ce lot (max 40)

      // Pousser chaque entreprise validée dans la file d'attente pour la recherche profonde
      for (const comp of validCompanies) {
        await this.researchQueue.add('expert-research-company', {
          researchJobId: jobId,
          tenantId,
          listId,
          companyName: comp.name,
          domain: comp.domain,
          sourcePrompt: prompt
        });
      }

      foundCount += validCompanies.length;

      await this.prisma.researchJob.update({
        where: { id: jobId },
        data: { foundCount }
      });

      // Pause : attendre que la file d'attente traite ce lot avant de relancer l'IA
      this.logger.log(`[Job ${jobId}] Mise en pause du superviseur en attendant que le lot de ${validCompanies.length} prospects soit analysé par l'Agent Expert...`);
      let isBatchFinished = false;
      let checkAttempts = 0;
      while (!isBatchFinished && checkAttempts < 60) { // Max 10 minutes (60 * 10s)
        await new Promise(resolve => setTimeout(resolve, 10000));
        checkAttempts++;
        const checkJob = await this.prisma.researchJob.findUnique({ where: { id: jobId } });
        if (!checkJob) break;
        
        const evaluated = (checkJob.options as any)?.evaluatedCount || 0;
        this.logger.debug(`[Job ${jobId}] Superviseur: ${evaluated}/${checkJob.foundCount} évalués. (Validés: ${checkJob.processedCount})`);
        
        if (checkJob.processedCount >= targetCount) {
          isBatchFinished = true; // On a atteint l'objectif !
        } else if (evaluated >= checkJob.foundCount) {
          isBatchFinished = true; // Le lot est terminé
        }
      }

    } // Fin de la boucle

    // Mark compilation as completed, the workers will process the queue
    await this.prisma.researchJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED' }
    });
    
    this.logger.log(`[Job ${jobId}] Compilation terminée. ${foundCount} entreprises envoyées en file d'attente.`);
  }
}
