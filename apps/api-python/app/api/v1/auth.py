import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user_payload,
)
from app.models.entities import User, Tenant, PlanEnum, UserRoleEnum
from app.schemas.auth import LoginRequest, RegisterRequest, AuthResponse, UserResponse, TenantResponse
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=AuthResponse)
async def register(req: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    # 1. Vérifier si l'email existe déjà
    stmt = select(User).where(User.email == req.email)
    res = await db.execute(stmt)
    if res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un utilisateur avec cette adresse email existe déjà."
        )

    # 2. Créer le Tenant
    tenant_name = req.tenantName or f"Organisation de {req.name}"
    slug = f"{req.name.lower().replace(' ', '-')}-{uuid.uuid4().hex[:6]}"
    tenant = Tenant(
        name=tenant_name,
        slug=slug,
        plan=PlanEnum.FREE,
        aiCreditsRemaining=100,
    )
    db.add(tenant)
    await db.flush()

    # 3. Créer l'utilisateur (OWNER)
    user = User(
        tenantId=tenant.id,
        email=req.email,
        name=req.name,
        password=get_password_hash(req.password),
        role=UserRoleEnum.OWNER,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await db.refresh(tenant)

    # 4. Générer les tokens JWT
    access_token = create_access_token(user.id, tenant.id, user.role.value)
    refresh_token = create_refresh_token(user.id, tenant.id)

    # Cookies HttpOnly
    response.set_cookie(
        key="accessToken",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=(settings.ENVIRONMENT == "production"),
    )

    return AuthResponse(
        user=UserResponse.model_validate(user),
        tenant=TenantResponse.model_validate(tenant),
        accessToken=access_token,
        refreshToken=refresh_token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.email == req.email)
    res = await db.execute(stmt)
    user = res.scalars().first()

    if not user or not user.password or not verify_password(req.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides."
        )

    tenant = await db.get(Tenant, user.tenantId)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation introuvable.")

    access_token = create_access_token(user.id, tenant.id, user.role.value)
    refresh_token = create_refresh_token(user.id, tenant.id)

    response.set_cookie(
        key="accessToken",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        secure=(settings.ENVIRONMENT == "production"),
    )

    return AuthResponse(
        user=UserResponse.model_validate(user),
        tenant=TenantResponse.model_validate(tenant),
        accessToken=access_token,
        refreshToken=refresh_token,
    )


@router.get("/me")
async def get_me(payload: dict = Depends(get_current_user_payload), db: AsyncSession = Depends(get_db)):
    user_id = payload.get("userId")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    tenant = await db.get(Tenant, user.tenantId)
    return {
        "user": UserResponse.model_validate(user),
        "tenant": TenantResponse.model_validate(tenant) if tenant else None,
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="accessToken")
    return {"success": True, "message": "Déconnexion réussie"}
