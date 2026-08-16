import random
import re
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.entities import (
    Campaign,
    CampaignProspect,
    SequenceStep,
    GeneratedMessage,
    Prospect,
    GeneratedMessageStatusEnum,
)
from app.core.database import AsyncSessionLocal
from app.services.ai_provider import generate_text_with_failover
from app.agents.visual_audit_agent import visual_audit_agent
from app.services.tavily_service import tavily_service

logger = logging.getLogger("CopywritingAgent")


class CopywritingAgent:
    SUBJECT_ANGLES = [
        {"name": "alerte d'un danger ou perte", "instruction": "Concentre-toi sur l'urgence ou le problème technique sans dire le mot problème."},
        {"name": "le mystère extrême", "instruction": "Ne dis rien sur le problème, suscite uniquement la curiosité."},
        {"name": "la question inattendue", "instruction": "Pose une question fermée et directe sur leur choix stratégique ou leur design."},
        {"name": "l'observation neutre", "instruction": "Fais une remarque très courte et factuelle sur un détail précis de leur site."},
        {"name": "le paradoxe contre-intuitif", "instruction": "Affirme quelque chose de contraire au bon sens en lien avec ton observation."},
    ]

    HOOK_VARIATIONS = [
        "Commence par une observation métier directe et pointue liée à son secteur, sans politesse introductive.",
        "Commence par une question ouverte ou rhétorique liée au problème identifié sur son site.",
        "Rentre dans le vif du sujet en parlant directement d'une conséquence négative constatée.",
        "Utilise l'empathie en mentionnant la charge de travail ou les frictions rencontrées par son équipe.",
        "Fais une remarque inattendue et très précise sur un détail de leur site ou positionnement.",
    ]

    async def generate_sequence_for_prospect(self, campaign_id: str, prospect_id: str):
        logger.info(f"Génération de la séquence d'emails pour prospect {prospect_id} (campagne {campaign_id})")

        async with AsyncSessionLocal() as session:
            campaign = await session.get(Campaign, campaign_id)
            stmt = (
                select(CampaignProspect)
                .where(
                    CampaignProspect.campaignId == campaign_id,
                    CampaignProspect.prospectId == prospect_id,
                )
            )
            res = await session.execute(stmt)
            campaign_prospect = res.scalars().first()

            if not campaign or not campaign_prospect:
                logger.warning("Campagne ou CampaignProspect introuvable")
                return

            prospect = await session.get(Prospect, prospect_id)
            if not prospect:
                return

            # Récupérer les étapes
            steps_stmt = (
                select(SequenceStep)
                .where(SequenceStep.campaignId == campaign_id)
                .order_by(SequenceStep.stepOrder.asc())
            )
            steps_res = await session.execute(steps_stmt)
            steps = steps_res.scalars().all()

        enrichment_data: Dict[str, Any] = prospect.enrichmentData or {}
        ai_config: Dict[str, Any] = campaign.aiConfig or {}
        global_context = ai_config.get("globalContext", "")
        campaign_objective = ai_config.get("campaignObjective", "")
        visual_audit_prompt = ai_config.get("visualAuditPrompt", "")

        # 1. Deep Research si manquante
        if not enrichment_data.get("deepResearch") and prospect.companyName:
            query = f"Entreprise {prospect.companyName} {prospect.companyDomain or ''} activités services avis"
            try:
                deep_res = await tavily_service.search(query, max_results=2)
                enrichment_data["deepResearch"] = deep_res
            except Exception:
                pass

        # 2. Visual Audit si manquant et URL disponible
        target_url = enrichment_data.get("website") or prospect.companyDomain
        if not enrichment_data.get("visualAudit") and target_url:
            try:
                v_res = await visual_audit_agent.run_visual_audit(
                    target_url, visual_audit_prompt, campaign_objective
                )
                if v_res:
                    enrichment_data["visualAudit"] = v_res
            except Exception:
                pass

        # Mettre à jour les données prospect en BDD
        async with AsyncSessionLocal() as session:
            await session.execute(
                select(Prospect).where(Prospect.id == prospect_id)
            )
            prospect.enrichmentData = enrichment_data
            session.add(prospect)
            await session.commit()

        # Profil textuel pour l'IA
        prospect_info = f"""Nom : {prospect.firstName} {prospect.lastName}
Entreprise : {prospect.companyName}
Secteur : {prospect.industry or 'Inconnu'}
Job Title : {prospect.jobTitle or 'Dirigeant'}
Données d'enrichissement : {enrichment_data}
{f"Recherche approfondie: {enrichment_data.get('deepResearch')}" if enrichment_data.get('deepResearch') else ''}
{f"Audit visuel (Variable Y): {enrichment_data.get('visualAudit')}" if enrichment_data.get('visualAudit') else ''}"""

        previous_context = ""

        # 3. Génération étape par étape
        for step in steps:
            subject = ""
            body = ""

            if step.templateType.value == "AI_GENERATED":
                if step.agentType.value == "SUBJECT":
                    angle = random.choice(self.SUBJECT_ANGLES)
                    system_prompt = f"""Tu es un copywriter B2B d'élite.
Ton but est d'écrire un OBJET d'email ultra-accrocheur et naturel (3 à 8 mots).
CONTEXTE CAMPAGNE : {global_context}
INFOS PROSPECT :
{prospect_info}
{f"EMAIL PRÉCÉDENT :\n{previous_context}" if previous_context else ''}

ANGLE IMPOSÉ : "{angle['name']}" ({angle['instruction']})
RÈGLES ANTI-ROBOT :
- Très court (3 à 8 mots).
- Pas de tirets, pas de mots comme 'friction', 'problème', 'question', 'optimisation'.
- Pas de préfixe 'Objet:' ou 'Sujet:'. Uniquement le texte brut."""

                    prompt = "Génère UNIQUEMENT le texte du sujet d'email."
                    raw_subj = await generate_text_with_failover(prompt, system_prompt=system_prompt, temperature=0.95)
                    clean_subj = re.sub(r"^(objet|sujet|subject)\s*:\s*", "", raw_subj, flags=re.IGNORECASE).strip().strip('"').rstrip(".")
                    subject = clean_subj
                    body = ""
                else:
                    hook = random.choice(self.HOOK_VARIATIONS)
                    system_prompt = f"""Tu es un expert en copywriting B2B. Ton but est d'écrire un email de prospection humanisé.
CONTEXTE GLOBAL : {global_context}
{f"OBJECTIF STRICT : {campaign_objective}" if campaign_objective else ''}
INFOS PROSPECT :
{prospect_info}
INSTRUCTION ÉTAPE : {step.aiPrompt or 'Email de prise de contact percutant'}
{f"EMAILS PRÉCÉDENTS :\n{previous_context}" if previous_context else ''}

CONTRAINTES ANTI-IA :
- Style d'accroche : {hook}
- 100% sur-mesure pour ce prospect précis.
- INTERDICTION d'utiliser 'En visitant votre site', 'J'ai remarqué que', 'Je me permets'.
- INTERDICTION de listes à puces ou de tirets.
- Écris directement le corps du message (pas de sujet)."""

                    prompt = "Rédige le corps de l'email."
                    body = await generate_text_with_failover(prompt, system_prompt=system_prompt, temperature=0.85)
                    subject = step.subject or ""
            else:
                subject = step.subject or ""
                body = step.manualContent or ""

            # Sauvegarde du message
            async with AsyncSessionLocal() as session:
                msg = GeneratedMessage(
                    campaignProspectId=campaign_prospect.id,
                    sequenceStepId=step.id,
                    subject=subject,
                    body=body,
                    status=GeneratedMessageStatusEnum.DRAFT,
                )
                session.add(msg)
                await session.commit()

            previous_context += f"\n[Étape {step.stepOrder}] Sujet: {subject}\nCorps: {body}\n"

        logger.info(f"Séquence générée avec succès pour prospect {prospect_id}")


copywriting_agent = CopywritingAgent()
