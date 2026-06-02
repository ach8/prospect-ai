import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Recherche des prospects sans site web (BTP ou autre) ---');

  // Trouver tous les prospects ayant source = GOOGLE_PLACES et companyDomain = null (ou chaine vide)
  const prospects = await prisma.prospect.findMany({
    where: {
      source: 'GOOGLE_PLACES',
      OR: [
        { companyDomain: null },
        { companyDomain: '' }
      ],
      // Assurons-nous qu'ils n'appartiennent à aucune liste
      lists: {
        none: {}
      }
    }
  });

  console.log(`${prospects.length} prospects trouvés sans liste et sans site web.`);

  if (prospects.length === 0) {
    console.log("Rien à faire.");
    return;
  }

  // Grouper par tenantId pour créer une liste par tenant (généralement il n'y en a qu'un)
  const prospectsByTenant = prospects.reduce((acc: any, prospect) => {
    if (!acc[prospect.tenantId]) acc[prospect.tenantId] = [];
    acc[prospect.tenantId].push(prospect);
    return acc;
  }, {});

  for (const tenantId of Object.keys(prospectsByTenant)) {
    const tenantProspects = prospectsByTenant[tenantId];
    console.log(`Création d'une liste pour le tenant ${tenantId} (${tenantProspects.length} prospects)...`);

    const list = await prisma.prospectList.create({
      data: {
        name: 'Prospects Sans Site Web (Récupération Automatique)',
        tenantId: tenantId,
      }
    });

    console.log(`Liste créée : ${list.name} (ID: ${list.id})`);

    // Ajouter les prospects à la liste
    const listEntries = tenantProspects.map((p: any) => ({
      prospectId: p.id,
      prospectListId: list.id
    }));

    const result = await prisma.prospectListEntry.createMany({
      data: listEntries,
      skipDuplicates: true
    });

    console.log(`${result.count} prospects ajoutés à la liste.`);
  }

  console.log('--- Terminé ---');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
