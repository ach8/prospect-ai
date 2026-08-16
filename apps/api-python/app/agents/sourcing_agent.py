import logging
import asyncio
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.entities import (
    ResearchJob,
    Prospect,
    ProspectListEntry,
    ResearchJobStatusEnum,
    ProspectSourceEnum,
)
from app.core.database import AsyncSessionLocal
from app.services.google_places import google_places_service
from app.services.email_discovery import email_discovery_service
from app.services.ai_provider import generate_text_with_failover, generate_json_with_failover
from app.services.web_scraper import web_scraper_service
from app.services.tavily_service import tavily_service

logger = logging.getLogger("SourcingAgent")


class SourcingAgent:
    async def start_sourcing_job(
        self,
        tenant_id: str,
        prompt: str,
        target_count: int = 100,
        list_id: Optional[str] = None,
        exclude_list_ids: Optional[List[str]] = None,
        webless_only: bool = False,
        is_expert: bool = False,
    ) -> ResearchJob:
        initial_blacklist: List[str] = []

        async with AsyncSessionLocal() as session:
            # 0. Récupérer les domaines exclus des listes sélectionnées
            if exclude_list_ids:
                stmt = (
                    select(Prospect.companyDomain)
                    .join(ProspectListEntry, Prospect.id == ProspectListEntry.prospectId)
                    .where(
                        Prospect.tenantId == tenant_id,
                        ProspectListEntry.prospectListId.in_(exclude_list_ids),
                        Prospect.companyDomain.isnot(None),
                    )
                )
                res = await session.execute(stmt)
                domains = [r[0] for r in res.all() if r[0]]
                initial_blacklist = list(set(domains))
                logger.info(f"Blacklist initialisée avec {len(initial_blacklist)} domaines exclus.")

            # 1. Créer le ResearchJob
            job = ResearchJob(
                tenantId=tenant_id,
                prompt=prompt,
                targetCount=target_count,
                listId=list_id,
                blacklistedDomains=initial_blacklist,
                options={"weblessOnly": webless_only, "isExpert": is_expert},
                status=ResearchJobStatusEnum.PROCESSING,
            )
            session.add(job)
            await session.commit()
            await session.refresh(job)

        # 2. Lancer la boucle en tâche d'arrière-plan asynchrone (asyncio.create_task)
        asyncio.create_task(self.run_sourcing_loop(job.id, is_expert=is_expert))
        return job

    async def run_sourcing_loop(self, job_id: str, is_expert: bool = False):
        logger.info(f"Démarrage de la boucle de sourcing pour le job {job_id} (Expert: {is_expert})")

        async with AsyncSessionLocal() as session:
            job = await session.get(ResearchJob, job_id)
            if not job:
                return

            found_count = job.foundCount
            target_count = job.targetCount
            blacklisted_domains = list(job.blacklistedDomains or [])
            blacklisted_phones: List[str] = []
            options = job.options or {}
            webless_only = options.get("weblessOnly") is True

        all_generated_queries: List[str] = []
        max_loops = 4
        current_loop = 0

        while found_count < target_count and current_loop < max_loops:
            current_loop += 1

            # Vérifier si annulé ou arrêté
            async with AsyncSessionLocal() as session:
                cur_job = await session.get(ResearchJob, job_id)
                if not cur_job or cur_job.status in [ResearchJobStatusEnum.FAILED, ResearchJobStatusEnum.COMPLETED]:
                    break

            # 1. Générer des variantes de recherche avec l'IA
            needed = max(10, (target_count - found_count) // 2)
            gen_prompt = f"""Tu es un expert en requêtes de recherche Google Maps.
Génère une liste JSON de {needed} sous-requêtes diversifiées pour : "{job.prompt}".
Varie les synonymes du métier et la géographie (villes, arrondissements).
INTERDICTION d'utiliser ces requêtes déjà faites : {', '.join(all_generated_queries[-20:])}
Réponds UNIQUEMENT avec un tableau JSON de chaînes: ["requête 1", "requête 2", ...]"""

            try:
                raw_queries = await generate_json_with_failover(gen_prompt, temperature=0.7)
                queries = [q for q in raw_queries if isinstance(q, str) and q not in all_generated_queries]
            except Exception as e:
                logger.warning(f"Échec génération requêtes IA: {e}")
                queries = [job.prompt]

            if not queries:
                break

            all_generated_queries.extend(queries)

            # 2. Parcourir chaque requête
            for query in queries:
                if found_count >= target_count:
                    break

                logger.info(f"[Job {job_id}] Recherche Google Places : '{query}'")
                try:
                    places = await google_places_service.search_businesses(query, limit=50)

                    # Filtrage
                    valid_places = []
                    for p in places:
                        if webless_only and p.website:
                            continue
                        domain = ""
                        if p.website:
                            try:
                                domain = urlparse(p.website).netloc.replace("www.", "").lower()
                            except Exception:
                                pass
                            if domain and domain in blacklisted_domains:
                                continue
                        if p.phone and p.phone in blacklisted_phones:
                            continue
                        if not p.name or p.name == "Inconnu":
                            continue

                        valid_places.append((p, domain))

                    if not valid_places:
                        continue

                    # Limiter au besoin restant
                    valid_places = valid_places[: target_count - found_count]

                    for place, domain in valid_places:
                        if domain:
                            blacklisted_domains.append(domain)
                        if place.phone:
                            blacklisted_phones.append(place.phone)

                        # Traitement selon le mode
                        if webless_only:
                            # Sauvegarde directe
                            async with AsyncSessionLocal() as session:
                                prospect = Prospect(
                                    tenantId=job.tenantId,
                                    firstName="Inconnu",
                                    lastName="",
                                    companyName=place.name,
                                    jobTitle="Dirigeant",
                                    phone=place.phone,
                                    source=ProspectSourceEnum.GOOGLE_PLACES,
                                    researchJobId=job_id,
                                    enrichmentData={
                                        "companyAddress": place.address,
                                        "googleMapsUrl": place.google_maps_url,
                                        "rating": place.rating,
                                        "userRatingsTotal": place.user_ratings_total,
                                    },
                                )
                                session.add(prospect)
                                await session.flush()
                                if job.listId:
                                    session.add(ProspectListEntry(prospectId=prospect.id, prospectListId=job.listId))
                                await session.commit()
                        else:
                            # Lancer la recherche du dirigeant + email
                            asyncio.create_task(
                                self.process_company_enrichment(
                                    job_id=job_id,
                                    tenant_id=job.tenantId,
                                    list_id=job.listId,
                                    company_name=place.name,
                                    domain=domain or "inconnu.com",
                                    address=place.address,
                                    phone=place.phone,
                                    is_expert=is_expert,
                                    source_prompt=job.prompt,
                                )
                            )

                    found_count += len(valid_places)

                    # Mettre à jour le compteur en BDD
                    async with AsyncSessionLocal() as session:
                        await session.execute(
                            update(ResearchJob)
                            .where(ResearchJob.id == job_id)
                            .values(
                                foundCount=found_count,
                                blacklistedDomains=blacklisted_domains,
                            )
                        )
                        await session.commit()

                    await asyncio.sleep(1.5)

                except Exception as query_err:
                    logger.error(f"Erreur recherche '{query}': {query_err}")

        # Clôturer le job
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(ResearchJob)
                .where(ResearchJob.id == job_id)
                .values(status=ResearchJobStatusEnum.COMPLETED)
            )
            await session.commit()

        logger.info(f"Job {job_id} de sourcing terminé ({found_count} trouvés).")

    async def process_company_enrichment(
        self,
        job_id: str,
        tenant_id: str,
        list_id: Optional[str],
        company_name: str,
        domain: str,
        address: str = "",
        phone: Optional[str] = None,
        is_expert: bool = False,
        source_prompt: str = "",
    ):
        try:
            # 1. Vérification doublon en BDD
            async with AsyncSessionLocal() as session:
                prefix = domain.split(".")[0]
                existing = await session.execute(
                    select(Prospect).where(
                        Prospect.tenantId == tenant_id,
                        (Prospect.companyName.ilike(f"%{prefix}%")) | (Prospect.companyDomain == domain),
                    )
                )
                if existing.scalars().first():
                    return

            # Si Mode Expert : vérification stricte anti-hallucination par scraping
            if is_expert and domain != "inconnu.com":
                site_text = await web_scraper_service.scrape_website(domain)
                verify_prompt = f"""Tu es un auditeur strict. L'utilisateur cherche des prospects avec cette requête : "{source_prompt}".
Analyse le site de "{company_name}" ({domain}) et vérifie s'il correspond STRICTEMENT aux critères.
Réponds en JSON : {{"isValid": true/false, "reason": "explication"}}
Contenu du site :
{site_text[:10000]}"""
                try:
                    v_res = await generate_json_with_failover(verify_prompt, temperature=0.1)
                    if not v_res.get("isValid"):
                        logger.info(f"[Expert] ❌ Rejeté: {company_name} ({v_res.get('reason')})")
                        return
                except Exception:
                    pass

            # 2. Recherche du dirigeant (CEO/Gérant)
            ceo_prompt = f"""Trouve le nom du dirigeant (CEO, Fondateur, Gérant) de l'entreprise "{company_name}" (domaine: {domain}).
Réponds UNIQUEMENT en JSON : {{"found": true, "firstName": "...", "lastName": "...", "jobTitle": "...", "industry": "..."}}"""

            ceo_info = {"found": False}
            try:
                ceo_info = await generate_json_with_failover(ceo_prompt, temperature=0.2)
            except Exception:
                pass

            first_name = ceo_info.get("firstName") or "Inconnu"
            last_name = ceo_info.get("lastName") or ""
            job_title = ceo_info.get("jobTitle") or "Dirigeant"
            industry = ceo_info.get("industry") or "Inconnu"
            email = None
            email_verified = False

            # 3. Recherche Email
            if first_name != "Inconnu" and domain != "inconnu.com":
                v_res = await email_discovery_service.find_valid_email(first_name, last_name, domain, company_name)
                if v_res and v_res.email:
                    email = v_res.email
                    email_verified = v_res.isValid

            # Si mode expert et aucun email, on n'ajoute pas
            if is_expert and not email:
                return

            # 4. Enregistrement en base
            async with AsyncSessionLocal() as session:
                prospect = Prospect(
                    tenantId=tenant_id,
                    firstName=first_name,
                    lastName=last_name,
                    companyName=company_name,
                    companyDomain=domain if domain != "inconnu.com" else None,
                    email=email,
                    emailVerified=email_verified,
                    phone=phone,
                    jobTitle=job_title,
                    industry=industry,
                    source=ProspectSourceEnum.GOOGLE_SEARCH if not is_expert else ProspectSourceEnum.SCRAPING,
                    researchJobId=job_id,
                    enrichmentData={"address": address},
                )
                session.add(prospect)
                await session.flush()

                if list_id:
                    session.add(ProspectListEntry(prospectId=prospect.id, prospectListId=list_id))

                await session.execute(
                    update(ResearchJob)
                    .where(ResearchJob.id == job_id)
                    .values(processedCount=ResearchJob.processedCount + 1)
                )
                await session.commit()
                logger.info(f"✅ Prospect créé : {company_name} ({first_name} {last_name} - {email or 'Sans email'})")

        except Exception as e:
            logger.error(f"Erreur enrichissement entreprise {company_name}: {e}")


sourcing_agent = SourcingAgent()
