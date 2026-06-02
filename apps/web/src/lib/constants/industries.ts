export const INDUSTRIES = [
  "Logiciel & IT (SaaS, Tech)",
  "E-commerce & Retail",
  "Agences (Marketing, Web, SEO)",
  "Immobilier & Proptech",
  "Finance & Assurance",
  "Santé & Bien-être",
  "Éducation & Formation",
  "Industrie & Production",
  "BTP & Construction",
  "Services aux entreprises (Conseil, RH, Juridique)",
  "Transport & Logistique",
  "Hôtellerie & Restauration",
  "Autre"
] as const;

export type Industry = typeof INDUSTRIES[number];
