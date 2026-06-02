import { VisualAuditAgentService } from '../src/modules/agents/services/visual-audit-agent.service';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env vars to get GEMINI_API_KEY
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function runTest() {
  console.log('--- TEST: Visual Audit Agent ---');
  
  // You can change this URL to any prospect's website
  const targetUrl = 'https://www.alan.com/'; 
  
  console.log(`Cible : ${targetUrl}`);
  console.log('Vérification de la clé API GEMINI...', process.env.GEMINI_API_KEY ? 'Trouvée' : 'Manquante !');

  const agent = new VisualAuditAgentService();

  try {
    const result = await agent.runVisualAudit(targetUrl);
    
    console.log('\n✅ RÉSULTAT DE L\'AUDIT (Variable Y) :\n');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Erreur durant le test :', error);
  }
}

runTest().then(() => process.exit(0));
