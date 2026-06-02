const fs = require('fs');
const path = require('path');

const files = [
  'src/modules/agents/services/enricher-agent.service.ts',
  'src/modules/agents/services/data-enrichment-agent.service.ts',
  'src/modules/agents/services/research-agent.service.ts'
];

for (const file of files) {
  const p = path.join(process.cwd(), file);
  let content = fs.readFileSync(p, 'utf-8');

  // Remplacer z.object(...) par la syntaxe { type: "object", properties: {...} } as any
  // C'est complexe par regex, on va plutôt repasser à jsonSchema de 'ai'
  
  if (!content.includes("import { jsonSchema }")) {
      content = content.replace(/import { generateText, tool.*? } from 'ai';/, (match) => {
          return match.replace("} from 'ai'", ", jsonSchema } from 'ai'");
      });
      content = content.replace(/import { generateText, tool } from 'ai';/, "import { generateText, tool, jsonSchema } from 'ai';");
  }

  // Vu la complexité des zod schemas, et sachant que la regex va casser, 
  // la meilleure approche est d'utiliser le type "any" sur les arguments
  // MAIS wait ! On peut juste demander au LLM de le faire via l'outil multi_replace_file_content !
}
