import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prospects = await prisma.prospect.findMany({
    where: {
      firstName: { equals: 'Sophie', mode: 'insensitive' },
      lastName: { equals: 'Lerman', mode: 'insensitive' }
    },
    select: { id: true, companyDomain: true, enrichmentData: true }
  });

  console.log(JSON.stringify(prospects, null, 2));
}

main();
