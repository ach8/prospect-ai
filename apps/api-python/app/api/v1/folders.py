from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_tenant_id
from app.models.entities import Folder
from app.schemas.prospects import FolderCreate, FolderResponse

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.get("", response_model=List[FolderResponse])
async def get_folders(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Folder).where(Folder.tenantId == tenant_id).order_by(Folder.createdAt.desc())
    res = await db.execute(stmt)
    folders = res.scalars().all()
    return [FolderResponse.model_validate(f) for f in folders]


@router.post("", response_model=FolderResponse)
async def create_folder(
    req: FolderCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    folder = Folder(
        tenantId=tenant_id,
        name=req.name,
        color=req.color,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return FolderResponse.model_validate(folder)


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Folder).where(Folder.id == folder_id, Folder.tenantId == tenant_id)
    res = await db.execute(stmt)
    folder = res.scalars().first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dossier introuvable.")

    await db.delete(folder)
    await db.commit()
    return {"success": True, "message": "Dossier supprimé avec succès."}
