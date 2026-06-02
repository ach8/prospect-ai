import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import * as dotenv from 'dotenv';

dotenv.config();

async function testSubjectGeneration() {
  const previousEmail = `Bonjour Pierre,

J'ai remarqué qu'il n'y avait aucun chat en direct sur la page d'accueil de Acme Corp. 

Cela peut créer une forte frustration chez les visiteurs qui ont une question urgente, ce qui les pousse souvent à abandonner le site plutôt que de remplir un formulaire de contact classique.

Avez-vous déjà envisagé d'installer un Chatbot IA automatisé pour diviser par deux ce taux d'abandon ?`;

  const angles = [
    "l'angle de l'erreur fatale ou du danger (alerter sur un problème pressant)",
    "l'angle du mystère ou de la curiosité extrême (ne pas tout dévoiler)",
    "l'angle de la question très pointue et inattendue",
    "l'angle de la méthode sournoise ou d'une vérité cachée",
    "l'angle du paradoxe ou de l'affirmation contre-intuitive"
  ];

  console.log("=== TESTS DE GÉNÉRATION D'OBJETS (TEMPÉRATURE 0.95) ===\n");
  console.log("Email source utilisé pour le test :\n" + previousEmail + "\n");
  console.log("Génération en cours...\n");

  for (let i = 0; i < 5; i++) {
    const randomAngle = angles[i]; // On force chaque angle pour le test

    const systemPrompt = `Tu es un expert en copywriting B2B de haut niveau. Ton but est d'écrire un OBJET d'email ultra-accrocheur.

VOICI L'EMAIL QUI A ÉTÉ GÉNÉRÉ (ÉTAPE PRÉCÉDENTE) :
${previousEmail}

IMPORTANT: Ton rôle est de lire cet email et de créer l'objet parfait pour l'introduire. L'objet doit être directement lié au contenu de l'email.
OBLIGATION DE PERSONNALISATION : Tu dois impérativement inclure le prénom du prospect (ex: "Pierre") OU le nom de son entreprise (ex: "Acme Corp") dans l'objet pour capter son attention immédiate.`;

    const finalPrompt = `Génère UNIQUEMENT le texte de l'objet de l'email.
OBLIGATION ABSOLUE POUR LA VARIATION : Tu DOIS utiliser l'approche créative suivante pour cet objet : "${randomAngle}".
Sois ultra-intrigant, inattendu, et crée un choc émotionnel ou une forte curiosité.
Ne mets aucun préfixe du style 'Objet:' ou 'Sujet:'. Seulement la phrase finale.`;

    try {
      const result = await generateText({
        model: google('gemini-3.1-pro-preview'),
        system: systemPrompt,
        prompt: finalPrompt,
        temperature: 0.95,
      });

      console.log(`[Angle: ${randomAngle}]`);
      console.log(`-> Résultat : ${result.text.trim()}\n`);
    } catch (e: any) {
      console.error(`Erreur pour l'angle ${i}: ${e.message}`);
    }
  }
}

testSubjectGeneration();
