import logging
import asyncio
import httpx
from typing import List, Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger("GooglePlacesService")


class LocalBusiness:
    def __init__(
        self,
        name: str,
        address: str,
        place_id: str,
        website: Optional[str] = None,
        phone: Optional[str] = None,
        rating: Optional[float] = None,
        user_ratings_total: Optional[int] = None,
        google_maps_url: Optional[str] = None,
    ):
        self.name = name
        self.address = address
        self.place_id = place_id
        self.website = website
        self.phone = phone
        self.rating = rating
        self.user_ratings_total = user_ratings_total
        self.google_maps_url = google_maps_url or f"https://www.google.com/maps/place/?q=place_id:{place_id}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "address": self.address,
            "placeId": self.place_id,
            "website": self.website,
            "phone": self.phone,
            "rating": self.rating,
            "userRatingsTotal": self.user_ratings_total,
            "googleMapsUrl": self.google_maps_url,
        }


class GooglePlacesService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GOOGLE_PLACES_API_KEY
        self.base_url = "https://maps.googleapis.com/maps/api/place"

    async def search_businesses(self, query: str, limit: int = 10) -> List[LocalBusiness]:
        if not self.api_key:
            logger.warning("GOOGLE_PLACES_API_KEY manquante. Recherche Google Places impossible.")
            return []

        logger.info(f"Recherche Google Places pour : '{query}' (limite {limit})")
        businesses: List[LocalBusiness] = []

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # 1. Text Search
                text_search_url = f"{self.base_url}/textsearch/json"
                params: Dict[str, Any] = {
                    "query": query,
                    "key": self.api_key,
                    "language": "fr",
                }

                all_places = []
                response = await client.get(text_search_url, params=params)
                data = response.json()
                results = data.get("results", [])
                all_places.extend(results)

                # Pagination
                next_page_token = data.get("next_page_token")
                pages = 0
                while next_page_token and len(all_places) < limit and pages < 2:
                    await asyncio.sleep(2.0)  # Délai obligatoire pour Google next_page_token
                    params["pagetoken"] = next_page_token
                    res = await client.get(text_search_url, params=params)
                    p_data = res.json()
                    p_results = p_data.get("results", [])
                    all_places.extend(p_results)
                    next_page_token = p_data.get("next_page_token")
                    pages += 1

                # 2. Place Details pour chaque lieu
                selected_places = all_places[:limit]
                for place in selected_places:
                    place_id = place.get("place_id")
                    if not place_id:
                        continue

                    ratings_total = place.get("user_ratings_total")
                    # Règle : Filtrer les fiches Google Places avec moins de 5 avis
                    if ratings_total is not None and ratings_total < 5:
                        logger.debug(f"Ignoré: {place.get('name')} a seulement {ratings_total} avis (< 5).")
                        continue

                    # Fetch Details
                    details_url = f"{self.base_url}/details/json"
                    details_params = {
                        "place_id": place_id,
                        "fields": "name,formatted_address,website,formatted_phone_number,rating,user_ratings_total",
                        "key": self.api_key,
                        "language": "fr",
                    }
                    try:
                        d_res = await client.get(details_url, params=details_params)
                        d_data = d_res.json().get("result", {})
                        businesses.append(
                            LocalBusiness(
                                name=d_data.get("name") or place.get("name") or "Inconnu",
                                address=d_data.get("formatted_address") or place.get("formatted_address") or "",
                                place_id=place_id,
                                website=d_data.get("website"),
                                phone=d_data.get("formatted_phone_number"),
                                rating=d_data.get("rating"),
                                user_ratings_total=d_data.get("user_ratings_total") or ratings_total,
                            )
                        )
                    except Exception as detail_err:
                        logger.warning(f"Erreur détails place {place.get('name')}: {detail_err}")

            logger.info(f"{len(businesses)} entreprises trouvées via Google Places.")
            return businesses

        except Exception as e:
            logger.error(f"Erreur lors de la recherche Google Places: {e}")
            return []


google_places_service = GooglePlacesService()
