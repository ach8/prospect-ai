from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class SequenceStepCreate(BaseModel):
    stepOrder: int
    channel: Optional[str] = "EMAIL"
    templateType: Optional[str] = "AI_GENERATED"
    agentType: Optional[str] = "FIRST_TOUCH"
    aiPrompt: Optional[str] = None
    subject: Optional[str] = None
    manualContent: Optional[str] = None
    delayHours: Optional[int] = 0


class SequenceStepResponse(SequenceStepCreate):
    id: str
    campaignId: str

    class Config:
        from_attributes = True


class CampaignCreate(BaseModel):
    name: str
    folderId: Optional[str] = None
    aiConfig: Optional[Dict[str, Any]] = None
    steps: Optional[List[SequenceStepCreate]] = None
    prospectListIds: Optional[List[str]] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    folderId: Optional[str] = None
    status: Optional[str] = None
    aiConfig: Optional[Dict[str, Any]] = None
    startDate: Optional[datetime] = None


class CampaignResponse(BaseModel):
    id: str
    name: str
    status: str
    folderId: Optional[str] = None
    aiConfig: Dict[str, Any]
    startDate: Optional[datetime] = None
    tenantId: str
    userId: str
    createdAt: datetime
    updatedAt: datetime
    steps: Optional[List[SequenceStepResponse]] = []
    prospectsCount: Optional[int] = 0

    class Config:
        from_attributes = True


class GeneratedMessageResponse(BaseModel):
    id: str
    campaignProspectId: str
    sequenceStepId: str
    subject: Optional[str] = None
    body: str
    status: str
    createdAt: datetime

    class Config:
        from_attributes = True
