import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const msgs = await prisma.generatedMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { sequenceStep: true }
  });
  console.log(JSON.stringify(msgs, null, 2));
}

main().finally(() => prisma.$disconnect());
