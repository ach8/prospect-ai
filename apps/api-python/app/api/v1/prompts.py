from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_tenant_id
from app.models.entities import PromptTemplate
from app.schemas.prompts import (
    PromptTemplateCreate,
    PromptTemplateUpdate,
    PromptTemplateResponse,
    GenerateDynamicPromptDto,
)
from app.services.ai_provider import generate_json_with_failover

router = APIRouter(prefix="/prompts", tags=["Prompts"])


@router.get("", response_model=List[PromptTemplateResponse])
async def get_prompt_templates(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PromptTemplate)
        .where(PromptTemplate.tenantId == tenant_id)
        .order_by(PromptTemplate.createdAt.desc())
    )
    res = await db.execute(stmt)
    templates = res.scalars().all()
    return [PromptTemplateResponse.model_validate(t) for t in templates]


@router.post("", response_model=PromptTemplateResponse)
async def create_prompt_template(
    req: PromptTemplateCreate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    template = PromptTemplate(
        tenantId=tenant_id,
        **req.model_dump(),
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return PromptTemplateResponse.model_validate(template)


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_prompt_template(
    template_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PromptTemplate).where(PromptTemplate.id == template_id, PromptTemplate.tenantId == tenant_id)
    res = await db.execute(stmt)
    template = res.scalars().first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modèle introuvable.")
    return PromptTemplateResponse.model_validate(template)


@router.patch("/{template_id}", response_model=PromptTemplateResponse)
async def update_prompt_template(
    template_id: str,
    req: PromptTemplateUpdate,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PromptTemplate).where(PromptTemplate.id == template_id, PromptTemplate.tenantId == tenant_id)
    res = await db.execute(stmt)
    template = res.scalars().first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modèle introuvable.")

    for field, val in req.model_dump(exclude_unset=True).items():
        setattr(template, field, val)

    await db.commit()
    await db.refresh(template)
    return PromptTemplateResponse.model_validate(template)


@router.delete("/{template_id}")
async def delete_prompt_template(
    template_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PromptTemplate).where(PromptTemplate.id == template_id, PromptTemplate.tenantId == tenant_id)
    res = await db.execute(stmt)
    template = res.scalars().first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modèle introuvable.")

    await db.delete(template)
    await db.commit()
    return {"success": True, "message": "Modèle supprimé avec succès."}


@router.post("/generate-dynamic")
async def generate_dynamic_prompts(req: GenerateDynamicPromptDto):
    """
    Génère un set complet de prompts ultra-ciblés en fonction de l'offre et de l'audience cible.
    """
    prompt = f"""Tu es un maître en stratégie de prospection B2B et en ingénierie de prompts.
L'utilisateur veut créer une campagne d'outreach hyper-personnalisée.

OFFRE : {req.offer}
CIBLE : {req.targetAudience}
OBJECTIF : {req.campaignGoal}

Génère une configuration complète de campagne au format JSON avec ces champs précis :
{{
  "name": "Nom accrocheur pour la campagne",
  "globalContext": "Le contexte global de l'offre et les règles de ton pour l'IA",
  "campaignObjective": "L'objectif commercial strict",
  "visualAuditPrompt": "Consignes précises pour l'audit visuel du site web prospect",
  "subjectPrompt": "Instruction pour générer l'objet percutant",
  "firstTouchPrompt": "Instruction pour le 1er email (Accroche + Problème + Valeur)",
  "followUpPrompt": "Instruction pour l'email de relance 1",
  "closerPrompt": "Instruction pour l'email de clôture/dernière chance"
}}"""

    try:
        data = await generate_json_with_failover(
            prompt,
            system_prompt="Tu es un directeur de copywriting B2B de classe mondiale.",
            temperature=0.7,
        )
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la génération de prompts : {e}",
        )
