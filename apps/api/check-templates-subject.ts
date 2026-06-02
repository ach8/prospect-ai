import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.promptTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    select: { name: true, subjectPrompt: true }
  });
  console.log(JSON.stringify(templates, null, 2));
}

main().finally(() => prisma.$disconnect());
