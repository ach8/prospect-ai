import { z } from 'zod';

// ============================================
// Prospect Types
// ============================================

export const ProspectSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().nullable(),
  emailVerified: z.boolean().default(false),
  emailConfidence: z.number().min(0).max(100).default(0),
  phone: z.string().nullable(),
  linkedinUrl: z.string().url().nullable(),
  companyName: z.string(),
  companyDomain: z.string().nullable(),
  jobTitle: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  enrichmentData: z.record(z.unknown()).nullable(),
  source: z.enum(['google_search', 'google_places', 'scraping', 'open_data', 'linkedin', 'manual']),
  createdAt: z.date(),
});

export type Prospect = z.infer<typeof ProspectSchema>;

export const CreateProspectSchema = ProspectSchema.omit({
  id: true,
  createdAt: true,
  emailVerified: true,
  emailConfidence: true,
});

export type CreateProspect = z.infer<typeof CreateProspectSchema>;

// Search request for the Research Agent
export const ProspectSearchRequestSchema = z.object({
  niche: z.string().min(1).describe('The target niche/industry to search for'),
  location: z.string().min(1).describe('Geographic location to search in'),
  count: z.number().min(1).max(500).default(50),
  filters: z.object({
    minEmployees: z.number().optional(),
    maxEmployees: z.number().optional(),
    hasWebsite: z.boolean().optional(),
    hasEmail: z.boolean().optional(),
    industries: z.array(z.string()).optional(),
  }).optional(),
});

export type ProspectSearchRequest = z.infer<typeof ProspectSearchRequestSchema>;

// Research Agent response
export const ProspectSearchResultSchema = z.object({
  status: z.enum(['success', 'partial_results', 'no_results']),
  found: z.number(),
  requested: z.number(),
  results: z.array(ProspectSchema.partial()),
  suggestions: z.array(z.object({
    niche: z.string(),
    estimatedCount: z.number(),
  })).optional(),
  actions: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
});

export type ProspectSearchResult = z.infer<typeof ProspectSearchResultSchema>;
