import { Injectable, Logger } from '@nestjs/common';
import { Client, TextSearchResponse, PlaceData, Language } from '@googlemaps/google-maps-services-js';

export interface LocalBusiness {
  name: string;
  address: string;
  website?: string;
  phone?: string;
  rating?: number;
  placeId: string;
  googleMapsUrl?: string;
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
      // 1. Recherche texte (Text Search) avec pagination
      let allPlaces: any[] = [];
      let textSearchResponse = await this.client.textSearch({
        params: {
          query,
          key: this.apiKey,
          language: Language.fr,
        },
      });

      if (textSearchResponse.data.results) {
        allPlaces.push(...textSearchResponse.data.results);
      }

      let pageTokensUsed = 0;
      while (textSearchResponse.data.next_page_token && allPlaces.length < limit && pageTokensUsed < 3) {
        // L'API Google exige un court délai avant que le next_page_token soit valide
        await new Promise(r => setTimeout(r, 2000));
        
        try {
          textSearchResponse = await this.client.textSearch({
            params: {
              query,
              pagetoken: textSearchResponse.data.next_page_token,
              key: this.apiKey,
              language: Language.fr,
            },
          });
          
          if (textSearchResponse.data.results) {
            allPlaces.push(...textSearchResponse.data.results);
          }
          pageTokensUsed++;
        } catch (e) {
          this.logger.warn('Erreur lors de la pagination Google Places: ' + e);
          break;
        }
      }

      const places = allPlaces.slice(0, limit);
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
            googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
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
