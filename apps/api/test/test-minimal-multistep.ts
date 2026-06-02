// Minimal test to verify multi-step tool calling works
const { generateText, tool, stepCountIs, zodSchema } = require('ai');
const { google } = require('@ai-sdk/google');
const { z } = require('zod');

require('dotenv').config({ path: '.env.local' });

async function main() {
  console.log('=== TEST MINIMAL MULTI-STEP ===');
  console.log('AI SDK version:', require('ai/package.json').version);
  console.log('@ai-sdk/google version:', require('@ai-sdk/google/package.json').version);
  
  const collectedItems: string[] = [];
  
  try {
    const result = await generateText({
      model: google('gemini-3.1-pro-preview'),
      system: 'Tu es un assistant. Utilise les outils disponibles pour répondre.',
      prompt: 'Donne-moi 3 noms de fruits. Pour chaque fruit, appelle l\'outil "addItem".',
      stopWhen: stepCountIs(10),
      onStepFinish: (step: any) => {
        console.log(`  [Step] finishReason=${step.finishReason} toolCalls=${step.toolCalls?.length || 0}`);
      },
      tools: {
        addItem: tool({
          description: 'Ajoute un item à la liste. Tu DOIS fournir le paramètre "name".',
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Le nom de l'item" }
            },
            required: ["name"]
          } as any,
          execute: async (args: any) => {
            console.log(`  [TOOL] addItem called with:`, args);
            const name = args.name;
            collectedItems.push(name);
            return `OK: "${name}" ajouté. Total: ${collectedItems.length}`;
          },
        }),
      },
    });

    console.log('\n=== RÉSULTAT ===');
    console.log('FinishReason:', result.finishReason);
    console.log('Steps:', result.steps?.length);
    console.log('Text:', result.text?.substring(0, 200));
    console.log('Error:', result.error);
    console.log('Items collectés:', collectedItems);
    
    if (result.steps) {
      result.steps.forEach((step: any, i: number) => {
        console.log(`  Step ${i+1}: reason=${step.finishReason}, tools=${step.toolCalls?.length || 0}`);
        if (step.error) console.log(`  Step ${i+1} Error:`, step.error);
        if (step.warnings) console.log(`  Step ${i+1} Warnings:`, step.warnings);
      });
    }
  } catch (err: any) {
    console.error('ERREUR:', err.message);
    if (err.data) console.error('Data:', JSON.stringify(err.data).substring(0, 500));
    if (err.cause) console.error('Cause:', err.cause);
  }
}

main();
