import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.promptTemplate.findMany();
  console.log(templates.map(t => t.name));
}

main().finally(() => prisma.$disconnect());
