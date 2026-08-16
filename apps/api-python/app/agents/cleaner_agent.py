import logging
import asyncio
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.entities import (
    Prospect,
    ProspectList,
    ProspectListEntry,
    CsvImportJob,
    ImportJobStatusEnum,
    JobTypeEnum,
    ProspectSourceEnum,
)
from app.core.database import AsyncSessionLocal
from app.services.ai_provider import generate_json_with_failover
from app.services.tavily_service import tavily_service

logger = logging.getLogger("CleanerAgent")

INDUSTRIES = [
    "Plomberie & Chauffage",
    "Électricité",
    "BTP & Rénovation",
    "E-commerce & Retail",
    "Agence Marketing & Web",
    "SaaS & Logiciels",
    "Santé & Médical",
    "Restauration & Hôtellerie",
    "Immobilier",
    "Services Financiers & Assurance",
    "Conseil & Coaching",
    "Transport & Logistique",
    "Industrie & Fabrication",
    "Automobile & Garage",
]


class CleanerAgent:
    async def evaluate_prospect(
        self,
        prospect: Dict[str, Any],
        target_industry: str,
        allow_deep_research: bool = True,
    ) -> Dict[str, Any]:
        """
        Évalue si un prospect correspond au secteur d'activité cible.
        """
        current_ind = prospect.get("industry")
        # 1. Fast Lane (Sans IA)
        if current_ind and current_ind.lower().strip() == target_industry.lower().strip():
            return {"isMatch": True, "reason": f"Secteur identique ({target_industry})"}

        # 2. Classification LLM
        prompt_data = f"""SECTEUR CIBLE ATTENDU :
{target_industry}

INFORMATIONS DU PROSPECT :
Nom: {prospect.get('firstName', '')} {prospect.get('lastName', '')}
Entreprise: {prospect.get('companyName', '')}
Secteur actuel: {prospect.get('industry', 'Inconnu')}
Job Title: {prospect.get('jobTitle', 'Inconnu')}
Domaine: {prospect.get('companyDomain', 'Inconnu')}
Données additionnelles: {prospect.get('enrichmentData', {})}

Ce prospect appartient-il au secteur cible ?
Réponds UNIQUEMENT en JSON :
{{
  "isMatch": true/false,
  "classifiedIndustry": "Secteur déterminé",
  "reason": "Explication brève",
  "needsMoreInfo": true/false
}}"""

        try:
            res = await generate_json_with_failover(
                prompt_data,
                system_prompt="Tu es un expert en qualification de leads B2B (Agent Nettoyeur).",
                temperature=0.1,
            )

            # 3. Deep Research si l'IA manque d'informations
            if res.get("needsMoreInfo") and allow_deep_research:
                query = f"Entreprise {prospect.get('companyName')} {prospect.get('companyDomain', '')} activité secteur"
                deep_res = await tavily_service.search(query, max_results=2)

                second_prompt = f"""SECTEUR CIBLE ATTENDU : {target_industry}
Entreprise : {prospect.get('companyName')}
Recherche web :
{deep_res}

Ce prospect appartient-il au secteur cible ?
Réponds en JSON : {{"isMatch": true/false, "reason": "explication", "classifiedIndustry": "secteur"}}"""

                second_res = await generate_json_with_failover(second_prompt, temperature=0.1)
                return {
                    "isMatch": second_res.get("isMatch", True),
                    "reason": second_res.get("reason", "Qualifié après recherche web"),
                    "deepResearchResult": deep_res,
                }

            return {
                "isMatch": res.get("isMatch", True),
                "reason": res.get("reason", "Qualifié par l'IA"),
            }

        except Exception as e:
            logger.error(f"Erreur évaluation prospect: {e}")
            return {"isMatch": True, "reason": "Erreur IA, prospect conservé par sécurité"}

    async def save_rejected_prospects(self, tenant_id: str, rejected_prospects: List[Dict[str, Any]]):
        if not rejected_prospects:
            return

        async with AsyncSessionLocal() as session:
            # Trouver ou créer la liste "Prospects Rejetés"
            stmt = select(ProspectList).where(
                ProspectList.tenantId == tenant_id,
                ProspectList.name == "Prospects Rejetés",
            )
            res = await session.execute(stmt)
            rejected_list = res.scalars().first()

            if not rejected_list:
                rejected_list = ProspectList(tenantId=tenant_id, name="Prospects Rejetés")
                session.add(rejected_list)
                await session.flush()

            for p in rejected_prospects:
                first_name = p.get("firstName") or "Inconnu"
                company_name = p.get("companyName") or "Inconnu"

                # Chercher si le prospect existe déjà
                db_p = None
                if p.get("email"):
                    res_p = await session.execute(
                        select(Prospect).where(
                            Prospect.tenantId == tenant_id,
                            Prospect.email == p.get("email"),
                        )
                    )
                    db_p = res_p.scalars().first()

                if not db_p:
                    db_p = Prospect(
                        tenantId=tenant_id,
                        firstName=first_name,
                        lastName=p.get("lastName", ""),
                        companyName=company_name,
                        email=p.get("email"),
                        industry=p.get("industry"),
                        jobTitle=p.get("jobTitle"),
                        source=ProspectSourceEnum.API_IMPORT,
                        enrichmentData={"cleanerRejectionReason": p.get("reason", "")},
                    )
                    session.add(db_p)
                    await session.flush()

                # Ajouter à la liste des rejetés
                existing_entry = await session.execute(
                    select(ProspectListEntry).where(
                        ProspectListEntry.prospectId == db_p.id,
                        ProspectListEntry.prospectListId == rejected_list.id,
                    )
                )
                if not existing_entry.scalars().first():
                    session.add(ProspectListEntry(prospectId=db_p.id, prospectListId=rejected_list.id))

            await session.commit()


cleaner_agent = CleanerAgent()
