import { Injectable, Logger } from '@nestjs/common';
import { generateObjectWithGroq } from './ai-model.provider';
import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
import { z } from 'zod';

@Injectable()
export class VisualAuditAgentService {
  private readonly logger = new Logger(VisualAuditAgentService.name);

  async runVisualAudit(url: string, customInstructions?: string, campaignObjective?: string): Promise<any | null> {
    this.logger.log(`Lancement de l'audit visuel pour: ${url}`);
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    let browser = null;
    let screenshotBuffer: Buffer | null = null;

    try {
      this.logger.log(`Ouverture de Puppeteer pour capturer ${url}`);
      puppeteer.use(StealthPlugin());
      browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage', 
          '--disable-gpu',
          '--window-size=1920,1080'
        ],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      
      const screenshot = await page.screenshot({ fullPage: false, encoding: 'binary' });
      screenshotBuffer = Buffer.from(screenshot);
      
    } catch (error: any) {
      this.logger.error(`Erreur lors de la capture du site ${url}: ${error.message}`);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    if (!screenshotBuffer) {
      return null;
    }

    this.logger.log(`Capture réussie. Analyse par Gemini Vision en cours...`);

    const missionDescription = customInstructions 
      ? `Ta mission est d'analyser la capture d'écran du site web d'une entreprise pour trouver UN goulot d'étranglement ou une friction EN TE BASANT STRICTEMENT SUR CES DIRECTIVES : "${customInstructions}".`
      : `Ta mission est d'analyser la capture d'écran du site web d'une entreprise pour trouver UN goulot d'étranglement ou une friction liée à un manque d'automatisation ou d'optimisation (par exemple : absence de chatbot, formulaire de contact archaïque, appel à l'action peu clair, manque de prise de RDV automatisée, etc.).`;

    const systemPrompt = `Tu es un expert en processus d'affaires, UX/UI et automatisation B2B.
${missionDescription}

Tu dois générer un objet JSON ("Variable Y" pour notre outreach) contenant 4 champs :
- page : La page exacte où se trouve le problème (ex: Accueil, Tarifs, Contact).
- friction : Un seul problème ciblé. Le point de blocage le plus proche de la conversion.
- raison : Décrire le comportement humain face à ce problème (ex: hésitation, confusion, frustration due à l'attente).
- consequence : Décrire la réaction en chaîne logique (Friction -> Hésitation -> Abandon de page).

Règle stricte: Reste très factuel, neutre et professionnel. N'invente rien qui ne soit pas visible ou logiquement déductible.`;

    let finalSystemPrompt = systemPrompt;
    if (campaignObjective) {
      finalSystemPrompt += `\n\nOBJECTIF COMMERCIAL DE LA CAMPAGNE :\nL'objectif final de l'email sera de : "${campaignObjective}".\nTa mission est de trouver une friction sur le site qui justifie naturellement cet objectif. Par exemple, si l'objectif est de vendre un Chatbot SAV, tu dois impérativement chercher (et signaler l'absence de) un système de chat en direct, ou pointer la difficulté à trouver de l'aide rapidement sur la page.\n`;
    }

    try {
      const result = await generateObjectWithGroq({
        schema: z.object({
          page: z.string().describe("La page exacte du problème (ex: Accueil, Contact)"),
          friction: z.string().describe("Le problème ciblé, vérifiable visuellement ou déductible du manque d'outil"),
          raison: z.string().describe("La raison humaine ou le comportement face au problème"),
          consequence: z.string().describe("La mécanique de conséquence (Friction -> Hésitation -> Abandon)")
        }),
        messages: [
          { role: 'system', content: finalSystemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Analyse cette capture d'écran de la page d'accueil de ${url} et identifie un point de friction.` },
              { type: 'image', image: screenshotBuffer, mimeType: 'image/png' }
            ]
          }
        ]
      }, true);

      this.logger.log(`Analyse visuelle terminée avec succès pour ${url}`);
      return result.object;

    } catch (error: any) {
      this.logger.error(`Erreur lors de l'analyse Gemini Vision pour ${url}: ${error.message}`);
      return null;
    }
  }
}
