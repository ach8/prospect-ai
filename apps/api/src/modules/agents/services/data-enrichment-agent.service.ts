// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { tool, stepCountIs, hasToolCall } from 'ai';
import { z } from 'zod';
import { generateTextWithGroq } from './ai-model.provider';
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
    this.logger.log(`DÃƒÂ©marrage de l'agent d'enrichissement pour la ligne: ${JSON.stringify(rowData)}`);

    try {
      const result = await generateTextWithGroq({
        system: `Tu es un expert mondial en enrichissement de donnÃƒÂ©es B2B (Data Enrichment).
        L'utilisateur te fournit une ligne de donnÃƒÂ©es incomplÃƒÂ¨tes issue d'un fichier CSV (sous forme de JSON).
        Ton but est de trouver les informations manquantes demandÃƒÂ©es, et UNIQUEMENT ces informations, de maniÃƒÂ¨re la plus prÃƒÂ©cise possible, en utilisant tes outils et ta capacitÃƒÂ© de recherche.
        
        RÃƒË†GLES :
        1. Utilise "searchLocalBusinesses" pour trouver un site web ou un tÃƒÂ©lÃƒÂ©phone si l'entreprise est locale.
        2. Utilise "searchCompanyRegistry" pour trouver le nom du dirigeant lÃƒÂ©gal en France.
        3. Utilise "readWebsiteContent" uniquement pour trouver d'autres informations (comme un tÃƒÂ©lÃƒÂ©phone) si demandÃƒÂ©.
        4. Utilise "searchTheWeb" pour faire une recherche gÃƒÂ©nÃƒÂ©rale sur internet, par exemple pour trouver un profil LinkedIn ou un site web si les autres outils ÃƒÂ©chouent.
        5. Si l'option "findEmail" est vraie, appelle DIRECTEMENT ET UNIQUEMENT "discoverEmail" avec le prÃƒÂ©nom, le nom et le domaine. Ne cherche JAMAIS d'emails via Google ou readWebsiteContent (ce sont souvent des infos gÃƒÂ©nÃƒÂ©riques inutiles).
        6. Dans "finishEnrichment", remplis "emailConfidence" avec le score de confiance retournÃƒÂ© par discoverEmail (99 = vÃƒÂ©rifiÃƒÂ© SMTP, 70 = gÃƒÂ©nÃƒÂ©rique vÃƒÂ©rifiÃƒÂ©, 50 = catch-all). Ne remplis "email" que si discoverEmail a trouvÃƒÂ© quelque chose.
        7. Quand tu as terminÃƒÂ© tes recherches, tu DOIS appeler l'outil "finishEnrichment" avec les donnÃƒÂ©es finales. Ne renvoie pas de texte, utilise uniquement l'outil "finishEnrichment" pour conclure.`,
        prompt: `Voici les donnÃƒÂ©es de la ligne ÃƒÂ  enrichir :
        ${JSON.stringify(rowData, null, 2)}
        
        Tu dois trouver les informations suivantes :
        ${options.findEmail ? '- Email valide du dirigeant ou contact principal' : ''}
        ${options.findPhone ? '- NumÃƒÂ©ro de tÃƒÂ©lÃƒÂ©phone de l\'entreprise' : ''}
        ${options.findDirectorName ? '- PrÃƒÂ©nom, nom et poste du dirigeant' : ''}
        ${options.findWebsite ? '- URL du site web de l\'entreprise' : ''}
        ${options.findLinkedin ? '- URL du profil LinkedIn du dirigeant ou de l\'entreprise' : ''}
        
        Utilise tes outils pour enquÃƒÂªter, puis appelle "finishEnrichment" avec le rÃƒÂ©sultat final.`,
        stopWhen: hasToolCall('finishEnrichment'),
        tools: {
          searchLocalBusinesses: tool({
            description: "Recherche des informations sur une entreprise locale sur Google Maps (Adresse, Téléphone, Website). Attend {query}.",
            inputSchema: z.object({
              query: z.string().describe("Nom de l'entreprise et la ville (ex: 'Coiffeur Lyon', 'Noreve Saint-Tropez')")
            }),
            execute: async (args: any) => {
              const query = args.query || args.recherche || args.q || args.search || Object.values(args)[0] || '';
              const businesses = await this.googlePlacesService.searchBusinesses(query, 1);
              return JSON.stringify(businesses);
            },
          }),
          readWebsiteContent: tool({
            description: "Aspire le code texte brut d'une page web. Attend {url}.",
            inputSchema: z.object({
              url: z.string().describe("URL complète du site web à visiter (ex: 'https://www.noreve.com')")
            }),
            execute: async (args: any) => {
              const url = args.url || args.website || args.site || Object.values(args)[0] || '';
              const text = await this.webScraperService.scrapeWebsite(url);
              return text.substring(0, 5000);
            },
          }),
          searchCompanyRegistry: tool({
            description: "Recherche une entreprise dans la base OpenData Sirene Française pour trouver le dirigeant légal. Attend {query}.",
            inputSchema: z.object({
              query: z.string().describe("Nom de l'entreprise ou SIRET à rechercher")
            }),
            execute: async (args: any) => {
              const query = args.query || args.recherche || args.q || args.search || Object.values(args)[0] || '';
              const data = await this.openDataService.searchCompany(query);
              return JSON.stringify(data);
            },
          }),
          searchTheWeb: tool({
            description: "Effectue une recherche générale sur internet (Google) pour trouver n'importe quelle information, un profil LinkedIn, un article, un dirigeant, etc. Attend {query}.",
            inputSchema: z.object({
              query: z.string().describe("La requête Google Search à effectuer")
            }),
            execute: async (args: any) => {
              const query = args.query || args.recherche || args.q || args.search || Object.values(args)[0] || '';
              const textResult = await this.webSearchService.answerQuery(query);
              return textResult;
            },
          }),
          discoverEmail: tool({
            description: "Découvre l'email d'une personne via vérification SMTP. Teste 14 formats personnels (prenom.nom@, pnom@, etc.), puis 7 emails génériques (contact@, info@, direction@). Retourne l'email trouvé avec un score de confiance: 99=vérifié SMTP, 70=email générique vérifié, 50=catch-all. Attend {firstName, lastName, domain}.",
            inputSchema: z.object({
              firstName: z.string().optional().describe("Prénom du dirigeant"),
              lastName: z.string().optional().describe("Nom de famille du dirigeant"),
              domain: z.string().optional().describe("Nom de domaine du site de l'entreprise (ex: 'noreve.com')")
            }),
            execute: async (args: any) => {
              const firstName = args.firstName || args.prenom || '';
              const lastName = args.lastName || args.nom || '';
              const domain = args.domain || args.domaine || '';
              if (!firstName || !lastName || !domain) {
                return "Impossible de découvrir l'email : le prénom, le nom ou le domaine est manquant. Cherche d'abord le site web de l'entreprise si nécessaire.";
              }
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
            description: "Outil à appeler obligatoirement à la fin pour renvoyer les données enrichies. Attend {companyName, website, firstName, lastName, jobTitle, email, emailConfidence, phone, linkedinUrl}.",
            inputSchema: z.object({
              companyName: z.string().optional().describe("Nom de l'entreprise"),
              website: z.string().optional().describe("Site internet de l'entreprise"),
              firstName: z.string().optional().describe("Prénom du dirigeant/contact"),
              lastName: z.string().optional().describe("Nom du dirigeant/contact"),
              jobTitle: z.string().optional().describe("Poste occupé"),
              email: z.string().optional().describe("Adresse email trouvée"),
              emailConfidence: z.number().optional().describe("Confiance dans l'email"),
              phone: z.string().optional().describe("Numéro de téléphone trouvé"),
              linkedinUrl: z.string().optional().describe("URL du profil LinkedIn")
            }),
            execute: async (data: any) => {
              return "Données enregistrées avec succès. Tu peux maintenant terminer la conversation.";
            },
          })
        },
      });

      // DEBUG: log complet du rÃƒÂ©sultat
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

      // On cherche si l'outil finishEnrichment a ÃƒÂ©tÃƒÂ© appelÃƒÂ© dans les ÃƒÂ©tapes
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
        // Map potential French translations to standard English keys
        const mappedData = {
          companyName: finalData.companyName || finalData.nomEntreprise || '',
          website: finalData.website || finalData.siteWeb || '',
          firstName: finalData.firstName || finalData.prenom || '',
          lastName: finalData.lastName || finalData.nom || '',
          jobTitle: finalData.jobTitle || finalData.poste || '',
          email: finalData.email || '',
          emailConfidence: finalData.emailConfidence || 0,
          phone: finalData.phone || finalData.telephone || '',
          linkedinUrl: finalData.linkedinUrl || ''
        };
        return {
          success: true,
          data: mappedData,
          stepsTaken: result.steps?.length || 1,
        };
      } else {
        this.logger.error("L'IA n'a pas appelÃƒÂ© l'outil finishEnrichment.");
        return {
          success: false,
          data: null,
          error: "L'IA a rÃƒÂ©pondu: " + (result.text || "Aucun texte retournÃƒÂ©"),
          rawText: result.text
        };
      }

    } catch (error: any) {
      this.logger.error(`Erreur lors de l'enrichissement: ${error.message}`);
      throw error;
    }
  }
}
