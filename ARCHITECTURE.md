# Arquitectura propuesta (backend)

## Estado actual
- NestJS 11 + TypeORM + PostgreSQL.
- Auth básico con JWT (register/login) y `UsersService` directo.
- Dependencia `@nestjs/cqrs` instalada, pero todavía no se usa.
- La estructura tipo *clean* en `src/modules/auth/application|domain|infrastructure` existe, pero hoy está vacía.

## Recomendación: Modular Monolith + Vertical Slices (pragmático)
En Nest, la arquitectura que mejor “encaja” y escala sin pelearse con el framework es:

- **Módulos por Bounded Context** (DDD liviano): `auth`, `users`, `access`.
- **Vertical slices** dentro de cada módulo (cuando crezca):
  - `presentation/` (controllers)
  - `application/` (use-cases: comandos/queries, DTOs, handlers)
  - `domain/` (reglas de negocio, entidades/VO, interfaces de repositorio)
  - `infrastructure/` (TypeORM repos, mappers, integraciones)

Esto es una versión **pragmática** de Clean/Hexagonal:
- La frontera real es **Application/Domain** vs **Infrastructure**.
- Nest se usa como *composition root* (DI) y como capa de transporte.

### Por qué no “Clean Architecture pura” desde el día 1
Separar modelos de dominio y modelos ORM al 100% es correcto, pero suele ser caro al principio.
Mejor: empezar con **contratos + puertos** (interfaces) y agregar mappers cuando el dominio lo pida.

## Autorización dinámica: RBAC primero, ABAC después
### Modelo base (RBAC dinámico)
- `User` ↔ `Role` (N:N) en `user_roles`
- `Role` ↔ `Permission` (N:N) en `role_permissions`
- `Permission.key` como string estable (ej: `orders.read`, `access.manage`)

Esto permite:
- Crear roles/permisos en runtime.
- Asignar roles a usuarios sin re-deploy.

### Evolución a ABAC (políticas)
Cuando necesites reglas como “puede ver pedidos sólo si son de su sucursal”, mantenés permisos como *acción* y agregás **policies** con condiciones:
- `Permission` (acción) + `Policy` (condición) + `resource`.
- Patrones recomendados: **Policy pattern** + **Specification pattern**.

## Patrones de diseño que aplican bien en Nest
- **Strategy**: Passport (`JwtStrategy`) para autenticación.
- **Guard**: `JwtAuthGuard` y `PermissionsGuard` para autorización.
- **Decorator**: `@Permissions(...)` para declarar reglas de acceso en controllers.
- **Repository**: repositorios TypeORM (y a futuro interfaces en `domain/repositories`).
- **CQRS (opcional)**: `CommandBus/QueryBus` para separar casos de uso.
- **Ports & Adapters (Hexagonal)**: `UsersPort`/`USERS_PORT` y `AccessPort`/`ACCESS_PORT` para desacoplar application de TypeORM.

## Convenciones recomendadas
- Permisos como strings con namespace: `access.manage`, `users.read`, `users.write`.
- Tokens JWT cortos (15m) + refresh token (si necesitás revocación/propagación rápida de cambios).
- Caching (más adelante): cachear permisos por usuario con TTL + invalidación por `aclVersion`.

## Lo que ya quedó implementado
- Módulo `access` con entidades `Role` y `Permission` y endpoints CRUD/assign.
- `Auth` ahora devuelve `roles` y `permissions` en login/register y en `/auth/me`.
- **CQRS real en Auth**: `POST /auth/register` y `POST /auth/login` ejecutan `RegisterCommand` / `LoginCommand` vía `CommandBus`.
- **Queries**: `GET /auth/me`, `GET /access/roles` y `GET /access/permissions` usan `QueryBus`.
- **Commands en access**: endpoints `POST /access/*` ejecutan Commands vía `CommandBus`.
- Script `seed:iam` para crear roles/permisos base y (opcional) un admin.
