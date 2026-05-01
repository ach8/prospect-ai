import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AgentsController } from '../src/modules/agents/agents.controller';
import { ManualResearchDto } from '../src/modules/agents/dto/manual-research.dto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const controller = app.get(AgentsController);

  console.log('--- Test de Google Places ---');
  const placesDto: ManualResearchDto = {
    query: 'agences immobilières à Paris',
    tools: ['GOOGLE_PLACES'],
  };
  const placesResult = await controller.runManualResearch(placesDto);
  console.log(JSON.stringify(placesResult, null, 2));

  console.log('\n--- Test de Web Search ---');
  const webDto: ManualResearchDto = {
    query: 'Qui est le CEO de OpenAI ?',
    tools: ['WEB_SEARCH'],
  };
  const webResult = await controller.runManualResearch(webDto);
  console.log(JSON.stringify(webResult, null, 2));

  console.log('\n--- Test de Email Discovery ---');
  const emailDto: ManualResearchDto = {
    query: 'Recherche email', // non utilisé par cet outil mais requis par le DTO global
    tools: ['EMAIL_DISCOVERY'],
    firstName: 'Selim',
    lastName: 'Jaouadi',
    domain: 'bigsmash.fr'
  };
  const emailResult = await controller.runManualResearch(emailDto);
  console.log(JSON.stringify(emailResult, null, 2));

  await app.close();
}

bootstrap().catch(console.error);
