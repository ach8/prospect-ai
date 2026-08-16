import base64
import logging
import httpx
from bs4 import BeautifulSoup
from typing import Optional, Tuple

logger = logging.getLogger("WebScraper")


class WebScraperService:
    async def scrape_website(self, domain_or_url: str) -> str:
        """
        Scrape le contenu textuel d'un site web pour l'analyse anti-hallucination.
        """
        url = domain_or_url if domain_or_url.startswith("http") else f"https://{domain_or_url}"
        logger.info(f"Scraping de {url}...")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
                res = await client.get(url, headers=headers)
                if res.status_code != 200 and url.startswith("https"):
                    # Fallback http
                    res = await client.get(f"http://{domain_or_url}", headers=headers)

                html = res.text
                soup = BeautifulSoup(html, "html.parser")

                # Supprimer les balises inutiles
                for tag in soup(["script", "style", "nav", "footer", "svg", "noscript"]):
                    tag.decompose()

                text = soup.get_text(separator=" ", strip=True)
                return text[:15000]

        except Exception as e:
            logger.warning(f"Erreur scraping pour {url}: {e}")
            return ""

    async def capture_screenshot_base64(self, url: str) -> Optional[str]:
        """
        Capture une capture d'écran de la page d'accueil avec Playwright pour l'Audit Visuel.
        Retourne l'image encodée en base64.
        """
        target_url = url if url.startswith("http") else f"https://{url}"
        logger.info(f"Capture d'écran Playwright pour {target_url}")

        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
                )
                page = await browser.new_page(viewport={"width": 1920, "height": 1080})
                try:
                    await page.goto(target_url, wait_until="domcontentloaded", timeout=15000)
                    screenshot_bytes = await page.screenshot(full_page=False)
                    await browser.close()
                    return base64.b64encode(screenshot_bytes).decode("utf-8")
                except Exception as page_err:
                    logger.warning(f"Erreur navigation page {target_url}: {page_err}")
                    await browser.close()
                    return None
        except Exception as e:
            logger.warning(f"Playwright non disponible ou erreur capture: {e}")
            return None


web_scraper_service = WebScraperService()
