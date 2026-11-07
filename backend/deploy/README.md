# Despliegue con GitHub Actions, GHCR y Docker Compose

Actualización de monorepo: el destino ahora es https://github.com/rolas91/fernando.git, rama master. Los workflows activos están en .github/workflows de la raíz y producen ghcr.io/rolas91/fernando-api y ghcr.io/rolas91/fernando-web. Los contratos usan frontend/backend del mismo commit; no requieren DEPENDENCIES_READ_TOKEN ni BACKEND_CONTRACT_REF. Las instrucciones de repositorios separados que siguen son históricas: consultar WORKSPACE.md de la raíz para la configuración actual de CI. Mantener ENABLE_VPS_DEPLOY desactivado durante la validación del entorno dev.

Esta carpeta pertenece al repositorio backend y es la fuente de la configuración del VPS. No se ha conectado a ningún servidor real ni se han publicado imágenes durante la configuración.

## Flujo

1. Backend usa la rama master; frontend y móvil usan main.
2. Cada repositorio ejecuta sus pruebas y tipos. La web verifica además sus contratos de cálculos con el checkout hermano del backend.
3. Las imágenes web/API se construyen y comprueban en GitHub. Se publican con etiqueta sha-COMMIT y se despliegan por digest inmutable, para amd64/arm64.
4. El VPS actualiza solamente la imagen de la aplicación correspondiente. Un bloqueo común con flock serializa despliegues desde ambos repositorios.
5. Compose espera la salud de los contenedores y el helper comprueba /api-healthz a través del proxy web. Si falla, restaura las imágenes previas. GitHub comprueba también la URL HTTPS pública.

El Dockerfile.production del backend arranca sin migrar y exige configuración de base de datos/JWT explícita. El Dockerfile antiguo de CapRover permanece intacto. Ningún secreto de runtime se pasa al build. Las respuestas de la API y Socket.IO usan el mismo dominio que la web.

## Preparar el VPS una vez

Requisitos: Linux, Docker Engine con Compose moderno y soporte de --wait, Bash, util-linux/flock, un PostgreSQL existente accesible desde el VPS y acceso de lectura a las imágenes privadas en GHCR. El usuario SSH de despliegue debe poder ejecutar Docker. Usa el instalador oficial de Docker correspondiente a tu distribución.

- Crea /opt/dr-workops con acceso restringido al usuario de despliegue.
- Copia compose.production.yml, Caddyfile y deploy.sh desde esta carpeta a /opt/dr-workops.
- Copia .env.production.example como .env.production y .env.images.example como .env.images en ese directorio. Completa los datos directamente en el VPS; no los subas a Git ni los pegues en un chat.
- Conserva también los ajustes actuales de correo, Spaces/archivos, Twilio y otras integraciones. El ejemplo no intenta adivinar estos valores.
- Protege .env.production y .env.images con chmod 600 y deploy.sh con chmod 700.
- Configura docker login ghcr.io con una credencial que tenga permiso de lectura de los paquetes. El token efímero de GitHub Actions no sustituye el acceso persistente del VPS al registro.
- Sustituye ambos digests de ejemplo por los digests reales de builds correctos que aparecen en el resumen de Actions. Los ceros son ejemplos, no imágenes existentes.

APP_DOMAIN debe apuntar al VPS. EDGE_PROXY=caddy incorpora HTTPS automático con Caddy y necesita los puertos 80/443 libres. Si un proxy existente ya ocupa esos puertos, usa EDGE_PROXY=external y configura ese proxy para reenviar al puerto local WEB_PORT (8080 por defecto), incluyendo WebSocket. La web solamente publica ese puerto en 127.0.0.1; la API no publica un puerto de producción.

PostgreSQL no se crea ni reemplaza en esta pila de producción. Mantén sus backups por separado. Si existen archivos locales en el backend antiguo/public, restaura esos archivos en el volumen uploads antes de dirigir tráfico al nuevo despliegue; no basta con copiar la imagen. Las credenciales de Spaces se conservan en el archivo privado de runtime si los archivos ya viven en almacenamiento externo.

Primero publica y valida las imágenes sin activar aún el deploy automático. Para la primera instalación, desde /opt/dr-workops:

```bash
# Descargar ambas imágenes ya publicadas.
docker compose --env-file .env.production --env-file .env.images -f compose.production.yml pull api web
# Solo cuando corresponda y después de verificar un backup: aplicar migraciones.
docker compose --env-file .env.production --env-file .env.images -f compose.production.yml --profile tools run --rm --no-deps migrate
# Iniciar la versión configurada. Este comando no migra.
api_image=$(sed -n 's/^API_IMAGE=//p' .env.images | tr -d '\r')
bash deploy.sh api "$api_image" false
```

Comprueba https://TU_DOMINIO/ y https://TU_DOMINIO/api-healthz, autenticación, calendario, edición y notificaciones. Cambios futuros en estos archivos de infraestructura deben copiarse de nuevo al VPS; el despliegue automático actualiza las imágenes, no sobrescribe secretos ni configuración del servidor.

## Configuración de GitHub en frontend y backend

Crea el Environment production. Puedes usar las políticas de tu equipo; los workflows no fuerzan una aprobación manual adicional. En ambos repositorios configura:

| Tipo | Nombre | Contenido |
| --- | --- | --- |
| Secret | DEPLOY_HOST | Dominio o IP del VPS |
| Secret | DEPLOY_USER | Usuario SSH de despliegue |
| Secret | DEPLOY_SSH_KEY | Clave SSH privada del usuario |
| Secret | DEPLOY_KNOWN_HOSTS | Entrada SSH del servidor, con fingerprint verificado por un canal confiable |
| Variable de repositorio | ENABLE_VPS_DEPLOY | true solo después de completar y comprobar la primera instalación |
| Variable | DEPLOY_PATH | /opt/dr-workops |
| Variable | DEPLOY_PORT | 22 o el puerto SSH utilizado |
| Variable | PUBLIC_HEALTH_URL | https://TU_DOMINIO/api-healthz |
| Variable frontend | VITE_GOOGLE_MAPS_API_KEY | Clave pública de navegador restringida a tus dominios, si utilizas mapas |
| Variable frontend | VITE_BUSINESS_TIME_ZONE | America/Los_Angeles o la zona que ya utiliza el negocio |
| Secret frontend | DEPENDENCIES_READ_TOKEN | Token con lectura del repositorio backend si es privado |
| Variable frontend | BACKEND_CONTRACT_REF | Revisión del backend para pruebas de contratos; master por defecto, preferible un commit coordinado |

ENABLE_VPS_DEPLOY debe ser variable de repositorio porque se evalúa antes de crear el job del Environment. GITHUB_TOKEN para publicar GHCR lo proporciona GitHub y el workflow solicita packages:write solamente en el job de imágenes. No uses pull_request_target para ejecutar código no confiable con secretos. Las PR ejecutan pruebas locales; los contratos entre repositorios se comprueban antes de publicar desde la rama de producción.

Los push correctos a master/backend o main/frontend publican imágenes. El job del VPS se ejecuta únicamente si ENABLE_VPS_DEPLOY=true y se configuró el Environment. Los workflows están fijados a revisiones verificadas de las acciones oficiales, con Dependabot para actualizaciones.

## Migraciones y rollback

El push automático no migra. El workflow manual del backend ofrece run_migrations=false por defecto. Activarlo es una operación explícita: requiere un backup verificado y migraciones compatibles con la versión que pueda volver a ejecutarse. Una reversión de imagen no revierte el esquema ni los datos. Usa cambios de esquema compatibles hacia atrás (expand/contract) y operaciones destructivas en fases separadas.

El helper guarda las imágenes anteriores en .releases y registra las versiones correctas en history.log. Para volver solamente a la API de un snapshot anterior:

```bash
previous=$(sed -n 's/^API_IMAGE=//p' .releases/FECHA.env.images | tr -d '\r')
bash deploy.sh api "$previous" false
# Para la web: extrae WEB_IMAGE y usa deploy.sh web DIGEST false.
```

Una falla de la comprobación pública HTTPS deja el workflow en error; si los contenedores y el proxy interno siguen sanos, revisa DNS/TLS/red antes de cambiar imágenes. Compose en un único VPS puede tener una interrupción breve al recrear un servicio; esto no promete despliegue sin interrupciones.

## Validación local sin producción

compose.smoke.yml usa una base PostgreSQL efímera con credenciales de prueba internas. No lee .env ni contiene una conexión a producción. Puedes ejecutar:

```bash
docker build -f Dockerfile.production -t dr-workops-ci:local .
docker compose -f deploy/compose.smoke.yml up -d --wait --wait-timeout 240
docker compose -f deploy/compose.smoke.yml down --volumes --remove-orphans
```

Las pruebas deployment.test.cjs simulan Docker para comprobar digest, salud, migración explícita y rollback; nunca hablan con un VPS ni una base real. En Windows requieren Bash disponible; también pueden ejecutarse dentro del contenedor Linux de Node con el repositorio montado en solo lectura y DEPLOY_TEST_TMP=/tmp/workops-tests.

Referencias oficiales: [Nx](https://nx.dev/docs/kb/adding-to-existing-project), [Docker y GitHub Actions](https://docs.docker.com/build/ci/github-actions/), [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

### Verificación local realizada (6 de noviembre de 2026)

- Construcción real de ambas imágenes Linux amd64 y validación de Nginx.
- Arranque de PostgreSQL temporal, aplicación de todas las migraciones, API saludable y creación de un administrador de prueba.
- Web/SPA y salud API a través de Nginx; las rutas protegidas mantienen el rechazo 401 sin autenticación.
- Handshake de Socket.IO tanto por polling como por WebSocket a través del proxy.
- 330 pruebas del backend, 6 pruebas del helper de despliegue, pruebas web/mobile y comprobaciones de tipos/compilación/Nx completadas.

Esto valida la pila local. La ejecución de GitHub Actions, las imágenes arm64, TLS con el dominio real, la conexión al VPS y las compilaciones nativas EAS se verificarán al configurar esos entornos; no se ejecutó un despliegue de producción.

La configuración de conexión ya no contiene la contraseña fija ni un host remoto de respaldo que existían en el código anterior. Completa DB_HOST/DB_PASSWORD en tu entorno privado. Si esa contraseña se utilizó realmente, rótala: quitarla del código actual no la elimina del historial Git.
