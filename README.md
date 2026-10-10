# Ventas IA Frontend

Frontend React/Vite para la microapp Ventas IA: Tienda viva, onboarding premium, Centro de control, observabilidad, conversaciones y configuración.

## Desarrollo

```bash
npm install
npm run dev
```

Por defecto Vite proxifica `/api`, `/webhooks` y `/health` hacia `http://127.0.0.1:3001`.

Para apuntar a un backend separado, configura:

```bash
VITE_API_BASE_URL=https://tu-backend.example.com
```

## Build

```bash
npm run build
```
