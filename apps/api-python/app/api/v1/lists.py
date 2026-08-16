from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_tenant_id
from app.models.entities import ProspectList, ProspectListEntry
from app.schemas.prospects import ProspectListCreate, ProspectListResponse

router = APIRouter(prefix="/lists", tags=["Lists"])


@router.get("", response_model=List[ProspectListResponse])
async def get_lists(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ProspectList).where(ProspectList.tenantId == tenant_id).order_by(ProspectList.createdAt.desc())
    res = await db.execute(stmt)
    lists = res.scalars().all()

    output = []
    for l in lists:
        # Count entries
        count_stmt = select(func.count(ProspectListEntry.id)).where(ProspectListEntry.prospectListId == l.id)
        c_res = await db.execute(count_stmt)
        count = c_res.scalar_one()

        resp = ProspectListResponse.model_validate(l)
        resp.prospectsCount = count
        output.append(resp)

    return output


@router.post("", response_model=ProspectListResponse)
async def create_list(
    req: ProspectListCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    prospect_list = ProspectList(
        tenantId=tenant_id,
        name=req.name,
        folderId=req.folderId,
    )
    db.add(prospect_list)
    await db.commit()
    await db.refresh(prospect_list)

    resp = ProspectListResponse.model_validate(prospect_list)
    resp.prospectsCount = 0
    return resp


@router.get("/{list_id}", response_model=ProspectListResponse)
async def get_list(
    list_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ProspectList).where(ProspectList.id == list_id, ProspectList.tenantId == tenant_id)
    res = await db.execute(stmt)
    l = res.scalars().first()
    if not l:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Liste introuvable.")

    count_stmt = select(func.count(ProspectListEntry.id)).where(ProspectListEntry.prospectListId == l.id)
    c_res = await db.execute(count_stmt)
    count = c_res.scalar_one()

    resp = ProspectListResponse.model_validate(l)
    resp.prospectsCount = count
    return resp


@router.delete("/{list_id}")
async def delete_list(
    list_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ProspectList).where(ProspectList.id == list_id, ProspectList.tenantId == tenant_id)
    res = await db.execute(stmt)
    l = res.scalars().first()
    if not l:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Liste introuvable.")

    await db.delete(l)
    await db.commit()
    return {"success": True, "message": "Liste supprimée avec succès."}
