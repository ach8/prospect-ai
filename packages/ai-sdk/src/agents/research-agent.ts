import { generateText, tool } from 'ai';
import { z } from 'zod';
import { geminiFlash, DEFAULT_AGENT_CONFIG, type AgentConfig } from '../config/models';

// ============================================
// Research Agent — Prospect Discovery
// ============================================

const RESEARCH_SYSTEM_PROMPT = `Tu es un agent de recherche de prospects B2B expert.
Tu utilises la recherche Google pour découvrir des entreprises dans n'importe quelle niche.

RÈGLES DE RECHERCHE :
1. Commence par une recherche Google grounded pour identifier les entreprises
2. Si tu trouves moins de résultats que demandé, élargis ta recherche :
   - Utilise des synonymes de la niche
   - Élargis la zone géographique
   - Cherche la catégorie parente
3. Pour chaque entreprise trouvée, extrais au maximum :
   - Nom de l'entreprise
   - Site web
   - Adresse
   - Téléphone
   - Email visible publiquement
   - Secteur d'activité
4. Tu ne retournes JAMAIS "aucun résultat". Si la niche est trop spécifique,
   propose des alternatives et élargis la recherche.
5. Déduplique les résultats (même entreprise = même domaine web).
6. Retourne les résultats en JSON structuré.

LANGUE : Français`;

export function createResearchAgent(config: Partial<AgentConfig> = {}) {
  const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...config };

  return {
    async search(niche: string, location: string, count: number = 50) {
      const startTime = Date.now();

      const { text, usage } = await generateText({
        model: geminiFlash({ useSearchGrounding: true }),
        system: RESEARCH_SYSTEM_PROMPT,
        prompt: `Trouve ${count} entreprises dans la niche "${niche}" situées à/en "${location}".
        
Retourne un JSON avec la structure :
{
  "status": "success" | "partial_results",
  "found": number,
  "results": [{ "name", "website", "address", "phone", "email", "industry", "source" }],
  "suggestions": [{ "niche": "...", "estimatedCount": number }] // si résultats insuffisants
}`,
        maxSteps: agentConfig.maxSteps,
        temperature: agentConfig.temperature,
      });

      return {
        data: text,
        tokensUsed: usage?.totalTokens ?? 0,
        durationMs: Date.now() - startTime,
      };
    },
  };
}
