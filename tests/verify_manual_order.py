"""Real local API + mobile/desktop UI. Never uses production or WhatsApp."""
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get('UI_BASE_URL', 'http://127.0.0.1:5177')
if not BASE.startswith('http://127.0.0.1:'):
    raise RuntimeError('Local UI only')
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (390, 1440, 320):
        context = browser.new_context(viewport={'width': width, 'height': 900})
        response = context.request.post(f'{BASE}/api/auth/google', data={'idToken': 'dev-google-id-token', 'profile': {'sub': 'manual-ui-owner', 'email': 'andina@example.local', 'name': 'Owner'}})
        assert response.ok, response.text()
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'{BASE}/?app=1&tenant=andina&view=conversations', wait_until='networkidle')
        page.get_by_role('button', name='Conversaciones', exact=True).click()
        page.get_by_text(f'Atención manual {width}', exact=True).first.click()
        if page.get_by_role('tab', name='Acciones', exact=True).is_visible():
            page.get_by_role('tab', name='Acciones', exact=True).click()
        page.get_by_role('button', name='Confirmar y alistar pedido', exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog.get_by_label('Nombre del cliente', exact=True)).to_be_visible()
        dialog.get_by_label('Nombre del cliente', exact=True).fill('Cliente de prueba')
        dialog.get_by_label('Dirección de entrega', exact=True).fill('Calle de prueba 123')
        dialog.get_by_label('Forma de pago', exact=True).select_option('cash')
        for search in ('Colanta', 'Pan tajado'):
            dialog.get_by_label('Agregar productos del catálogo', exact=True).fill(search)
            dialog.locator('.manual-order-results button').first.click()
        expect(dialog.locator('.manual-order-total')).to_contain_text('10.000')
        expect(dialog.get_by_role('button', name='Confirmar y alistar pedido', exact=True)).to_be_disabled()
        dialog.get_by_role('checkbox').check()
        assert dialog.evaluate('el => el.scrollWidth <= el.clientWidth + 1'), 'Horizontal overflow'
        if width == 390:
            page.screenshot(path=str(Path(os.environ.get('TEMP', '.')) / 'via-manual-order-mobile.png'))
        dialog.get_by_role('button', name='Confirmar y alistar pedido', exact=True).click()
        try:
            expect(dialog).not_to_be_visible()
        except AssertionError:
            print(dialog.inner_text(), flush=True)
            print(errors, flush=True)
            raise
        expect(page.get_by_role('button', name='Marcar en camino', exact=True).first).to_be_visible()
        expect(page.locator('.queue-layout')).to_contain_text('Leche Colanta')
        assert not errors, errors
        print(f'PASS manual confirmation -> preparing at {width}px, total $10,000, no WhatsApp sent')
        context.close()
    browser.close()
