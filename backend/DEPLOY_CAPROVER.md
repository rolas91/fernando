# Deploy Backend en CapRover

Este backend ya incluye:

- `captain-definition`
- `Dockerfile`
- `.dockerignore`

## 1) Variables obligatorias en CapRover

- `PORT=3000`
- `NODE_ENV=production`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`

Recomendadas:

- `CORS_ORIGIN=https://tu-frontend.com`
- `SWAGGER_ENABLED=false`
- `AUTH_DEV_BYPASS=false`

## 2) Servir frontend build desde backend (opcional)

Si quieres backend + frontend en la misma app:

- `SERVE_FRONTEND=true`
- `FRONTEND_DIST_PATH=/app/public` (opcional, por defecto intenta `/app/public`)

Luego asegúrate de copiar el build del frontend dentro de `backend/public` antes del deploy:

```powershell
cd "c:\workspace\fernando\frontend"
npm run build
cd "c:\workspace\fernando\backend"
if (Test-Path public) { Remove-Item -Recurse -Force public }
Copy-Item -Recurse "..\frontend\dist" "public"
```

También puedes usar el script automatizado:

```powershell
cd "c:\workspace\fernando\backend"
npm run prepare:frontend
```

## 3) Deploy

- Crea app en CapRover.
- Conecta repo y selecciona carpeta `backend` como app root.
- Despliega.
