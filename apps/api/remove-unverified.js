const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Removing unverified emails globally...");
  const result = await prisma.prospect.updateMany({
    where: {
      emailVerified: false,
      email: { not: null }
    },
    data: {
      email: null,
      emailConfidence: 0
    }
  });
  console.log(`Updated ${result.count} prospects by removing their unverified emails.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
