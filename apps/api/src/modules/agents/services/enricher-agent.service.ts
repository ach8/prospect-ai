// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { generateTextWithGroq } from './ai-model.provider';
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
      const result = await generateTextWithGroq({
        system: `Tu es un dÃƒÂ©tective privÃƒÂ© spÃƒÂ©cialisÃƒÂ© dans la recherche d'informations sur des entreprises.
        L'utilisateur va te donner le nom d'une entreprise ou l'URL de son site web.
        Ton seul but est de trouver le prÃƒÂ©nom, le nom et le poste exact du ou des dirigeants de cette entreprise.
        Pour cela, utilise les outils ÃƒÂ  ta disposition (Base de donnÃƒÂ©es Sirene et Aspirateur de site web).
        Sors un rapport trÃƒÂ¨s court avec juste les informations utiles trouvÃƒÂ©es.`,
        prompt: `EnquÃƒÂªte sur l'entreprise suivante : "${companyNameOrUrl}". Trouve et retourne une liste des dirigeants (CEO, Fondateurs, Directeurs). Ne cherche pas les emails, juste les noms et les postes.`,
        stopWhen: stepCountIs(5),
        tools: {
          searchCompanyRegistry: tool({
            description: "Recherche les informations légales et les noms des dirigeants officiels d'une entreprise française via la base Sirene (OpenData).",
            inputSchema: z.object({
              query: z.string().describe("Nom de l'entreprise ou SIRET")
            }),
            execute: async (args: any) => {
              const query = args.query || Object.values(args)[0] || '';
              this.logger.log(`EnricherAgent utilise OpenData pour: ${query}`);
              const results = await this.openDataService.searchCompany(query);
              return JSON.stringify(results);
            },
          }),
          readWebsiteContent: tool({
            description: "Aspire le code texte brut d'une page web. Utile pour lire la page 'À propos' ou 'Contact' d'un site web.",
            inputSchema: z.object({
              url: z.string().describe("URL du site web à visiter")
            }),
            execute: async (args: any) => {
              const url = args.url || Object.values(args)[0] || '';
              this.logger.log(`EnricherAgent aspire le site: ${url}`);
              const text = await this.webScraperService.scrapeWebsite(url);
              return text;
            },
          }),
        },
      });

      this.logger.log(`RÃƒÂ©ponse de l'EnricherAgent reÃƒÂ§ue.`);
      return result.text;
    } catch (error: any) {
      this.logger.error(`Erreur du EnricherAgent : ${error.message}`);
      return `Impossible d'enrichir cette entreprise via les bases de donnÃƒÂ©es : ${error.message}`;
    }
  }
}
