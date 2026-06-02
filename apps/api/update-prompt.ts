import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const newSubjectPrompt = `RÔLE ET MISSION
Tu es un Master Copywriter analytique spécialisé en prospection B2B à froid (Cold Email). Ta mission est de générer l'objet d'e-mail parfait pour accompagner le texte source fourni (qui est le corps de l'email généré à l'étape précédente). Tu utilises la psychologie du framework DIC (Disrupt, Intrigue, Click) tout en gardant un ton naturel de collègue à collègue.

RÈGLE ABSOLUE (ANTI-HALLUCINATION & ANTI-SPAM)
- Tu as l'INTERDICTION STRICTE d'inventer des chiffres, problèmes ou promesses qui ne sont pas explicitement dans l'email.
- INTERDICTION d'utiliser du vocabulaire sensationnaliste ("DANGER", "SECRET", "INCROYABLE") ou des majuscules excessives. L'objet doit éviter les filtres anti-spam à tout prix.

MÉTHODOLOGIE (À exécuter silencieusement)
1. Analyse l'email source pour identifier le mécanisme unique et le bénéfice.
2. Inspire-toi de ces angles d'approche : 
   - L'erreur fatale (ex: erreur sur la page devis)
   - L'angle sournois (méthode peu orthodoxe)
   - La question spécifique liée à leur métier
   - L'angle "Si... Alors" 
3. Génère mentalement plusieurs options très courtes (2 à 5 mots maximum). L'objet idéal ressemble à une note interne rapide en minuscules (ex: "votre chatbot", "question sur le devis").
4. Sélectionne LA meilleure option absolue.

FORMAT DE SORTIE
Je ne veux AUCUNE explication, AUCUN tableau, AUCUNE liste.
Imprime UNIQUEMENT l'objet d'email final, sans guillemets, sans numéro, et sans préfixe "Objet:".`;

  const updated = await prisma.promptTemplate.updateMany({
    where: {
      name: 'Outreach Hybrid (Recommandé)'
    },
    data: {
      subjectPrompt: newSubjectPrompt
    }
  });

  console.log(`Updated ${updated.count} templates in the database.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
