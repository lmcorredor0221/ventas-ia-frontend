from playwright.sync_api import expect, sync_playwright


BASE_URL = "http://127.0.0.1:5174/?app=1"
TENANT_ID = "tienda-nueva"


def json_response(route, payload):
    route.fulfill(status=200, content_type="application/json", body=__import__("json").dumps(payload))


def main():
    tenant = {
        "id": TENANT_ID,
        "name": "Tienda Nueva",
        "industry": "Tienda de barrio",
        "plan": "Ventas IA SaaS",
        "status": "trial",
        "accent": "#d49a41",
        "config": {"whatsapp": {}, "googleSheets": {}, "googleDrive": {}, "saas": {}},
        "lifecycle": {"ownerEmail": "dueno@example.com"},
    }
    status = {
        "status": {
            "readyForOperation": False,
            "readyForActivation": False,
            "nextStep": "llm",
            "subscription": {"status": "trial"},
            "checks": [
                {"key": "subscription", "ok": True, "detail": "trial"},
                {"key": "google_oauth", "ok": True, "detail": "dueno@example.com"},
                {"key": "google_provisioning", "ok": True, "detail": "sheet-1"},
                {"key": "llm", "ok": False, "detail": "pending"},
                {"key": "whatsapp", "ok": False, "detail": "missing"},
            ],
        },
        "subscription": {"status": "trial"},
        "googleConnection": {"status": "connected", "accountEmail": "dueno@example.com"},
        "googleWorkspace": {"status": "provisioned", "spreadsheet": {"id": "sheet-1"}},
        "whatsappOnboarding": {
            "setupPath": "new_business",
            "status": "in_progress",
            "canAutomate": False,
            "reason": "meta_webhook_not_configured",
            "binding": {},
        },
    }
    overview = {
        "tenants": [tenant],
        "tools": [],
        "conversations": [],
        "pendingRequests": [],
        "events": [],
        "usage": {
            "metrics": {"deliveries_confirmed": 0},
            "limits": {"includedDeliveries": 400},
            "percentages": {},
        },
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 980})
        page.route("**/api/auth/me", lambda route: json_response(route, {
            "user": {"email": "dueno@example.com", "name": "Dueno"},
            "memberships": [{"tenantId": TENANT_ID, "role": "owner", "status": "active"}],
            "isPlatformAdmin": False,
        }))
        page.route("**/api/ops/overview?*", lambda route: json_response(route, overview))
        page.route(f"**/api/saas/tenants/{TENANT_ID}/status", lambda route: json_response(route, status))
        page.route("**/api/billing/status?*", lambda route: json_response(route, {"subscription": {"status": "trial"}}))

        page.goto(BASE_URL)
        expect(page.get_by_text("Dejemos Tienda Nueva lista")).to_be_visible()
        expect(page.get_by_role("tab", name="WhatsApp Pendiente")).to_have_attribute("aria-selected", "true")
        expect(page.get_by_text("Tu tienda ya completó lo que depende de ella.")).to_be_visible()
        expect(page.get_by_text("No necesitas configurar nada más por ahora.")).to_be_visible()

        page.get_by_role("button", name="Revisar mi catálogo").click()
        expect(page.get_by_text("Guía para dejar Drive y Sheets listos")).to_be_visible()
        expect(page.get_by_text("Carga tus productos desde CSV")).to_be_visible()

        page.get_by_role("tab", name="WhatsApp Pendiente").click()
        page.get_by_role("button", name="Conocer la prueba guiada").click()
        expect(page.get_by_text("Antes de publicar, valida una conversación completa")).to_be_visible()

        page.get_by_role("button", name="Configuración", exact=True).click()
        expect(page.get_by_text("Puesta en marcha guiada")).to_be_visible()
        expect(page.get_by_text("Parámetros de la tienda")).to_have_count(0)
        browser.close()


if __name__ == "__main__":
    main()
