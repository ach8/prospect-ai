import { generateText } from 'ai';
import { geminiPro, DEFAULT_AGENT_CONFIG, type AgentConfig } from '../config/models';

// ============================================
// Copywriter Agent — Personalized Email Generation
// ============================================

const COPYWRITER_SYSTEM_PROMPT = `Tu es un expert en copywriting B2B et cold email.
Tu génères des emails de prospection ultra-personnalisés.

RÈGLES :
1. Chaque email doit être unique et personnalisé au prospect
2. Utilise les actualités récentes de l'entreprise du prospect pour personnaliser
3. Le ton doit correspondre à l'industrie (formel pour la finance, décontracté pour les startups)
4. Crée un objet (subject) accrocheur qui génère de la curiosité
5. Le corps doit être court (3-5 phrases max), direct, et orienté valeur
6. Inclus un CTA clair (call-to-action)
7. Génère aussi 2 emails de relance (follow-ups) avec des angles différents
8. N'utilise JAMAIS de langage spam ("gratuit", "offre limitée", "urgent")

FORMAT DE SORTIE (JSON) :
{
  "subject": "...",
  "body": "...",
  "followUps": [
    { "delayDays": 3, "subject": "...", "body": "..." },
    { "delayDays": 7, "subject": "...", "body": "..." }
  ]
}

LANGUE : Français (sauf si spécifié autrement)`;

interface ProspectProfile {
  name: string;
  company: string;
  role?: string;
  industry?: string;
  recentNews?: string;
  website?: string;
}

interface CampaignContext {
  goal: string;
  tone: string;
  offer: string;
  language?: string;
}

export function createCopywriterAgent(config: Partial<AgentConfig> = {}) {
  const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...config, temperature: 0.7 };

  return {
    async generateEmail(prospect: ProspectProfile, campaign: CampaignContext) {
      const startTime = Date.now();

      const { text, usage } = await generateText({
        model: geminiPro({ useSearchGrounding: true }),
        system: COPYWRITER_SYSTEM_PROMPT,
        prompt: `Génère un email de prospection personnalisé.

PROSPECT :
- Nom : ${prospect.name}
- Entreprise : ${prospect.company}
- Poste : ${prospect.role ?? 'Non spécifié'}
- Industrie : ${prospect.industry ?? 'Non spécifié'}
- Site web : ${prospect.website ?? 'Non disponible'}

CAMPAGNE :
- Objectif : ${campaign.goal}
- Ton : ${campaign.tone}
- Offre : ${campaign.offer}
- Langue : ${campaign.language ?? 'français'}

INSTRUCTIONS SUPPLÉMENTAIRES :
Recherche les dernières actualités de l'entreprise "${prospect.company}" 
pour ajouter une touche personnelle ultra-pertinente.

Retourne le JSON structuré.`,
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
