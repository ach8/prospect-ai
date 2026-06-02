const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('Folders:', await prisma.folder.findMany());
  console.log('Lists:', await prisma.prospectList.findMany());
}
main().catch(console.error).finally(() => prisma.$disconnect());
