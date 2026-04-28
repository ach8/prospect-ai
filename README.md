# 🚀 ProspectAI

**SaaS de Prospection B2B Propulsée par IA — Powered by Google Gemini**

Plateforme intelligente de prospection qui utilise un système multi-agents IA pour découvrir des prospects dans n'importe quelle niche, enrichir leurs données, et lancer des campagnes de prospection ultra-personnalisées.

## ✨ Features

- 🔍 **Découverte de Prospects** — Recherche IA multi-sources (Google Search, Places, annuaires, bases ouvertes)
- 📧 **Email Finder** — Découverte et vérification d'emails avec confidence score
- 📊 **Enrichissement** — Données entreprise, signaux, stack technique, actualités
- ✍️ **Copywriting IA** — Messages ultra-personnalisés générés par Gemini Pro
- 🎯 **Campagnes Multi-canal** — Séquences email/LinkedIn avec A/B testing
- 📈 **Analytics** — Dashboards temps réel, recommandations IA

## 🏗️ Architecture

```
prospect-ai/
├── apps/
│   ├── web/          → Next.js 15 (Frontend)
│   └── api/          → NestJS (Backend)
├── packages/
│   ├── shared/       → Types & Zod schemas
│   ├── ai-sdk/       → Gemini agent wrappers
│   ├── email-engine/ → SMTP rotation & warm-up
│   └── ui/           → Shared design system
```

## 🛠️ Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS 4, shadcn/ui |
| Backend | NestJS, Prisma, BullMQ |
| AI | Google Gemini 2.5 (Pro + Flash), Vercel AI SDK |
| Database | PostgreSQL + pgvector, Redis |
| Infra | Vercel, Railway, Supabase |

## 🚀 Getting Started

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env.local

# Push database schema
pnpm db:push

# Start development
pnpm dev
```

## 📄 License

Proprietary — All rights reserved.
