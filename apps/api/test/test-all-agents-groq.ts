import * as dotenv from 'dotenv';
import * as path from 'path';

// Charger les variables d'environnement
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { PrismaService } from '../src/common/prisma/prisma.service';
import { CleanerAgentService } from '../src/modules/agents/services/cleaner-agent.service';
import { DataEnrichmentAgentService } from '../src/modules/agents/services/data-enrichment-agent.service';
import { DeepResearchAgentService } from '../src/modules/agents/services/deep-research-agent.service';
import { WebSearchAgentService } from '../src/modules/agents/services/web-search-agent.service';
import { VisualAuditAgentService } from '../src/modules/agents/services/visual-audit-agent.service';

async function runAllAgentsTest() {
  console.log('==================================================');
  console.log('🧪 Test Standalone de TOUS les Agents IA avec Groq');
  console.log('   (Bypasse Upstash Redis & BullMQ)');
  console.log('==================================================\n');

  // 1. Connexion BDD
  console.log('Connexion PostgreSQL...');
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    console.log('✅ Base de données PostgreSQL connectée avec succès !\n');
  } catch (err: any) {
    console.error('❌ Échec de connexion base de données :', err.message);
    process.exit(1);
  }

  // 2. Instanciation des Services
  console.log('Instanciation des services en cours...');
  const webSearchService = new WebSearchAgentService(prisma);
  const deepResearchAgent = new DeepResearchAgentService(webSearchService);
  
  // Mocks pour DataEnrichment
  const mockEmailDiscovery: any = {
    findValidEmail: async () => ({ email: 'm.massat@noreve.com', confidence: 99 })
  };
  const mockGooglePlaces: any = {
    searchBusinesses: async () => []
  };
  const mockWebScraper: any = {
    scrapeWebsite: async () => 'Noreve propose des coques de protection haut de gamme faites main à Saint-Tropez.'
  };
  const mockOpenData: any = {
    searchCompany: async () => []
  };

  const cleanerAgent = new CleanerAgentService(prisma, deepResearchAgent, null as any);
  const dataEnrichmentAgent = new DataEnrichmentAgentService(
    mockEmailDiscovery,
    mockGooglePlaces,
    mockWebScraper,
    mockOpenData,
    webSearchService
  );
  const visualAuditAgent = new VisualAuditAgentService();

  console.log('✅ Tous les agents sont instanciés avec succès !');

  // --------------------------------------------------
  // TEST 1 : CleanerAgent (generateObjectWithGroq)
  // --------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('1. Test de CleanerAgent (evaluateProspect)');
  console.log('--------------------------------------------------');
  try {
    const start = Date.now();
    const prospect = {
      firstName: 'Jean',
      lastName: 'Dupont',
      companyName: 'Dupont Technologies',
      industry: 'Technologies',
      jobTitle: 'Directeur Technique'
    };
    // Évaluer si le prospect appartient au secteur "Technologies"
    const result = await cleanerAgent.evaluateProspect(prospect, 'Technologies', false);
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`⏱️ Répondu en ${duration}s`);
    console.log('🟢 Résultat :', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('❌ Échec de CleanerAgent :', err.message);
  }

  // --------------------------------------------------
  // TEST 2 : DataEnrichmentAgent (generateTextWithGroq)
  // --------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('2. Test de DataEnrichmentAgent (enrichRow)');
  console.log('--------------------------------------------------');
  try {
    const start = Date.now();
    const row = {
      companyName: 'Noreve',
      firstName: 'Michael',
      lastName: 'Massat',
    };
    const options = {
      findEmail: true,
      findWebsite: true
    };
    const result = await dataEnrichmentAgent.enrichRow(row, options);
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`⏱️ Répondu en ${duration}s`);
    console.log('🟢 Résultat :', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('❌ Échec de DataEnrichmentAgent :', err.message);
  }

  // --------------------------------------------------
  // TEST 3 : DeepResearchAgent (Tavily search custom tool calling)
  // --------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('3. Test de DeepResearchAgent (runDeepResearch avec outil Tavily)');
  console.log('--------------------------------------------------');
  try {
    const start = Date.now();
    const prospectInfo = {
      firstName: 'Axel',
      lastName: 'Dumas',
      companyName: 'Hermès',
      companyDomain: 'hermes.com',
      industry: 'Luxe'
    };
    const result = await deepResearchAgent.runDeepResearch(prospectInfo);
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`⏱️ Répondu en ${duration}s`);
    console.log('🟢 Résultat du rapport OSINT de Deep Research :\n', result);
  } catch (err: any) {
    console.error('❌ Échec de DeepResearchAgent :', err.message);
  }

  // --------------------------------------------------
  // TEST 4 : VisualAuditAgent (Groq Vision llama-3.2-11b-vision)
  // --------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log('4. Test de VisualAuditAgent (Groq Vision llama-3.2-11b-vision-preview)');
  console.log('--------------------------------------------------');
  try {
    const start = Date.now();
    // Nous allons simuler une capture d'écran via un petit buffer transparent ou bidon de 1px
    const mockImageBuffer = Buffer.from(
      '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',
      'base64'
    );
    
    // Injecter un buffer d'image factice directement dans le module pour contourner Puppeteer
    // et tester uniquement Groq Vision
    const { generateObjectWithGroq } = require('../src/modules/agents/services/ai-model.provider');
    const { z } = require('zod');
    
    visualAuditAgent.runVisualAudit = async (url, customInstructions, campaignObjective) => {
      const missionDescription = customInstructions 
        ? `Ta mission est d'analyser la capture d'écran du site web d'une entreprise pour trouver UN goulot d'étranglement ou une friction EN TE BASANT STRICTEMENT SUR CES DIRECTIVES : "${customInstructions}".`
        : `Ta mission est d'analyser la capture d'écran du site web d'une entreprise pour trouver UN goulot d'étranglement ou une friction liée à un manque d'automatisation ou d'optimisation.`;

      const systemPrompt = `Tu es un expert en processus d'affaires, UX/UI et automatisation B2B.
${missionDescription}

Tu dois générer un objet JSON ("Variable Y" pour notre outreach) contenant 4 champs :
- page : La page exacte où se trouve le problème (ex: Accueil, Contact).
- friction : Un seul problème ciblé.
- raison : Décrire le comportement humain face à ce problème.
- consequence : Décrire la réaction en chaîne logique.`;

      const result = await generateObjectWithGroq({
        schema: z.object({
          page: z.string().describe("La page exacte du problème (ex: Accueil, Contact)"),
          friction: z.string().describe("Le problème ciblé"),
          raison: z.string().describe("La raison humaine ou le comportement face au problème"),
          consequence: z.string().describe("La mécanique de conséquence")
        }),
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyse cette capture d'écran de la page d'accueil de ${url} et identifie un point de friction.` },
              { type: 'image', image: mockImageBuffer, mimeType: 'image/png' }
            ]
          }
        ]
      }, true);

      return result.object;
    };
    
    console.log("Envoi de l'image mockée à Groq Vision...");
    // @ts-ignore
    const result = await visualAuditAgent.runVisualAudit('https://noreve.com', 'Trouver des frictions', 'Vendre des automatisations');
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`⏱️ Répondu en ${duration}s`);
    console.log('🟢 Résultat de l\'audit visuel Groq Vision :', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('❌ Échec de VisualAuditAgent :', err.message);
  }

  // Déconnexion
  await prisma.$disconnect();
  console.log('\n==================================================');
  console.log('🎉 Fin des tests globaux de tous les agents IA !');
  console.log('==================================================');
}

runAllAgentsTest().catch(console.error);
