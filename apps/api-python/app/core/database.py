from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from app.core.config import settings

db_url = settings.DIRECT_URL or settings.DATABASE_URL
if db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

# Nettoyer d'éventuels paramètres non supportés par asyncpg
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
try:
    parsed = urlparse(db_url)
    if parsed.query:
        query_params = parse_qs(parsed.query)
        unsupported = ["pgbouncer", "connection_limit", "pool_timeout", "schema"]
        cleaned_params = {k: val for k, val in query_params.items() if k.lower() not in unsupported}
        new_query = urlencode(cleaned_params, doseq=True)
        db_url = urlunparse(parsed._replace(query=new_query))
except Exception:
    pass

# Supabase / PgBouncer require statement_cache_size=0 to avoid DuplicatePreparedStatementError
connect_args = {
    "statement_cache_size": 0,
    "prepared_statement_cache_size": 0,
}

engine = create_async_engine(
    db_url,
    connect_args=connect_args,
    echo=(settings.ENVIRONMENT == "development_debug"),
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for injecting database session into FastAPI routes."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
