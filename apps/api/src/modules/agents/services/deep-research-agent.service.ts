// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { generateTextWithGroq } from './ai-model.provider';
import { WebSearchAgentService } from './web-search-agent.service';

@Injectable()
export class DeepResearchAgentService {
  private readonly logger = new Logger(DeepResearchAgentService.name);

  constructor(private readonly webSearchService: WebSearchAgentService) {}

  async runDeepResearch(prospectInfo: any): Promise<string | null> {
    const { firstName, lastName, companyName, industry, linkedinUrl, companyDomain } = prospectInfo;

    this.logger.log(`Lancement de Deep Research pour: ${firstName} ${lastName} @ ${companyName}`);

    let promptText = `Recherche des informations factuelles sur l'entreprise du prospect en explorant principalement son site web (dÃƒÂ©duit du domaine ou de l'email).

PROSPECT:
- Nom : ${firstName} ${lastName}
- Entreprise : ${companyName}
- Domaine / Site Web : ${companyDomain || 'Inconnu'}
- Secteur : ${industry || 'Inconnu'}
`;

    if (linkedinUrl) {
      promptText += `- Profil LinkedIn : ${linkedinUrl}\n\n`;
    }

    promptText += `TA MISSION :
1. Va sur le site web de l'entreprise (ou cherche-le sur Google si le domaine n'est pas fourni).
2. RÃƒÂ©sume EXACTEMENT ce que fait l'entreprise : quels sont ses produits/services phares ?
3. Quelle est sa cible client principale ?
4. Trouve 1 ou 2 actualitÃƒÂ©s rÃƒÂ©centes ou faits marquants.
5. S'il y a des infos intÃƒÂ©ressantes sur le profil LinkedIn de la personne, ajoute-les.

IMPORTANT : NE gÃƒÂ©nÃƒÂ¨re PAS de "Pain points", "Icebreakers" ou de propositions commerciales. Contente-toi de fournir un rapport factuel, dense et prÃƒÂ©cis sur l'entreprise et la personne.`;

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await generateTextWithGroq({
          system: `Tu es un expert en OSINT B2B. Ta mission est d'extraire des donnÃƒÂ©es factuelles pures depuis le web. Tu as accÃƒÂ¨s ÃƒÂ  Google Search. 
          RÃƒÂ©dige un rapport ultra-concis (bullet points) avec les faits trouvÃƒÂ©s (Ce qu'ils font, Cible, ActualitÃƒÂ©s).`,
          prompt: promptText,
          tools: {
            google_search: tool({
              description: 'Search Google for web results.',
              inputSchema: z.object({
                query: z.string().describe("La requête précise à rechercher sur Google/Tavily")
              }),
              execute: async (args: any) => {
                const q = args?.query || args?.q || args?.search || args?.recherche || Object.values(args)[0] || '';
                return await this.webSearchService.answerQuery(q);
              },
            }),
          },
        });

        this.logger.log(`Deep Research terminÃƒÂ© avec succÃƒÂ¨s pour ${firstName} ${lastName}.`);
        return result.text;
      } catch (error: any) {
        this.logger.warn(`Ã¢Å¡Â Ã¯Â¸Â Erreur Deep Research (tentative ${attempt + 1}/${MAX_RETRIES + 1}): ${error.message}`);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1))); // DÃƒÂ©lai progressif
        } else {
          this.logger.error(`Ã¢ÂÅ’ Ãƒâ€°chec dÃƒÂ©finitif Deep Research : ${error.message}`);
          return null;
        }
      }
    }
    return null;
  }
}
