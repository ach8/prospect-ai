import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';
import { promisify } from 'util';
import * as emailValidator from 'email-validator';
import axios from 'axios';

const resolveMx = promisify(dns.resolveMx);

export interface ValidationResult {
  email: string;
  isValid: boolean;
  isCatchAll: boolean;
  confidence: number;
  source: 'smtp_verified' | 'reacher_api' | 'catch_all' | 'generic_verified';
}

@Injectable()
export class EmailDiscoveryService {
  private readonly logger = new Logger(EmailDiscoveryService.name);

  /**
   * URL du backend Reacher (open source, self-hosted).
   * Configurer REACHER_API_URL dans .env (ex: http://mon-vps:8080)
   * Doc: https://github.com/reacherhq/check-if-email-exists
   */
  private readonly reacherUrl = process.env.REACHER_API_URL || '';
  private smtpAvailable: boolean | null = null;

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
  // MÉTHODE 1 : REACHER API (open source, self-hosted)
  // POST http://reacher-vps:8080/v0/check_email
  // Body: { "to_email": "test@example.com" }
  // Réponse: { is_reachable: "safe"|"risky"|"invalid"|"unknown", smtp: { is_deliverable, is_catch_all, ... } }
  // ============================================================

  private async reacherCheckEmail(email: string): Promise<{ isReachable: string; isDeliverable: boolean; isCatchAll: boolean } | null> {
    if (!this.reacherUrl) return null;

    try {
      const response = await axios.post(
        `${this.reacherUrl}/v0/check_email`,
        { to_email: email },
        { timeout: 15000 },
      );
      const data = response.data;
      return {
        isReachable: data.is_reachable, // "safe", "risky", "invalid", "unknown"
        isDeliverable: data.smtp?.is_deliverable ?? false,
        isCatchAll: data.smtp?.is_catch_all ?? false,
      };
    } catch (error: any) {
      this.logger.warn(`[Reacher] Erreur pour ${email}: ${error.message}`);
      return null;
    }
  }

  /**
   * Vérifie un email via Reacher et retourne un ValidationResult.
   */
  private async reacherVerify(email: string): Promise<ValidationResult | null> {
    const result = await this.reacherCheckEmail(email);
    if (!result) return null;

    if (result.isReachable === 'safe') {
      this.logger.log(`✅ [Reacher] ${email} → SAFE (délivrable)`);
      return { email, isValid: true, isCatchAll: false, confidence: 99, source: 'reacher_api' };
    }
    if (result.isReachable === 'risky') {
      if (result.isCatchAll) {
        this.logger.log(`⚠️ [Reacher] ${email} → RISKY (catch-all)`);
        return { email, isValid: true, isCatchAll: true, confidence: 50, source: 'catch_all' };
      }
      this.logger.log(`⚠️ [Reacher] ${email} → RISKY`);
      return { email, isValid: true, isCatchAll: false, confidence: 70, source: 'reacher_api' };
    }
    if (result.isReachable === 'invalid') {
      this.logger.debug(`❌ [Reacher] ${email} → INVALID`);
      return null; // Email invalide, on continue avec les autres permutations
    }
    // "unknown" → le serveur n'a pas pu vérifier
    this.logger.debug(`❓ [Reacher] ${email} → UNKNOWN`);
    return null;
  }

  // ============================================================
  // MÉTHODE 2 : SMTP DIRECT (quand port 25 est ouvert)
  // ============================================================

  async getMxRecords(domain: string): Promise<string[]> {
    try {
      const records = await resolveMx(domain);
      records.sort((a, b) => a.priority - b.priority);
      return records.map(r => r.exchange);
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
          try { socket.write(`QUIT\r\n`); } catch {}
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

  private async smtpFindEmail(emails: string[], mxRecord: string, source: ValidationResult['source']): Promise<ValidationResult | null> {
    for (const email of emails) {
      const isValid = await this.pingSmtp(email, mxRecord);
      if (isValid) {
        this.logger.log(`✅ [SMTP] Email vérifié: ${email}`);
        return { email, isValid: true, isCatchAll: false, confidence: 99, source };
      }
      await new Promise(r => setTimeout(r, 150));
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

    // Reacher en priorité
    if (this.reacherUrl) {
      const result = await this.reacherVerify(email);
      if (result) return result;
    }

    // SMTP direct en fallback
    if (await this.isSmtpAvailable()) {
      const domain = email.split('@')[1];
      const mxRecords = await this.getMxRecords(domain);
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

    this.logger.warn(`Impossible de vérifier ${email}: ni Reacher ni SMTP disponible.`);
    return { email, isValid: false, isCatchAll: false, confidence: 0, source: 'smtp_verified' };
  }

  /**
   * Découverte d'email en 2 méthodes (uniquement vérification réelle) :
   *
   * 1️⃣ Reacher API (self-hosted, open source) → SMTP à distance
   * 2️⃣ SMTP direct (si port 25 ouvert) → vérification locale
   *
   * Si aucune méthode disponible → retourne null (jamais d'invention).
   */
  async findValidEmail(firstName: string, lastName: string, domain: string): Promise<ValidationResult | null> {
    domain = this.cleanDomain(domain);
    this.logger.log(`🔎 Recherche d'email pour ${firstName} ${lastName} @ ${domain}`);

    const mxRecords = await this.getMxRecords(domain);
    if (mxRecords.length === 0) {
      this.logger.warn(`❌ Aucun MX pour ${domain}. Pas de serveur email.`);
      return null;
    }

    const hasReacher = !!this.reacherUrl;
    const hasSmtp = await this.isSmtpAvailable();

    if (!hasReacher && !hasSmtp) {
      this.logger.error(`❌ IMPOSSIBLE DE VÉRIFIER LES EMAILS :`);
      this.logger.error(`   - Port 25 bloqué (SMTP direct indisponible)`);
      this.logger.error(`   - REACHER_API_URL non configurée`);
      this.logger.error(`   → Déployez Reacher sur un VPS: docker run -p 8080:8080 reacherhq/backend:latest`);
      this.logger.error(`   → Puis ajoutez REACHER_API_URL=http://votre-vps:8080 dans .env`);
      return null;
    }

    const personalEmails = this.generatePermutations(firstName, lastName, domain);
    const genericEmails = this.generateGenericEmails(domain);

    // ===== MÉTHODE 1 : REACHER (prioritaire) =====
    if (hasReacher) {
      this.logger.log(`🔍 [Reacher] Test de ${personalEmails.length} permutations + ${genericEmails.length} génériques...`);

      // D'abord vérifier si c'est un catch-all
      const catchAllCheck = await this.reacherCheckEmail(`xrandomtest${Date.now()}@${domain}`);
      if (catchAllCheck?.isCatchAll) {
        const bestEmail = personalEmails[0];
        this.logger.log(`⚠️ [Reacher] Serveur catch-all détecté. Premier format: ${bestEmail}`);
        return { email: bestEmail, isValid: true, isCatchAll: true, confidence: 50, source: 'catch_all' };
      }

      // Tester les permutations personnelles
      for (const email of personalEmails) {
        const result = await this.reacherVerify(email);
        if (result && result.isValid && !result.isCatchAll) return result;
      }

      // Tester les emails génériques
      for (const email of genericEmails) {
        const result = await this.reacherVerify(email);
        if (result && result.isValid) {
          result.source = 'generic_verified';
          return result;
        }
      }

      this.logger.warn(`❌ [Reacher] Aucun email valide trouvé pour ${firstName} ${lastName} @ ${domain}`);
      return null;
    }

    // ===== MÉTHODE 2 : SMTP DIRECT =====
    if (hasSmtp) {
      this.logger.log(`📡 [SMTP] Test des permutations sur ${domain}...`);
      const primaryMx = mxRecords[0];

      const catchAll = await this.isCatchAll(domain, primaryMx);
      if (catchAll) {
        const bestEmail = personalEmails[0];
        this.logger.log(`⚠️ Serveur catch-all. Premier format: ${bestEmail}`);
        return { email: bestEmail, isValid: true, isCatchAll: true, confidence: 50, source: 'catch_all' };
      }

      const personalResult = await this.smtpFindEmail(personalEmails, primaryMx, 'smtp_verified');
      if (personalResult) return personalResult;

      const genericResult = await this.smtpFindEmail(genericEmails, primaryMx, 'generic_verified');
      if (genericResult) return genericResult;

      this.logger.warn(`❌ [SMTP] Aucun email accepté sur ${domain}`);
      return null;
    }

    return null;
  }

  /**
   * Vérifie un email trouvé sur un site web.
   */
  async verifyWebFoundEmail(email: string): Promise<ValidationResult | null> {
    if (!emailValidator.validate(email)) return null;
    return this.verifyEmail(email);
  }
}
