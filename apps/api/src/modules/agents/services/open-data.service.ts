import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface CompanyRegistryInfo {
  siren: string;
  name: string;
  address: string;
  executives: Array<{
    firstName: string;
    lastName: string;
    role: string;
  }>;
}

@Injectable()
export class OpenDataService {
  private readonly logger = new Logger(OpenDataService.name);

  async searchCompany(query: string): Promise<CompanyRegistryInfo[]> {
    this.logger.log(`Recherche dans l'API Entreprises France pour: ${query}`);
    
    try {
      // API Publique Française (Recherche d'entreprises)
      // Documentation: https://recherche-entreprises.api.gouv.fr/
      const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&page=1&per_page=3`;
      
      const response = await axios.get(url, { timeout: 8000 });
      const results = response.data.results || [];

      const companies: CompanyRegistryInfo[] = results.map((company: any) => {
        // Extraire les dirigeants
        const executives = (company.dirigeants || []).map((dirigeant: any) => ({
          firstName: dirigeant.prenoms || '',
          lastName: dirigeant.nom || '',
          role: dirigeant.qualite || 'Dirigeant',
        }));

        return {
          siren: company.siren,
          name: company.nom_complet,
          address: company.siege?.adresse || '',
          executives,
        };
      });

      this.logger.debug(`${companies.length} entreprises trouvées via OpenData.`);
      return companies;
    } catch (error: any) {
      this.logger.warn(`Échec de la recherche OpenData pour ${query} : ${error.message}`);
      return [];
    }
  }
}
