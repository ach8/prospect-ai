// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { generateText, tool, zodSchema, stepCountIs, hasToolCall } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod/v4';
import { EmailDiscoveryService } from './email-discovery.service';
import { GooglePlacesService } from './google-places.service';
import { WebScraperService } from './web-scraper.service';
import { OpenDataService } from './open-data.service';
import { WebSearchAgentService } from './web-search-agent.service';

export interface EnrichmentOptions {
  findEmail?: boolean;
  findPhone?: boolean;
  findDirectorName?: boolean;
  findLinkedin?: boolean;
  findWebsite?: boolean;
}

@Injectable()
export class DataEnrichmentAgentService {
  private readonly logger = new Logger(DataEnrichmentAgentService.name);

  constructor(
    private readonly emailDiscovery: EmailDiscoveryService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly webScraperService: WebScraperService,
    private readonly openDataService: OpenDataService,
    private readonly webSearchService: WebSearchAgentService,
  ) {}

  async enrichRow(rowData: any, options: EnrichmentOptions) {
    this.logger.log(`Démarrage de l'agent d'enrichissement pour la ligne: ${JSON.stringify(rowData)}`);

    try {
      const result = await generateText({
        model: google('gemini-2.5-pro'),
        system: `Tu es un expert mondial en enrichissement de données B2B (Data Enrichment).
        L'utilisateur te fournit une ligne de données incomplètes issue d'un fichier CSV (sous forme de JSON).
        Ton but est de trouver les informations manquantes demandées, et UNIQUEMENT ces informations, de manière la plus précise possible, en utilisant tes outils et ta capacité de recherche.
        
        RÈGLES :
        1. Utilise "searchLocalBusinesses" pour trouver un site web ou un téléphone si l'entreprise est locale.
        2. Utilise "searchCompanyRegistry" pour trouver le nom du dirigeant légal en France.
        3. Utilise "readWebsiteContent" si tu as trouvé un site web. Regarde PARTICULIÈREMENT la page Contact, À propos, ou Équipe. 
           Si tu trouves un email sur le site, NOTE-LE pour l'utiliser dans finishEnrichment.
        4. Utilise "searchTheWeb" pour faire une recherche générale sur internet, par exemple pour trouver un profil LinkedIn, un email professionnel publié, ou un site web si les autres outils échouent.
        5. Si l'option "findEmail" est vraie :
           a) D'abord, cherche un email sur le site web (page contact) et via la recherche Google.
           b) Ensuite, appelle TOUJOURS "discoverEmail" avec le prénom, le nom et le domaine trouvés. Cet outil vérifie par SMTP si l'email existe réellement.
           c) Si discoverEmail retourne un résultat avec confidence >= 70, utilise cet email. Sinon, utilise l'email trouvé sur le site web.
        6. Dans "finishEnrichment", remplis "emailConfidence" avec le score de confiance retourné par discoverEmail (99 = vérifié SMTP, 70 = générique vérifié, 50 = catch-all).
        7. Quand tu as terminé tes recherches, tu DOIS appeler l'outil "finishEnrichment" avec les données finales. Ne renvoie pas de texte, utilise uniquement l'outil "finishEnrichment" pour conclure.`,
        prompt: `Voici les données de la ligne à enrichir :
        ${JSON.stringify(rowData, null, 2)}
        
        Tu dois trouver les informations suivantes :
        ${options.findEmail ? '- Email valide du dirigeant ou contact principal' : ''}
        ${options.findPhone ? '- Numéro de téléphone de l\'entreprise' : ''}
        ${options.findDirectorName ? '- Prénom, nom et poste du dirigeant' : ''}
        ${options.findWebsite ? '- URL du site web de l\'entreprise' : ''}
        ${options.findLinkedin ? '- URL du profil LinkedIn du dirigeant ou de l\'entreprise' : ''}
        
        Utilise tes outils pour enquêter, puis appelle "finishEnrichment" avec le résultat final.`,
        stopWhen: hasToolCall('finishEnrichment'),
        tools: {
          searchLocalBusinesses: tool({
            description: "Recherche des informations sur une entreprise locale sur Google Maps (Adresse, Téléphone, Website).",
            inputSchema: zodSchema(z.object({
              query: z.string().describe("Nom de l'entreprise + ville (ex: 'Boulangeries à Nantes')"),
            })),
            execute: async ({ query }) => {
              const businesses = await this.googlePlacesService.searchBusinesses(query, 1);
              return JSON.stringify(businesses);
            },
          }),
          readWebsiteContent: tool({
            description: "Aspire le code texte brut d'une page web.",
            inputSchema: zodSchema(z.object({
              url: z.string().describe("L'URL complète à analyser"),
            })),
            execute: async ({ url }) => {
              const text = await this.webScraperService.scrapeWebsite(url);
              return text.substring(0, 5000);
            },
          }),
          searchCompanyRegistry: tool({
            description: "Recherche une entreprise dans la base OpenData Sirene Française pour trouver le dirigeant légal.",
            inputSchema: zodSchema(z.object({
              query: z.string().describe("Nom de l'entreprise"),
            })),
            execute: async ({ query }) => {
              const data = await this.openDataService.searchCompany(query);
              return JSON.stringify(data);
            },
          }),
          searchTheWeb: tool({
            description: "Effectue une recherche générale sur internet (Google) pour trouver n'importe quelle information, un profil LinkedIn, un article, un dirigeant, etc.",
            inputSchema: zodSchema(z.object({
              query: z.string().describe("La requête de recherche exacte (ex: 'CEO de l'entreprise X LinkedIn')"),
            })),
            execute: async ({ query }) => {
              const textResult = await this.webSearchService.answerQuery(query);
              return textResult;
            },
          }),
          discoverEmail: tool({
            description: "Découvre l'email d'une personne via vérification SMTP. Teste 14 formats personnels (prenom.nom@, pnom@, etc.), puis 7 emails génériques (contact@, info@, direction@). Retourne l'email trouvé avec un score de confiance: 99=vérifié SMTP, 70=email générique vérifié, 50=catch-all.",
            inputSchema: zodSchema(z.object({
              firstName: z.string().describe("Prénom de la personne"),
              lastName: z.string().describe("Nom de famille de la personne"),
              domain: z.string().describe("Nom de domaine de l'entreprise (ex: acme.com, PAS l'URL complète)"),
            })),
            execute: async ({ firstName, lastName, domain }) => {
              // Nettoyer le domaine au cas où l'IA passe l'URL complète
              const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
              const result = await this.emailDiscovery.findValidEmail(firstName, lastName, cleanDomain);
              if (result) {
                return JSON.stringify({
                  email: result.email,
                  confidence: result.confidence,
                  source: result.source,
                  isValid: result.isValid,
                  isCatchAll: result.isCatchAll,
                });
              }
              return "Aucun email trouvé. Aucune des 21 permutations testées n'a été acceptée par le serveur SMTP.";
            },
          }),
          finishEnrichment: tool({
            description: "Outil à appeler obligatoirement à la fin pour renvoyer les données enrichies.",
            inputSchema: zodSchema(z.object({
              companyName: z.string().optional(),
              website: z.string().optional(),
              firstName: z.string().optional(),
              lastName: z.string().optional(),
              jobTitle: z.string().optional(),
              email: z.string().optional(),
              emailConfidence: z.number().optional(),
              phone: z.string().optional(),
              linkedinUrl: z.string().optional(),
            })),
            execute: async (data) => {
              return "Données enregistrées avec succès. Tu peux maintenant terminer la conversation.";
            },
          })
        },
      });

      // DEBUG: log complet du résultat
      this.logger.log(`=== RESULT DEBUG ===`);
      this.logger.log(`Text: "${result.text?.substring(0, 200)}"`);
      this.logger.log(`Steps count: ${result.steps?.length}`);
      this.logger.log(`Finish reason: ${result.finishReason}`);
      if (result.steps) {
        result.steps.forEach((step, i) => {
          this.logger.log(`Step ${i}: finishReason=${step.finishReason}, toolCalls=${step.toolCalls?.length || 0}, text="${step.text?.substring(0, 100)}"`);
          step.toolCalls?.forEach(tc => {
            this.logger.log(`  Tool: ${tc.toolName}, args=${JSON.stringify(tc.args)}, input=${JSON.stringify((tc as any).input)}`);
          });
        });
      }
      this.logger.log(`=== END DEBUG ===`);

      // On cherche si l'outil finishEnrichment a été appelé dans les étapes
      let finalData = null;
      if (result.steps) {
        for (const step of result.steps) {
          if (step.toolCalls) {
            for (const tc of step.toolCalls) {
              if (tc.toolName === 'finishEnrichment') {
                finalData = tc.args || (tc as any).input || {};
              }
            }
          }
        }
      }

      if (finalData) {
        return {
          success: true,
          data: finalData,
          stepsTaken: result.steps?.length || 1,
        };
      } else {
        this.logger.error("L'IA n'a pas appelé l'outil finishEnrichment.");
        return {
          success: false,
          data: null,
          error: "L'IA a répondu: " + (result.text || "Aucun texte retourné"),
          rawText: result.text
        };
      }

    } catch (error: any) {
      this.logger.error(`Erreur lors de l'enrichissement: ${error.message}`);
      throw error;
    }
  }
}
