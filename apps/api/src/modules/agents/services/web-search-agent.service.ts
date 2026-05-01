import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

@Injectable()
export class WebSearchAgentService {
  private readonly logger = new Logger(WebSearchAgentService.name);

  async answerQuery(query: string): Promise<string> {
    this.logger.log(`WebSearchAgent interroge Google pour : "${query}"`);

    try {
      const result = await generateText({
        model: google('gemini-2.5-flash'),
        system: `Tu es un assistant de recherche web expert.
        Tu as accès à Google Search en temps réel. Utilise-le systématiquement pour trouver la réponse exacte à la question de l'utilisateur.
        Sois extrêmement précis. Ne fais pas de phrases à rallonge. Donne les faits, les noms, les URLs ou les profils LinkedIn que tu trouves.
        Si l'utilisateur cherche un dirigeant, trouve son prénom, nom et lien LinkedIn officiel.
        Si l'utilisateur cherche un profil LinkedIn, donne l'URL exacte du profil (https://www.linkedin.com/in/...).`,
        prompt: query,
        tools: {
          google_search: google.tools.googleSearch({}),
        },
      });

      this.logger.log(`Réponse du WebSearchAgent reçue.`);
      return result.text;
    } catch (error: any) {
      this.logger.error(`Erreur du WebSearchAgent : ${error.message}`);
      return `Impossible de trouver l'information via la recherche web native : ${error.message}`;
    }
  }
}
