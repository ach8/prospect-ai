import { WebScraperService } from '../src/modules/agents/services/web-scraper.service';

async function run() {
  const service = new WebScraperService();
  console.log("Scraping du site 'https://example.com'...");
  const text = await service.scrapeWebsite('https://example.com');
  console.log('\n--- RÉSULTAT DU SCRAPING ---');
  console.log(text);
  console.log('----------------------------\n');
}

run();
