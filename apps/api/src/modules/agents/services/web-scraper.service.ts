import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class WebScraperService {
  private readonly logger = new Logger(WebScraperService.name);

  async scrapeWebsite(url: string): Promise<string> {
    this.logger.log(`Scraping du site web : ${url}`);
    
    // S'assurer que l'URL commence par http/https
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      const response = await axios.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
        },
        timeout: 10000, // 10 secondes max
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extraire les meta tags utiles
      const metaDescription = $('meta[name="description"]').attr('content') || '';
      const ogDescription = $('meta[property="og:description"]').attr('content') || '';
      const pageTitle = $('title').text().trim();

      // Extraire les liens internes utiles (about, contact, équipe)
      const usefulLinks: string[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const lower = href.toLowerCase();
        if (lower.includes('about') || lower.includes('equipe') || lower.includes('team') 
            || lower.includes('contact') || lower.includes('a-propos') || lower.includes('qui-sommes')) {
          // Construire l'URL absolue
          try {
            const absoluteUrl = new URL(href, targetUrl).toString();
            if (!usefulLinks.includes(absoluteUrl)) usefulLinks.push(absoluteUrl);
          } catch {}
        }
      });

      // Supprimer les scripts, styles, iframes, etc.
      $('script, style, noscript, iframe, img, svg, video').remove();

      // Extraire le texte principal
      let bodyText = $('body').text();
      bodyText = bodyText.replace(/\s+/g, ' ').trim();

      // Assembler le résultat enrichi
      let result = '';
      if (pageTitle) result += `Titre: ${pageTitle}\n`;
      if (metaDescription) result += `Description: ${metaDescription}\n`;
      if (ogDescription && ogDescription !== metaDescription) result += `Résumé: ${ogDescription}\n`;
      if (usefulLinks.length > 0) result += `Pages utiles: ${usefulLinks.slice(0, 5).join(', ')}\n`;
      result += `\nContenu:\n${bodyText}`;

      // Limiter la taille du texte retourné
      const maxLength = 8000;
      if (result.length > maxLength) {
        result = result.substring(0, maxLength) + '... [TRONQUÉ]';
      }

      this.logger.debug(`Scraping réussi. Longueur du texte extrait : ${result.length} caractères.`);
      return result;
    } catch (error: any) {
      this.logger.warn(`Échec du scraping pour ${targetUrl} : ${error.message}`);
      return `Impossible de lire le site web: ${error.message}`;
    }
  }
}
