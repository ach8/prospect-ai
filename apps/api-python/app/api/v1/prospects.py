from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from app.core.database import get_db
from app.core.security import get_current_tenant_id
from app.models.entities import Prospect, ProspectListEntry, ProspectSourceEnum, CallStatusEnum
from app.schemas.prospects import ProspectCreate, ProspectUpdate, ProspectResponse

router = APIRouter(prefix="/prospects", tags=["Prospects"])


@router.get("", response_model=List[ProspectResponse])
async def get_prospects(
    list_id: Optional[str] = Query(None, alias="listId"),
    folder_id: Optional[str] = Query(None, alias="folderId"),
    search: Optional[str] = None,
    limit: int = Query(2500, le=5000),
    offset: int = 0,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    query = select(Prospect).where(Prospect.tenantId == tenant_id)

    if list_id:
        query = query.join(ProspectListEntry, Prospect.id == ProspectListEntry.prospectId).where(
            ProspectListEntry.prospectListId == list_id
        )
    elif folder_id:
        from app.models.entities import ProspectList
        query = query.join(ProspectListEntry, Prospect.id == ProspectListEntry.prospectId)\
                     .join(ProspectList, ProspectListEntry.prospectListId == ProspectList.id)\
                     .where(ProspectList.folderId == folder_id)

    if search:
        query = query.where(
            (Prospect.companyName.ilike(f"%{search}%"))
            | (Prospect.firstName.ilike(f"%{search}%"))
            | (Prospect.lastName.ilike(f"%{search}%"))
            | (Prospect.email.ilike(f"%{search}%"))
            | (Prospect.industry.ilike(f"%{search}%"))
        )

    query = query.order_by(Prospect.createdAt.desc()).limit(limit).offset(offset)
    res = await db.execute(query)
    prospects = res.scalars().all()
    
    # Check campaign prospects for hasGeneratedEmails
    from app.models.entities import CampaignProspect
    prospect_ids = [p.id for p in prospects]
    generated_prospect_ids = set()
    if prospect_ids:
        cp_stmt = select(CampaignProspect.prospectId).where(CampaignProspect.prospectId.in_(prospect_ids))
        cp_res = await db.execute(cp_stmt)
        generated_prospect_ids = set(cp_res.scalars().all())

    results = []
    for p in prospects:
        resp = ProspectResponse.model_validate(p)
        resp.hasGeneratedEmails = p.id in generated_prospect_ids
        results.append(resp)

    return results


@router.post("", response_model=ProspectResponse)
async def create_prospect(
    req: ProspectCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    data = req.model_dump(exclude={"listId"})
    prospect = Prospect(
        tenantId=tenant_id,
        **data,
    )
    db.add(prospect)
    await db.flush()

    if req.listId:
        db.add(ProspectListEntry(prospectId=prospect.id, prospectListId=req.listId))

    await db.commit()
    await db.refresh(prospect)
    return ProspectResponse.model_validate(prospect)


@router.get("/{prospect_id}", response_model=ProspectResponse)
async def get_prospect(
    prospect_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.tenantId == tenant_id)
    res = await db.execute(stmt)
    prospect = res.scalars().first()
    if not prospect:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect introuvable.")
    return ProspectResponse.model_validate(prospect)


@router.patch("/{prospect_id}", response_model=ProspectResponse)
async def update_prospect(
    prospect_id: str,
    req: ProspectUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.tenantId == tenant_id)
    res = await db.execute(stmt)
    prospect = res.scalars().first()
    if not prospect:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect introuvable.")

    update_data = req.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(prospect, field, val)

    await db.commit()
    await db.refresh(prospect)
    return ProspectResponse.model_validate(prospect)


@router.delete("/{prospect_id}")
async def delete_prospect(
    prospect_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Prospect).where(Prospect.id == prospect_id, Prospect.tenantId == tenant_id)
    res = await db.execute(stmt)
    prospect = res.scalars().first()
    if not prospect:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect introuvable.")

    await db.delete(prospect)
    await db.commit()
    return {"success": True, "message": "Prospect supprimé avec succès."}
