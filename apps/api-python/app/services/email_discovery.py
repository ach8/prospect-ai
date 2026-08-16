import re
import dns.resolver
import asyncio
import httpx
import logging
import unicodedata
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.core.config import settings
from app.services.tavily_service import tavily_service
from app.services.ai_provider import generate_text_with_failover

logger = logging.getLogger("EmailDiscovery")


class ValidationResult(BaseModel):
    email: str
    isValid: bool
    isCatchAll: bool
    confidence: int
    source: str


class EmailDiscoveryService:
    def __init__(self):
        self.no2bounce_api_key = settings.NO2BOUNCE_API_KEY
        self.anymail_finder_api_key = settings.ANYMAIL_FINDER_API_KEY

    def normalize(self, name: str) -> str:
        if not name:
            return ""
        nfkd = unicodedata.normalize("NFD", name.lower().strip())
        no_accent = "".join([c for c in nfkd if not unicodedata.combining(c)])
        return re.sub(r"[^a-z]", "", no_accent)

    def clean_domain(self, domain: str) -> str:
        if not domain:
            return ""
        d = re.sub(r"^https?://", "", domain)
        d = re.sub(r"^www\.", "", d)
        return d.split("/")[0].strip().lower()

    def generate_permutations(self, first_name: str, last_name: str, domain: str) -> List[str]:
        f = self.normalize(first_name)
        l = self.normalize(last_name)
        if not f or not l:
            return []

        permutations = [
            f"{f}.{l}@{domain}",
            f"{f}{l}@{domain}",
            f"{f[0]}.{l}@{domain}",
            f"{f[0]}{l}@{domain}",
            f"{l}.{f}@{domain}",
            f"{f}_{l}@{domain}",
            f"{l}_{f}@{domain}",
            f"{f}@{domain}",
            f"{l}@{domain}",
            f"{f}-{l}@{domain}",
            f"{l}-{f}@{domain}",
            f"{f[0]}{l[0]}@{domain}",
            f"{f}{l[0]}@{domain}",
            f"{l}{f[0]}@{domain}",
        ]
        # Dédupliquer
        return list(dict.fromkeys(permutations))

    async def get_mx_records(self, domain: str) -> List[str]:
        try:
            loop = asyncio.get_event_loop()
            answers = await loop.run_in_executor(None, lambda: dns.resolver.resolve(domain, "MX"))
            records = sorted(answers, key=lambda r: r.preference)
            return [str(r.exchange).rstrip(".") for r in records if str(r.exchange).rstrip(".")]
        except Exception as e:
            logger.warning(f"Aucun enregistrement MX pour {domain}: {e}")
            return []

    # ============================================================
    # No2Bounce API
    # ============================================================
    async def no2bounce_verify(self, email: str) -> Optional[ValidationResult]:
        if not self.no2bounce_api_key:
            return None

        url = "https://connect.no2bounce.com/v2/n2b_validate_email"
        headers = {"apitoken": self.no2bounce_api_key}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                post_res = await client.post(url, json={"email": email}, headers=headers)
                tracking_id = post_res.json().get("data", {}).get("trackingId")
                if not tracking_id:
                    return None

                for _ in range(12):
                    await asyncio.sleep(1.5)
                    get_res = await client.get(f"{url}?trackingId={tracking_id}", headers=headers)
                    data = get_res.json()
                    if data.get("overallStatus") == "Completed":
                        score_status = data.get("result", {}).get("scoreStatus", "")
                        if "AcceptAll" in score_status or "CatchAll" in score_status:
                            logger.info(f"⚠️ [No2Bounce] {email} → CATCH-ALL ({score_status})")
                            return ValidationResult(email=email, isValid=True, isCatchAll=True, confidence=50, source="catch_all")
                        elif "Deliverable" in score_status and "UnDeliverable" not in score_status:
                            logger.info(f"✅ [No2Bounce] {email} → SAFE ({score_status})")
                            return ValidationResult(email=email, isValid=True, isCatchAll=False, confidence=99, source="no2bounce_api")
                        else:
                            return None
            return None
        except Exception as e:
            logger.warning(f"[No2Bounce] Erreur pour {email}: {e}")
            return None

    # ============================================================
    # Anymail Finder API
    # ============================================================
    async def anymail_finder_search(self, first_name: str, last_name: str, domain: str) -> Optional[ValidationResult]:
        if not self.anymail_finder_api_key:
            return None

        url = "https://api.anymailfinder.com/v5.1/find-email/person"
        headers = {
            "Authorization": self.anymail_finder_api_key,
            "Content-Type": "application/json",
        }
        payload = {"full_name": f"{first_name} {last_name}", "domain": domain}

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                data = res.json()
                found_email = data.get("email_address") or data.get("email", {}).get("email")
                if found_email:
                    logger.info(f"✅ [Anymail Finder] Email trouvé : {found_email}")
                    return ValidationResult(
                        email=found_email,
                        isValid=True,
                        isCatchAll=False,
                        confidence=90,
                        source="generic_verified",
                    )
            return None
        except Exception as e:
            logger.warning(f"❌ [Anymail Finder] Erreur : {e}")
            return None

    # ============================================================
    # OSINT Search via Tavily + Groq
    # ============================================================
    async def find_personal_email_osint(
        self, first_name: str, last_name: str, company_name: str, domain: str, linkedin_url: Optional[str] = None
    ) -> Optional[str]:
        query = f'corporate email contact "{first_name} {last_name}" "{company_name}" "{domain}"'
        if linkedin_url:
            query += f" {linkedin_url}"

        search_results = await tavily_service.search(query, max_results=3)

        system_prompt = """Tu es un expert mondial en OSINT et recherche B2B.
Ta mission est de trouver l'adresse email PROFESSIONNELLE et NOMINATIVE de la personne spécifiée.
RÈGLES STRICTES :
1. Cherche un email nominatif (ex: prenom.nom@domaine.com, p.nom@domaine.com).
2. INTERDICTION de renvoyer un email générique comme contact@, info@, hello@, etc.
3. Si trouvé, réponds UNIQUEMENT l'adresse email brute sans phrases.
4. Si introuvable ou incertain, réponds STRICTEMENT : "NON_TROUVE"."""

        prompt = f"""Prospect : {first_name} {last_name}
Entreprise : {company_name}
Domaine : {domain}
Résultats web :
{search_results}"""

        try:
            res = await generate_text_with_failover(prompt, system_prompt=system_prompt, temperature=0.1)
            cleaned = res.strip().lower()
            if "non_trouve" in cleaned or " " in cleaned:
                return None
            if re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", cleaned) and not cleaned.startswith(("contact@", "info@", "hello@")):
                return cleaned
            return None
        except Exception as e:
            logger.warning(f"Erreur OSINT Email: {e}")
            return None

    # ============================================================
    # Pattern Discovery
    # ============================================================
    async def find_email_pattern(self, domain: str, company_name: str) -> Optional[str]:
        query = f'email pattern format formula domain "{domain}" OR "{company_name}"'
        search_results = await tavily_service.search(query, max_results=3)

        system_prompt = """Tu es un expert OSINT spécialisé dans la découverte de formats d'emails d'entreprises.
Rends UNIQUEMENT le pattern (ex: prenom.nom, p.nom, prenom, nom.prenom, prenomnom).
Si introuvable, réponds : NON_TROUVE."""

        prompt = f"Quel est le format d'email de l'entreprise {company_name} ({domain}) ?\nRésultats:\n{search_results}"
        try:
            res = await generate_text_with_failover(prompt, system_prompt=system_prompt, temperature=0.1)
            cleaned = res.strip().lower()
            known_patterns = ["prenom.nom", "p.nom", "prenom", "nom", "nom.prenom", "prenomnom", "n.prenom", "prenom_nom", "pnom"]
            for p in known_patterns:
                if p in cleaned:
                    return p
            return None
        except Exception:
            return None

    def apply_pattern(self, pattern: str, f: str, l: str, domain: str) -> Optional[str]:
        pattern_map = {
            "prenom.nom": f"{f}.{l}@{domain}",
            "nom.prenom": f"{l}.{f}@{domain}",
            "p.nom": f"{f[0]}.{l}@{domain}",
            "n.prenom": f"{l[0]}.{f}@{domain}",
            "prenom": f"{f}@{domain}",
            "nom": f"{l}@{domain}",
            "prenomnom": f"{f}{l}@{domain}",
            "pnom": f"{f[0]}{l}@{domain}",
            "prenom_nom": f"{f}_{l}@{domain}",
        }
        return pattern_map.get(pattern)

    # ============================================================
    # Orchestration Principale 4 Niveaux
    # ============================================================
    async def find_valid_email(
        self, first_name: str, last_name: str, domain: str, company_name: str, linkedin_url: Optional[str] = None
    ) -> Optional[ValidationResult]:
        domain = self.clean_domain(domain)
        if not domain or domain in ["example.com", "example.org", "domain.com"]:
            return None

        mx_records = await self.get_mx_records(domain)
        if not mx_records:
            logger.warning(f"Le domaine {domain} n'a pas de serveurs MX.")
            return None

        f = self.normalize(first_name)
        l = self.normalize(last_name)

        # Niveau 1 : OSINT Gemini / Groq + Validation No2Bounce
        osint_email = await self.find_personal_email_osint(first_name, last_name, company_name, domain, linkedin_url)
        if osint_email:
            if self.no2bounce_api_key:
                v_res = await self.no2bounce_verify(osint_email)
                if v_res and v_res.isValid and not v_res.isCatchAll:
                    v_res.source = "gemini_search"
                    v_res.confidence = 95
                    return v_res
            else:
                return ValidationResult(email=osint_email, isValid=True, isCatchAll=False, confidence=80, source="gemini_search")

        # Niveau 2 : Détection de pattern d'entreprise
        if f and l:
            pattern = await self.find_email_pattern(domain, company_name)
            if pattern:
                pattern_email = self.apply_pattern(pattern, f, l, domain)
                if pattern_email and self.no2bounce_api_key:
                    v_res = await self.no2bounce_verify(pattern_email)
                    if v_res and v_res.isValid and not v_res.isCatchAll:
                        v_res.source = "gemini_search"
                        v_res.confidence = 90
                        return v_res

            # Niveau 3 : Top 3 permutations B2B avec No2Bounce
            top3 = [
                f"{f}.{l}@{domain}",
                f"{f}@{domain}",
                f"{f[0]}.{l}@{domain}",
            ]
            if self.no2bounce_api_key:
                tasks = [self.no2bounce_verify(em) for em in top3]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for res in results:
                    if isinstance(res, ValidationResult) and res.isValid and not res.isCatchAll:
                        res.confidence = 75
                        return res

        # Niveau 4 : Anymail Finder fallback
        return await self.anymail_finder_search(first_name, last_name, domain)

    async def verify_email(self, email: str) -> ValidationResult:
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
            return ValidationResult(email=email, isValid=False, isCatchAll=False, confidence=0, source="invalid")

        domain = self.clean_domain(email.split("@")[1])
        mx_records = await self.get_mx_records(domain)
        if not mx_records:
            return ValidationResult(email=email, isValid=False, isCatchAll=False, confidence=0, source="no_mx")

        if self.no2bounce_api_key:
            res = await self.no2bounce_verify(email)
            if res:
                return res

        return ValidationResult(email=email, isValid=True, isCatchAll=False, confidence=60, source="mx_verified")


email_discovery_service = EmailDiscoveryService()
