import { GooglePlacesService } from '../src/modules/agents/services/google-places.service';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const service = new GooglePlacesService();
  console.log("Recherche Google Places pour 'Agences web à Paris'...");
  const results = await service.searchBusinesses('Agences web à Paris', 2);
  console.log(JSON.stringify(results, null, 2));
}

run();
