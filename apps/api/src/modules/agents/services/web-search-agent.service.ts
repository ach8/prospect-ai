import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class WebSearchAgentService {
  private readonly logger = new Logger(WebSearchAgentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Effectue une recherche web via Tavily Search API.
   * Cette méthode est hautement résistante aux blocages anti-bots.
   */
  private async searchTavily(query: string): Promise<string> {
    const apiKey = process.env.TAVILY_API_KEY || '';
    this.logger.log(`🔍 [Tavily Search] Requête : "${query}"`);

    try {
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: apiKey,
          query: query,
          search_depth: 'basic',
          include_answer: false,
          max_results: 3
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      const results = response.data.results || [];
      if (results.length === 0) {
        return 'Aucun résultat de recherche trouvé.';
      }

      return results
        .map((r: any) => `Source: ${r.url}\nTitre: ${r.title}\nContenu: ${r.content}`)
        .join('\n\n');
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message;
      this.logger.warn(`⚠️ [Tavily Search] Erreur : ${errMsg}`);
      return `Erreur Tavily lors de la recherche : ${errMsg}`;
    }
  }

  /**
   * Enregistre une tâche AgentTask dans la base de données pour alerter le tableau de bord
   * que les quotas de tous les modèles Groq sont épuisés (429).
   */
  private async triggerQuotaExhaustedAlert(errorMsg: string) {
    this.logger.error(`🚨 [CRITICAL ALERT] Tous les quotas de modèles Groq sont épuisés !`);
    try {
      const tenant = await this.prisma.tenant.findFirst();
      const tenantId = tenant ? tenant.id : 'system';

      await this.prisma.agentTask.create({
        data: {
          tenantId,
          agentName: '⚠️ ALERTE : QUOTA GROQ ATTEINT',
          status: 'FAILED',
          input: { error: 'Tous les modèles de secours ont été épuisés (429 Rate Limit).' },
          error: `Tous les modèles Groq de secours ont renvoyé des erreurs de limite/quota. Détail de la dernière erreur : ${errorMsg}`
        }
      });
      this.logger.log(`✅ Alerte système enregistrée en base de données pour le tenant : ${tenantId}`);
    } catch (dbErr: any) {
      this.logger.error(`❌ Impossible d'enregistrer l'alerte système en base : ${dbErr.message}`);
    }
  }

  /**
   * Interroge Groq avec une cascade de modèles de secours (Failover Chain)
   * pour résister aux erreurs de quotas (429).
   */
  private async queryGroqWithFailover(
    systemPrompt: string,
    prompt: string,
    responseFormatJson = false
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY || '';
    
    // Ordre de bascule approuvé (basé sur les capacités et limites utilisateur)
    const models = [
      'llama-3.3-70b-versatile',                  // Principal (très intelligent, 1K RPD)
      'qwen/qwen3-32b',                           // Secondaire (intelligent et rapide, 1K RPD)
      'meta-llama/llama-4-scout-17b-16e-instruct',// Tertiaire (Llama 4 Scout, 1K RPD)
      'llama-3.1-8b-instant',                     // Fallback haut volume (14.4K RPD)
      'allam-2-7b',                               // Fallback additionnel (7K RPD)
      'openai/gpt-oss-120b',                      // Fallback optionnel (1K RPD)
      'openai/gpt-oss-20b'                        // Fallback optionnel (1K RPD)
    ];

    let lastErrorMsg = 'Aucune erreur enregistrée';

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      this.logger.log(`[Groq Failover] (${i + 1}/${models.length}) Tentative avec le modèle : ${model}`);

      try {
        const payload: any = {
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1
        };

        if (responseFormatJson) {
          payload.response_format = { type: 'json_object' };
        }

        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          payload,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 25000
          }
        );

        const content = response.data.choices[0].message.content.trim();
        this.logger.log(`✅ Succès avec le modèle : ${model}`);
        return content;
      } catch (err: any) {
        const status = err.response?.status;
        const errMsg = err.response?.data?.error?.message || err.message;
        lastErrorMsg = errMsg;
        this.logger.warn(`⚠️ Échec du modèle ${model} (Statut ${status || 'inconnu'}): ${errMsg}`);

        // Détection de quota / surcharge (429) ou autre erreur de limite
        if (status === 429 || errMsg.toLowerCase().includes('limit') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('exhausted')) {
          this.logger.warn(`🔄 Limite ou Quota atteint pour ${model}. Basculement automatique...`);
          
          // Petite pause avant le basculement si c'est un Rate Limit temporaire
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // Dans le cas de toute autre erreur, on tente quand même la bascule par précaution
        this.logger.warn(`🔄 Erreur inattendue sur ${model}. Tentative sur le modèle de secours...`);
      }
    }

    // Si on arrive ici, tous les modèles de secours ont échoué
    const fatalError = `Tous les modèles Groq de secours ont échoué. Dernière erreur : ${lastErrorMsg}`;
    await this.triggerQuotaExhaustedAlert(lastErrorMsg);
    throw new Error(fatalError);
  }

  /**
   * Interroge l'agent pour répondre à une question générale de recherche web.
   */
  async answerQuery(query: string): Promise<string> {
    this.logger.log(`WebSearchAgent interroge Tavily + Groq pour : "${query}"`);

    try {
      const searchResults = await this.searchTavily(query);

      const systemPrompt = `Tu es un assistant de recherche web expert.
      Tu as accès à des données de recherche web en temps réel. Utilise-les systématiquement pour trouver la réponse exacte.
      Sois extrêmement précis. Ne fais pas de phrases à rallonge. Donne les faits, les noms, les URLs ou les profils LinkedIn que tu trouves.
      Si l'utilisateur cherche un dirigeant, trouve son prénom, nom et lien LinkedIn officiel.
      Si l'utilisateur cherche un profil LinkedIn, donne l'URL exacte du profil (https://www.linkedin.com/in/...).`;

      const promptText = `Question de l'utilisateur : "${query}"
      
      Données de recherche en temps réel :
      ${searchResults}`;

      return await this.queryGroqWithFailover(systemPrompt, promptText, false);
    } catch (error: any) {
      this.logger.error(`❌ Échec définitif du WebSearchAgent (answerQuery) : ${error.message}`);
      return `Impossible de trouver l'information via la recherche web : ${error.message}`;
    }
  }

  /**
   * Trouve l'adresse email professionnelle d'une personne spécifique.
   */
  async findPersonalEmail(
    firstName: string,
    lastName: string,
    companyName: string,
    domain: string,
    linkedinUrl?: string
  ): Promise<string | null> {
    this.logger.log(`WebSearchAgent interroge Tavily + Groq pour l'email de : ${firstName} ${lastName} @ ${companyName} (${domain})`);

    const promptText = linkedinUrl 
      ? `Find corporate email contact of "${firstName} ${lastName}" working at "${companyName}" (domain: ${domain}) linkedin profile: ${linkedinUrl}`
      : `Find corporate email contact of "${firstName} ${lastName}" working at "${companyName}" (domain: ${domain})`;

    try {
      const searchResults = await this.searchTavily(promptText);

      const systemPrompt = `Tu es un expert mondial en OSINT (Open Source Intelligence) et en recherche B2B.
      Ta mission est de trouver l'adresse email PROFESSIONNELLE et NOMINATIVE de la personne spécifiée à partir des résultats de recherche.
      
      RÈGLES STRICTES :
      1. Tu dois chercher un email qui appartient personnellement à cette personne (ex: prenom.nom@entreprise.com, p.nom@entreprise.com, prenom@entreprise.com).
      2. TU NE DOIS JAMAIS renvoyer d'email générique comme contact@, info@, hello@, support@, direction@.
      3. Si tu trouves l'email nominatif exact de la personne dans les résultats de recherche, réponds UNIQUEMENT l'adresse email. Rien d'autre. Pas de phrases.
      4. Si tu n'es pas absolument certain ou si tu ne trouves rien de nominatif, réponds EXACTEMENT : "NON_TROUVE".
      5. Vérifie bien que le nom de domaine correspond à l'entreprise demandée.`;

      const userPrompt = `Prospect : ${firstName} ${lastName}
      Entreprise : ${companyName}
      Domaine : ${domain}
      ${linkedinUrl ? `Profil LinkedIn : ${linkedinUrl}` : ''}
      
      Données de recherche web :
      ${searchResults}`;

      const response = await this.queryGroqWithFailover(systemPrompt, userPrompt, false);
      const cleaned = response.trim();
      this.logger.log(`Réponse Groq pour l'email de ${firstName} ${lastName} : "${cleaned}"`);

      if (cleaned === 'NON_TROUVE' || cleaned.includes('NON_TROUVE') || cleaned.includes(' ')) {
        return null;
      }

      // Validation basique par regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(cleaned) && !cleaned.startsWith('contact@') && !cleaned.startsWith('info@') && !cleaned.startsWith('hello@')) {
        return cleaned.toLowerCase();
      }

      return null;
    } catch (error: any) {
      this.logger.error(`❌ Échec définitif Groq WebSearch (Email) : ${error.message}`);
      return null;
    }
  }

  /**
   * Trouve le pattern/format d'email d'une entreprise donnée.
   */
  async findEmailPattern(domain: string, companyName: string): Promise<string | null> {
    this.logger.log(`🔍 [Pattern] Recherche du format d'email pour ${companyName} (${domain}) via Tavily + Groq`);

    try {
      const searchResults = await this.searchTavily(`email pattern format formula domain "${domain}" OR "${companyName}"`);

      const systemPrompt = `Tu es un expert OSINT spécialisé dans la découverte de formats d'emails professionnels.
      Ta mission est UNIQUEMENT de trouver le FORMAT/PATTERN d'email utilisé par l'entreprise donnée à partir des données de recherche fournies.
      
      RÈGLES STRICTES :
      1. Renseigne-toi sur le format d'email de l'entreprise (ex: prenom.nom, p.nom, prenom, nom.prenom).
      2. Rends uniquement le format, par exemple : "prenom.nom", "p.nom", "prenom", "nom.prenom".
      3. Ne donne aucune explication, aucun email complet. Juste le format SANS le @domaine.
      4. Si tu n'es pas certain, réponds EXACTEMENT : "NON_TROUVE".`;

      const userPrompt = `Quel est le format d'email utilisé par l'entreprise "${companyName}" avec le domaine "${domain}" ?
      
      Données de recherche web :
      ${searchResults}`;

      const response = await this.queryGroqWithFailover(systemPrompt, userPrompt, false);
      const cleaned = response.trim().toLowerCase();
      this.logger.log(`[Pattern] Réponse Groq : "${cleaned}"`);

      if (cleaned.includes('non_trouve') || cleaned.length > 30) {
        return null;
      }

      // Patterns valides reconnus
      const knownPatterns = ['prenom.nom', 'p.nom', 'prenom', 'nom', 'nom.prenom', 'prenomnom', 'n.prenom', 'prenom_nom', 'pnom'];
      const matched = knownPatterns.find(p => cleaned.includes(p));
      return matched || null;
    } catch (error: any) {
      this.logger.error(`❌ [Pattern] Échec définitif Groq : ${error.message}`);
      return null;
    }
  }
}
