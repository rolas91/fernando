# WorkOps: monorepo Nx

Repositorio destino: https://github.com/rolas91/fernando.git. Su rama predeterminada actual es master. El monorepo contiene frontend/, backend/ y mobile/, con la configuración Nx, Docker local y GitHub Actions en la raíz.

## Carpeta de trabajo consolidada

La raíz del proyecto contiene un único repositorio Git y tres aplicaciones: backend/, frontend/ y mobile/. No hay repositorios Git anidados ni es necesario trabajar desde output/monorepo-FECHA. El único remoto activo es origin, dirigido a rolas91/fernando.

La estructura anterior, sus historiales Git independientes, archivos locales y copias generadas se conservan en un archivo externo al workspace. La consolidación local no publica cambios en GitHub ni modifica el VPS. El comando prepare:monorepo dejó de formar parte de los comandos activos: no hace falta generar nuevas copias del proyecto.

Los archivos backend/.env, frontend/.env y mobile/.env, las configuraciones locales de Firebase y la firma de desarrollo de Android se conservan localmente y están excluidos de Git. Los archivos .env.example son plantillas. Los directorios nativos generados de Expo y los archivos públicos del backend también permanecen fuera del repositorio. Solo los workflows de .github/ en la raíz son activos.

Antes de publicar, revisar git status desde la raíz, confirmar los archivos elegidos y abrir una PR hacia master. No usar force push ni subir archivos privados. MONOREPO-EXPORT.json conserva las revisiones de la exportación inicial como referencia histórica.

## Instalación y comandos

Usar Node 24 LTS. Ejecutar npm ci en la raíz y npm run install:projects para instalar las dependencias de las tres aplicaciones. Cada una mantiene su package-lock y sus dependencias independientes; frontend y mobile usan versiones distintas de React. Nx coordina tareas sin cambiar esas versiones.

Los comandos dev normales conservan las configuraciones .env de cada aplicación. Para trabajar con la base local aislada, configurar .env.docker y utilizar npm run dev:local; ese lanzador fuerza workops_local y no reutiliza la base remota. No se deben asumir las direcciones de los entornos sin revisar la configuración local.

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

.github/workflows/eas-build.yml es manual, usa mobile-release y trabaja dentro de mobile/. Requiere EXPO_TOKEN, EAS_PROJECT_ID y EXPO_PUBLIC_API_URL. No publica en tiendas. Los archivos privados de Firebase/firma deben configurarse en Expo/EAS; las copias locales conservadas no se publican en Git.

## VPS: transición actual

El VPS es independiente de la reorganización local. Dev usa /opt/dr-workops-test, Docker web/API, la base workops_docker_test y el puerto web local 8080. Docker de producción está en /opt/dr-workops, usa nestdb del PostgreSQL del host y publica la web en 127.0.0.1:8081. El servicio anterior con PM2 usa el puerto 3000. NGINX conserva HTTPS y determina si el dominio principal apunta a 3000 o 8081; comprobar su configuración para conocer el destino activo. Mover esta carpeta local no cambia ese destino.

La API de dev utiliza una red Docker interna para aislar integraciones externas; producción conserva su configuración propia. No copiar la base ni las credenciales de dev a producción. Los adjuntos y respaldos quedan fuera de Git. Los respaldos del VPS están bajo /var/backups/dr-workops y los archivos locales archivados se conservan fuera del workspace.

backend/deploy/README.md conserva los detalles del helper de despliegue, rollback y Compose. Sus referencias a repositorios separados corresponden a la configuración anterior; para ramas, Actions y nombres de imágenes prevalece esta guía de la raíz. backend/workspace y setup-workspace.cjs pertenecen a la estructura anterior y no se exportan al monorepo.

## Auditoría de dependencias

La instalación limpia confirmó avisos existentes. El primer bloque de correcciones eliminó el crítico del backend y los avisos de los componentes de red/uploads/imágenes actualizados. Quedan otros avisos pendientes: consultar docs/security-first-block.md y docs/dependency-audit.md antes de activar producción.
