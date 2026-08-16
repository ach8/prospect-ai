from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_tenant_id
from app.models.entities import Prospect, Campaign, ProspectList, ResearchJob, Tenant

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    tenant_id: str = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
):
    # Total prospects
    p_total_stmt = select(func.count(Prospect.id)).where(Prospect.tenantId == tenant_id)
    p_total = (await db.execute(p_total_stmt)).scalar_one()

    # Verified emails
    p_verified_stmt = select(func.count(Prospect.id)).where(
        Prospect.tenantId == tenant_id, Prospect.emailVerified == True
    )
    p_verified = (await db.execute(p_verified_stmt)).scalar_one()

    # Total campaigns
    c_total_stmt = select(func.count(Campaign.id)).where(Campaign.tenantId == tenant_id)
    c_total = (await db.execute(c_total_stmt)).scalar_one()

    # Total lists
    l_total_stmt = select(func.count(ProspectList.id)).where(ProspectList.tenantId == tenant_id)
    l_total = (await db.execute(l_total_stmt)).scalar_one()

    # Tenant credits
    tenant = await db.get(Tenant, tenant_id)
    credits_remaining = tenant.aiCreditsRemaining if tenant else 0

    return {
        "success": True,
        "stats": {
            "totalProspects": p_total,
            "verifiedEmails": p_verified,
            "emailVerificationRate": round((p_verified / p_total * 100), 1) if p_total > 0 else 0,
            "totalCampaigns": c_total,
            "totalLists": l_total,
            "aiCreditsRemaining": credits_remaining,
        },
    }
