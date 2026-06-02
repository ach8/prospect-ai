import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GooglePlacesService, LocalBusiness } from './google-places.service';

@Injectable()
export class SourcingLoopManagerService {
  private readonly logger = new Logger(SourcingLoopManagerService.name);

  constructor(
    private prisma: PrismaService,
    private googlePlaces: GooglePlacesService,
    @InjectQueue('research') private researchQueue: Queue,
  ) {}

  async startSourcingJob(tenantId: string, prompt: string, targetCount: number, listId?: string, excludeListIds?: string[], weblessOnly?: boolean) {
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
        options: { weblessOnly: !!weblessOnly },
        status: 'PROCESSING',
      }
    });

    // 2. Start the asynchronous loop in the background
    // We don't await this so the API responds immediately
    this.runSourcingLoop(job.id).catch(err => {
      this.logger.error(`Error in sourcing loop for job ${job.id}: ${err.message}`);
      this.prisma.researchJob.update({
        where: { id: job.id },
        data: { status: 'FAILED' }
      }).catch(e => console.error(e));
    });

    return job;
  }

  private async runSourcingLoop(jobId: string) {
    this.logger.log(`Starting sourcing loop for job ${jobId}`);
    
    let job = await this.prisma.researchJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    let foundCount = job.foundCount;
    const targetCount = job.targetCount;
    let blacklistedDomains: string[] = job.blacklistedDomains as string[] || [];
    let blacklistedPhones: string[] = [];
    
    const options = job.options as any || {};
    const weblessOnly = options.weblessOnly === true;

    let allGeneratedQueries: string[] = [];
    let loopIteration = 0;
    const MAX_API_LOOPS = 4; // To prevent infinite cost

    while (foundCount < targetCount && loopIteration < MAX_API_LOOPS) {
      loopIteration++;
      
      const currentJob = await this.prisma.researchJob.findUnique({ where: { id: jobId } });
      if (!currentJob || currentJob.status === 'FAILED' || currentJob.status === 'COMPLETED' || currentJob.status === 'CANCELLED' as any) {
        break;
      }

      // Générer des variantes de recherche pour Google Places
      const queriesResult = await generateText({
        model: vertex('gemini-3.5-flash'),
        system: `Tu es un expert en requêtes de recherche locale Google Maps.
Le client cherche de nouveaux prospects pour la requête initiale.
Tu dois générer une liste de ${Math.max(10, Math.ceil((targetCount - foundCount) / 2))} sous-requêtes TRÈS DIFFÉRENTES.
Varie à la fois :
1. Les synonymes du métier/secteur (ex: au lieu de juste "Plombier", utilise "Dépannage plomberie", "Artisan sanitaire", "Entreprise de plomberie", etc.)
2. La géographie (utilise des noms de rues, de quartiers, d'arrondissements, de villes limitrophes).

IMPORTANT: Tu ne dois JAMAIS réutiliser ces requêtes que nous avons déjà faites : ${allGeneratedQueries.join(', ')}

Renvoie UNIQUEMENT un tableau JSON de chaînes de caractères brutes. Ne dis pas bonjour, ne fais pas d'intro. Juste le JSON.
Exemple: ["Dépannage plomberie Paris 11", "Artisan sanitaire Bastille", "Entreprise de plomberie Paris 75012"]`,
        prompt: `Génère ${Math.max(10, Math.ceil((targetCount - foundCount) / 2))} variantes ultra-diversifiées pour la recherche : "${job.prompt}"`
      });

      let queries: string[] = [];
      try {
        let cleanText = queriesResult.text;
        const match = cleanText.match(/\[([\s\S]*?)\]/);
        if (match) {
          cleanText = match[0];
        }
        const parsed = JSON.parse(cleanText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          queries = parsed.filter(q => !allGeneratedQueries.includes(q));
        }
      } catch (e) {
        this.logger.warn(`Failed to parse queries from AI: ${queriesResult.text}`);
      }

      if (queries.length === 0) {
        this.logger.warn(`[Job ${jobId}] L'IA n'a pas pu générer de nouvelles requêtes.`);
        break;
      }

      this.logger.log(`[Job ${jobId}] Loop ${loopIteration}: Generated ${queries.length} new queries.`);
      allGeneratedQueries.push(...queries);

      for (const query of queries) {
        if (foundCount >= targetCount) break;

        const currentJobInner = await this.prisma.researchJob.findUnique({ where: { id: jobId } });
        if (!currentJobInner || currentJobInner.status === 'FAILED' || currentJobInner.status === 'COMPLETED' || currentJobInner.status === 'CANCELLED' as any) {
          break;
        }

        this.logger.log(`[Job ${jobId}] Running Google Places search for: "${query}"`);
      
      try {
        const places = await this.googlePlaces.searchBusinesses(query, 60);
        
        let validPlaces = places.filter(p => {
          if (weblessOnly && p.website) return false;
          if (p.website) {
            try {
              const domain = new URL(p.website).hostname.replace('www.', '');
              if (blacklistedDomains.includes(domain)) return false;
            } catch (e) {}
          }
          if (p.phone && blacklistedPhones.includes(p.phone)) return false;
          if (!p.name || p.name === 'Inconnu') return false;
          return true;
        });

        if (validPlaces.length === 0) continue;

        // Ne garder que ce qu'il nous manque
        validPlaces = validPlaces.slice(0, targetCount - foundCount);

        for (const place of validPlaces) {
          let domain = '';
          if (place.website) {
            try { domain = new URL(place.website).hostname.replace('www.', ''); } catch(e){}
          }
          
          if (domain) blacklistedDomains.push(domain);
          if (place.phone) blacklistedPhones.push(place.phone);

          if (weblessOnly) {
            // Sauvegarder directement, pas besoin de deep research
            const created = await this.prisma.prospect.create({
              data: {
                tenantId: job.tenantId,
                firstName: 'Inconnu',
                lastName: '',
                companyName: place.name,
                jobTitle: 'Dirigeant',
                phone: place.phone,
                source: 'GOOGLE_PLACES',
                researchJobId: jobId,
                enrichmentData: {
                  companyAddress: place.address,
                  googleMapsUrl: place.googleMapsUrl,
                  rating: place.rating
                }
              }
            });
            if (job.listId) {
              await this.prisma.prospectListEntry.create({
                data: { prospectId: created.id, prospectListId: job.listId }
              }).catch(() => {});
            }
            await this.prisma.researchJob.update({
              where: { id: jobId },
              data: { processedCount: { increment: 1 } }
            });
          } else {
            // Envoyer à deep-research-company pour trouver le dirigeant et l'email
            await this.researchQueue.add('deep-research-company', {
              researchJobId: jobId,
              tenantId: job.tenantId,
              listId: job.listId,
              companyName: place.name,
              domain: domain || 'inconnu.com', // fallback pour que le job ne crashe pas
              sourcePrompt: job.prompt
            });
          }
        }

        foundCount += validPlaces.length;

        await this.prisma.researchJob.update({
          where: { id: jobId },
          data: {
            foundCount,
            blacklistedDomains
          }
        });

        // Pause API rate limits
        await new Promise(r => setTimeout(r, 2000));

      } catch (error: any) {
        this.logger.error(`[Job ${jobId}] Erreur pendant la recherche "${query}": ${error.message}`);
      }
    } // End of queries loop
  } // End of while loop

    // Mark as completed
    await this.prisma.researchJob.update({
      where: { id: jobId },
      data: { status: 'COMPLETED' }
    });
    
    this.logger.log(`Job ${jobId} finished sourcing loop.`);
  }
}
