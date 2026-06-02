import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const allProspects = await prisma.prospect.findMany();
  
  const nameGroups = new Map<string, typeof allProspects>();
  
  for (const p of allProspects) {
    const key = `${p.firstName} ${p.lastName} @ ${p.companyName}`.toLowerCase().trim();
    if (!nameGroups.has(key)) {
      nameGroups.set(key, []);
    }
    nameGroups.get(key)!.push(p);
  }

  let duplicatesRemoved = 0;

  for (const [key, prospects] of nameGroups.entries()) {
    if (prospects.length > 1) {
      console.log(`Doublons trouvés pour ${key} (${prospects.length})`);
      
      prospects.sort((a, b) => {
        if (a.emailVerified !== b.emailVerified) return a.emailVerified ? -1 : 1;
        if (a.emailConfidence !== b.emailConfidence) return b.emailConfidence - a.emailConfidence;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      const prospectsToDelete = prospects.slice(1);
      const idsToDelete = prospectsToDelete.map(p => p.id);
      
      await prisma.prospect.deleteMany({
        where: { id: { in: idsToDelete } }
      });
      
      console.log(` -> ${idsToDelete.length} doublons supprimés.`);
      duplicatesRemoved += idsToDelete.length;
    }
  }

  console.log(`\n✅ Nettoyage terminé. ${duplicatesRemoved} prospects en doublon (par nom/entreprise) ont été supprimés.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
