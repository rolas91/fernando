# WorkOps: monorepo Nx

Repositorio destino: https://github.com/rolas91/fernando.git. Su rama predeterminada actual es master. El monorepo contiene frontend/, backend/ y mobile/, con la configuración Nx, Docker local y GitHub Actions en la raíz.

## Preparación de la migración

La carpeta de trabajo original conserva los tres repositorios Git anidados y todos sus cambios actuales. No ejecutar git add . en esa carpeta: los repositorios anidados se convertirían en referencias Git en lugar de incluir sus archivos.

npm run prepare:monorepo muestra una vista previa. npm run prepare:monorepo -- --write crea una copia independiente en output/monorepo-FECHA, basada en un clon del repositorio destino. La rama de esa copia se llama migration/monorepo. Se conserva el historial remoto del backend y se colocan los archivos actuales bajo backend/. Frontend y mobile se incorporan como archivos actuales; sus historiales completos permanecen en sus repositorios originales. No se hacen commits ni push automáticamente.

La copia omite .git anidados, dependencias instaladas, archivos de entorno privados, adjuntos, respaldos, claves de firma y las configuraciones antiguas de Actions por aplicación. Solo se publican los workflows de la raíz. MONOREPO-EXPORT.json registra las revisiones originales y los archivos copiados; no contiene credenciales.

Antes de publicar, revisar git status en la copia. Las eliminaciones de archivos de la raíz antigua del backend son esperadas: ahora están dentro de backend/. No usar force push. Después de revisar y probar, se puede hacer un commit en migration/monorepo y abrir una PR hacia master. El código que sirve PM2 en el VPS no se actualiza por crear esta rama.

## Instalación y comandos

Usar Node 24 LTS. Ejecutar npm ci en la raíz y npm run install:projects para instalar las dependencias de las tres aplicaciones. Cada una mantiene su package-lock y sus dependencias independientes; frontend y mobile usan versiones distintas de React. Nx coordina tareas sin cambiar esas versiones.

| Comando | Resultado |
| --- | --- |
| npm run dev | Frontend y API en desarrollo |
| npm run dev:frontend | Solo frontend, normalmente 8080 |
| npm run dev:backend | Solo API, normalmente 3000 |
| npm run dev:mobile | Expo |
| npm run dev:all | Las tres aplicaciones |
| npm run mobile:android / mobile:ios / mobile:web | Desarrollo de la app móvil |
| npm run build | Compilar web y API |
| npm run build:android / build:ios | EAS; requiere configurar Expo y firma |
| npm run typecheck | Tipos de las tres aplicaciones |
| npm test | Pruebas de las tres, incluidos contratos web/API del mismo commit |
| npm run lint | Revisión sin correcciones automáticas |
| npm run check:workspace | Verificar la infraestructura del monorepo |
| npm run projects / graph | Proyectos y grafo Nx |

Los builds, tipos y pruebas usan caché local Nx. Los servidores, migraciones y builds nativos no se cachean. La caché web incluye un hash de sus variables VITE_ y archivos dotenv, sin imprimir valores. No se ha activado Nx Cloud. Hay un aviso moderado de minimatch en las herramientas de Nx; no se forzó una actualización mayor incompatible. Nx no forma parte de las imágenes de ejecución.

## Docker local

Copiar .env.docker.example como .env.docker y elegir credenciales locales. npm run docker:up construye y arranca web, API, PostgreSQL local y las migraciones. npm run docker:seed crea el administrador LOCAL_ADMIN_EMAIL/LOCAL_ADMIN_PASSWORD. Abrir http://localhost:8080.

npm run docker:logs muestra los registros. npm run docker:down detiene la pila conservando los volúmenes. La base local workops_local está separada de producción.

Para desarrollar con recarga en host: npm run docker:db, npm run docker:migrate, npm run docker:seed y npm run dev:local. Este modo fija la conexión a la base local. No ejecutar simultáneamente ambos modos en los mismos puertos. Los comandos dev:backend/db:migrate/db:revert ordinarios usan el entorno de backend; no confundirlos con el modo local aislado.

## GitHub Actions y publicación

.github/workflows/ci-deploy.yml verifica master y sus PR. Instala y prueba los tres proyectos mediante Nx y construye las dos imágenes. Los contratos frontend/backend usan el mismo checkout; ya no se necesita DEPENDENCIES_READ_TOKEN ni BACKEND_CONTRACT_REF.

En master se publican ghcr.io/rolas91/fernando-api:sha-COMMIT y ghcr.io/rolas91/fernando-web:sha-COMMIT. El resumen de Actions registra los digests inmutables. Cada imagen se prueba en amd64 antes de publicar para amd64/arm64. Las PR no publican imágenes ni despliegan. Las dos imágenes deben construirse correctamente antes de iniciar el despliegue. Los jobs de despliegue se ejecutan en orden API y web; esto no es una actualización atómica de la pareja.

Mantener ENABLE_VPS_DEPLOY sin configurar o false durante esta migración. Todavía no se ha ejecutado el workflow remoto del monorepo. El despliegue preparado usa el Environment production y los secretos DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY y DEPLOY_KNOWN_HOSTS; variables DEPLOY_PATH, DEPLOY_PORT y PUBLIC_HEALTH_URL. No apuntarlo todavía al servicio actual. VITE_GOOGLE_MAPS_API_KEY y VITE_BUSINESS_TIME_ZONE son variables de compilación web. Las migraciones siguen siendo explícitas y no se revierten al restaurar una imagen.

.github/workflows/eas-build.yml es manual, usa mobile-release y trabaja dentro de mobile/. Requiere EXPO_TOKEN, EAS_PROJECT_ID y EXPO_PUBLIC_API_URL. No publica en tiendas. Los archivos privados de Firebase/firma deben configurarse en Expo/EAS; no se copian al monorepo.

## VPS: transición actual

Producción drworkops.com continúa en NGINX hacia PM2, puerto 3000, con PostgreSQL nestdb. dev.drworkops.com ya tiene HTTPS y todavía sirve una página temporal. Docker de pruebas usará la base workops_docker_test y su usuario exclusivo, comprobados desde la red dr-workops-test, subred 172.18.0.0/16, gateway 172.18.0.1. La web de prueba se publicará solo en 127.0.0.1:8080 y NGINX la expondrá mediante dev. No hace falta Caddy: se conservará el NGINX actual.

La conexión PostgreSQL desde Docker fue comprobada manualmente. Antes de arrancar la aplicación con la copia de datos hay que preparar su configuración de pruebas y aislar correos, SMS, push y tareas externas; no reutilizar las credenciales de integraciones de producción. Los adjuntos y respaldos quedan fuera de Git y se trasladan por separado. El respaldo del VPS está en /var/backups/dr-workops/20261107-035335.

backend/deploy/README.md conserva los detalles del helper de despliegue, rollback y Compose. Sus referencias a repositorios separados corresponden a la configuración anterior; para ramas, Actions y nombres de imágenes prevalece esta guía de la raíz. backend/workspace y setup-workspace.cjs pertenecen a la estructura anterior y no se exportan al monorepo.

## Auditoría de dependencias

La instalación limpia confirmó avisos existentes. El primer bloque de correcciones eliminó el crítico del backend y los avisos de los componentes de red/uploads/imágenes actualizados. Quedan otros avisos pendientes: consultar docs/security-first-block.md y docs/dependency-audit.md antes de activar producción.
