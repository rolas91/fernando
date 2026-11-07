# Dependencias pendientes antes de producción

Estado posterior: se aplicó el primer bloque de correcciones compatible. El backend pasó de 29 avisos/1 crítico a 19 avisos/0 críticos, web de 14 a 11 y móvil de 40 a 37. Consultar security-first-block.md para versiones, límites y validaciones. Los números y la revisión que siguen corresponden al estado anterior al bloque, conservado como referencia.

El 7 de noviembre de 2026 se ejecutó npm audit --omit=dev --json en backend/ de la copia del monorepo, después de npm ci. La auditoría reportó 29 avisos en el árbol de dependencias de ejecución: 4 bajos, 7 moderados, 17 altos y 1 crítico. Son avisos de dependencias existentes; esta migración no actualizó las dependencias de las aplicaciones.

El aviso crítico corresponde a proxy-addr, dependencia transitiva, en el rango 1.1.0–2.0.7: [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h). El registro informa una corrección disponible a partir de 2.0.8. Este resultado no confirma que la aplicación sea explotable: hace falta revisar las condiciones del aviso, las dependencias que lo incorporan y la configuración real del proxy.

Antes de activar el despliegue en producción, revisar los avisos, seleccionar actualizaciones compatibles y repetir las pruebas y la construcción de las imágenes. No ejecutar npm audit fix --force indiscriminadamente. La publicación de una rama de migración no debe activar el despliegue del VPS: ENABLE_VPS_DEPLOY se mantiene desactivado.

El backend remoto ya tenía historial antes de esta migración. Conservarlo no elimina secretos o datos que pudieran estar en commits antiguos. Los archivos privados, respaldos y adjuntos se excluyen de la nueva copia de trabajo, pero eso no limpia el historial anterior. La contraseña fija previamente retirada del código debe rotarse si estaba en uso.

## Revisión de exposición y compatibilidad

Se repitió la auditoría de los tres proyectos y se revisaron sus dependencias instaladas y los puntos de uso en el código. No se hicieron cambios en package.json, package-lock.json ni en lógica de aplicación. Tampoco se ejecutaron ataques o pruebas contra el VPS.

| Árbol revisado con --omit=dev | Bajo | Moderado | Alto | Crítico | Total |
| --- | --- | --- | --- | --- | --- |
| Backend | 4 | 7 | 17 | 1 | 29 |
| Frontend | 0 | 7 | 7 | 0 | 14 |
| Mobile | 2 | 18 | 18 | 2 | 40 |

Los totales cuentan paquetes señalados por npm, incluidos padres de una misma dependencia vulnerable. No equivalen a fallas independientes ni confirman explotación. En frontend y móvil, --omit=dev tampoco prueba que cada paquete termine en el navegador o binario: algunas herramientas de compilación están declaradas como dependencias de producción.

### Prioridad de corrección

1. **Socket.IO, Engine.IO y ws.** El backend instala socket.io-parser 4.2.6, engine.io 6.6.6 y ws 8.18.3. La aplicación expone gateways /realtime y /shift-chat; también hay clientes Socket.IO en web y móvil. Son componentes usados, no solo herramientas de compilación. [El aviso del parser](https://github.com/advisories/GHSA-2m8v-j782-fhvr) describe agotamiento de memoria y fija 4.2.7 como versión corregida de su rama. Resolver todos los avisos de Engine.IO y ws también requiere actualizar sus revisiones afectadas; corregir solo el parser no basta. Mantener los eventos, namespaces, autenticación, reconexión e invalidación de caché existentes y comprobar cliente/servidor después del cambio.

2. **Cargas y procesamiento de imágenes.** Multer 2.1.1 llega mediante @nestjs/platform-express y se usa en archivos de workers, assignments, certificaciones, chat e importaciones. Las rutas revisadas tienen autenticación y límites de archivo, pero esos controles no equivalen a corregir todos los avisos del parser multipart. [Multer documenta denegación de servicio por campos anidados](https://github.com/advisories/GHSA-72gw-mp4g-v24j). Sharp 0.35.2 procesa los bytes de los logos en SpacesStorageService; su [aviso de libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) afecta el procesamiento de entradas no confiables bajo determinadas condiciones. El árbol también señala un aviso posterior de librsvg. La revisión debe cubrir ambos, no limitarse a la primera versión corregida de libheif. No se confirmó una explotación con los formatos y permisos actuales.

3. **proxy-addr.** La versión instalada es 2.0.7 mediante Express. [El aviso crítico](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) requiere ciertas subredes IPv6 mal configuradas al establecer confianza en proxies. No se encontró trust proxy/trustProxy en el código de arranque revisado. Por ello no se confirmó esa condición en la aplicación actual; sigue pendiente actualizar a una revisión corregida, desde 2.0.8, y comprobar el registro de IP detrás de NGINX. No habilitar confianza indiscriminada en X-Forwarded-For como supuesto arreglo.

4. **Correo y dependencias compartidas del backend.** Nodemailer 8.0.5 está usado por IntegrationsService. La corrección completa propuesta por npm pasa a una versión mayor 10.x, así que requiere revisión de compatibilidad y pruebas de destinatarios, SMTP, adjuntos y plantillas con un servidor de correo de pruebas. Axios/Undici, Express/body-parser/qs, Lodash y otras dependencias transitivas también están señaladas; actualizar dentro de rangos declarados cuando sea posible y repetir auditoría tras resolver el árbol real.

5. **Web y Expo.** Revisar Socket.IO del cliente, React Router y Zod en web. npm propone Zod 4 como corrección: eso puede cambiar el comportamiento de validaciones y no debe aplicarse automáticamente sobre Zod 3. En mobile los críticos son shell-quote 1.8.3 mediante react-devtools-core y tar 7.5.13 mediante @expo/cli, correspondientes a herramientas de desarrollo/construcción; no se confirmó su ejecución en el binario móvil publicado. Expo está en SDK 54 y varios arreglos automáticos proponen SDK 58: cualquier salto debe tratarse como una migración aparte y coordinada con React Native y los módulos nativos.

### Avisos que no justifican cambios ciegos

- La sugerencia automática para ExcelJS/UUID incluye bajar ExcelJS de 4.x a 3.4.0. No aceptarla sin revisar API y compatibilidad de importación/exportación. El aviso transitivo de UUID no implica que todas las operaciones de ExcelJS sean vulnerables.
- El aviso de TypeORM sobre orderBy en UpdateQueryBuilder/SoftDeleteQueryBuilder descrito para MySQL/MariaDB no demuestra exposición en este sistema, que usa PostgreSQL. TypeORM y su árbol tienen otros avisos que sí requieren análisis por separado.
- La contraseña retirada del código permanece en el historial remoto: una actualización de librerías no sustituye su rotación si seguía siendo válida.

### Secuencia propuesta

Corregir primero revisiones compatibles de red/Socket.IO, Express/uploads y Sharp en un bloque acotado, sin modificar payloads ni lógica de Schedule. Ejecutar tipos, las pruebas actuales y construir las imágenes; validar luego polling/WebSocket, archivos/logos y lectura de Schedule/Assignments en el entorno aislado. Tratar Nodemailer, Zod y una eventual actualización de Expo en bloques separados con pruebas específicas. Conservar producción en PM2 mientras se valida dev.drworkops.com. No ejecutar migraciones de datos por actualizar estas librerías.

Se ejecutó además npm audit fix --dry-run --ignore-scripts --json para el backend. La simulación propone cambiar 140 paquetes, agregar 21 y retirar 37; incluye herramientas de desarrollo y no constituye una actualización aplicada ni una auditoría del árbol ya corregido. Se comprobó que los manifiestos y lockfiles de las tres aplicaciones siguen iguales a los originales. Por su amplitud, no se recomienda aplicar todo el plan de una vez.
