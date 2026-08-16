import logging
from typing import Optional, Dict, Any
from app.services.web_scraper import web_scraper_service
from app.services.ai_provider import generate_json_with_failover

logger = logging.getLogger("VisualAuditAgent")


class VisualAuditAgent:
    async def run_visual_audit(
        self,
        url: str,
        custom_instructions: Optional[str] = None,
        campaign_objective: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Effectue une capture d'écran du site web et utilise l'IA de vision
        pour extraire la Variable Y (Page, Friction, Raison, Conséquence).
        """
        logger.info(f"Lancement de l'audit visuel pour : {url}")

        image_base64 = await web_scraper_service.capture_screenshot_base64(url)
        if not image_base64:
            logger.warning(f"Impossible de capturer l'écran de {url}")
            return None

        mission = (
            f"Ta mission est d'analyser la capture d'écran du site web pour identifier un point de friction selon ces directives : '{custom_instructions}'."
            if custom_instructions
            else "Ta mission est d'analyser la capture d'écran du site web pour trouver une friction liée à un manque d'optimisation ou d'automatisation."
        )

        system_prompt = f"""Tu es un expert en UX/UI, conversion web et automatisation B2B.
{mission}

Tu dois générer un objet JSON ("Variable Y" pour notre séquence) contenant 4 champs :
- "page": La page exacte (ex: Accueil, Tarifs, Contact).
- "friction": Un seul problème ciblé et vérifiable.
- "raison": Le comportement humain ou la confusion face à ce problème.
- "consequence": La réaction en chaîne logique (Friction -> Hésitation -> Perte de conversion).

Reste factuel, précis et professionnel."""

        if campaign_objective:
            system_prompt += f"\n\nOBJECTIF COMMERCIAL : '{campaign_objective}'. Trouve une friction qui justifie cet objectif."

        prompt = f"Analyse cette capture d'écran de la page de {url} et identifie le point de friction."

        try:
            result = await generate_json_with_failover(
                prompt=prompt,
                system_prompt=system_prompt,
                is_vision=True,
                image_base64=image_base64,
                temperature=0.2,
            )
            logger.info(f"Audit visuel réussi pour {url}: {result.get('friction')}")
            return result
        except Exception as e:
            logger.error(f"Erreur lors de l'analyse visuelle de {url}: {e}")
            return None


visual_audit_agent = VisualAuditAgent()
