import { LeadResearchAgentService } from '../src/modules/agents/services/research-agent.service';
import { EmailDiscoveryService } from '../src/modules/agents/services/email-discovery.service';
import { ProspectsService } from '../src/modules/prospects/prospects.service';
import { GooglePlacesService } from '../src/modules/agents/services/google-places.service';
import { WebScraperService } from '../src/modules/agents/services/web-scraper.service';
import { OpenDataService } from '../src/modules/agents/services/open-data.service';
import { WebSearchAgentService } from '../src/modules/agents/services/web-search-agent.service';
import { EnricherAgentService } from '../src/modules/agents/services/enricher-agent.service';
import * as readline from 'readline';
import { config } from 'dotenv';

// Charger les variables d'environnement (ex: GOOGLE_GENERATIVE_AI_API_KEY)
config({ path: '.env.local' });
config({ path: '.env' });

async function run() {
  console.log('==============================================');
  console.log('🤖 ProspectAI - Test Live de l\'Agent de Recherche');
  console.log('==============================================\n');
  
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log('❌ ERREUR: GOOGLE_GENERATIVE_AI_API_KEY n\'est pas définie dans .env');
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

  try {
    const prompt = await question('Entrez votre recherche (ex: Trouve le CEO de OpenAI) :\n> ');
    rl.close();

    if (!prompt) {
      console.log('❌ Paramètre manquant.');
      return;
    }

    console.log('\n🔄 Initialisation des services...');
    
    // On instancie les vrais services, mais on va mocker la sauvegarde en BDD pour le test
    const emailDiscovery = new EmailDiscoveryService();
    const googlePlaces = new GooglePlacesService();
    const webScraper = new WebScraperService();
    const openData = new OpenDataService();
    const webSearchAgent = new WebSearchAgentService();
    const enricherAgent = new EnricherAgentService(openData, webScraper);
    const prospectsServiceMock = {
      create: async (data: any, tenantId: string) => {
        console.log(`\n[MOCK DB] 💾 Sauvegarde simulée du prospect dans la BDD :`);
        console.log(data);
        return { id: 'mock-id', ...data };
      }
    } as unknown as ProspectsService;

    const prismaMock = {
      prospectList: {
        findFirst: async () => null,
        create: async (data: any) => ({ id: 'mock-list-id', ...data.data })
      }
    } as any;

    const agent = new LeadResearchAgentService(emailDiscovery, prospectsServiceMock, googlePlaces, webSearchAgent, enricherAgent, prismaMock);

    console.log(`\n🚀 Lancement de l'agent IA (Gemini 2.5) avec accès web...`);
    console.log(`Veuillez patienter, cela peut prendre 10 à 30 secondes en fonction des recherches...`);
    
    const startTime = Date.now();
    const result = await agent.runResearch(prompt, 'test-tenant-id');
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n✅ TERMINÉ !');
    console.log(`⏱️  Durée : ${duration} secondes`);
    console.log(`🔢 Étapes (Allers-retours outils) : ${result.stepsTaken}`);
    console.log('\n📝 RÉSUMÉ DE L\'IA :');
    console.log('--------------------------------------------------');
    console.log(result.summary);
    console.log('--------------------------------------------------');
    console.log('\n🧑‍💼 PROSPECTS TROUVÉS :');
    console.log(JSON.stringify(result.prospects, null, 2));

  } catch (error: any) {
    console.error('\n🚨 Erreur inattendue de l\'Agent:', error.message);
  }
}

run().catch(console.error);
