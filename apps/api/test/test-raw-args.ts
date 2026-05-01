// @ts-nocheck
// Test with zod/v4 + inputSchema
const { generateText, tool, stepCountIs } = require('ai');
const { google } = require('@ai-sdk/google');
const { z } = require('zod/v4');

require('dotenv').config({ path: '.env.local' });

async function main() {
  console.log('=== TEST zod/v4 + inputSchema ===');
  console.log('zod version:', require('zod/package.json').version);
  
  const items = [];
  
  try {
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: 'Appelle l\'outil "greet" avec name="Jean". C\'est obligatoire.',
      stopWhen: stepCountIs(5),
      tools: {
        greet: tool({
          description: 'Salue une personne par son nom',
          inputSchema: z.object({
            name: z.string().describe('Le nom de la personne à saluer'),
          }),
          execute: async (args) => {
            console.log('EXECUTE args:', JSON.stringify(args));
            items.push(args.name);
            return `Bonjour ${args.name}!`;
          },
        }),
      },
    });

    console.log('\n=== RÉSULTAT ===');
    console.log('Steps:', result.steps?.length);
    console.log('Items:', items);
    console.log('SUCCESS:', items.length > 0 && items[0] !== undefined);
  } catch (err) {
    console.error('ERROR:', err.message);
  }
}

main();
