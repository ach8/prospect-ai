import logging
import httpx
from typing import Optional, List, Dict, Any
from app.core.config import settings

logger = logging.getLogger("TavilyService")


class TavilyService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.TAVILY_API_KEY
        self.base_url = "https://api.tavily.com/search"

    async def search(self, query: str, max_results: int = 3, search_depth: str = "basic") -> str:
        """
        Effectue une recherche web via Tavily Search API.
        Retourne un texte formaté avec les sources, titres et contenus.
        """
        logger.info(f"🔍 [Tavily Search] Requête : '{query}'")

        payload = {
            "api_key": self.api_key,
            "query": query,
            "search_depth": search_depth,
            "include_answer": False,
            "max_results": max_results,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(self.base_url, json=payload)
                response.raise_for_status()
                data = response.json()

            results = data.get("results", [])
            if not results:
                return "Aucun résultat de recherche trouvé."

            formatted = []
            for r in results:
                formatted.append(f"Source: {r.get('url')}\nTitre: {r.get('title')}\nContenu: {r.get('content')}")

            return "\n\n".join(formatted)

        except Exception as e:
            logger.warning(f"⚠️ [Tavily Search] Erreur : {e}")
            return f"Erreur Tavily lors de la recherche : {e}"


tavily_service = TavilyService()
