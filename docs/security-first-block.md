# Primer bloque de correcciones de seguridad

Se conservan Nest 11.1.18, React 18 en web, Expo SDK 54/React Native en móvil y los flujos de negocio actuales. No se cambian controladores, validaciones, acciones de Schedule, eventos Socket.IO ni migraciones de datos.

## Dependencias actualizadas

| Componente | Antes | Después |
| --- | --- | --- |
| Express | 5.2.1 | 5.3.0 |
| Multer | 2.1.1 | 2.5.0 |
| proxy-addr | 2.0.7 | 2.0.8 |
| body-parser | 2.2.2 | 2.4.0 |
| qs | 6.15.0 | 6.17.1 |
| Sharp | 0.35.2 | 0.35.5 |
| Engine.IO servidor | 6.6.6 | 6.6.11 |
| socket.io-parser | 4.2.6 | 4.2.7 |
| socket.io-client web/móvil | 4.8.3 | 4.8.4 |
| engine.io-client web/móvil | 6.6.4 / 6.6.5 | 6.6.7 |

Se actualizan también las revisiones compatibles de ws y las bibliotecas nativas que necesita Sharp. Las ramas antiguas de ws utilizadas por herramientas de React Native se conservan en su major, con sus parches disponibles.

Nest fija versiones concretas de Express y Multer. Para no mezclar los cambios de validación de una actualización de Nest con este bloque, se usan overrides limitados a @nestjs/platform-express, proxy-addr y los componentes Socket.IO del backend. Los lockfiles fijan el árbol probado. No se reemplazan librerías ni se aplican saltos mayores de Nodemailer, Zod o Expo.

## Auditoría posterior

| Proyecto | Antes: total / críticos | Después: total / críticos |
| --- | --- | --- |
| Backend | 29 / 1 | 19 / 0 |
| Frontend | 14 / 0 | 11 / 0 |
| Mobile | 40 / 2 | 37 / 2 |

Los componentes objetivo del backend (Express, Multer, proxy-addr, body-parser, qs, Engine.IO, socket.io-parser, ws y Sharp) ya no aparecen señalados en npm audit --omit=dev después del cambio. Quedan avisos de otras dependencias; los dos críticos de móvil continúan en herramientas de desarrollo/construcción y no se corrigen en este bloque. No se declara libre de vulnerabilidades el sistema completo.

## Validación

Pasaron las comprobaciones de tipos de los tres proyectos, compilación de web/API y las pruebas de las tres aplicaciones, incluidas 50 suites y 330 pruebas del backend. Las verificaciones del workspace comprueban además revisiones mínimas corregidas para evitar degradaciones accidentales.

backend/scripts/security-runtime-smoke.cjs comprueba dentro de la imagen API las rutas/query y JSON de Express, rechazo de JSON inválido y cuerpos sobredimensionados, aceptación/rechazo de multipart por tipo/tamaño y conversión PNG con Sharp nativo. Solo utiliza loopback y no escribe en la base de la aplicación ni contacta integraciones externas. GitHub Actions lo ejecuta después del arranque de la pila PostgreSQL temporal.

Las pruebas locales no sustituyen la ejecución remota de Actions ni la validación de la aplicación en dev.drworkops.com. El despliegue automático de producción continúa desactivado.
