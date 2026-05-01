import { OpenDataService } from '../src/modules/agents/services/open-data.service';

async function run() {
  const service = new OpenDataService();
  console.log("Recherche API Entreprises France pour 'LVMH'...");
  const results = await service.searchCompany('LVMH');
  console.log('\n--- RÉSULTAT OPEN DATA ---');
  console.log(JSON.stringify(results, null, 2));
  console.log('--------------------------\n');
}

run();
