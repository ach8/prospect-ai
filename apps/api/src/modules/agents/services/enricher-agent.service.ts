// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { generateText, tool, stepCountIs, zodSchema } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod/v4';
import { OpenDataService } from './open-data.service';
import { WebScraperService } from './web-scraper.service';
import { ProspectsService } from '../../prospects/prospects.service';

@Injectable()
export class EnricherAgentService {
  private readonly logger = new Logger(EnricherAgentService.name);

  constructor(
    private readonly openDataService: OpenDataService,
    private readonly webScraperService: WebScraperService,
    private readonly prospectsService: ProspectsService,
  ) {}

  async enrichCompany(companyNameOrUrl: string): Promise<string> {
    this.logger.log(`Lancement de EnricherAgent pour: "${companyNameOrUrl}"`);

    try {
      const result = await generateText({
        model: google('gemini-2.5-flash'),
        system: `Tu es un détective privé spécialisé dans la recherche d'informations sur des entreprises.
        L'utilisateur va te donner le nom d'une entreprise ou l'URL de son site web.
        Ton seul but est de trouver le prénom, le nom et le poste exact du ou des dirigeants de cette entreprise.
        Pour cela, utilise les outils à ta disposition (Base de données Sirene et Aspirateur de site web).
        Sors un rapport très court avec juste les informations utiles trouvées.`,
        prompt: `Enquête sur l'entreprise suivante : "${companyNameOrUrl}". Trouve et retourne une liste des dirigeants (CEO, Fondateurs, Directeurs). Ne cherche pas les emails, juste les noms et les postes.`,
        stopWhen: stepCountIs(5),
        tools: {
          searchCompanyRegistry: tool({
            description: "Recherche les informations légales et les noms des dirigeants officiels d'une entreprise française via la base Sirene (OpenData).",
            inputSchema: zodSchema(z.object({
              query: z.string().describe("Le nom de l'entreprise (ex: 'LVMH' ou 'Decathlon')"),
            })),
            execute: async ({ query }) => {
              this.logger.log(`EnricherAgent utilise OpenData pour: ${query}`);
              const results = await this.openDataService.searchCompany(query);
              return JSON.stringify(results);
            },
          }),
          readWebsiteContent: tool({
            description: "Aspire le code texte brut d'une page web. Utile pour lire la page 'À propos' ou 'Contact' d'un site web.",
            inputSchema: zodSchema(z.object({
              url: z.string().describe("L'URL complète du site web (ex: https://alan.com)"),
            })),
            execute: async ({ url }) => {
              this.logger.log(`EnricherAgent aspire le site: ${url}`);
              const text = await this.webScraperService.scrapeWebsite(url);
              return text;
            },
          }),
        },
      });

      this.logger.log(`Réponse de l'EnricherAgent reçue.`);
      return result.text;
    } catch (error: any) {
      this.logger.error(`Erreur du EnricherAgent : ${error.message}`);
      return `Impossible d'enrichir cette entreprise via les bases de données : ${error.message}`;
    }
  }
}
