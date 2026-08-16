import json
import logging
import asyncio
from typing import List, Optional, Any, Dict, Type
from pydantic import BaseModel
from groq import AsyncGroq
from app.core.config import settings

logger = logging.getLogger("AIProvider")

# Groq Async Client
groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)

# Cascade de modèles textuels pour Failover (429 Rate Limits / TPM / RPD)
GROQ_TEXT_MODELS = [
    "llama-3.3-70b-versatile",
    "qwen/qwen-2.5-32b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.1-8b-instant",
    "allam-2-7b",
]

# Modèles de vision pour les audits visuels de captures d'écran
GROQ_VISION_MODELS = [
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.2-11b-vision-preview",
]


async def generate_text_with_failover(
    prompt: str,
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    is_vision: bool = False,
    image_base64: Optional[str] = None,
) -> str:
    """
    Génère du texte en interrogeant la cascade de modèles Groq.
    Si un modèle renvoie un 429 ou une erreur de quota, bascule automatiquement sur le suivant.
    """
    models = GROQ_VISION_MODELS if is_vision else GROQ_TEXT_MODELS
    last_error: Optional[Exception] = None

    messages: List[Dict[str, Any]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    if is_vision and image_base64:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image_base64}"
                    }
                }
            ]
        })
    else:
        messages.append({"role": "user", "content": prompt})

    for i, model in enumerate(models):
        try:
            logger.debug(f"[Groq Failover] ({i+1}/{len(models)}) Test avec le modèle : {model}")
            response = await groq_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                timeout=30.0,
            )
            content = response.choices[0].message.content or ""
            return content.strip()
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            is_rate_limit = any(term in err_str for term in ["429", "rate limit", "quota", "tpm", "rpd", "limit reached", "too large"])
            if is_rate_limit:
                logger.warning(f"[Groq Failover] Rate-limit/Quota atteint sur {model}. Basculement sur le modèle de secours...")
                await asyncio.sleep(0.5)
                continue
            logger.warning(f"[Groq Failover] Erreur sur {model}: {e}. Tentative suivante...")

    logger.error(f"[Groq Failover] Échec total de tous les modèles de secours : {last_error}")
    raise last_error or RuntimeError("Tous les modèles IA ont échoué")


async def generate_json_with_failover(
    prompt: str,
    system_prompt: Optional[str] = None,
    schema: Optional[Type[BaseModel]] = None,
    temperature: float = 0.2,
    is_vision: bool = False,
    image_base64: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Génère un objet JSON structuré avec validation par rapport au schéma si fourni.
    """
    json_system = system_prompt or "Tu es un assistant IA précis. Tu dois impérativement répondre en JSON pur et valide."
    json_system += "\nRéponds UNIQUEMENT avec un objet JSON brut, sans backticks markdown, sans intro, sans salutations."

    raw_text = await generate_text_with_failover(
        prompt=prompt,
        system_prompt=json_system,
        temperature=temperature,
        is_vision=is_vision,
        image_base64=image_base64,
    )

    clean_text = raw_text.replace("```json", "").replace("```", "").strip()
    
    # Extract JSON substring if surrounded by extra text
    if "{" in clean_text and "}" in clean_text:
        start = clean_text.find("{")
        end = clean_text.rfind("}") + 1
        clean_text = clean_text[start:end]
    elif "[" in clean_text and "]" in clean_text:
        start = clean_text.find("[")
        end = clean_text.rfind("]") + 1
        clean_text = clean_text[start:end]

    try:
        data = json.loads(clean_text)
        if schema and isinstance(data, dict):
            # Validate with schema
            validated = schema(**data)
            return validated.model_dump()
        return data
    except Exception as e:
        logger.error(f"Erreur de parsing JSON pour le texte : '{raw_text[:200]}...': {e}")
        raise ValueError(f"Impossible de parser la réponse JSON de l'IA : {e}")
