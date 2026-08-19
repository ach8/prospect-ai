import { createGroq } from '@ai-sdk/groq';
import { generateText, generateObject, GenerateTextResult, GenerateObjectResult } from 'ai';

// Client Groq officiel
export const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY || '',
});

// Chaîne de secours pour les requêtes textuelles
export const GROQ_TEXT_MODELS = [
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
];

// Modèles de vision pour les audits visuels d'images
export const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

/**
 * Wrapper de generateText avec gestion automatique du failover sur Groq.
 * Si un modèle renvoie une erreur de type 429 (rate limit), on bascule sur le suivant.
 */
export async function generateTextWithGroq(
  params: any,
  isVision: boolean = false
): Promise<any> {
  const models = isVision ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS;
  let lastError: any = null;

  for (const modelName of models) {
    try {
      return await generateText({
        ...params,
        model: groq(modelName),
      });
    } catch (error: any) {
      lastError = error;
      const isRateLimit = 
        error?.status === 429 || 
        error?.statusCode === 429 || 
        error?.message?.includes('429') ||
        error?.message?.toLowerCase().includes('rate limit') ||
        error?.message?.toLowerCase().includes('limit reached') ||
        error?.message?.toLowerCase().includes('limit') ||
        error?.message?.toLowerCase().includes('tpm') ||
        error?.message?.toLowerCase().includes('tpd') ||
        error?.message?.toLowerCase().includes('too large') ||
        error?.message?.toLowerCase().includes('rate_limit') ||
        error?.message?.toLowerCase().includes('rate-limited') ||
        error?.message?.toLowerCase().includes('quota');
      if (isRateLimit) {
        console.warn(`[Groq Failover] Rate-limited/Quota/TPM atteint sur ${modelName}. Tentative avec le modèle de secours...`);
        continue;
      }
      throw error; // Erreur de syntaxe/paramètres : arrêt immédiat
    }
  }
  throw lastError;
}

/**
 * Wrapper de generateObject avec gestion automatique du failover sur Groq.
 */
export async function generateObjectWithGroq<T = any>(
  params: any,
  isVision: boolean = false
): Promise<any> {
  const models = isVision ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS;
  let lastError: any = null;

  for (const modelName of models) {
    try {
      return await generateObject({
        ...params,
        model: groq(modelName),
      }) as GenerateObjectResult<T>;
    } catch (error: any) {
      lastError = error;
      const isRateLimit = 
        error?.status === 429 || 
        error?.statusCode === 429 || 
        error?.message?.includes('429') ||
        error?.message?.toLowerCase().includes('rate limit') ||
        error?.message?.toLowerCase().includes('limit reached') ||
        error?.message?.toLowerCase().includes('limit') ||
        error?.message?.toLowerCase().includes('tpm') ||
        error?.message?.toLowerCase().includes('tpd') ||
        error?.message?.toLowerCase().includes('too large') ||
        error?.message?.toLowerCase().includes('rate_limit') ||
        error?.message?.toLowerCase().includes('rate-limited') ||
        error?.message?.toLowerCase().includes('quota');
      if (isRateLimit) {
        console.warn(`[Groq Failover] Rate-limited/Quota/TPM atteint sur ${modelName}. Tentative avec le modèle de secours...`);
        continue;
      }
      throw error; // Erreur de syntaxe/paramètres : arrêt immédiat
    }
  }
  throw lastError;
}
