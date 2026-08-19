import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from app.core.database import engine
from sqlalchemy import text


async def test_database_connection():
    print("Testing tenant alignment in DB...")
    try:
        async with engine.connect() as conn:
            # Users
            res_u = await conn.execute(text("SELECT id, email, name, role, \"tenantId\" FROM users;"))
            users = res_u.fetchall()
            for u in users:
                print(f"     - User {u.email} -> TenantId: {u.tenantId}")

            # Tenants
            res_t = await conn.execute(text("SELECT id, name FROM tenants;"))
            tenants = res_t.fetchall()
            for t in tenants:
                print(f"     - Tenant {t.name} -> ID: {t.id}")

            # Prospects per tenant
            res_p = await conn.execute(text("SELECT \"tenantId\", count(*) FROM prospects GROUP BY \"tenantId\";"))
            p_counts = res_p.fetchall()
            for p in p_counts:
                print(f"     - Prospects in Tenant {p.tenantId}: {p.count}")
    except Exception as e:
        print(f"[ERROR] App engine connection failed: {e}")


if __name__ == "__main__":
    asyncio.run(test_database_connection())
