import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';
import { promisify } from 'util';
import * as emailValidator from 'email-validator';
import axios from 'axios';
import { WebSearchAgentService } from './web-search-agent.service';

const resolveMx = promisify(dns.resolveMx);

export interface ValidationResult {
  email: string;
  isValid: boolean;
  isCatchAll: boolean;
  confidence: number;
  source: 'smtp_verified' | 'no2bounce_api' | 'catch_all' | 'generic_verified' | 'hunter_api' | 'gemini_search';
}

@Injectable()
export class EmailDiscoveryService {
  private readonly logger = new Logger(EmailDiscoveryService.name);

  // No2Bounce API Key
  private readonly no2bounceApiKey = process.env.NO2BOUNCE_API_KEY || '';
  
  // Anymail Finder API Key
  private readonly anymailFinderApiKey = process.env.ANYMAIL_FINDER_API_KEY || '';
  
  private smtpAvailable: boolean | null = null;

  constructor(private readonly webSearchAgent: WebSearchAgentService) {}

  // ============================================================
  // PERMUTATIONS D'EMAIL
  // ============================================================

  generatePermutations(firstName: string, lastName: string, domain: string): string[] {
    const f = this.normalize(firstName);
    const l = this.normalize(lastName);
    if (!f || !l) return [];

    const permutations = [
      `${f}.${l}@${domain}`,
      `${f}${l}@${domain}`,
      `${f.charAt(0)}.${l}@${domain}`,
      `${f.charAt(0)}${l}@${domain}`,
      `${l}.${f}@${domain}`,
      `${f}_${l}@${domain}`,
      `${l}_${f}@${domain}`,
      `${f}@${domain}`,
      `${l}@${domain}`,
      `${f}-${l}@${domain}`,
      `${l}-${f}@${domain}`,
      `${f.charAt(0)}${l.charAt(0)}@${domain}`,
      `${f}${l.charAt(0)}@${domain}`,
      `${l}${f.charAt(0)}@${domain}`,
    ];
    return [...new Set(permutations)];
  }

  generateGenericEmails(domain: string): string[] {
    return [
      `contact@${domain}`,
      `info@${domain}`,
      `direction@${domain}`,
      `bonjour@${domain}`,
      `hello@${domain}`,
      `commercial@${domain}`,
      `accueil@${domain}`,
    ];
  }

  extractEmailsFromText(text: string, domain?: string): string[] {
    if (!text) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const allEmails = text.match(emailRegex) || [];
    const cleaned = [...new Set(allEmails.map(e => e.toLowerCase().trim()))];
    const excluded = ['noreply', 'no-reply', 'unsubscribe', 'mailer-daemon', 'postmaster', 'abuse'];
    const filtered = cleaned.filter(e => !excluded.includes(e.split('@')[0]));
    if (domain) {
      const domainEmails = filtered.filter(e => e.endsWith(`@${domain}`));
      const otherEmails = filtered.filter(e => !e.endsWith(`@${domain}`));
      return [...domainEmails, ...otherEmails];
    }
    return filtered;
  }

  private normalize(name: string): string {
    return name
      .toLowerCase().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
  }

  private cleanDomain(domain: string): string {
    return domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim();
  }

  // ============================================================
  // MÉTHODE 1 : NO2BOUNCE API
  // ============================================================

  private async no2bounceVerify(email: string): Promise<ValidationResult | null> {
    if (!this.no2bounceApiKey) return null;

    try {
      // Étape 1 : Soumettre l'email à valider (POST)
      const postRes = await axios.post(
        'https://connect.no2bounce.com/v2/n2b_validate_email',
        { email },
        { headers: { apitoken: this.no2bounceApiKey }, timeout: 8000 }
      );
      
      const trackingId = postRes.data?.data?.trackingId;
      if (!trackingId) return null;

      // Étape 2 : Polling pour récupérer le résultat asynchrone (max ~22 secondes)
      let attempts = 0;
      while (attempts < 15) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Attente 1.5s
        attempts++;

        const getRes = await axios.get(
          `https://connect.no2bounce.com/v2/n2b_validate_email?trackingId=${trackingId}`,
          { headers: { apitoken: this.no2bounceApiKey }, timeout: 8000 }
        );

        const data = getRes.data;
        if (data.overallStatus === 'Completed') {
          const status = data.result?.scoreStatus;
          if (status.includes('AcceptAll') || status.includes('CatchAll')) {
             this.logger.log(`⚠️ [No2Bounce] ${email} → CATCH-ALL (${status})`);
             return { email, isValid: true, isCatchAll: true, confidence: 50, source: 'catch_all' };
          } else if (status.includes('Deliverable') && !status.includes('UnDeliverable')) {
             this.logger.log(`✅ [No2Bounce] ${email} → SAFE (${status})`);
             return { email, isValid: true, isCatchAll: false, confidence: 99, source: 'no2bounce_api' };
          } else if (status.includes('UnDeliverable') || status.includes('Invalid')) {
             this.logger.debug(`❌ [No2Bounce] ${email} → INVALID (${status})`);
             return null;
          } else {
             this.logger.debug(`❓ [No2Bounce] ${email} → ${status}`);
             return null;
          }
        }
      }
      this.logger.warn(`⏳ [No2Bounce] Timeout polling pour ${email}`);
      return null;

    } catch (error: any) {
      this.logger.warn(`[No2Bounce] Erreur pour ${email}: ${error.response?.data?.message || error.message}`);
      return null;
    }
  }

  // Lance les requêtes en parallèle et s'arrête dès qu'un email valide est trouvé
  private async no2bounceFindEmailParallel(emails: string[]): Promise<ValidationResult | null> {
    const BATCH_SIZE = 5;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      this.logger.log(`🔍 [No2Bounce] Vague ${Math.floor(i/BATCH_SIZE)+1}: test de ${batch.length} emails en parallèle...`);
      
      const results = await Promise.allSettled(
        batch.map(email => this.no2bounceVerify(email))
      );
      
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && r.value.isValid && !r.value.isCatchAll) {
          return r.value; // Retourner dès qu'on trouve le premier valide !
        }
      }
    }
    return null;
  }

  // ============================================================
  // MÉTHODE 2 : SMTP DIRECT (Fallback si No2Bounce est indisponible ou non configuré)
  // ============================================================

  async getMxRecords(domain: string): Promise<string[]> {
    try {
      const records = await resolveMx(domain);
      records.sort((a, b) => a.priority - b.priority);
      return records.map(r => r.exchange).filter(ex => ex && ex !== '.');
    } catch (error) {
      this.logger.warn(`Aucun MX pour: ${domain}`);
      return [];
    }
  }

  async isCatchAll(domain: string, mxRecord: string): Promise<boolean> {
    const randomEmail = `xtest${Math.random().toString(36).substring(2, 10)}yz@${domain}`;
    return this.pingSmtp(randomEmail, mxRecord);
  }

  private async pingSmtp(email: string, mxRecord: string): Promise<boolean> {
    return new Promise((resolve) => {
      let step = 0;
      let resolved = false;
      const timeout = 7000;
      const socket = net.createConnection(25, mxRecord);

      const finish = (result: boolean) => {
        if (!resolved) {
          resolved = true;
          try { socket.write(`QUIT\r\n`); } catch { }
          socket.end();
          socket.destroy();
          resolve(result);
        }
      };

      socket.setTimeout(timeout, () => finish(false));
      socket.on('error', () => finish(false));

      socket.on('data', (data) => {
        const response = data.toString();
        const code = parseInt(response.substring(0, 3), 10);

        if (step === 0 && code === 220) {
          socket.write(`EHLO prospectai.io\r\n`);
          step++;
        } else if (step === 1 && code === 250) {
          socket.write(`MAIL FROM:<verify@prospectai.io>\r\n`);
          step++;
        } else if (step === 2 && code === 250) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          step++;
        } else if (step === 3) {
          if (code === 250 || code === 251 || code === 252) {
            this.logger.debug(`SMTP: ${email} → ACCEPTÉ (${code})`);
            finish(true);
          } else {
            this.logger.debug(`SMTP: ${email} → REJETÉ (${code})`);
            finish(false);
          }
        } else if (code >= 400) {
          finish(false);
        }
      });
    });
  }

  private async isSmtpAvailable(): Promise<boolean> {
    if (this.smtpAvailable !== null) return this.smtpAvailable;

    return new Promise((resolve) => {
      const socket = net.createConnection(25, 'aspmx.l.google.com');
      socket.setTimeout(4000, () => {
        this.logger.warn('⚠️ Port 25 bloqué. SMTP direct indisponible.');
        this.smtpAvailable = false;
        socket.destroy();
        resolve(false);
      });
      socket.on('data', () => {
        this.logger.log('✅ Port 25 ouvert. SMTP direct disponible.');
        this.smtpAvailable = true;
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        this.smtpAvailable = false;
        socket.destroy();
        resolve(false);
      });
    });
  }

  private async smtpFindEmailParallel(emails: string[], mxRecord: string, source: ValidationResult['source']): Promise<ValidationResult | null> {
    const BATCH_SIZE = 3;
    
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      this.logger.log(`📡 [SMTP] Vague ${Math.floor(i/BATCH_SIZE)+1}: test de ${batch.length} emails en parallèle...`);
      
      const results = await Promise.allSettled(
        batch.map(async (email) => {
          const isValid = await this.pingSmtp(email, mxRecord);
          if (isValid) {
            this.logger.log(`✅ [SMTP] Email vérifié: ${email}`);
            return { email, isValid: true, isCatchAll: false, confidence: 99, source } as ValidationResult;
          }
          return null;
        })
      );
      
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) return r.value;
      }
      
      if (i + BATCH_SIZE < emails.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    return null;
  }

  // ============================================================
  // ORCHESTRATION
  // ============================================================

  async verifyEmail(email: string): Promise<ValidationResult> {
    if (!emailValidator.validate(email)) {
      return { email, isValid: false, isCatchAll: false, confidence: 0, source: 'smtp_verified' };
    }

    const domain = email.split('@')[1];
    
    const dummyDomains = ['example.com', 'example.org', 'example.net', 'domain.com'];
    if (dummyDomains.includes(domain.toLowerCase())) {
      return { email, isValid: false, isCatchAll: false, confidence: 0, source: 'smtp_verified' };
    }

    const mxRecords = await this.getMxRecords(domain);
    if (mxRecords.length === 0) {
      return { email, isValid: false, isCatchAll: false, confidence: 0, source: 'smtp_verified' };
    }

    // No2Bounce en priorité
    if (this.no2bounceApiKey) {
      const result = await this.no2bounceVerify(email);
      if (result) return result;
    }

    // SMTP direct en fallback
    if (await this.isSmtpAvailable()) {
      if (mxRecords.length > 0) {
        const primaryMx = mxRecords[0];
        const isValid = await this.pingSmtp(email, primaryMx);
        const catchAll = isValid ? await this.isCatchAll(domain, primaryMx) : false;
        return {
          email,
          isValid,
          isCatchAll: catchAll,
          confidence: isValid ? (catchAll ? 50 : 99) : 0,
          source: 'smtp_verified',
        };
      }
    }

    this.logger.warn(`Impossible de vérifier ${email}: ni No2Bounce ni SMTP disponible.`);
    return { email, isValid: false, isCatchAll: false, confidence: 0, source: 'smtp_verified' };
  }

  // ============================================================
  // MÉTHODE 3 : ANYMAIL FINDER (Dernier Recours)
  // ============================================================

  private async anymailFinderSearch(firstName: string, lastName: string, domain: string): Promise<ValidationResult | null> {
    if (!this.anymailFinderApiKey) {
      this.logger.warn(`❌ ANYMAIL_FINDER_API_KEY non configurée. Fallback impossible.`);
      return null;
    }

    try {
      this.logger.log(`⚠️ [Anymail Finder] Recherche en dernier recours pour ${firstName} ${lastName} @ ${domain}`);
      const response = await axios.post(
        'https://api.anymailfinder.com/v5.1/find-email/person',
        { full_name: `${firstName} ${lastName}`, domain },
        {
          headers: {
            'Authorization': this.anymailFinderApiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const emailInfo = response.data?.email;
      const foundEmail = response.data?.email_address || (emailInfo && emailInfo.email);

      if (foundEmail) {
        this.logger.log(`✅ [Anymail Finder] Email trouvé ! ${foundEmail}`);
        return {
          email: foundEmail,
          isValid: true,
          isCatchAll: false,
          confidence: 90,
          source: 'generic_verified' // fallback source pour Anymail
        };
      }

      this.logger.warn(`❌ [Anymail Finder] Aucun email trouvé.`);
      return null;
    } catch (error: any) {
      this.logger.error(`❌ [Anymail Finder] Erreur: ${error.response?.data?.message || error.message}`);
      return null;
    }
  }

  async findValidEmail(firstName: string, lastName: string, domain: string, companyName: string, linkedinUrl?: string): Promise<ValidationResult | null> {
    domain = this.cleanDomain(domain);
    this.logger.log(`🔎 Recherche d'email pour ${firstName} ${lastName} @ ${domain} (${companyName})`);

    const dummyDomains = ['example.com', 'example.org', 'example.net', 'domain.com'];
    if (dummyDomains.includes(domain.toLowerCase())) {
      this.logger.error(`❌ [Validation] Domaine factice ignoré : ${domain}`);
      return null;
    }

    const mxRecords = await this.getMxRecords(domain);
    if (mxRecords.length === 0) {
      this.logger.error(`❌ [Validation] Le domaine ${domain} n'a pas d'enregistrement MX. Abandon.`);
      return null;
    }

    const hasNo2Bounce = !!this.no2bounceApiKey;
    if (!hasNo2Bounce) {
      this.logger.error(`❌ NO2BOUNCE_API_KEY non configurée. Impossible de valider les emails.`);
    }

    // ════════════════════════════════════════════════════
    // NIVEAU 1 : OSINT Gemini - Recherche nominative directe
    // ════════════════════════════════════════════════════
    const foundEmail = await this.webSearchAgent.findPersonalEmail(firstName, lastName, companyName, domain, linkedinUrl);
    
    if (foundEmail && hasNo2Bounce) {
      this.logger.log(`🔍 [Niveau 1] Validation No2Bounce de l'email trouvé par Gemini : ${foundEmail}`);
      const result = await this.no2bounceVerify(foundEmail);
      if (result && result.isValid && !result.isCatchAll) {
        result.source = 'gemini_search';
        result.confidence = 95;
        this.logger.log(`✅ [Niveau 1] Succès ! Email trouvé et validé : ${foundEmail}`);
        return result;
      }
      this.logger.warn(`❌ [Niveau 1] L'email Gemini (${foundEmail}) est invalide selon No2Bounce.`);
    } else if (!foundEmail) {
      this.logger.warn(`❌ [Niveau 1] Gemini n'a pas trouvé d'email nominatif pour ${firstName} ${lastName}.`);
    }

    // ════════════════════════════════════════════════════
    // NIVEAU 2 : Recherche du Pattern de l'entreprise via Gemini (Gratuit)
    // ════════════════════════════════════════════════════
    this.logger.log(`🔄 [Niveau 2] Recherche du format d'email pour ${companyName}...`);
    const f = this.normalize(firstName);
    const l = this.normalize(lastName);

    if (f && l && hasNo2Bounce) {
      const pattern = await this.webSearchAgent.findEmailPattern(domain, companyName);
      
      if (pattern) {
        const patternEmail = this.applyPattern(pattern, f, l, domain);
        if (patternEmail) {
          this.logger.log(`🔍 [Niveau 2] Pattern trouvé : "${pattern}" → Test de ${patternEmail}`);
          const result = await this.no2bounceVerify(patternEmail);
          if (result && result.isValid && !result.isCatchAll) {
            result.source = 'gemini_search';
            result.confidence = 90;
            this.logger.log(`✅ [Niveau 2] Succès via Pattern ! Email : ${patternEmail}`);
            return result;
          }
          this.logger.warn(`❌ [Niveau 2] Email pattern (${patternEmail}) invalide.`);
        }
      } else {
        this.logger.warn(`❌ [Niveau 2] Aucun format d'email trouvé pour ${companyName}.`);
      }

      // ════════════════════════════════════════════════════
      // NIVEAU 3 : Top 3 Permutations Statistiques (Max 3 crédits No2Bounce)
      // ════════════════════════════════════════════════════
      this.logger.log(`🔄 [Niveau 3] Test des 3 formats B2B les plus courants (en parallèle)...`);
      const top3 = [
        `${f}.${l}@${domain}`,     // prenom.nom (le + courant, ~45%)
        `${f}@${domain}`,          // prenom (~25%)
        `${f.charAt(0)}.${l}@${domain}`, // p.nom (~20%)
      ];

      const results = await Promise.allSettled(
        top3.map(email => this.no2bounceVerify(email))
      );

      // Chercher le premier résultat valide non catch-all
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value && r.value.isValid && !r.value.isCatchAll) {
          r.value.source = 'gemini_search';
          r.value.confidence = 75;
          this.logger.log(`✅ [Niveau 3] Succès via permutation ! Email : ${r.value.email}`);
          return r.value;
        }
      }
      this.logger.warn(`❌ [Niveau 3] Les 3 formats principaux ont échoué pour ${f}.${l}@${domain}`);
    }

    // ════════════════════════════════════════════════════
    // NIVEAU 4 : Anymail Finder - Dernier recours (Payant)
    // ════════════════════════════════════════════════════
    this.logger.log(`🔄 [Niveau 4] Passage au Fallback Anymail Finder pour ${firstName} ${lastName} @ ${domain}`);
    return this.anymailFinderSearch(firstName, lastName, domain);
  }

  private applyPattern(pattern: string, f: string, l: string, domain: string): string | null {
    const map: Record<string, string> = {
      'prenom.nom':  `${f}.${l}@${domain}`,
      'nom.prenom':  `${l}.${f}@${domain}`,
      'p.nom':       `${f.charAt(0)}.${l}@${domain}`,
      'n.prenom':    `${l.charAt(0)}.${f}@${domain}`,
      'prenom':      `${f}@${domain}`,
      'nom':         `${l}@${domain}`,
      'prenomnom':   `${f}${l}@${domain}`,
      'pnom':        `${f.charAt(0)}${l}@${domain}`,
      'prenom_nom':  `${f}_${l}@${domain}`,
    };
    return map[pattern] || null;
  }

  async verifyWebFoundEmail(email: string): Promise<ValidationResult | null> {
    if (!emailValidator.validate(email)) return null;
    return this.verifyEmail(email);
  }
}
