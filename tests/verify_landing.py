import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("UI_BASE_URL", "http://127.0.0.1:5173")
OUT_DIR = Path(os.environ.get("UI_RESULTS_DIR", "test-results-landing"))
OUT_DIR.mkdir(parents=True, exist_ok=True)


def check_landing(page, name, width, height, route):
    page.set_viewport_size({"width": width, "height": height})
    page.goto(f"{BASE_URL}{route}", wait_until="networkidle")
    page.get_by_role("heading", name="Recibe pedidos sin estar pegado al celular.").wait_for()
    assert page.locator("body").evaluate("el => el.scrollWidth <= el.clientWidth + 1")
    assert page.get_by_text("Hasta 400").first.is_visible()
    assert page.get_by_role("link", name="Probar gratis").first.get_attribute("href").endswith("/?app=1")
    slider = page.locator("#landing-deliveries")
    slider.fill("400")
    assert page.locator("output").inner_text() == "400"
    page.screenshot(path=str(OUT_DIR / f"{name}.png"), full_page=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    check_landing(page, "desktop", 1440, 1000, "/")
    check_landing(page, "desktop-alias", 1440, 1000, "/landing")
    check_landing(page, "mobile", 390, 844, "/")
    browser.close()

print("Landing visual checks passed")
