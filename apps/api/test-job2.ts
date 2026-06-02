import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const job = await prisma.csvImportJob.findUnique({
    where: { id: "87b4fbef-9b12-49bc-a955-b55f8e3bb03a" },
  });
  console.log('Job details:', job);
}
run().catch(console.error).finally(() => prisma.$disconnect());
