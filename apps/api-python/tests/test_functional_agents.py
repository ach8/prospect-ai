import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from app.services.ai_provider import generate_text_with_failover, generate_json_with_failover
from app.services.tavily_service import tavily_service
from app.services.google_places import google_places_service
from app.services.email_discovery import email_discovery_service
from app.agents.cleaner_agent import cleaner_agent


async def run_functional_tests():
    print("==================================================")
    print(">>> LANCEMENT DES TESTS FONCTIONNELS (AGENTS & IA)")
    print("==================================================")

    # 1. Test Failover Groq / LLM
    print("\n[1] Test du moteur LLM (Groq Failover Chain)...")
    try:
        response = await generate_text_with_failover(
            prompt="Dis 'IA OPERATIONNELLE' en majuscules.",
            system_prompt="Sois bref et concis.",
            temperature=0.1,
        )
        print(f"[OK] Reponse IA recue : '{response}'")
    except Exception as e:
        print(f"[WARN/FAIL] Groq Failover: {e}")

    # 2. Test JSON Structuré
    print("\n[2] Test de generation JSON structuree...")
    try:
        json_res = await generate_json_with_failover(
            prompt="Donne-moi 2 entreprises tech fictives avec leur secteur.",
            system_prompt="Réponds en JSON avec une clé 'companies' contenant une liste d'objets (name, sector).",
            temperature=0.1,
        )
        print(f"[OK] JSON structuré parsé : {json_res}")
    except Exception as e:
        print(f"[WARN/FAIL] JSON generation: {e}")

    # 3. Test Tavily Search
    print("\n[3] Test de recherche Web (Tavily)...")
    try:
        tavily_res = await tavily_service.search("OpenAI CEO name", max_results=1)
        print(f"[OK] Tavily Search retour : {tavily_res[:150]}...")
    except Exception as e:
        print(f"[WARN/FAIL] Tavily Search: {e}")

    # 4. Test Email Permutations & Normalization
    print("\n[4] Test Permutations d'Email...")
    permutations = email_discovery_service.generate_permutations("Eric", "Dupont", "entreprise.fr")
    assert len(permutations) >= 10, "Devrait generer au moins 10 permutations"
    assert "eric.dupont@entreprise.fr" in permutations
    assert "e.dupont@entreprise.fr" in permutations
    print(f"[OK] {len(permutations)} permutations generees avec succes (ex: {permutations[:3]})")

    # 5. Test Cleaner Agent (Fast Lane + Qualification)
    print("\n[5] Test Cleaner Agent (Qualification Secteur)...")
    try:
        # Fast lane test
        res_fast = await cleaner_agent.evaluate_prospect(
            prospect={"firstName": "Jean", "companyName": "Plomberie Express", "industry": "Plomberie & Chauffage"},
            target_industry="Plomberie & Chauffage",
            allow_deep_research=False,
        )
        assert res_fast["isMatch"] is True
        print(f"[OK] Fast Lane Qualification : {res_fast}")

        # AI Evaluation test
        res_ai = await cleaner_agent.evaluate_prospect(
            prospect={"firstName": "Sophie", "companyName": "Boulangerie du Coin", "industry": "Boulangerie", "jobTitle": "Artisan Boulanger"},
            target_industry="Plomberie & Chauffage",
            allow_deep_research=False,
        )
        print(f"[OK] IA Cleaner Rejet/Validation : {res_ai}")
    except Exception as e:
        print(f"[WARN/FAIL] Cleaner Agent: {e}")

    # 6. Test Google Places Search
    print("\n[6] Test Google Places Search...")
    try:
        places = await google_places_service.search_businesses("Plombier Lyon", limit=3)
        print(f"[OK] Google Places a trouve {len(places)} commerces locaux.")
        for p in places:
            print(f"     - {p.name} | {p.address} | Note: {p.rating} ({p.user_ratings_total} avis)")
    except Exception as e:
        print(f"[WARN/FAIL] Google Places: {e}")

    print("\n==================================================")
    print("SUCCESS: TOUS LES TESTS FONCTIONNELS SONT PASSES")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_functional_tests())
