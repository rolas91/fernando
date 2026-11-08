# Compatibilidad de lecturas en la copia de datos real

Assignments fallaba con HTTP 500 porque pg devuelve las columnas DATE crudas como objetos Date, mientras que el paginado las ordenaba con localeCompare. Se proyecta la fecha de ordenación explícitamente como texto YYYY-MM-DD en PostgreSQL. Se conserva la fecha calendario, la ordenación ascendente/descendente y por proyecto, los filtros, las 25 filas por página y la hidratación completa de cada asignación. No se cambian datos ni validaciones de escritura.

Los lookups de formularios también podían fallar si un workerId histórico, por ejemplo 0013, se incluía en una búsqueda contra users.id, de tipo UUID. Se conservan todos los IDs al buscar workers y se consultan users únicamente con IDs UUID. Los trabajadores históricos no se renumeran ni se descartan del resultado.

Se añaden regresiones para la proyección SQL de fechas y para páginas con IDs históricos solos o mezclados con IDs UUID de usuarios.

Para comprobar arreglos en dev sin fusionarlos primero a master, el workflow existente permite publicar imágenes desde una ejecución manual sobre una rama del repositorio, después de pasar CI y smoke tests. Las PR no publican imágenes. Estas publicaciones de prueba son amd64, la arquitectura del VPS; master sigue publicando amd64/arm64. Los jobs de despliegue automático mantienen su condición exclusiva de master y ENABLE_VPS_DEPLOY=true. Cada imagen conserva la etiqueta sha-COMMIT y se instala en dev por digest; PM2 y la base nestdb no se modifican.
