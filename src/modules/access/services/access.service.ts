import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../../entities/permission.entity';
import { Role } from '../../../entities/role.entity';
import { User } from '../../../entities/user.entity';

export type UserAccessContext = {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepo: Repository<Permission>,
  ) {}

  async createPermission(key: string, description?: string | null) {
    const normalized = key.trim().toLowerCase();
    const existing = await this.permissionsRepo.findOne({
      where: { key: normalized },
    });
    if (existing) {
      throw new ConflictException('El permiso ya existe');
    }
    const permission = this.permissionsRepo.create({
      key: normalized,
      description: description ?? null,
    });
    return this.permissionsRepo.save(permission);
  }

  async listPermissions() {
    return this.permissionsRepo.find({ order: { key: 'ASC' } });
  }

  async createRole(key: string, name: string, description?: string | null) {
    const normalized = key.trim().toLowerCase();
    const existing = await this.rolesRepo.findOne({
      where: { key: normalized },
    });
    if (existing) {
      throw new ConflictException('El rol ya existe');
    }
    const role = this.rolesRepo.create({
      key: normalized,
      name: name.trim(),
      description: description ?? null,
      permissions: [],
    });
    return this.rolesRepo.save(role);
  }

  async listRoles() {
    return this.rolesRepo.find({
      order: { key: 'ASC' },
      relations: { permissions: true },
    });
  }

  async grantPermissionToRole(roleKey: string, permissionKey: string) {
    const rk = roleKey.trim().toLowerCase();
    const pk = permissionKey.trim().toLowerCase();

    const role = await this.rolesRepo.findOne({
      where: { key: rk },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    const permission = await this.permissionsRepo.findOne({
      where: { key: pk },
    });
    if (!permission) {
      throw new NotFoundException('Permiso no encontrado');
    }

    const already = (role.permissions ?? []).some((p) => p.key === pk);
    if (!already) {
      role.permissions = [...(role.permissions ?? []), permission];
      await this.rolesRepo.save(role);
    }

    return this.rolesRepo.findOne({
      where: { key: rk },
      relations: { permissions: true },
    });
  }

  async assignRoleToUser(userId: string, roleKey: string) {
    const rk = roleKey.trim().toLowerCase();

    const role = await this.rolesRepo.findOne({ where: { key: rk } });
    if (!role) {
      throw new NotFoundException('Rol no encontrado');
    }

    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { roles: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const already = (user.roles ?? []).some((r) => r.key === rk);
    if (!already) {
      user.roles = [...(user.roles ?? []), role];
      await this.usersRepo.save(user);
    }

    return this.getUserAccessContext(userId);
  }

  async ensureRoleExists(roleKey: string, name?: string) {
    const rk = roleKey.trim().toLowerCase();
    const existing = await this.rolesRepo.findOne({ where: { key: rk } });
    if (existing) {
      return existing;
    }
    const created = this.rolesRepo.create({
      key: rk,
      name: name ?? rk,
      description: null,
      permissions: [],
    });
    return this.rolesRepo.save(created);
  }

  async getUserAccessContext(userId: string): Promise<UserAccessContext> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: { roles: { permissions: true } },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const roles = (user.roles ?? []).map((r) => r.key);
    const permissions = new Set<string>();
    for (const role of user.roles ?? []) {
      for (const permission of role.permissions ?? []) {
        permissions.add(permission.key);
      }
    }

    return {
      id: user.id,
      email: user.email,
      roles,
      permissions: Array.from(permissions).sort(),
    };
  }

  async ensureDefaults() {
    // Idempotente: crea un set mínimo para arrancar.
    const accessManage = await this.permissionsRepo.findOne({
      where: { key: 'access.manage' },
    });
    if (!accessManage) {
      await this.createPermission(
        'access.manage',
        'Administrar roles/permisos',
      );
    }

    const accessRead = await this.permissionsRepo.findOne({
      where: { key: 'access.read' },
    });
    if (!accessRead) {
      await this.createPermission('access.read', 'Leer roles/permisos');
    }

    await this.ensureRoleExists('user', 'User');
    await this.ensureRoleExists('admin', 'Admin');

    // Asigna permisos a admin (y access.read a user) si aún no están
    await this.grantPermissionToRole('admin', 'access.manage');
    await this.grantPermissionToRole('admin', 'access.read');
    await this.grantPermissionToRole('user', 'access.read');
  }
}
