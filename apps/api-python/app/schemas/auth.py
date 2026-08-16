from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    tenantName: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    tenantId: str
    avatarUrl: Optional[str] = None
    createdAt: datetime

    class Config:
        from_attributes = True


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    aiCreditsRemaining: int

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    user: UserResponse
    tenant: TenantResponse
    accessToken: str
    refreshToken: Optional[str] = None
