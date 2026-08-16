from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class RunResearchDto(BaseModel):
    prompt: str
    listName: Optional[str] = None
    weblessOnly: Optional[bool] = False


class AsyncResearchDto(BaseModel):
    prompt: str
    listId: Optional[str] = None
    targetCount: Optional[int] = 100
    excludeListIds: Optional[List[str]] = None
    weblessOnly: Optional[bool] = False


class CleanListDto(BaseModel):
    listId: str
    targetAudience: str


class CleanCsvDto(BaseModel):
    rows: List[Dict[str, Any]]
    mapping: Dict[str, str]
    targetAudience: str
    listId: str
    filename: Optional[str] = "Nettoyage IA"


class VerifyEmailDto(BaseModel):
    email: str


class ManualResearchDto(BaseModel):
    query: str
    tools: List[str]
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    domain: Optional[str] = None
    companyName: Optional[str] = None
