// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { generateTextWithGroq } from './ai-model.provider';
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

  async runResearch(prompt: string, tenantId: string, listName?: string, weblessOnly?: boolean) {
    this.logger.log(`DÃƒÂ©marrage de l'agent de recherche pour le tenant ${tenantId}. Prompt: "${prompt}"`);

    let targetListId: string | undefined = undefined;

    if (listName) {
      this.logger.log(`Recherche ou crÃƒÂ©ation du dossier de prospects: "${listName}"`);
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
        const weblessInstruction = weblessOnly ? `\n9. OBLIGATION ABSOLUE : Tu cherches EXCLUSIVEMENT des entreprises qui n'ont PAS de site web. Si Google Places retourne un "website", rejette immédiatement l'entreprise et passe à une autre.` : '';

        const result = await generateTextWithGroq({
          system: `Tu es un agent de prospection B2B. Tu reçois une requête de recherche et tu dois trouver des prospects complets.

RÈGLES STRICTES :
1. Tu DOIS trouver le prénom et nom réel du dirigeant de chaque entreprise.
2. Un prospect SANS prénom/nom humain est INTERDIT.
3. Dès que tu identifies une entreprise ou une personne potentielle, tu DOIS obligatoirement utiliser l'outil "checkInternalDatabase" avec son nom ou son entreprise. Si l'outil te répond qu'elle existe déjà, abandonne immédiatement ce prospect et cherche-en un autre.
4. Utilise les outils dans cet ordre : searchLocalBusinesses -> askWebSearchAgent -> checkInternalDatabase -> discoverEmail -> addProspectToResults -> finishResearch.
5. Tu DOIS appeler "addProspectToResults" pour CHAQUE prospect trouvé.
6. Tu DOIS appeler "finishResearch" quand tu as terminé.
7. Si tu ne trouves pas le dirigeant d'une entreprise ou s'il existe déjà, passe à la suivante.
8. Tu DOIS impérativement déduire et fournir le secteur d'activité (industry) de l'entreprise pour chaque prospect.${weblessInstruction}`,
          prompt,
          maxSteps: 15,
          onStepFinish: (step) => {
            this.logger.log(`[Step] reason=${step.finishReason} | toolCalls=${step.toolCalls?.length || 0} | text="${(step.text || '').substring(0, 100)}"`);
          },
          tools: {
            searchLocalBusinesses: tool({
              description: "Recherche des commerces ou entreprises locales sur Google Maps. Attend {query}.",
              inputSchema: z.object({
                query: z.string().describe("Le nom du commerce ou de l'entreprise recherchée et/ou sa ville")
              }),
              execute: async (args: any) => {
                const query = args.query || Object.values(args)[0] || '';
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
            checkInternalDatabase: tool({
              description: "Vérifie si une entreprise ou une personne est déjà présente dans notre base de données interne pour éviter les doublons. Attend {companyName, firstName, lastName, email}.",
              inputSchema: z.object({
                companyName: z.string().optional().describe("Nom de l'entreprise"),
                firstName: z.string().optional().describe("Prénom du prospect"),
                lastName: z.string().optional().describe("Nom de famille"),
                email: z.string().optional().describe("Adresse email")
              }),
              execute: async (args: any) => {
                const { companyName, firstName, lastName, email } = args;
                this.logger.log(`[TOOL] checkInternalDatabase: ${companyName}`);
                
                let dbProspect = null;
                if (email) {
                  dbProspect = await this.prisma.prospect.findFirst({ where: { tenantId, email } });
                }
                
                if (!dbProspect && firstName && lastName) {
                  dbProspect = await this.prisma.prospect.findFirst({
                    where: { tenantId, firstName, lastName, companyName }
                  });
                }
                
                if (!dbProspect) {
                  dbProspect = await this.prisma.prospect.findFirst({
                    where: { tenantId, companyName }
                  });
                }
                
                if (dbProspect) {
                  return `ATTENTION : Le prospect ou l'entreprise "${companyName}" existe DEJA dans la base. Ne perds pas de temps, abandonne ce prospect et cherche une autre entreprise différente.`;
                }
                return `OK : "${companyName}" n'est pas dans la base, tu peux continuer à chercher ses informations.`;
              }
            }),
            askWebSearchAgent: tool({
              description: "Fait une recherche Google pour trouver des informations (dirigeant, site web, LinkedIn). Attend {query}.",
              inputSchema: z.object({
                query: z.string().describe("La requête Google Search à effectuer")
              }),
              execute: async (args: any) => {
                const query = args.query || Object.values(args)[0] || '';
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
              description: "Enquête sur une entreprise via la base Sirene et son site web pour trouver les dirigeants. Attend {query}.",
              inputSchema: z.object({
                query: z.string().describe("Nom de l'entreprise ou URL du site web")
              }),
              execute: async (args: any) => {
                const query = args.query || Object.values(args)[0] || '';
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
              description: "Découvre l'email professionnel d'une personne à partir de son nom et du domaine de l'entreprise. Attend {firstName, lastName, domain}.",
              inputSchema: z.object({
                firstName: z.string().describe("Prénom du prospect"),
                lastName: z.string().describe("Nom de famille"),
                domain: z.string().describe("Nom de domaine (ex: entreprise.com)")
              }),
              execute: async (args: any) => {
                const { firstName, lastName, domain } = args;
                this.logger.log(`[TOOL] discoverEmail: ${firstName} ${lastName} @ ${domain}`);
                try {
                  // Pre-flight check pour éviter de lancer la découverte si déjà en base
                  const exists = await this.prisma.prospect.findFirst({
                    where: { tenantId, firstName, lastName, companyName: { contains: domain.split('.')[0] } }
                  });
                  if (exists) {
                    return `STOP : Ce prospect existe déjà dans la base. Ne dépense pas de crédits, cherche quelqu'un d'autre.`;
                  }
 
                  const result = await this.emailDiscovery.findValidEmail(firstName, lastName, domain);
                  if (result) return JSON.stringify(result);
                  return "Aucun email valide trouvé.";
                } catch (e: any) {
                  return `Erreur: ${e.message}`;
                }
              },
            }),
            addProspectToResults: tool({
              description: "Sauvegarde un prospect trouvé dans la liste finale. Attend {firstName, lastName, jobTitle, companyName, email, phone, linkedinUrl, source, companyAddress, companyDescription, industry, googleMapsUrl}.",
              inputSchema: z.object({
                firstName: z.string().optional().describe("Prénom"),
                lastName: z.string().optional().describe("Nom"),
                jobTitle: z.string().optional().describe("Poste occupé"),
                companyName: z.string().optional().describe("Nom de l'entreprise"),
                email: z.string().optional().describe("Adresse email"),
                phone: z.string().optional().describe("Numéro de téléphone"),
                linkedinUrl: z.string().optional().describe("Lien de profil LinkedIn"),
                source: z.string().optional().describe("Source du contact"),
                companyAddress: z.string().optional().describe("Adresse physique de l'entreprise"),
                companyDescription: z.string().optional().describe("Brève description de l'activité"),
                industry: z.string().optional().describe("Secteur d'activité"),
                googleMapsUrl: z.string().optional().describe("Lien Google Maps de l'entreprise")
              }),
              execute: async (args: any) => {
                const { firstName, lastName, companyName, email } = args;
                
                if (!firstName || !lastName || firstName.toLowerCase() === 'inconnu' || lastName.toLowerCase() === 'inconnu') {
                  this.logger.warn(`[TOOL] addProspectToResults REJETÉ: prénom/nom manquant`);
                  return "ERREUR: prénom/nom humain requis. Cherche le vrai dirigeant.";
                }
 
                // Déduplication finale silencieuse
                let exists = null;
                if (email) {
                   exists = await this.prisma.prospect.findFirst({ where: { tenantId, email } });
                }
                if (!exists) {
                   exists = await this.prisma.prospect.findFirst({
                     where: { tenantId, firstName, lastName, companyName }
                   });
                }
                
                if (exists) {
                   this.logger.warn(`[TOOL] addProspectToResults REJETÉ: Doublon détecté pour ${firstName} ${lastName}`);
                   return "ERREUR: Ce prospect existe déjà dans la base. Ne l'ajoute pas, trouve une autre personne ou entreprise différente.";
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
              description: "Termine la recherche et génère le rapport final. Attend {summary}.",
              inputSchema: z.object({
                summary: z.string().describe("Résumé global ou rapport succinct des prospects trouvés")
              }),
              execute: async (args: any) => {
                const summary = args.summary || Object.values(args)[0] || '';
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
            summary: result.text || "Recherche terminÃƒÂ©e.",
            stepsTaken: result.steps?.length || 1,
            prospects: foundProspects,
            listId: targetListId,
          };
        }

        this.logger.warn(`[Tentative ${attempts}] 0 prospect. Relance...`);
      } catch (error: any) {
        if (error.message && error.message.includes("GRACEFUL_FINISH")) {
          const summary = error.message.split("|")[1];
          this.logger.log(`Ã¢Å“â€¦ Recherche terminÃƒÂ©e. ${foundProspects.length} prospects.`);
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
      summary: "DÃƒÂ©solÃƒÂ©, la recherche n'a pas pu aboutir aprÃƒÂ¨s plusieurs tentatives.",
      stepsTaken: attempts,
      prospects: [],
      listId: targetListId,
    };
  }
}
