from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class PromptTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    globalContext: Optional[str] = None
    visualAuditPrompt: Optional[str] = None
    campaignObjective: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    subjectPrompt: Optional[str] = None
    firstTouchPrompt: Optional[str] = None
    followUpPrompt: Optional[str] = None
    closerPrompt: Optional[str] = None
    isDefault: Optional[bool] = False


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    globalContext: Optional[str] = None
    visualAuditPrompt: Optional[str] = None
    campaignObjective: Optional[str] = None
    steps: Optional[List[Dict[str, Any]]] = None
    subjectPrompt: Optional[str] = None
    firstTouchPrompt: Optional[str] = None
    followUpPrompt: Optional[str] = None
    closerPrompt: Optional[str] = None
    isDefault: Optional[bool] = None


class PromptTemplateResponse(PromptTemplateCreate):
    id: str
    tenantId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class GenerateDynamicPromptDto(BaseModel):
    offer: str
    targetAudience: str
    campaignGoal: Optional[str] = "Obtenir un appel de 15 minutes"
