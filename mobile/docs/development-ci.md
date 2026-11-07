# Desarrollo con Nx y compilaciones de CI

Los comandos originales npm start, npm run android, npm run ios y npm run web siguen disponibles en este repositorio. Desde el workspace con las carpetas hermanas frontend/backend/mobile, usa npm run dev:mobile, mobile:android, mobile:ios o mobile:web. Consulta backend/workspace/WORKSPACE.md para reconstruir esa carpeta de coordinación en otra máquina.

- npm run typecheck comprueba los tipos.
- npm run test:ci ejecuta las pruebas locales en serie, incluyendo las reglas de timesheets.
- npm run build:android y npm run build:ios usan EAS CLI 27.5.0 con el perfil production existente.
- npm run build:web exporta la variante web de Expo; no reemplaza la aplicación frontend principal y depende de que los módulos nativos utilizados tengan soporte web.

El workflow Mobile CI valida main y sus PR sin acceder a cuentas de tiendas. EAS native build es un workflow manual de main. Selecciona android/ios/all y preview/production; genera compilaciones y espera su resultado, sin envío automático a las tiendas.

Crea el Environment mobile-release en GitHub y configura EXPO_TOKEN como Secret. Configura EAS_PROJECT_ID (UUID del proyecto) y EXPO_PUBLIC_API_URL como variables de ese Environment. Inicializa y prepara una vez el proyecto EAS y sus credenciales de firma con tu cuenta autorizada. El EAS_PROJECT_ID de CI se incorpora a la configuración sin reescribir app.json ni sus identificadores actuales.

Para Android, el archivo google-services.json indicado en app.json debe estar disponible para el build. Si lo administras como variable de archivo de EAS, utiliza GOOGLE_SERVICES_JSON en el entorno correspondiente; app.config.js acepta esa ruta y conserva la original cuando la variable no está definida. Los perfiles existentes de eas.json se mantienen. No subas tokens ni claves de firma a Git.

Un teléfono físico necesita una API accesible desde su red: localhost dentro del teléfono es el propio teléfono. Para desarrollo configura EXPO_PUBLIC_API_URL con la IP LAN del equipo, y para producción usa la URL HTTPS de tu API. Expo/EAS se gestiona separado del despliegue web/API con Docker Compose.
