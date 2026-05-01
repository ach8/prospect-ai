import { Injectable, Logger } from '@nestjs/common';
import { Client, TextSearchResponse, PlaceData, Language } from '@googlemaps/google-maps-services-js';

export interface LocalBusiness {
  name: string;
  address: string;
  website?: string;
  phone?: string;
  rating?: number;
  placeId: string;
}

@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly client = new Client({});
  private readonly apiKey = process.env.GOOGLE_PLACES_API_KEY || '';

  async searchBusinesses(query: string, limit: number = 10): Promise<LocalBusiness[]> {
    if (!this.apiKey) {
      this.logger.warn('GOOGLE_PLACES_API_KEY est manquante. Impossible de faire la recherche Google Places.');
      return [];
    }

    this.logger.log(`Recherche Google Places pour : "${query}"`);

    try {
      // 1. Recherche texte (Text Search)
      const textSearchResponse = await this.client.textSearch({
        params: {
          query,
          key: this.apiKey,
          language: Language.fr,
        },
      });

      const places = textSearchResponse.data.results.slice(0, limit);
      const businesses: LocalBusiness[] = [];

      // 2. Pour chaque lieu, on fait un Place Details pour avoir le site web et le téléphone
      for (const place of places) {
        if (!place.place_id) continue;

        try {
          const detailsResponse = await this.client.placeDetails({
            params: {
              place_id: place.place_id,
              fields: ['name', 'formatted_address', 'website', 'formatted_phone_number', 'rating'],
              key: this.apiKey,
              language: Language.fr,
            },
          });

          const details = detailsResponse.data.result;
          businesses.push({
            name: details.name || place.name || 'Inconnu',
            address: details.formatted_address || place.formatted_address || '',
            website: details.website,
            phone: details.formatted_phone_number,
            rating: details.rating,
            placeId: place.place_id,
          });
        } catch (detailError) {
          this.logger.warn(`Erreur lors de la récupération des détails pour ${place.name}: ${detailError}`);
        }
      }

      this.logger.log(`${businesses.length} entreprises trouvées via Google Places.`);
      return businesses;
    } catch (error: any) {
      this.logger.error(`Erreur lors de la recherche Google Places: ${error.message}`);
      return [];
    }
  }
}
