import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DataEnrichmentAgentService } from '../agents/services/data-enrichment-agent.service';
import { EmailDiscoveryService } from '../agents/services/email-discovery.service';
import { GooglePlacesService } from '../agents/services/google-places.service';
import { WebSearchAgentService } from '../agents/services/web-search-agent.service';
import { ProspectsService } from '../prospects/prospects.service';
import { EnrichmentJobData } from './enrichment.service';

@Processor('enrichment', { concurrency: 3 })
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentAgent: DataEnrichmentAgentService,
    private readonly emailDiscovery: EmailDiscoveryService,
    private readonly googlePlaces: GooglePlacesService,
    private readonly webSearch: WebSearchAgentService,
    private readonly prospectsService: ProspectsService,
  ) {
    super();
  }

  async process(job: Job<EnrichmentJobData>) {
    this.logger.debug(`Traitement du job ${job.id} pour le CSV ${job.data.csvJobId}`);
    
    const { csvJobId, tenantId, listId, rowData, options, duplicateAction, prospectId } = job.data;

    try {
      // 1. Détection des doublons avant d'appeler l'IA (sauf si on enrichit un prospect précis)
      let existingProspect = null;
      
      if (prospectId) {
        existingProspect = await this.prisma.prospect.findUnique({
          where: { id: prospectId }
        });
      } else {
        const email = rowData.email?.toLowerCase().trim();
        const firstName = this.cleanName(rowData.firstName || rowData._raw?.firstName || '')?.toLowerCase();
        const lastName = this.cleanName(rowData.lastName || rowData._raw?.lastName || '')?.toLowerCase();
        const companyName = (rowData.companyName || rowData._raw?.companyName || '')?.toLowerCase().trim();
        const companyDomain = (rowData.companyDomain || rowData._raw?.companyDomain || '')?.toLowerCase().trim();

        const orConditions: any[] = [];
        if (email) {
          orConditions.push({ email });
        }
        if (firstName && lastName) {
          orConditions.push({
            firstName: { equals: firstName, mode: 'insensitive' },
            lastName: { equals: lastName, mode: 'insensitive' }
          });
        }
        
        if (orConditions.length > 0) {
          // Fetch potential matches
          const candidates = await this.prisma.prospect.findMany({
            where: { tenantId, OR: orConditions }
          });
          
          // Strict memory matching
          existingProspect = candidates.find(p => {
             if (email && p.email?.toLowerCase() === email) return true;
             if (firstName && lastName && p.firstName?.toLowerCase() === firstName && p.lastName?.toLowerCase() === lastName) {
                if (companyName && p.companyName?.toLowerCase() === companyName) return true;
                if (companyDomain && p.companyDomain?.toLowerCase() === companyDomain) return true;
             }
             return false;
          }) || null;
        }
      }

      if (existingProspect && duplicateAction === 'skip' && !prospectId) {
        this.logger.debug(`Ligne ignorée (doublon): ${rowData.email || rowData.companyDomain}`);
        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: { processedRows: { increment: 1 } }
        });
        await this.checkJobCompletion(csvJobId);
        return;
      }

      // 2. Déterminer ce qu'on doit VRAIMENT chercher pour CETTE ligne
      const rowOptions = { ...options };
      if (rowData.email || existingProspect?.email) {
        rowOptions.findEmail = false;
      }
      if (rowData.phone || existingProspect?.phone) {
        rowOptions.findPhone = false;
      }
      if (rowData.linkedinUrl || existingProspect?.linkedinUrl) {
        rowOptions.findLinkedin = false;
      }
      if (rowData.jobTitle || existingProspect?.jobTitle) {
        rowOptions.findDirectorName = false;
      }
      if (rowData.companyDomain || existingProspect?.companyDomain) {
        rowOptions.findWebsite = false;
      }

      const needsSearch = rowOptions.findEmail || rowOptions.findPhone || rowOptions.findDirectorName || rowOptions.findLinkedin || rowOptions.findWebsite;

      let enrichmentResult: any = { success: true, data: {} };

      if (needsSearch) {
        const isEmailOnly = rowOptions.findEmail 
          && !rowOptions.findPhone 
          && !rowOptions.findDirectorName 
          && !rowOptions.findLinkedin 
          && !rowOptions.findWebsite;

        if (isEmailOnly) {
          // ========== FAST PATH : Appel SMTP direct, SANS IA ==========
          enrichmentResult = await this.fastPathEmailOnly(rowData);
        } else {
          // ========== FULL PATH : Agent IA pour enrichissement complet ==========
          enrichmentResult = await this.enrichmentAgent.enrichRow(rowData, rowOptions);
        }
      } else {
        this.logger.debug(`Aucune recherche nécessaire pour la ligne (données déjà présentes): ${rowData.email || rowData.companyDomain}`);
      }
      
      if (enrichmentResult.success && enrichmentResult.data) {
        const data = enrichmentResult.data;
        let companyDomain: string | null = null;
        try {
          companyDomain = data.website ? new URL(data.website).hostname.replace('www.', '') : (rowData.companyDomain || null);
        } catch {
          companyDomain = rowData.companyDomain || null;
        }

        // Fallbacks if user mapped standard fields to "Tag personnalisé" instead of official dropdown
        const customFirstName = rowData._customData?.['Prénom'] || rowData._customData?.['prenom'] || rowData._customData?.['firstName'];
        const customLastName = rowData._customData?.['Nom'] || rowData._customData?.['nom'] || rowData._customData?.['lastName'];
        const customEmail = rowData._customData?.['Email'] || rowData._customData?.['email'];
        const customPhone = rowData._customData?.['Téléphone'] || rowData._customData?.['phone'] || rowData._customData?.['tel'];

        // Helper to ignore 'Inconnu' from AI which is truthy and would overwrite valid CSV data
        const validAiData = (val: any) => (val && typeof val === 'string' && val.toLowerCase() !== 'inconnu') ? val : undefined;

        const prospectData = {
          // Priority to CSV (rowData) or Custom Tag over AI (data) to prevent AI from messing up existing names
          firstName: this.cleanName(rowData.firstName || customFirstName || validAiData(data.firstName) || existingProspect?.firstName || 'Inconnu'),
          lastName: this.cleanName(rowData.lastName || customLastName || validAiData(data.lastName) || existingProspect?.lastName || 'Inconnu'),
          companyName: rowData.companyName || validAiData(data.companyName) || existingProspect?.companyName || 'Inconnu',
          // Priority to AI for enriched fields like email, phone, etc.
          email: validAiData(data.email) || rowData.email || customEmail || existingProspect?.email,
          phone: validAiData(data.phone) || rowData.phone || customPhone || existingProspect?.phone,
          linkedinUrl: validAiData(data.linkedinUrl) || rowData.linkedinUrl || existingProspect?.linkedinUrl,
          jobTitle: validAiData(data.jobTitle) || rowData.jobTitle || existingProspect?.jobTitle,
          companyDomain: companyDomain || existingProspect?.companyDomain,
          emailVerified: (data.emailConfidence || 0) >= 80 ? true : (existingProspect?.emailVerified || false),
          emailConfidence: Math.max(data.emailConfidence || 0, existingProspect?.emailConfidence || 0),
          source: prospectId ? undefined : 'API_IMPORT' as any, // ne pas écraser la source si MAJ
          enrichmentData: { ...(existingProspect?.enrichmentData as any || {}), ...data, ...(rowData._customData || {}) },
          csvImportJobId: prospectId ? undefined : csvJobId, // id job utilisé pour import initial seulement
        };

        // Enlever les undefined pour ne pas écraser les valeurs par défaut prisma
        if (prospectId) {
          delete prospectData.source;
          delete prospectData.csvImportJobId;
        }

        // Re-vérifier les doublons APRÈS l'enrichissement
        if (!existingProspect && (prospectData.email || (prospectData.firstName && prospectData.lastName))) {
          const postOrConditions: any[] = [];
          if (prospectData.email) {
             postOrConditions.push({ email: prospectData.email.toLowerCase() });
          }
          if (prospectData.firstName && prospectData.lastName) {
             postOrConditions.push({
                firstName: { equals: prospectData.firstName, mode: 'insensitive' },
                lastName: { equals: prospectData.lastName, mode: 'insensitive' }
             });
          }
          
          if (postOrConditions.length > 0) {
            const candidates = await this.prisma.prospect.findMany({
              where: { tenantId, OR: postOrConditions }
            });
            
            existingProspect = candidates.find(p => {
               if (prospectData.email && p.email?.toLowerCase() === prospectData.email.toLowerCase()) return true;
               if (p.firstName?.toLowerCase() === prospectData.firstName.toLowerCase() && p.lastName?.toLowerCase() === prospectData.lastName.toLowerCase()) {
                  if (prospectData.companyName && p.companyName?.toLowerCase() === prospectData.companyName.toLowerCase()) return true;
                  if (prospectData.companyDomain && p.companyDomain?.toLowerCase() === prospectData.companyDomain.toLowerCase()) return true;
               }
               return false;
            }) || null;
          }
        }

        let savedProspectId: string | undefined;

        if (existingProspect) {
          if (prospectId || duplicateAction === 'update' || duplicateAction === 'skip') {
            // Si prospectId fourni, on met TOUJOURS à jour. Sinon on respecte le duplicateAction.
            if (prospectId || duplicateAction === 'update') {
              const updated = await this.prisma.prospect.update({
                where: { id: existingProspect.id },
                data: prospectData
              });
              savedProspectId = updated.id;
            } else {
              savedProspectId = existingProspect.id;
            }
          }
        } else {
          const created = await this.prospectsService.create(prospectData as any, tenantId);
          savedProspectId = created.id;
        }

        // Lier le prospect à la liste
        if (savedProspectId && listId) {
          try {
            await this.prisma.prospectListEntry.upsert({
              where: {
                prospectId_prospectListId: {
                  prospectId: savedProspectId,
                  prospectListId: listId
                }
              },
              create: {
                prospectId: savedProspectId,
                prospectListId: listId
              },
              update: {}
            });
          } catch (e: any) {
            this.logger.error(`Erreur liaison prospect/liste: ${e.message}`);
          }
        }

        // Mise à jour des compteurs du job
        const incData: any = { processedRows: { increment: 1 } };
        if (enrichmentResult.data.email) {
          incData.enrichedRows = { increment: 1 };
          if (enrichmentResult.source === 'gemini_search' || enrichmentResult.source === 'google_search') {
            incData.emailsFoundSearch = { increment: 1 };
          } else if (enrichmentResult.source === 'generic_verified' || enrichmentResult.source === 'anymail_finder') {
            incData.emailsFoundAnymail = { increment: 1 };
          } else if (enrichmentResult.source === 'database') {
            incData.emailsFoundDatabase = { increment: 1 };
          }
        } else {
          incData.emailsNotFound = { increment: 1 };
        }

        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: incData
        });
      } else {
        // Échec du traitement (pas de data ou pas de success)
        await this.prisma.csvImportJob.update({
          where: { id: csvJobId },
          data: {
            processedRows: { increment: 1 },
            failedRows: { increment: 1 }
          }
        });
      }
      
      await this.checkJobCompletion(csvJobId);
      
    } catch (error) {
      this.logger.error(`Erreur d'enrichissement pour la ligne ${job.id}:`, error);
      await this.prisma.csvImportJob.update({
        where: { id: csvJobId },
        data: {
          processedRows: { increment: 1 },
          failedRows: { increment: 1 }
        }
      });
      await this.checkJobCompletion(csvJobId);
      throw error;
    }
  }

  /**
   * FAST PATH : Recherche d'email SANS IA.
   * 1. Extraire prénom, nom, domaine depuis les données CSV brutes
   * 2. Si pas de domaine → Google Places pour trouver le site web
   * 3. Appel direct à EmailDiscoveryService.findValidEmail()
   * Résultat : 0 coût IA, 0 hallucination, 3× plus rapide
   */
  private async fastPathEmailOnly(rowData: any): Promise<any> {
    const rawFirstName = rowData.firstName || rowData._raw?.firstName || '';
    const rawLastName = rowData.lastName || rowData._raw?.lastName || '';
    const firstName = this.cleanName(rawFirstName);
    const lastName = this.cleanName(rawLastName);
    const companyName = this.extractCompanyName(rowData);
    const jobTitle = rowData.jobTitle || rowData._raw?.title || '';

    this.logger.log(`⚡ [FAST PATH] Noms nettoyés : "${rawFirstName}" → "${firstName}", "${rawLastName}" → "${lastName}"`);
    this.logger.log(`⚡ [FAST PATH] Recherche email directe pour ${firstName} ${lastName} @ ${companyName}`);

    // Étape 1 : Trouver le domaine
    let domain = this.extractDomain(rowData);
    let website: string | undefined;

    if (!domain && companyName) {
      // Tentative 1 : Google Places API
      this.logger.log(`⚡ [FAST PATH] Domaine manquant → Recherche Google Places pour "${companyName}"...`);
      try {
        const businesses = await this.googlePlaces.searchBusinesses(companyName, 1);
        if (businesses.length > 0 && businesses[0].website) {
          website = businesses[0].website;
          domain = new URL(website).hostname.replace('www.', '');
          this.logger.log(`⚡ [FAST PATH] Domaine trouvé via Google Places : ${domain}`);
        }
      } catch (e: any) {
        this.logger.warn(`⚡ [FAST PATH] Google Places a échoué : ${e.message}`);
      }

      // Tentative 2 : Fallback Gemini Search (léger, juste pour trouver le domaine)
      if (!domain) {
        this.logger.log(`⚡ [FAST PATH] Fallback → Recherche Gemini pour le site web de "${companyName}"...`);
        try {
          const searchResult = await this.webSearch.answerQuery(
            `Quel est le site web officiel de l'entreprise "${companyName}" ? Réponds UNIQUEMENT avec l'URL du site, rien d'autre. Exemple: https://example.com`
          );
          // Extraire une URL du résultat
          const urlMatch = searchResult.match(/https?:\/\/[^\s"'<>]+\.[a-z]{2,}/i);
          if (urlMatch) {
            website = urlMatch[0].replace(/[.,;:!?)\]]+$/, ''); // nettoyer la ponctuation finale
            const extractedDomain = new URL(website).hostname.replace('www.', '');
            // Ignorer les résultats LinkedIn/Facebook/Twitter
            if (!extractedDomain.includes('linkedin.com') && !extractedDomain.includes('facebook.com') && !extractedDomain.includes('twitter.com')) {
              domain = extractedDomain;
              this.logger.log(`⚡ [FAST PATH] Domaine trouvé via Gemini Search : ${domain}`);
            }
          }
        } catch (e: any) {
          this.logger.warn(`⚡ [FAST PATH] Gemini Search a échoué : ${e.message}`);
        }
      }
    }

    if (!domain) {
      this.logger.warn(`⚡ [FAST PATH] ❌ Impossible de trouver le domaine pour "${companyName}". Abandon.`);
      return {
        success: true,
        source: null,
        data: { firstName, lastName, companyName, jobTitle, email: null, emailConfidence: 0 },
      };
    }

    // Étape 2 : Découverte Intelligente (Gemini + No2Bounce + Anymail Finder)
    let linkedinUrl = rowData.linkedinUrl; // 1. Priorité au mapping manuel fait par l'utilisateur
    if (!linkedinUrl && rowData._raw) {
      // 2. Fallback intelligent sur les colonnes brutes du CSV
      const rawKeys = Object.keys(rowData._raw);
      // Cherche une colonne qui parle de linkedin mais pas de l'entreprise
      const bestKey = rawKeys.find(k => {
        const lower = k.toLowerCase();
        return lower.includes('linkedin') && !lower.includes('company') && !lower.includes('entreprise');
      });
      if (bestKey) linkedinUrl = rowData._raw[bestKey];
    }
    const emailResult = await this.emailDiscovery.findValidEmail(rawFirstName, rawLastName, domain, companyName, linkedinUrl);

    if (emailResult && emailResult.isValid) {
      this.logger.log(`⚡ [FAST PATH] ✅ Email trouvé : ${emailResult.email} (confiance: ${emailResult.confidence}%)`);
      return {
        success: true,
        source: emailResult.source,
        data: {
          firstName,
          lastName,
          companyName,
          jobTitle,
          email: emailResult.email,
          emailConfidence: emailResult.confidence,
          website: website || (domain ? `https://${domain}` : undefined),
        },
      };
    }

    this.logger.warn(`⚡ [FAST PATH] ❌ Aucun email valide trouvé pour ${firstName} ${lastName} @ ${domain}`);
    return {
      success: true,
      source: null,
      data: {
        firstName,
        lastName,
        companyName,
        jobTitle,
        email: null,
        emailConfidence: 0,
        website: website || (domain ? `https://${domain}` : undefined),
      },
    };
  }

  /**
   * Extrait un nom de domaine clean à partir des données CSV brutes.
   * Gère les cas : URL complète, domaine simple, URL LinkedIn (ignorée).
   */
  private extractDomain(rowData: any): string | null {
    // Chercher dans les champs possibles
    const candidates = [
      rowData.companyDomain,
      rowData._raw?.companyDomain,
      rowData._raw?.website,
      rowData.website,
    ];

    for (const raw of candidates) {
      if (!raw || typeof raw !== 'string') continue;
      // Ignorer les URLs LinkedIn  
      if (raw.includes('linkedin.com')) continue;
      
      try {
        // Si c'est une URL, extraire le hostname
        if (raw.startsWith('http')) {
          return new URL(raw).hostname.replace('www.', '');
        }
        // Si c'est un domaine simple (contient un point, pas d'espace)
        if (raw.includes('.') && !raw.includes(' ')) {
          return raw.replace(/^www\./, '').trim();
        }
      } catch { /* ignorer les formats invalides */ }
    }

    return null;
  }

  /**
   * Extrait le nom de l'entreprise proprement, en ignorant les URLs LinkedIn.
   */
  private extractCompanyName(rowData: any): string {
    const candidates = [
      rowData._raw?.companyName,
      rowData.companyName,
    ];
    
    for (const name of candidates) {
      if (name && typeof name === 'string' && !name.includes('linkedin.com')) {
        return name;
      }
    }
    
    return 'Inconnu';
  }

  /**
   * Nettoie un prénom ou nom :
   * - Supprime les emojis et caractères spéciaux Unicode
   * - Supprime les infos parasites après " - " (ex: "Pierre Garro - SEO 🔍 SEA" → "Pierre Garro")
   * - Supprime les infos après " & " si suivi de mots longs (ex: "PLAUD & DOIDO - Identité" → "PLAUD")
   * - Normalise la casse (GARDAS → Gardas)
   * - Supprime les espaces en trop
   */
  private cleanName(raw: string): string {
    if (!raw) return '';
    
    let name = raw;

    // 1. Couper après " - " (souvent un titre/poste collé au nom)
    const dashIndex = name.indexOf(' - ');
    if (dashIndex > 0) {
      name = name.substring(0, dashIndex);
    }

    // 2. Couper après " & " si suivi d'un mot long (info entreprise, pas un double nom)
    const ampIndex = name.indexOf(' & ');
    if (ampIndex > 0) {
      const afterAmp = name.substring(ampIndex + 3).trim();
      // Si ce qui suit est long (> 10 chars), c'est probablement une info parasite
      if (afterAmp.length > 10) {
        name = name.substring(0, ampIndex);
      }
    }

    // 3. Supprimer tous les emojis et caractères Unicode spéciaux
    name = name.replace(/[\u{1F000}-\u{1FFFF}]/gu, '') // emojis
              .replace(/[\u{2600}-\u{27BF}]/gu, '')     // symboles divers
              .replace(/[\u{FE00}-\u{FE0F}]/gu, '')     // variation selectors
              .replace(/[\u{200D}]/gu, '')               // zero-width joiner
              .replace(/[\u{20E3}]/gu, '')               // combining enclosing keycap
              .replace(/[\u{E0020}-\u{E007F}]/gu, '');   // tags

    // 4. Supprimer les caractères spéciaux restants (garder lettres, espaces, tirets, apostrophes)
    name = name.replace(/[^\p{L}\s'-]/gu, '');

    // 5. Normaliser la casse : "GARDAS" → "Gardas", "pierre" → "Pierre"
    name = name.trim().split(/\s+/).map(word => {
      if (word.length === 0) return '';
      // Garder les noms composés avec tiret : "Armel-Alexandre" 
      return word.split('-').map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join('-');
    }).join(' ');

    return name.trim();
  }

  private async checkJobCompletion(csvJobId: string) {
    const job = await this.prisma.csvImportJob.findUnique({ where: { id: csvJobId }});
    if (job && job.processedRows >= job.totalRows) {
      await this.prisma.csvImportJob.update({
        where: { id: csvJobId },
        data: { status: 'COMPLETED' }
      });
      this.logger.log(`🎉 Job CSV ${csvJobId} complété !`);
    }
  }
}
