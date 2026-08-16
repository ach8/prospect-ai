import asyncio
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_tenant_id, get_current_user_payload
from app.models.entities import (
    Campaign,
    SequenceStep,
    CampaignProspect,
    ProspectListEntry,
    CampaignStatusEnum,
    GeneratedMessage,
)
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignUpdate,
    CampaignResponse,
    SequenceStepResponse,
    GeneratedMessageResponse,
)
from app.agents.copywriting_agent import copywriting_agent

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


@router.get("", response_model=List[CampaignResponse])
async def get_campaigns(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Campaign)
        .where(Campaign.tenantId == tenant_id)
        .order_by(Campaign.createdAt.desc())
    )
    res = await db.execute(stmt)
    campaigns = res.scalars().all()

    output = []
    for c in campaigns:
        # Steps
        s_res = await db.execute(select(SequenceStep).where(SequenceStep.campaignId == c.id).order_by(SequenceStep.stepOrder))
        steps = s_res.scalars().all()

        # Prospect count
        p_res = await db.execute(select(func.count(CampaignProspect.id)).where(CampaignProspect.campaignId == c.id))
        p_count = p_res.scalar_one()

        resp = CampaignResponse.model_validate(c)
        resp.steps = [SequenceStepResponse.model_validate(s) for s in steps]
        resp.prospectsCount = p_count
        output.append(resp)

    return output


@router.post("", response_model=CampaignResponse)
async def create_campaign(
    req: CampaignCreate,
    payload: dict = Depends(get_current_user_payload),
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    user_id = payload.get("userId")
    campaign = Campaign(
        tenantId=tenant_id,
        userId=user_id,
        name=req.name,
        folderId=req.folderId,
        aiConfig=req.aiConfig or {},
        status=CampaignStatusEnum.DRAFT,
    )
    db.add(campaign)
    await db.flush()

    # Steps
    steps_out = []
    if req.steps:
        for s in req.steps:
            step = SequenceStep(
                campaignId=campaign.id,
                stepOrder=s.stepOrder,
                channel=s.channel,
                templateType=s.templateType,
                agentType=s.agentType,
                aiPrompt=s.aiPrompt,
                subject=s.subject,
                manualContent=s.manualContent,
                delayHours=s.delayHours or 0,
            )
            db.add(step)
            await db.flush()
            steps_out.append(SequenceStepResponse.model_validate(step))

    # Link prospect lists if provided
    if req.prospectListIds:
        for list_id in req.prospectListIds:
            entries_res = await db.execute(
                select(ProspectListEntry.prospectId).where(ProspectListEntry.prospectListId == list_id)
            )
            prospect_ids = entries_res.scalars().all()
            for pid in prospect_ids:
                # Add to campaign_prospects
                cp = CampaignProspect(
                    campaignId=campaign.id,
                    prospectId=pid,
                )
                db.add(cp)

    await db.commit()
    await db.refresh(campaign)

    resp = CampaignResponse.model_validate(campaign)
    resp.steps = steps_out
    return resp


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Campaign).where(Campaign.id == campaign_id, Campaign.tenantId == tenant_id)
    res = await db.execute(stmt)
    c = res.scalars().first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campagne introuvable.")

    s_res = await db.execute(select(SequenceStep).where(SequenceStep.campaignId == c.id).order_by(SequenceStep.stepOrder))
    steps = s_res.scalars().all()

    p_res = await db.execute(select(func.count(CampaignProspect.id)).where(CampaignProspect.campaignId == c.id))
    p_count = p_res.scalar_one()

    resp = CampaignResponse.model_validate(c)
    resp.steps = [SequenceStepResponse.model_validate(s) for s in steps]
    resp.prospectsCount = p_count
    return resp


@router.post("/{campaign_id}/generate")
async def generate_campaign_messages(
    campaign_id: str,
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Lance la génération des messages de séquence d'emails pour tous les prospects de la campagne.
    """
    stmt = select(Campaign).where(Campaign.id == campaign_id, Campaign.tenantId == tenant_id)
    res = await db.execute(stmt)
    c = res.scalars().first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campagne introuvable.")

    # Trouver les prospects de la campagne
    cp_res = await db.execute(select(CampaignProspect.prospectId).where(CampaignProspect.campaignId == campaign_id))
    prospect_ids = cp_res.scalars().all()

    # Mettre à jour le statut en RUNNING
    c.status = CampaignStatusEnum.RUNNING
    await db.commit()

    # Lancer les tâches asynchrones de génération
    for pid in prospect_ids:
        asyncio.create_task(copywriting_agent.generate_sequence_for_prospect(campaign_id, pid))

    return {
        "success": True,
        "message": f"Génération lancée pour {len(prospect_ids)} prospects.",
        "count": len(prospect_ids),
    }
