import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.generatedMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      campaignProspect: {
        include: {
          prospect: true
        }
      },
      sequenceStep: true
    }
  });

  console.log("=== DERNIERS OBJETS GÉNÉRÉS ===");
  messages.filter(m => m.sequenceStep.agentType === 'SUBJECT').forEach(m => {
    console.log(`[Prospect: ${m.campaignProspect.prospect.firstName} ${m.campaignProspect.prospect.companyName}]`);
    console.log(`Objet généré: ${m.body}`);
    console.log('---');
  });
}

main().finally(() => prisma.$disconnect());
