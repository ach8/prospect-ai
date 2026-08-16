from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.prospects import router as prospects_router
from app.api.v1.lists import router as lists_router
from app.api.v1.folders import router as folders_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.agents import router as agents_router
from app.api.v1.prompts import router as prompts_router
from app.api.v1.dashboard import router as dashboard_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(prospects_router)
api_router.include_router(lists_router)
api_router.include_router(folders_router)
api_router.include_router(campaigns_router)
api_router.include_router(agents_router)
api_router.include_router(prompts_router)
api_router.include_router(dashboard_router)
