import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prospects = await prisma.prospect.findMany({
    where: {
      firstName: { equals: 'Sophie', mode: 'insensitive' },
      lastName: { equals: 'Lerman', mode: 'insensitive' }
    }
  });

  if (prospects.length === 0) {
    console.log('Sophie Lerman not found');
    return;
  }

  for (const p of prospects) {
    const data = p.enrichmentData as any || {};
    delete data.visualAudit;
    delete data.deepResearch;

    await prisma.prospect.update({
      where: { id: p.id },
      data: { enrichmentData: data }
    });

    console.log('Cache cleared for Sophie Lerman with ID:', p.id);
  }

  console.log('Done! All cached visualAudits and deepResearch have been removed for her.');
}

main();
