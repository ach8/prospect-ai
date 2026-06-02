import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Analyse des prospects en cours...');
  const allProspects = await prisma.prospect.findMany();
  console.log(`Total prospects dans la base: ${allProspects.length}`);

  // Regrouper par email
  const emailGroups = new Map<string, typeof allProspects>();
  
  for (const p of allProspects) {
    if (!p.email) continue;
    const email = p.email.toLowerCase();
    if (!emailGroups.has(email)) {
      emailGroups.set(email, []);
    }
    emailGroups.get(email)!.push(p);
  }

  let duplicatesRemoved = 0;

  for (const [email, prospects] of emailGroups.entries()) {
    if (prospects.length > 1) {
      console.log(`Doublons trouvés pour ${email} (${prospects.length})`);
      
      // Trier pour garder le meilleur (celui avec emailVerified = true ou plus grande confiance ou plus récent)
      prospects.sort((a, b) => {
        if (a.emailVerified !== b.emailVerified) return a.emailVerified ? -1 : 1;
        if (a.emailConfidence !== b.emailConfidence) return b.emailConfidence - a.emailConfidence;
        return b.updatedAt.getTime() - a.updatedAt.getTime(); // Le plus récent en premier
      });

      const prospectToKeep = prospects[0];
      const prospectsToDelete = prospects.slice(1);

      console.log(` -> On garde l'ID: ${prospectToKeep.id} (Confiance: ${prospectToKeep.emailConfidence})`);
      
      const idsToDelete = prospectsToDelete.map(p => p.id);
      
      await prisma.prospect.deleteMany({
        where: { id: { in: idsToDelete } }
      });
      
      console.log(` -> ${idsToDelete.length} doublons supprimés.`);
      duplicatesRemoved += idsToDelete.length;
    }
  }

  console.log(`\n✅ Nettoyage terminé. ${duplicatesRemoved} prospects en doublon ont été supprimés.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
