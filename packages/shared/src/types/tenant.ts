import { z } from 'zod';

// ============================================
// Tenant & User Types (Multi-tenancy)
// ============================================

export const TenantPlanSchema = z.enum(['free', 'starter', 'pro', 'enterprise']);
export type TenantPlan = z.infer<typeof TenantPlanSchema>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  plan: TenantPlanSchema,
  aiCreditsRemaining: z.number().int().default(0),
  maxUsers: z.number().int().default(1),
  createdAt: z.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;

export const UserRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleSchema,
  avatarUrl: z.string().url().nullable(),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
