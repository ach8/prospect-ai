import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.promptTemplate.findMany();
  console.log("=== TEMPLATES IN DB ===");
  templates.forEach(t => {
    console.log(`--- Template: ${t.name} ---`);
    console.log(`FIRST TOUCH: ${t.firstTouchPrompt?.substring(0, 50)}...`);
    console.log(`FOLLOW UP: ${t.followUpPrompt?.substring(0, 50)}...`);
    console.log(`CLOSER: ${t.closerPrompt?.substring(0, 50)}...`);
  });
}

main().finally(() => prisma.$disconnect());
