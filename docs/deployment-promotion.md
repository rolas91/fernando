# Dev automático y promoción manual

Esta preparación no publica imágenes, no sube commits y no cambia contenedores. La activación es independiente de la configuración de las protecciones de GitHub.

## Flujo habitual

1. Trabajar en una rama y abrir PR hacia `master`. Los checks obligatorios son `ci` (pruebas y compilaciones), `api` y `web` (imágenes y comprobaciones de contenedores).
2. Fusionar el PR. Actions construye API y web, publica sus digests y guarda `release.json` durante 90 días.
3. Con `ENABLE_DEV_DEPLOY=true`, el trabajo `deploy_dev` instala ambas imágenes en `/opt/dr-workops-test`, verifica contenedores y `https://dev.drworkops.com/api-healthz`. Guarda el comprobante `dev-validated.json` solo si todo termina correctamente.
4. Probar dev. El resumen de la ejecución muestra el número de versión y el **Build run ID**, que es el número al final de la URL `/actions/runs/NUMERO`; no es el contador visual `#18`.
5. Actions → **Promover a producción** → Run workflow. Seleccionar la rama **master**, introducir ese Build run ID, elegir `promote` y marcar la confirmación de pruebas y autorización de producción.
6. GitHub verifica que el build es de este repositorio, terminó correctamente en master y tiene un comprobante vigente de dev del mismo commit e intento. Después instala exactamente esa pareja de imágenes, sin reconstruirlas, en `/opt/dr-workops`.

La comprobación automática de salud no reemplaza las pruebas funcionales de la persona que promueve. Un despliegue en un VPS puede tener una breve interrupción mientras se recrean los servicios.

## Preparación y activación, una sola vez

El workflow debe llegar a `master` mediante PR antes de que aparezca su botón. No hace falta copiar scripts nuevos al VPS: Actions envía por SSH el script versionado `backend/deploy/deploy-release.sh` de master. Las configuraciones privadas permanecen en el servidor.

En GitHub, crear los entornos **dev** y **production**, permitiendo despliegues únicamente desde la rama `master` (no tags). `master` debe exigir PR, los checks `ci`, `api` y `web` actualizados, resolución de conversaciones y prohibir force push/eliminación, también para administradores. El archivo `.github/master-protection.json` conserva esa política. Se permite un PR sin otro aprobador para que una persona sola pueda operar; un equipo puede exigir una aprobación adicional. No se activan excepciones para administradores.

Configurar en cada entorno sus propios secrets:

| Secret | Uso |
| --- | --- |
| `DEPLOY_HOST` | Host del VPS |
| `DEPLOY_USER` | Usuario con acceso a Docker y al directorio del entorno |
| `DEPLOY_SSH_KEY` | Llave privada de despliegue |
| `DEPLOY_KNOWN_HOSTS` | Entrada del host SSH cuya huella se verificó previamente |

Variable opcional por entorno: `DEPLOY_PORT`, por defecto `22`. No introducir credenciales PostgreSQL, Google ni Twilio en estos campos; se conservan en los archivos privados existentes del VPS. Una llave debe ser exclusiva de automatización; no copiar una llave personal al repositorio.

Requisitos existentes del servidor:

- Docker Compose con `--wait` y `config --format json`, Bash, Python 3, curl y flock.
- Acceso de lectura a GHCR configurado para el usuario de despliegue si las imágenes son privadas.
- Dev conserva `compose.dev.yml`, `.env.dev`, sus redes y su base independiente.
- Producción conserva `compose.production.yml`, `.env.production`, `.env.images`, sus volúmenes y su base actual.
- La comprobación HTTPS desde el propio VPS debe poder acceder a `/api-healthz`. Si dev mantiene una lista de IP permitidas en NGINX, incluir al origen de esa comprobación sin abrir todo el sitio. El workflow no altera listas de acceso.
- La cuenta SSH tiene que poder entrar desde los runners de GitHub. El workflow no cambia el firewall.

Solo cuando se decida activar, crear las variables **de repositorio**:

- `ENABLE_DEV_DEPLOY=true`: habilita dev para los siguientes builds de master; también se puede ejecutar manualmente el workflow de CI en master.
- `ENABLE_PRODUCTION_PROMOTION=true`: permite el botón de promoción, pero nunca provoca un despliegue por sí sola.

El control antiguo `ENABLE_VPS_DEPLOY` deja de ser utilizado. No habilitarlo para este flujo. Ninguna variable anterior se cambia al preparar o proteger las ramas.

## Salud, trazabilidad y reversión

El helper toma el mismo `.deploy.lock` del helper anterior. Actualiza ambas imágenes como una sola versión, conserva las configuraciones previas en `.releases`, espera salud Docker, consulta la API a través de web y verifica HTTPS. Si falla una de esas comprobaciones, restaura ambas imágenes anteriores y devuelve error. Si la conexión SSH se pierde o vence el tiempo, el resultado puede ser indeterminado: revisar el estado antes de reintentar. Un fallo al subir el comprobante de Actions después de una instalación sana tampoco desinstala esa versión; la promoción quedará bloqueada hasta disponer del comprobante correcto.

`compose.dev.yml` se conserva. Las imágenes de dev se fijan mediante `.release-images.json`, que se aplica como override. En producción también se actualiza `.env.images` para mantener los comandos de inspección existentes. Para consultar la configuración efectiva de dev después de activar:

```bash
docker compose --env-file /opt/dr-workops-test/.env.dev -f /opt/dr-workops-test/compose.dev.yml -f /opt/dr-workops-test/.release-images.json ps
```

Para restaurar una versión anterior, usar el mismo workflow **Promover a producción**, elegir `rollback`, introducir el Build run ID anterior que haya pasado dev y confirmar. Esa opción instala una pareja anterior de imágenes; **no restaura datos ni revierte migraciones**. Conservar los artefactos de las versiones que se necesiten durante la ventana de reversión (90 días por defecto) y las imágenes correspondientes en GHCR.

Este flujo no ejecuta migraciones, no restaura bases y no cambia `.env.dev`, `.env.production`, NGINX, PM2 ni archivos subidos. Un cambio de esquema requiere su propio procedimiento explícito, con respaldo verificado y compatibilidad con la versión anterior.

Después de activar, usar Actions para todos los despliegues y reversiones habituales. Evitar alternar la edición manual de imágenes con la automatización: el override representa la versión activa. Si se hace una recuperación manual, actualizar también ese override antes del siguiente despliegue.

Las imágenes anteriores a este flujo no tienen un comprobante de dev verificable. No se pueden promover con el botón: el primer build posterior a la integración debe pasar por dev. Para emergencias de esas versiones antiguas se conservan las configuraciones y el helper previos del servidor.
