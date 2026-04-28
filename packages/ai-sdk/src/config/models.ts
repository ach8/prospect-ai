import { google } from '@ai-sdk/google';

// ============================================
// Gemini Model Configuration
// ============================================

/**
 * Gemini 2.5 Flash — Fast, cost-effective model
 * Used for: Research Agent, Email Finder, Orchestrator, Analytics
 * Cost: ~$0.15/1M input tokens
 */
export const geminiFlash = (options?: { useSearchGrounding?: boolean }) =>
  google('gemini-2.5-flash', {
    useSearchGrounding: options?.useSearchGrounding ?? false,
  });

/**
 * Gemini 2.5 Pro — Advanced reasoning model
 * Used for: Copywriter Agent, Enrichment Agent
 * Cost: ~$1.25/1M input tokens
 */
export const geminiPro = (options?: { useSearchGrounding?: boolean }) =>
  google('gemini-2.5-pro', {
    useSearchGrounding: options?.useSearchGrounding ?? false,
  });

export interface AgentConfig {
  /** Max number of tool-call iterations before stopping */
  maxSteps: number;
  /** Temperature for generation (0 = deterministic, 1 = creative) */
  temperature: number;
  /** Language for responses */
  language: string;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxSteps: 10,
  temperature: 0.3,
  language: 'fr',
};
