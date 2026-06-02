import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const job = await prisma.csvImportJob.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  console.log('Latest Job:', job);

  if (job) {
    const prospects = await prisma.prospect.findMany({
      where: { csvImportJobId: job.id },
      take: 5
    });
    console.log('Prospects created by this job:', JSON.stringify(prospects, null, 2));
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
