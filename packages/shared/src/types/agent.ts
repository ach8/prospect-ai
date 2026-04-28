import { z } from 'zod';

// ============================================
// AI Agent Types
// ============================================

export const AgentNameSchema = z.enum([
  'research',
  'email_finder',
  'enrichment',
  'copywriter',
  'orchestrator',
  'analytics',
]);

export type AgentName = z.infer<typeof AgentNameSchema>;

export const AgentModelSchema = z.enum([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
]);

export type AgentModel = z.infer<typeof AgentModelSchema>;

// Maps each agent to its default model
export const AGENT_MODEL_MAP: Record<AgentName, AgentModel> = {
  research: 'gemini-2.5-flash',
  email_finder: 'gemini-2.5-flash',
  enrichment: 'gemini-2.5-pro',
  copywriter: 'gemini-2.5-pro',
  orchestrator: 'gemini-2.5-flash',
  analytics: 'gemini-2.5-flash',
};

// Agent task status for tracking in job queues
export const AgentTaskStatusSchema = z.enum([
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

export const AgentTaskSchema = z.object({
  id: z.string().uuid(),
  agentName: AgentNameSchema,
  tenantId: z.string().uuid(),
  status: AgentTaskStatusSchema,
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  tokensUsed: z.number().int().default(0),
  durationMs: z.number().int().default(0),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;
