import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const step = await prisma.sequenceStep.findFirst({
    where: { agentType: 'SUBJECT' },
    orderBy: { id: 'desc' } // using id desc as simple proxy for latest
  });

  if (step) {
    console.log("=== AI PROMPT IN DATABASE ===");
    console.log(step.aiPrompt);
  } else {
    console.log("No SUBJECT step found.");
  }
}

main().finally(() => prisma.$disconnect());
