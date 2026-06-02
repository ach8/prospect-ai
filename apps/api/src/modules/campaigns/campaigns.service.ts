import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { UpdateSequenceDto, UpdateGeneratedMessageDto, RegenerateMessageDto } from './dto/sequence.dto';
import { generateText } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CleanerAgentService } from '../agents/services/cleaner-agent.service';

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private cleanerAgent: CleanerAgentService,
    @InjectQueue('sequence-generation') private sequenceQueue: Queue
  ) {}

  async findAll(tenantId: string) {
    return this.prisma.forTenant(tenantId).campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { prospects: true }
        }
      }
    });
  }

  async findOne(id: string, tenantId: string) {
    const campaign = await this.prisma.forTenant(tenantId).campaign.findUnique({
      where: { id },
      include: {
        steps: true,
      }
    });
    if (!campaign) {
      throw new NotFoundException('Campagne non trouvÃ©e');
    }
    return campaign;
  }

  async create(dto: CreateCampaignDto, tenantId: string, userId: string) {
    const { listId, ...campaignData } = dto;

    const campaign = await this.prisma.forTenant(tenantId).campaign.create({
      data: {
        ...campaignData,
        userId,
        tenantId,
      },
    });

    if (listId) {
      const listEntries = await this.prisma.prospectListEntry.findMany({
        where: { prospectListId: listId },
        select: { prospectId: true },
      });

      if (listEntries.length > 0) {
        await this.prisma.campaignProspect.createMany({
          data: listEntries.map(entry => ({
            campaignId: campaign.id,
            prospectId: entry.prospectId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, tenantId: string) {
    await this.findOne(id, tenantId); // vÃ©rifie existence
    return this.prisma.forTenant(tenantId).campaign.update({
      where: { id },
      data: dto,
    });
  }

  async updateSteps(id: string, dto: UpdateSequenceDto, tenantId: string) {
    const campaign = await this.findOne(id, tenantId);
    
    if (dto.steps && dto.steps.length > 0) {
      const existingSteps = await this.prisma.sequenceStep.findMany({ where: { campaignId: id } });
      
      // 1. Delete steps that are no longer in dto.steps BEFORE creating new ones
      const keptIds = dto.steps.map(s => s.id).filter(Boolean) as string[];
      if (keptIds.length > 0) {
        await this.prisma.sequenceStep.deleteMany({
          where: {
            campaignId: id,
            id: { notIn: keptIds }
          }
        });
      } else {
        await this.prisma.sequenceStep.deleteMany({
          where: { campaignId: id }
        });
      }

      // 2. Update or create remaining steps
      for (const stepDto of dto.steps) {
        // On matche STRICTEMENT par ID pour éviter de mixer les emails générés si l'utilisateur change l'ordre
        const existingStep = stepDto.id ? existingSteps.find(s => s.id === stepDto.id) : null;
        
        if (existingStep) {
          await this.prisma.sequenceStep.update({
            where: { id: existingStep.id },
            data: {
              stepOrder: stepDto.stepOrder,
              channel: stepDto.channel,
              templateType: stepDto.templateType,
              agentType: stepDto.agentType,
              aiPrompt: stepDto.aiPrompt,
              subject: stepDto.subject,
              manualContent: stepDto.manualContent,
              delayHours: stepDto.delayHours,
            }
          });
        } else {
          // Nouvelle étape
          // Exclure l'ID potentiel du frontend s'il s'agit d'un clone sans ID en BDD
          const { id: _, ...stepData } = stepDto as any;
          await this.prisma.sequenceStep.create({
            data: {
              ...stepData,
              campaignId: id,
            }
          });
        }
      }
    }

    return this.findOne(id, tenantId);
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.forTenant(tenantId).campaign.delete({
      where: { id },
    });
  }

  async getProspects(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // ensure campaign exists and belongs to tenant
    
    return this.prisma.campaignProspect.findMany({
      where: { campaignId: id },
      include: {
        prospect: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeProspect(campaignId: string, prospectId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId); // ensure campaign exists
    return this.prisma.campaignProspect.delete({
      where: {
        campaignId_prospectId: {
          campaignId,
          prospectId,
        }
      }
    });
  }

  async removeProspectsBulk(campaignId: string, prospectIds: string[], tenantId: string) {
    await this.findOne(campaignId, tenantId);
    return this.prisma.campaignProspect.deleteMany({
      where: {
        campaignId,
        prospectId: { in: prospectIds }
      }
    });
  }

  async getCleaningStatus(campaignId: string, tenantId: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: {
        tenantId,
        agentName: `CLEAN_CAMPAIGN_${campaignId}`,
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!task) return { isCleaning: false };

    return {
      isCleaning: task.status === 'QUEUED' || task.status === 'PROCESSING',
      status: task.status,
      result: task.output
    };
  }

  async startCleaning(campaignId: string, tenantId: string) {
    const campaign = await this.findOne(campaignId, tenantId);
    const targetIndustry = (campaign.aiConfig as any)?.targetIndustry;
    
    if (!targetIndustry) {
      return { success: true, message: "Aucun secteur cible défini, nettoyage ignoré." };
    }

    // CREATE TASK
    const task = await this.prisma.agentTask.create({
      data: {
        tenantId,
        agentName: `CLEAN_CAMPAIGN_${campaignId}`,
        status: 'PROCESSING',
        input: { campaignId, targetIndustry }
      }
    });

    // RUN ASYNC
    this._runCleaningAsync(campaignId, tenantId, targetIndustry, task.id).catch(console.error);

    return { 
      success: true, 
      message: "Nettoyage asynchrone démarré"
    };
  }

  private async _runCleaningAsync(campaignId: string, tenantId: string, targetIndustry: string, taskId: string) {
    try {
      const campaignProspects = await this.prisma.campaignProspect.findMany({
        where: { campaignId },
        include: { prospect: true }
      });

      const rejectedProspects = [];
      const keptProspects = [];

      for (const cp of campaignProspects) {
        const initialIndustry = cp.prospect.industry;
        const evaluation = await this.cleanerAgent.evaluateProspect(cp.prospect, targetIndustry);
        
        if (!evaluation.isMatch) {
          rejectedProspects.push({
            ...cp.prospect,
            reason: evaluation.reason
          });
          
          await this.prisma.campaignProspect.delete({
            where: { id: cp.id }
          });
        } else {
          keptProspects.push(cp.prospect);
          
          const updateData: any = {};
          if (cp.prospect.industry !== initialIndustry) {
             updateData.industry = cp.prospect.industry; 
          }
          if (evaluation.deepResearchResult) {
             const enrichmentData: any = cp.prospect.enrichmentData || {};
             enrichmentData.deepResearch = evaluation.deepResearchResult;
             updateData.enrichmentData = enrichmentData;
          }
          
          if (Object.keys(updateData).length > 0) {
             await this.prisma.prospect.update({
               where: { id: cp.prospect.id },
               data: updateData
             });
          }
        }
      }

      if (rejectedProspects.length > 0) {
        await this.cleanerAgent.saveRejectedProspects(tenantId, rejectedProspects);
      }

      await this.prisma.agentTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          output: { kept: keptProspects.length, rejected: rejectedProspects.length },
          completedAt: new Date()
        }
      });
    } catch (err: any) {
      await this.prisma.agentTask.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          error: err.message || 'Erreur inconnue',
          completedAt: new Date()
        }
      });
    }
  }

  async exportCampaign(campaignId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId); // verify ownership

    const prospects = await this.prisma.campaignProspect.findMany({
      where: { campaignId },
      include: {
        prospect: true,
        messages: {
          include: {
            sequenceStep: true,
          },
          orderBy: {
            sequenceStep: { stepOrder: 'asc' }
          }
        }
      }
    });

    return prospects.map(cp => {
      const p = cp.prospect;
      const exportData: any = {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        companyName: p.companyName,
        industry: p.industry,
      };

      // Add messages
      cp.messages.forEach(msg => {
        const stepNum = msg.sequenceStep.stepOrder;
        exportData[`subject_${stepNum}`] = msg.subject || '';
        exportData[`body_${stepNum}`] = msg.body || '';
      });

      return exportData;
    });
  }

  async generateSequence(campaignId: string, tenantId: string) {
    const campaign = await this.findOne(campaignId, tenantId); // verify ownership

    // Fetch prospects
    const prospects = await this.prisma.campaignProspect.findMany({
      where: { campaignId },
      select: { prospectId: true },
    });

    if (prospects.length === 0) {
      return { success: false, message: 'Aucun prospect dans cette campagne.' };
    }

    // Supprimer les anciens messages DRAFT pour forcer la régénération
    await this.prisma.generatedMessage.deleteMany({
      where: {
        campaignProspect: {
          campaignId: campaignId
        },
        status: 'DRAFT'
      }
    });

    // Change campaign status to RUNNING if it's DRAFT
    if (campaign.status === 'DRAFT') {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'RUNNING' }
      });
    }

    // Add jobs to Queue
    // We queue 1 job per prospect to allow parallel processing and independent retries
    const jobs = prospects.map(p => ({
      name: 'generate-sequence-for-prospect',
      data: {
        campaignId,
        prospectId: p.prospectId,
      }
    }));

    await this.sequenceQueue.addBulk(jobs);

    return {
      success: true,
      message: `${jobs.length} jobs de génération ajoutés à la file d'attente.`,
    };
  }

  async stopGeneration(campaignId: string, tenantId: string) {
    await this.findOne(campaignId, tenantId); // verify ownership

    // 1. Repasser la campagne en mode DRAFT pour arrêter les jobs BullMQ en cours
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'DRAFT' }
    });

    // 2. Supprimer tous les messages générés pour cette campagne
    await this.prisma.generatedMessage.deleteMany({
      where: {
        campaignProspect: {
          campaignId: campaignId
        }
      }
    });

    return {
      success: true,
      message: "Génération arrêtée. Les emails ont été effacés."
    };
  }

  async getGenerationStatus(campaignId: string, tenantId: string) {
    const campaign = await this.findOne(campaignId, tenantId);
    
    // Count total prospects linked to campaign
    const totalProspects = await this.prisma.campaignProspect.count({
      where: { campaignId }
    });

    const totalSteps = campaign.steps.length;
    const totalExpectedMessages = totalProspects * totalSteps;

    // Count generated messages for this campaign
    const generatedMessagesCount = await this.prisma.generatedMessage.count({
      where: {
        campaignProspect: {
          campaignId
        }
      }
    });

    // Chercher le prospect en cours de traitement via BullMQ
    let currentProcessingProspect = null;
    try {
      const activeJobs = await this.sequenceQueue.getActive();
      const activeJob = activeJobs.find(job => job.data?.campaignId === campaignId);
      
      if (activeJob && activeJob.data?.prospectId) {
        const prospect = await this.prisma.prospect.findUnique({
          where: { id: activeJob.data.prospectId },
          select: { firstName: true, lastName: true, companyName: true }
        });
        if (prospect) {
          currentProcessingProspect = {
            id: activeJob.data.prospectId,
            name: `${prospect.firstName} ${prospect.lastName}`,
            company: prospect.companyName
          };
        }
      }
    } catch (err) {
      console.error("Erreur lors de la rÃ©cupÃ©ration des jobs actifs", err);
    }

    // RÃ©cupÃ©rer les derniers prospects traitÃ©s avec leurs sÃ©quences complÃ¨tes
    const recentCampaignProspects = await this.prisma.campaignProspect.findMany({
      where: {
        campaignId,
        messages: { some: {} } // On ne prend que ceux qui ont au moins un message gÃ©nÃ©rÃ©
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        prospect: {
          select: { firstName: true, lastName: true, companyName: true, enrichmentData: true }
        },
        messages: {
          include: {
            sequenceStep: {
              select: { agentType: true, stepOrder: true }
            }
          },
          orderBy: {
            sequenceStep: { stepOrder: 'asc' }
          }
        }
      }
    });

    const recentProspects = recentCampaignProspects.map(cp => {
      const enrichmentData = cp.prospect.enrichmentData as any;
      return {
        id: cp.id,
        prospectName: `${cp.prospect.firstName} ${cp.prospect.lastName}`,
        companyName: cp.prospect.companyName,
        deepResearch: enrichmentData?.deepResearch || null,
        messages: cp.messages.map(msg => ({
          id: msg.id,
          agentType: msg.sequenceStep.agentType,
          stepOrder: msg.sequenceStep.stepOrder,
          subject: msg.subject,
          body: msg.body,
          createdAt: msg.createdAt
        }))
      };
    });

    return {
      totalProspects,
      totalSteps,
      totalExpectedMessages,
      generatedMessagesCount,
      progress: totalExpectedMessages > 0 ? Math.round((generatedMessagesCount / totalExpectedMessages) * 100) : 0,
      currentProcessingProspect,
      recentProspects
    };
  }

  async updateMessage(campaignId: string, messageId: string, dto: UpdateGeneratedMessageDto, tenantId: string) {
    // Verify campaign belongs to tenant
    await this.findOne(campaignId, tenantId);

    const message = await this.prisma.generatedMessage.findFirst({
      where: {
        id: messageId,
        campaignProspect: { campaignId }
      }
    });

    if (!message) throw new NotFoundException('Message not found in this campaign');

    return this.prisma.generatedMessage.update({
      where: { id: messageId },
      data: {
        subject: dto.subject,
        body: dto.body
      }
    });
  }

  async regenerateMessage(campaignId: string, messageId: string, dto: RegenerateMessageDto, tenantId: string) {
    // Verify ownership
    const campaign = await this.findOne(campaignId, tenantId);

    const message = await this.prisma.generatedMessage.findFirst({
      where: {
        id: messageId,
        campaignProspect: { campaignId }
      },
      include: {
        campaignProspect: {
          include: { prospect: true }
        },
        sequenceStep: true
      }
    });

    if (!message) throw new NotFoundException('Message not found');

    const prospect = message.campaignProspect.prospect;
    const globalContext = (campaign.aiConfig as any)?.globalContext || '';
    const enrichmentData: any = prospect.enrichmentData || {};

    let systemPrompt = `Tu es un expert en copywriting B2B. Ton but est de RÃ‰Ã‰CRIRE un email existant en respectant UNE INSTRUCTION PRÃ‰CISE de l'utilisateur.
RÃ¨gles strictes :
- Jamais de "Bonjour Monsieur/Madame".
- Sois trÃ¨s concis et direct.
- Applique l'instruction Ã  la lettre, tout en gardant le sens original de l'email si l'instruction le permet.

CONTEXTE DE LA CAMPAGNE :
${globalContext}

INFOS DU PROSPECT :
Nom: ${prospect.firstName} ${prospect.lastName}
Entreprise: ${prospect.companyName}
Secteur: ${prospect.industry || ''}
${enrichmentData.deepResearch ? `\n--- RÃ‰SULTATS DE LA RECHERCHE APPROFONDIE ---\n${enrichmentData.deepResearch}\n--------------------------------------------` : ''}

EMAIL ORIGINAL Ã€ MODIFIER :
Sujet: ${message.subject || '(Pas de sujet)'}
Corps:
${message.body}

INSTRUCTION DE L'UTILISATEUR (CE QUE TU DOIS CHANGER) :
${dto.instruction}
`;

    const aiModel = (campaign.aiConfig as any)?.model || 'gemini-3.5-flash';
    const result = await generateText({
      model: vertex(aiModel),
      system: systemPrompt,
      prompt: "RÃ©dige la nouvelle version de l'email. Si le message original avait un sujet ou si l'instruction en demande un, Ã©cris-le sur la premiÃ¨re ligne prÃ©fixÃ© par 'OBJET:'. Le reste est le corps de l'email.",
    });

    let text = result.text.trim();
    let newSubject = message.subject;
    let newBody = text;

    if (text.toUpperCase().startsWith('OBJET:')) {
      const parts = text.split('\n');
      newSubject = parts[0].substring(6).trim();
      newBody = parts.slice(1).join('\n').trim();
    }

    return this.prisma.generatedMessage.update({
      where: { id: messageId },
      data: {
        subject: newSubject,
        body: newBody
      }
    });
  }
}
