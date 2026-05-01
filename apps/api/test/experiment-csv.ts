import { LeadResearchAgentService } from '../src/modules/agents/services/research-agent.service';
import { EmailDiscoveryService } from '../src/modules/agents/services/email-discovery.service';
import { ProspectsService } from '../src/modules/prospects/prospects.service';
import { GooglePlacesService } from '../src/modules/agents/services/google-places.service';
import { WebScraperService } from '../src/modules/agents/services/web-scraper.service';
import { OpenDataService } from '../src/modules/agents/services/open-data.service';
import { config } from 'dotenv';
import * as fs from 'fs';

config({ path: '.env.local' });
config({ path: '.env' });

const TARGETS = [
  { company: "Innovacases SAS | Noreve Saint-Tropez", expectedName: "Michaël MASSAT", expectedRole: "CEO | Fondateur" },
  { company: "Jungow", expectedName: "Guillaume Albisetti", expectedRole: "Co-fondateur" },
  { company: "Darbois Realestate Solutions", expectedName: "Patrick Darbois", expectedRole: "CEO and Founder" },
  { company: "KEOPS Toulouse", expectedName: "Guillaume Rouzies", expectedRole: "President KEOPS" },
  { company: "La Chouette Agence Immobilière", expectedName: "Angèle KIRSCH", expectedRole: "Cofondatrice" },
  { company: "COMMEREUC IMMOBILIER", expectedName: "Amandine COMMEREUC", expectedRole: "Presidente" },
  { company: "L'Adresse immobilier Meaux Trilport", expectedName: "Audrey Iscain", expectedRole: "Gérante" },
  { company: "SPITI Immobilier", expectedName: "Christophe HUTTEAU", expectedRole: "Fondateur et Dirigeant" },
  { company: "BELLA DN PROPERTIES", expectedName: "Carine Deneux", expectedRole: "Gérant & fondateur" },
  { company: "Agence SADONE", expectedName: "Arthur Rouen", expectedRole: "Consultant Immobilier" },
];

async function runExperiment() {
  console.log('==============================================');
  console.log('🧪 EXPÉRIMENTATION : Ground Truth vs AI Agent (5 leads)');
  console.log('==============================================\n');

  const emailDiscovery = new EmailDiscoveryService();
  const googlePlaces = new GooglePlacesService();
  const webScraper = new WebScraperService();
  const openData = new OpenDataService();
  
  const prospectsServiceMock = {
    create: async (data: any, tenantId: string) => {
      return { id: 'mock', ...data };
    }
  } as unknown as ProspectsService;

  const agent = new LeadResearchAgentService(emailDiscovery, prospectsServiceMock, googlePlaces, webScraper, openData);

  const resultsTable = [];
  
  // Limité à 5 pour des raisons de temps de réponse, on peut faire les 10 mais c'est long
  const targetsToRun = TARGETS.slice(0, 5);

  for (let i = 0; i < targetsToRun.length; i++) {
    const target = targetsToRun[i];
    console.log(`\n--- Recherche ${i + 1}/${targetsToRun.length} : ${target.company} ---`);
    
    // On enlève la consigne stricte sur l'email pour le test
    const prompt = `Trouve le nom du dirigeant de l'entreprise "${target.company}" en France. Trouve aussi son email. Résume simplement : NOM DU DIRIGEANT: [Nom], EMAIL: [Email ou Non trouvé]. Si tu utilises un outil, donne les informations trouvées.`;
    
    try {
      const res = await agent.runResearch(prompt, 'test-tenant');
      const summaryLine = res.summary.replace(/\\n/g, ' ').replace(/\\r/g, '');
      console.log(`✅ IA: ${summaryLine}`);
      
      resultsTable.push({
        Company: target.company,
        Expected: `${target.expectedName} (${target.expectedRole})`,
        Agent_Summary: summaryLine
      });
      
    } catch (e: any) {
      console.log(`⚠️ Erreur : ${e.message}`);
      resultsTable.push({
        Company: target.company,
        Expected: target.expectedName,
        Agent_Summary: 'ERREUR D\'EXÉCUTION'
      });
    }
  }

  console.log('\n==============================================');
  console.log('📊 RÉSULTATS FINAUX');
  console.log('==============================================\n');
  
  // Sauvegarde dans un fichier MD pour affichage
  const mdContent = `
# Résultats Expérimentation Agent vs CSV

| Entreprise | Dirigeant Attendu (Linkedin) | Résumé renvoyé par l'IA |
|---|---|---|
${resultsTable.map(r => `| **${r.Company}** | ${r.Expected} | ${r.Agent_Summary} |`).join('\n')}
`;
  fs.writeFileSync('experiment_results.md', mdContent);
  console.log("Fichier experiment_results.md généré avec succès.");
  process.exit(0);
}

runExperiment();
