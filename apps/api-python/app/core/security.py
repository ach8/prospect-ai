from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: Union[str, Any], tenant_id: str, role: str = "MEMBER", expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "sub": str(subject),
        "userId": str(subject),
        "tenantId": tenant_id,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: Union[str, Any], tenant_id: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    to_encode = {
        "sub": str(subject),
        "userId": str(subject),
        "tenantId": tenant_id,
        "exp": expire,
        "type": "refresh"
    }
    return jwt.encode(to_encode, settings.JWT_REFRESH_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, secret: str = settings.JWT_SECRET) -> dict:
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token d'authentification invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )


DEFAULT_FALLBACK_TENANT_ID = "5ca767cb-5c94-4929-82f0-83b8fced8644"


async def get_current_user_payload(
    request: Request,
    auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    # 1. Bearer Header
    token = None
    if auth_creds and auth_creds.credentials:
        token = auth_creds.credentials
    # 2. Cookies (accessToken)
    if not token:
        token = request.cookies.get("accessToken") or request.cookies.get("token")

    if token:
        try:
            return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        except JWTError:
            pass

    # 3. Fallback automatique au 1er utilisateur/tenant (reproduisant le JwtAuthGuard de NestJS pour l'UI)
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.entities import User
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            stmt = select(User).limit(1)
            res = await session.execute(stmt)
            user = res.scalars().first()
            if user:
                return {
                    "sub": user.id,
                    "userId": user.id,
                    "tenantId": user.tenantId,
                    "role": user.role.value if hasattr(user.role, "value") else str(user.role),
                }
    except Exception:
        pass

    return {
        "sub": "default",
        "userId": "default",
        "tenantId": DEFAULT_FALLBACK_TENANT_ID,
        "role": "OWNER",
    }


async def get_current_tenant_id(payload: dict = Depends(get_current_user_payload)) -> str:
    return payload.get("tenantId") or DEFAULT_FALLBACK_TENANT_ID
