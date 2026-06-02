import { EmailDiscoveryService } from './src/modules/agents/services/email-discovery.service';
require('dotenv').config();

async function test() {
  const s = new EmailDiscoveryService();
  console.log('--- TEST SUR LE VPS (Port 25 Ouvert) ---');
  console.log('🔎 Recherche email pour bill gates @ microsoft.com...');
  const res = await s.findValidEmail('bill', 'gates', 'microsoft.com');
  console.log('✅ RÉSULTAT :', res);
  process.exit(0);
}

test();
