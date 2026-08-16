from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class ProspectBase(BaseModel):
    firstName: str
    lastName: Optional[str] = ""
    email: Optional[str] = None
    emailVerified: Optional[bool] = False
    emailConfidence: Optional[int] = 0
    phone: Optional[str] = None
    linkedinUrl: Optional[str] = None
    companyName: str
    companyDomain: Optional[str] = None
    jobTitle: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    enrichmentData: Optional[Dict[str, Any]] = None
    source: Optional[str] = "MANUAL"
    callStatus: Optional[str] = "UNCALLED"
    callNotes: Optional[str] = None


class ProspectCreate(ProspectBase):
    listId: Optional[str] = None


class ProspectUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    emailVerified: Optional[bool] = None
    emailConfidence: Optional[int] = None
    phone: Optional[str] = None
    linkedinUrl: Optional[str] = None
    companyName: Optional[str] = None
    companyDomain: Optional[str] = None
    jobTitle: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    enrichmentData: Optional[Dict[str, Any]] = None
    callStatus: Optional[str] = None
    callNotes: Optional[str] = None
    lastCalledAt: Optional[datetime] = None


class ProspectResponse(ProspectBase):
    id: str
    tenantId: str
    createdAt: datetime
    updatedAt: datetime
    hasGeneratedEmails: Optional[bool] = False

    class Config:
        from_attributes = True


class ProspectListCreate(BaseModel):
    name: str
    folderId: Optional[str] = None


class ProspectListResponse(BaseModel):
    id: str
    name: str
    folderId: Optional[str] = None
    tenantId: str
    createdAt: datetime
    updatedAt: datetime
    prospectsCount: Optional[int] = 0

    class Config:
        from_attributes = True


class FolderCreate(BaseModel):
    name: str
    color: Optional[str] = None


class FolderResponse(BaseModel):
    id: str
    name: str
    color: Optional[str] = None
    tenantId: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
