import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.generatedMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    where: {
      sequenceStep: { agentType: 'SUBJECT' }
    },
    include: {
      campaignProspect: {
        include: { prospect: true }
      },
      sequenceStep: true
    }
  });

  console.log("=== DERNIERS OBJETS GÉNÉRÉS ===");
  messages.forEach(m => {
    console.log(`[Date: ${m.createdAt}]`);
    console.log(`[Prospect: ${m.campaignProspect.prospect.firstName} ${m.campaignProspect.prospect.companyName}]`);
    console.log(`Objet généré: ${m.body}`);
    console.log('---');
  });
}

main().finally(() => prisma.$disconnect());
