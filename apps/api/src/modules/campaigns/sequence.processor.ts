import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import { DeepResearchAgentService } from '../agents/services/deep-research-agent.service';
import { CleanerAgentService } from '../agents/services/cleaner-agent.service';
import { VisualAuditAgentService } from '../agents/services/visual-audit-agent.service';

@Processor('sequence-generation', { concurrency: 1 })
@Injectable()
export class SequenceProcessor extends WorkerHost {
  private readonly logger = new Logger(SequenceProcessor.name);

  constructor(
    private prisma: PrismaService,
    private deepResearchAgent: DeepResearchAgentService,
    private cleanerAgent: CleanerAgentService,
    private visualAuditAgent: VisualAuditAgentService
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing sequence generation job ${job.id}`);
    const { campaignId, prospectId } = job.data;

    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { steps: { orderBy: { stepOrder: 'asc' } } }
      });

      const campaignProspect = await this.prisma.campaignProspect.findUnique({
        where: { campaignId_prospectId: { campaignId, prospectId } },
        include: { prospect: true, messages: true }
      });

      if (!campaign || !campaignProspect) {
        throw new Error('Campaign or Prospect not found');
      }

      // Si l'utilisateur a cliqué sur "Stop", la campagne n'est plus RUNNING (DRAFT ou PAUSED)
      if (campaign.status !== 'RUNNING') {
        this.logger.log(`Génération ignorée pour prospect ${prospectId} : campagne ${campaignId} arrêtée.`);
        return { success: false, skipped: true, reason: 'Campaign stopped' };
      }

      let enrichmentData: any = campaignProspect.prospect.enrichmentData || {};
      
      // DEEP RESEARCH PHASE
      const hasAIGeneratedSteps = campaign.steps.some(s => s.templateType === 'AI_GENERATED');
      if (hasAIGeneratedSteps && !enrichmentData.deepResearch) {
        this.logger.log(`Lancement de Deep Research pour le prospect ${prospectId}`);
        const deepResearchResult = await this.deepResearchAgent.runDeepResearch({
          firstName: campaignProspect.prospect.firstName,
          lastName: campaignProspect.prospect.lastName,
          companyName: campaignProspect.prospect.companyName,
          industry: campaignProspect.prospect.industry,
          linkedinUrl: campaignProspect.prospect.linkedinUrl,
          companyDomain: enrichmentData.website || campaignProspect.prospect.companyDomain
        });
        
        if (deepResearchResult) {
          enrichmentData.deepResearch = deepResearchResult;
          // Sauvegarder en DB
          await this.prisma.prospect.update({
            where: { id: prospectId },
            data: { enrichmentData }
          });
        }
      }

      const globalContext = (campaign.aiConfig as any)?.globalContext || '';
      const visualAuditPrompt = (campaign.aiConfig as any)?.visualAuditPrompt || '';
      const campaignObjective = (campaign.aiConfig as any)?.campaignObjective || '';

      // VISUAL AUDIT PHASE
      const targetUrl = enrichmentData.website || campaignProspect.prospect.companyDomain;
      
      const crypto = require('crypto');
      const currentAuditHash = crypto.createHash('md5').update((targetUrl || '') + (visualAuditPrompt || '') + (campaignObjective || '')).digest('hex');
      
      let needsNewAudit = true;
      if (enrichmentData.visualAudit && enrichmentData.visualAuditHash === currentAuditHash) {
        needsNewAudit = false;
      }

      if (hasAIGeneratedSteps && needsNewAudit && targetUrl) {
        this.logger.log(`Lancement de l'Audit Visuel pour le prospect ${prospectId} (Nouveau contexte détecté)`);
        const visualAuditResult = await this.visualAuditAgent.runVisualAudit(
          targetUrl,
          visualAuditPrompt,
          campaignObjective
        );
        
        if (visualAuditResult) {
          enrichmentData.visualAudit = visualAuditResult;
          enrichmentData.visualAuditHash = currentAuditHash;
          // Sauvegarder en DB
          await this.prisma.prospect.update({
            where: { id: prospectId },
            data: { enrichmentData }
          });
        }
      }

      const prospectInfo = `Nom: ${campaignProspect.prospect.firstName || ''} ${campaignProspect.prospect.lastName || ''}
Email: ${campaignProspect.prospect.email || ''}
Entreprise: ${campaignProspect.prospect.companyName || ''}
Secteur: ${campaignProspect.prospect.industry || ''}
Données IA existantes (tags/CSV): ${JSON.stringify(enrichmentData)}
${enrichmentData.deepResearch ? `\n--- RÉSULTATS DE LA RECHERCHE APPROFONDIE ---\n${enrichmentData.deepResearch}\n--------------------------------------------` : ''}
${enrichmentData.visualAudit ? `\n--- VARIABLE Y (AUDIT VISUEL) ---\nPage: ${enrichmentData.visualAudit.page}\nProblème (Friction): ${enrichmentData.visualAudit.friction}\nRaison Reconnaissable: ${enrichmentData.visualAudit.raison}\nMécanique de Conséquence: ${enrichmentData.visualAudit.consequence}\n--------------------------------------------` : ''}`;

      let previousMessagesContext = '';

      for (const step of campaign.steps) {
        // Skip if message already exists
        const existingMsg = campaignProspect.messages.find(m => m.sequenceStepId === step.id);
        if (existingMsg) {
          previousMessagesContext += `\n[Email Ã‰tape ${step.stepOrder}]\nSujet: ${existingMsg.subject}\nCorps: ${existingMsg.body}\n`;
          continue;
        }

        let subject = '';
        let body = '';

        if (step.templateType === 'AI_GENERATED') {
          this.logger.log(`Generating AI message for step ${step.stepOrder} (Type: ${step.agentType})`);
          
          let systemPrompt = '';
          let finalPrompt = '';

          let baseRole = "Tu es un expert en copywriting B2B de haut niveau. Ton but est d'écrire des emails de prospection \"Humanisés\".";
          if (step.agentType === 'SUBJECT') {
            baseRole = "Tu es un expert en copywriting B2B. Ton but est d'écrire un OBJET d'email ultra-accrocheur.";
          }

          systemPrompt = `${baseRole}

CONTEXTE GLOBAL DE LA CAMPAGNE :
${globalContext}
${campaignObjective ? `\n=== OBJECTIF STRICT (PRIORITÉ ABSOLUE) ===\nL'utilisateur a défini l'objectif suivant. Tu DOIS orienter ton email pour atteindre cet objectif (pitch de vente, proposition de démo, etc.). Si le Contexte Global dit de 'ne rien vendre', tu dois IGNORER cette règle et accomplir l'objectif ci-dessous :\n${campaignObjective}\n==========================================\n` : ''}
INFOS DU PROSPECT :
${prospectInfo}

INSTRUCTION DE L'ÉTAPE ACTUELLE :
${step.aiPrompt}

IMPORTANT: Tu DOIS absolument respecter l'instruction de l'étape actuelle ci-dessus. C'est la consigne principale de l'utilisateur pour ce message.
`;

          if (step.agentType === 'SUBJECT') {
            if (previousMessagesContext) {
              systemPrompt += `\n\nVOICI L'EMAIL QUI A ÉTÉ GÉNÉRÉ (ÉTAPE PRÉCÉDENTE) :\n${previousMessagesContext}\n\nIMPORTANT: Ton rôle est de lire cet email et de créer l'objet parfait pour l'introduire. L'objet doit être directement lié au contenu de l'email.`;
            }
            const angles = [
              {
                name: "l'alerte d'un danger ou perte",
                instruction: "Concentre-toi sur l'urgence ou le problème technique sans dire le mot problème."
              },
              {
                name: "le mystère extrême",
                instruction: "Ne dis rien sur le problème, suscite uniquement une curiosité malsaine."
              },
              {
                name: "la question inattendue",
                instruction: "Pose une question fermée et provocatrice sur leur choix stratégique ou leur design."
              },
              {
                name: "l'observation neutre",
                instruction: "Fais une remarque très courte, factuelle et neutre sur un détail précis de leur site (pas juste 'le site', nomme le détail)."
              },
              {
                name: "le paradoxe (contre-intuitif)",
                instruction: "Affirme quelque chose de contraire au bon sens en lien avec ce que tu as observé."
              }
            ];
            
            const randomAngle = angles[Math.floor(Math.random() * angles.length)];

            finalPrompt = `Génère UNIQUEMENT le texte de l'objet de l'email.
OBLIGATION ABSOLUE : Tu dois analyser l'email généré précédemment et le profil du prospect, puis utiliser STRICTEMENT cet angle pour créer l'objet le plus percutant, naturel et adapté à la situation de ce prospect précis :

ANGLE IMPOSÉ : "${randomAngle.name}"
INSTRUCTION DE L'ANGLE : ${randomAngle.instruction}

CONTRAINTES ANTI-ROBOT (TRÈS IMPORTANT) :
- L'objet doit sonner comme une note interne très informelle écrite par un vrai humain. Phrase très naturelle, pas de ton publicitaire.
- INTERDICTION STRICTE de recopier mot pour mot une structure générique. Tu DOIS inventer une nouvelle structure de phrase à chaque fois.
- INTERDICTION STRICTE d'utiliser le format "question sur le site X".
- INTERDICTION STRICTE d'utiliser les mots "friction", "faille", "problème", "optimisation", "détail", "parcours d'achat" ou "question".
- INTERDICTION d'utiliser la structure "Prénom, un détail sur NomEntreprise".
- INTERDICTION d'utiliser la structure "NomEntreprise : problème".
- L'objet doit être très court (3 à 8 mots maximum).
- INTERDICTION ABSOLUE d'utiliser des tirets (-) dans le texte généré, pour ne pas avoir l'air généré par une IA.

Ne mets aucun préfixe du style 'Objet:' ou 'Sujet:'. Seulement le texte final, sans aucun guillemet.`;
          } else {
            if (previousMessagesContext) {
              systemPrompt += `\n\nVOICI LES EMAILS PRÉCÉDENTS ENVOYÉS À CE PROSPECT :\n${previousMessagesContext}\n\nIMPORTANT: Assure-toi que cet email est une suite logique et n'est pas redondant.`;
            }

            const hookVariations = [
              "Commence par une observation métier directe et pointue liée à son secteur d'activité, sans formule de politesse introductive.",
              "Commence par une question ouverte ou rhétorique liée au problème identifié sur son site. Sois direct et légèrement provocateur mais professionnel.",
              "Rentre dans le vif du sujet en parlant directement d'une conséquence négative, puis fais le lien avec les données trouvées (Deep Research ou Audit).",
              "Utilise l'empathie en mentionnant la charge de travail ou les difficultés de son équipe face à ce problème spécifique.",
              "Fais une remarque inattendue et très précise sur un détail de la Recherche Approfondie (Deep Research) ou du design de son site, pour prouver que l'email est unique."
            ];
            const randomHook = hookVariations[Math.floor(Math.random() * hookVariations.length)];

            systemPrompt += `\n\nCONTRAINTES DE PERSONNALISATION EXTRÊME (OBLIGATOIRE) :
- L'email DOIT être 100% sur-mesure pour ce prospect précis. Utilise ses informations (Secteur, Recherche Approfondie, etc.) pour formuler des phrases qui ne pourraient s'appliquer à aucune autre entreprise.
- INTERDICTION ABSOLUE d'utiliser des formules génériques comme "En parcourant la page d'accueil de [Entreprise]", "J'ai remarqué que", "J'ai constaté l'absence de", "En visitant votre site", "Je me permets de vous contacter".
- INTERDICTION ABSOLUE d'utiliser des tirets (-), des listes à puces ou d'autres formatages structurés. L'email ne doit absolument pas avoir l'air d'avoir été généré par une IA.
- Ne fais PAS un simple copier-coller de la friction. Réécris l'idée avec tes propres mots, de façon naturelle.
- INSTRUCTION DE STYLE POUR L'ACCROCHE : ${randomHook}
- L'email doit avoir l'air d'avoir été tapé manuellement à la volée par un humain. Reste hyper naturel, fluide et direct.`;

            finalPrompt = "Rédige DIRECTEMENT le corps de l'email demandé. NE METS JAMAIS D'OBJET (ni 'Objet:', ni 'Sujet:'). Commence directement par le premier mot de ton email.";
          }

          const aiModel = (campaign.aiConfig as any)?.model || 'gemini-3.5-flash';

          this.logger.log(`Using model ${aiModel} for step ${step.stepOrder}`);

          let result;
          let retries = 0;
          const maxRetries = 3;
          while (true) {
            try {
              result = await generateText({
                model: vertex(aiModel),
                system: systemPrompt,
                prompt: finalPrompt,
                temperature: step.agentType === 'SUBJECT' ? 0.95 : 0.85,
                maxRetries: 1, // Disable built-in quick retries so we can use our slow ones
              });
              
              // Petit délai entre chaque génération réussie pour éviter de saturer l'API
              await new Promise(resolve => setTimeout(resolve, 3000));
              break;
            } catch (err: any) {
              if (err.message?.includes('Resource exhausted') && retries < maxRetries) {
                retries++;
                this.logger.warn(`Quota Vertex AI atteint (429). Attente de 25 secondes avant la tentative ${retries}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, 25000));
              } else {
                throw err;
              }
            }
          }

          let text = result.text.trim();
          
          if (step.agentType === 'SUBJECT') {
            // Nettoyage brutal des préfixes générés par l'IA malgré les interdictions
            text = text.replace(/^(Objet|Sujet|Object|Subject|\*\*Objet\*\*|\*\*Sujet\*\*)\s*:\s*/i, '').trim();
            // Retrait des guillemets éventuels autour du sujet
            text = text.replace(/^["'](.*)["']$/, '$1').trim();
            // Retrait des points finaux
            text = text.replace(/\.$/, '').trim();
            
            subject = text;
            body = '';
          } else {
            // L'objet est géré par la configuration de l'étape
            subject = step.subject || '';
            body = text;
          }

        } else {
          // Manual Template
          subject = step.subject || '';
          body = step.manualContent || '';
        }

        // Save generated message
        const newMsg = await this.prisma.generatedMessage.create({
          data: {
            campaignProspectId: campaignProspect.id,
            sequenceStepId: step.id,
            subject,
            body,
            status: 'DRAFT',
          }
        });

        // Add to context for next step
        previousMessagesContext += `\n[Email Ã‰tape ${step.stepOrder}]\nSujet: ${newMsg.subject}\nCorps: ${newMsg.body}\n`;
      }

      this.logger.log(`Successfully generated sequence for prospect ${prospectId}`);
      return { success: true };

    } catch (error: any) {
      this.logger.error(`Error generating sequence: ${error.message}`, error.stack);
      throw error;
    }
  }
}
