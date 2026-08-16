import io
import csv
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_tenant_id
from app.models.entities import (
    ResearchJob,
    Prospect,
    ProspectListEntry,
    CsvImportJob,
    ResearchJobStatusEnum,
)
from app.schemas.agents import (
    AsyncResearchDto,
    CleanListDto,
    CleanCsvDto,
    VerifyEmailDto,
    ManualResearchDto,
)
from app.agents.sourcing_agent import sourcing_agent
from app.agents.cleaner_agent import cleaner_agent
from app.services.email_discovery import email_discovery_service
from app.services.google_places import google_places_service
from app.services.tavily_service import tavily_service

router = APIRouter(prefix="/agents", tags=["Agents"])


@router.post("/research/async")
async def run_async_research(
    dto: AsyncResearchDto,
    tenant_id: str = Depends(get_current_tenant_id),
):
    job = await sourcing_agent.start_sourcing_job(
        tenant_id=tenant_id,
        prompt=dto.prompt,
        target_count=dto.targetCount or 100,
        list_id=dto.listId,
        exclude_list_ids=dto.excludeListIds,
        webless_only=dto.weblessOnly or False,
        is_expert=False,
    )
    return {"success": True, "jobId": job.id}


@router.post("/deep-research/async")
async def run_deep_research_async(
    dto: AsyncResearchDto,
    tenant_id: str = Depends(get_current_tenant_id),
):
    job = await sourcing_agent.start_sourcing_job(
        tenant_id=tenant_id,
        prompt=dto.prompt,
        target_count=dto.targetCount or 50,
        list_id=dto.listId,
        exclude_list_ids=dto.excludeListIds,
        webless_only=False,
        is_expert=True,
    )
    return {"success": True, "jobId": job.id}


@router.get("/research/jobs")
async def get_research_jobs(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ResearchJob)
        .where(ResearchJob.tenantId == tenant_id)
        .order_by(ResearchJob.createdAt.desc())
    )
    res = await db.execute(stmt)
    all_jobs = res.scalars().all()
    # Filter out expert jobs from standard sourcing view
    jobs = [j for j in all_jobs if not (j.options or {}).get("isExpert")]
    return {"success": True, "jobs": jobs}


@router.get("/deep-research/jobs")
async def get_deep_research_jobs(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ResearchJob)
        .where(ResearchJob.tenantId == tenant_id)
        .order_by(ResearchJob.createdAt.desc())
    )
    res = await db.execute(stmt)
    all_jobs = res.scalars().all()
    jobs = [j for j in all_jobs if (j.options or {}).get("isExpert")]
    return {"success": True, "jobs": jobs}


@router.get("/research/{job_id}/prospects")
async def get_research_job_prospects(
    job_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Prospect).where(Prospect.researchJobId == job_id, Prospect.tenantId == tenant_id)
    res = await db.execute(stmt)
    prospects = res.scalars().all()
    return {"success": True, "prospects": prospects}


@router.get("/research/{job_id}/export")
async def export_research_job(
    job_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Prospect).where(Prospect.researchJobId == job_id, Prospect.tenantId == tenant_id)
    res = await db.execute(stmt)
    prospects = res.scalars().all()

    if not prospects:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aucun prospect trouvé pour cette tâche.")

    output = io.StringIO()
    # UTF-8 BOM for Excel
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["Prénom", "Nom", "Entreprise", "Site Web", "Titre", "Email", "LinkedIn", "Statut Email", "Score Confiance"])

    for p in prospects:
        writer.writerow([
            p.firstName or "",
            p.lastName or "",
            p.companyName or "",
            p.companyDomain or "",
            p.jobTitle or "",
            p.email or "",
            p.linkedinUrl or "",
            "Vérifié" if p.emailVerified else ("Non vérifié" if p.email else "Introuvable"),
            f"{p.emailConfidence}%" if p.emailConfidence else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="prospects_recherche_{job_id}.csv"'},
    )


@router.post("/clean-list")
async def clean_list(
    body: CleanListDto,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    # Récupérer les prospects de la liste
    stmt = (
        select(ProspectListEntry, Prospect)
        .join(Prospect, ProspectListEntry.prospectId == Prospect.id)
        .where(ProspectListEntry.prospectListId == body.listId)
    )
    res = await db.execute(stmt)
    entries = res.all()

    rejected_count = 0
    rejected_prospects = []

    for entry, prospect in entries:
        eval_res = await cleaner_agent.evaluate_prospect(
            prospect={"firstName": prospect.firstName, "lastName": prospect.lastName, "companyName": prospect.companyName, "industry": prospect.industry, "jobTitle": prospect.jobTitle, "companyDomain": prospect.companyDomain},
            target_industry=body.targetAudience,
        )

        if not eval_res.get("isMatch"):
            await db.delete(entry)
            rejected_prospects.append({
                "firstName": prospect.firstName,
                "lastName": prospect.lastName,
                "companyName": prospect.companyName,
                "email": prospect.email,
                "industry": prospect.industry,
                "jobTitle": prospect.jobTitle,
                "reason": eval_res.get("reason"),
            })
            rejected_count += 1

    await db.commit()

    if rejected_prospects:
        await cleaner_agent.save_rejected_prospects(tenant_id, rejected_prospects)

    return {
        "success": True,
        "totalEvaluated": len(entries),
        "rejectedCount": rejected_count,
        "keptCount": len(entries) - rejected_count,
        "message": f"{rejected_count} prospects retirés de la liste et ajoutés aux rejetés.",
    }


@router.post("/verify-email")
async def verify_email(dto: VerifyEmailDto):
    result = await email_discovery_service.verify_email(dto.email)
    return {"success": True, "result": result.model_dump()}


@router.post("/enrich/{prospect_id}")
async def enrich_prospect(
    prospect_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.tenantId == tenant_id)
    res = await db.execute(stmt)
    prospect = res.scalars().first()
    if not prospect:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect introuvable.")

    domain = prospect.companyDomain
    if not domain and prospect.companyName:
        # Trouver domaine via Tavily
        search = await tavily_service.search(f"site officiel entreprise {prospect.companyName}", max_results=1)
        if "Source: " in search:
            url = search.split("Source: ")[1].split("\n")[0]
            from urllib.parse import urlparse
            domain = urlparse(url).netloc.replace("www.", "")
            prospect.companyDomain = domain

    if domain and (not prospect.email or not prospect.emailVerified):
        v_res = await email_discovery_service.find_valid_email(
            prospect.firstName, prospect.lastName, domain, prospect.companyName, prospect.linkedinUrl
        )
        if v_res and v_res.email:
            prospect.email = v_res.email
            prospect.emailVerified = v_res.isValid
            prospect.emailConfidence = v_res.confidence

    await db.commit()
    await db.refresh(prospect)
    return {"success": True, "prospect": prospect}
