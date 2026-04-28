import { z } from 'zod';

// ============================================
// Campaign Types
// ============================================

export const CampaignStatusSchema = z.enum([
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'archived',
]);

export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const ChannelSchema = z.enum(['email', 'linkedin', 'sms', 'call']);
export type Channel = z.infer<typeof ChannelSchema>;

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  status: CampaignStatusSchema,
  goal: z.string(),
  tone: z.string(),
  aiConfig: z.object({
    model: z.string().default('gemini-2.5-pro'),
    useSearchGrounding: z.boolean().default(true),
    temperature: z.number().min(0).max(1).default(0.7),
    language: z.string().default('fr'),
  }),
  startDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Campaign = z.infer<typeof CampaignSchema>;

export const SequenceStepSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  stepOrder: z.number().int().min(1),
  channel: ChannelSchema,
  templateType: z.enum(['ai_generated', 'manual', 'hybrid']),
  aiPrompt: z.string().nullable(),
  delayHours: z.number().int().min(0),
});

export type SequenceStep = z.infer<typeof SequenceStepSchema>;

export const EmailEventTypeSchema = z.enum([
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'unsubscribed',
  'spam_reported',
]);

export type EmailEventType = z.infer<typeof EmailEventTypeSchema>;

export const CampaignProspectSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  prospectId: z.string().uuid(),
  status: z.enum(['pending', 'in_progress', 'contacted', 'replied', 'converted', 'failed', 'opted_out']),
  personalizedSubject: z.string().nullable(),
  personalizedBody: z.string().nullable(),
  currentStep: z.number().int().default(0),
  lastContactedAt: z.date().nullable(),
});

export type CampaignProspect = z.infer<typeof CampaignProspectSchema>;
