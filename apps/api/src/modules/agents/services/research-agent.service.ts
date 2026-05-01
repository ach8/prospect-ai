// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { generateText, tool, stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod/v4';
import { EmailDiscoveryService } from './email-discovery.service';
import { ProspectsService } from '../../prospects/prospects.service';
import { GooglePlacesService } from './google-places.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WebSearchAgentService } from './web-search-agent.service';
import { EnricherAgentService } from './enricher-agent.service';

@Injectable()
export class LeadResearchAgentService {
  private readonly logger = new Logger(LeadResearchAgentService.name);

  constructor(
    private readonly emailDiscovery: EmailDiscoveryService,
    private readonly prospectsService: ProspectsService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly webSearchAgent: WebSearchAgentService,
    private readonly enricherAgent: EnricherAgentService,
    private readonly prisma: PrismaService,
  ) {}

  async runResearch(prompt: string, tenantId: string, listName?: string) {
    this.logger.log(`Démarrage de l'agent de recherche pour le tenant ${tenantId}. Prompt: "${prompt}"`);

    let targetListId: string | undefined = undefined;

    if (listName) {
      this.logger.log(`Recherche ou création du dossier de prospects: "${listName}"`);
      let list = await this.prisma.prospectList.findFirst({
        where: { tenantId, name: listName }
      });
      if (!list) {
        list = await this.prisma.prospectList.create({
          data: { tenantId, name: listName }
        });
      }
      targetListId = list.id;
    }

    const foundProspects: any[] = [];
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      this.logger.log(`[Tentative ${attempts}/${MAX_ATTEMPTS}]`);

      try {
        const result = await generateText({
          model: google('gemini-2.5-flash'),
          system: `Tu es un agent de prospection B2B. Tu reçois une requête de recherche et tu dois trouver des prospects complets.

RÈGLES STRICTES :
1. Tu DOIS trouver le prénom et nom réel du dirigeant de chaque entreprise.
2. Un prospect SANS prénom/nom humain est INTERDIT.
3. Utilise les outils dans cet ordre : searchLocalBusinesses -> askWebSearchAgent -> addProspectToResults -> finishResearch.
4. Tu DOIS appeler "addProspectToResults" pour CHAQUE prospect trouvé.
5. Tu DOIS appeler "finishResearch" quand tu as terminé.
6. Si tu ne trouves pas le dirigeant d'une entreprise, passe à la suivante.`,
          prompt,
          maxSteps: 15,
          onStepFinish: (step) => {
            this.logger.log(`[Step] reason=${step.finishReason} | toolCalls=${step.toolCalls?.length || 0} | text="${(step.text || '').substring(0, 80)}"`);
          },
          tools: {
            searchLocalBusinesses: tool({
              description: "Recherche des commerces ou entreprises locales sur Google Maps.",
              inputSchema: z.object({
                query: z.string().describe("La recherche (ex: 'Boulangeries à Nantes')"),
              }),
              execute: async ({ query }) => {
                this.logger.log(`[TOOL] searchLocalBusinesses: "${query}"`);
                try {
                  const results = await this.googlePlacesService.searchBusinesses(query);
                  return typeof results === 'string' ? results : JSON.stringify(results);
                } catch (e: any) {
                  this.logger.error(`[TOOL ERROR] searchLocalBusinesses: ${e.message}`);
                  return `Erreur: ${e.message}`;
                }
              },
            }),
            askWebSearchAgent: tool({
              description: "Fait une recherche Google pour trouver des informations (dirigeant, site web, LinkedIn).",
              inputSchema: z.object({
                query: z.string().describe("La question de recherche"),
              }),
              execute: async ({ query }) => {
                this.logger.log(`[TOOL] askWebSearchAgent: "${query}"`);
                try {
                  const result = await this.webSearchAgent.answerQuery(query);
                  return result || "Aucun résultat trouvé.";
                } catch (e: any) {
                  this.logger.error(`[TOOL ERROR] askWebSearchAgent: ${e.message}`);
                  return `Erreur: ${e.message}`;
                }
              },
            }),
            askEnricherAgent: tool({
              description: "Enquête sur une entreprise via la base Sirene et son site web pour trouver les dirigeants.",
              inputSchema: z.object({
                query: z.string().describe("Nom de l'entreprise ou URL"),
              }),
              execute: async ({ query }) => {
                this.logger.log(`[TOOL] askEnricherAgent: "${query}"`);
                try {
                  const result = await this.enricherAgent.enrichCompany(query);
                  return result || "Aucune information trouvée.";
                } catch (e: any) {
                  this.logger.error(`[TOOL ERROR] askEnricherAgent: ${e.message}`);
                  return `Erreur: ${e.message}`;
                }
              },
            }),
            discoverEmail: tool({
              description: "Découvre l'email professionnel d'une personne à partir de son nom et du domaine de l'entreprise.",
              inputSchema: z.object({
                firstName: z.string(),
                lastName: z.string(),
                domain: z.string(),
              }),
              execute: async ({ firstName, lastName, domain }) => {
                this.logger.log(`[TOOL] discoverEmail: ${firstName} ${lastName} @ ${domain}`);
                try {
                  const result = await this.emailDiscovery.findValidEmail(firstName, lastName, domain);
                  if (result) return JSON.stringify(result);
                  return "Aucun email valide trouvé.";
                } catch (e: any) {
                  return `Erreur: ${e.message}`;
                }
              },
            }),
            addProspectToResults: tool({
              description: "Sauvegarde un prospect trouvé dans la liste finale.",
              inputSchema: z.object({
                firstName: z.string().describe("Prénom"),
                lastName: z.string().describe("Nom de famille"),
                jobTitle: z.string().describe("Poste"),
                companyName: z.string().describe("Nom de l'entreprise"),
                email: z.string().optional().describe("Email"),
                phone: z.string().optional(),
                linkedinUrl: z.string().optional(),
                source: z.string().describe("Source"),
                companyAddress: z.string().optional(),
                companyDescription: z.string().optional(),
              }),
              execute: async (args) => {
                const { firstName, lastName } = args;
                
                if (!firstName || !lastName || firstName.toLowerCase() === 'inconnu' || lastName.toLowerCase() === 'inconnu') {
                  this.logger.warn(`[TOOL] addProspectToResults REJETÉ: prénom/nom manquant`);
                  return "ERREUR: prénom/nom humain requis. Cherche le vrai dirigeant.";
                }

                this.logger.log(`[TOOL] ✅ addProspectToResults: ${firstName} ${lastName} (${args.companyName})`);
                foundProspects.push({
                  ...args,
                  emailVerified: false,
                });
                return `OK: ${firstName} ${lastName} ajouté. Total: ${foundProspects.length} prospect(s).`;
              },
            }),
            finishResearch: tool({
              description: "Termine la recherche et génère le rapport final.",
              inputSchema: z.object({
                summary: z.string().describe("Résumé final"),
              }),
              execute: async ({ summary }) => {
                this.logger.log(`[TOOL] finishResearch: ${foundProspects.length} prospects.`);
                if (foundProspects.length === 0) {
                  return "ERREUR: 0 prospect trouvé. Continue tes recherches!";
                }
                throw new Error(`GRACEFUL_FINISH|${summary || 'Recherche terminée.'}`);
              },
            }),
          },
        });

        this.logger.log(`[RESULT] FinishReason: ${result.finishReason} | Steps: ${result.steps?.length} | Prospects: ${foundProspects.length}`);

        if (foundProspects.length > 0) {
          return {
            success: true,
            summary: result.text || "Recherche terminée.",
            stepsTaken: result.steps?.length || 1,
            prospects: foundProspects,
            listId: targetListId,
          };
        }

        this.logger.warn(`[Tentative ${attempts}] 0 prospect. Relance...`);
      } catch (error: any) {
        if (error.message && error.message.includes("GRACEFUL_FINISH")) {
          const summary = error.message.split("|")[1];
          this.logger.log(`✅ Recherche terminée. ${foundProspects.length} prospects.`);
          return {
            success: true,
            summary,
            stepsTaken: 1,
            prospects: foundProspects,
            listId: targetListId,
          };
        }
        this.logger.error(`[Tentative ${attempts}] ERREUR: ${error.message}`);
      }
    }

    return {
      success: false,
      summary: "Désolé, la recherche n'a pas pu aboutir après plusieurs tentatives.",
      stepsTaken: attempts,
      prospects: [],
      listId: targetListId,
    };
  }
}
