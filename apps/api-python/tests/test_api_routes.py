import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "ProspectAI Backend"
    print("[OK] /health check passed")


def test_openapi():
    response = client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema.get("paths", {})
    
    expected_routes = [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/prospects",
        "/api/v1/campaigns",
        "/api/v1/agents/research/async",
        "/api/v1/agents/deep-research/async",
        "/api/v1/agents/clean-list",
        "/api/v1/agents/verify-email",
        "/api/v1/prompts",
        "/api/v1/dashboard/stats",
    ]
    
    for route in expected_routes:
        assert route in paths, f"Route {route} missing from OpenAPI schema"
        print(f"[OK] Route verified in OpenAPI: {route}")

    print(f"[OK] Total endpoints registered in FastAPI: {len(paths)}")


if __name__ == "__main__":
    test_health()
    test_openapi()
    print("SUCCESS: ALL FASTAPI TESTS PASSED!")
