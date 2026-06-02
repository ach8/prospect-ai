import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: 'RUNNING' }
  });
  console.log("=== RUNNING CAMPAIGNS ===");
  console.log(campaigns.map(c => ({id: c.id, name: c.name})));

  const count = await prisma.generatedMessage.count();
  console.log(`Total generated messages: ${count}`);
}

main().finally(() => prisma.$disconnect());
