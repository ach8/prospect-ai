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


async def get_token_from_request(request: Request, auth_creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    # 1. Bearer Header
    if auth_creds and auth_creds.credentials:
        return auth_creds.credentials
    # 2. Cookies (accessToken)
    token = request.cookies.get("accessToken") or request.cookies.get("token")
    if token:
        return token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Non authentifié. Token manquant.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user_payload(request: Request, token: str = Depends(get_token_from_request)) -> dict:
    return decode_token(token, settings.JWT_SECRET)


async def get_current_tenant_id(payload: dict = Depends(get_current_user_payload)) -> str:
    tenant_id = payload.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Aucun identifiant d'organisation (tenantId) associé à ce compte."
        )
    return tenant_id
