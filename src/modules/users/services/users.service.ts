import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import type { CreateUserInput } from '../ports/users.port';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async create(input: CreateUserInput): Promise<User> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('El correo ya está registrado');
    }

    const user = this.usersRepo.create({
      email: normalizedEmail,
      passwordHash: input.passwordHash,
      firstName: input.firstName?.trim() || '',
      lastName: input.lastName?.trim() || '',
      phone: input.phone?.trim() || '',
      avatarUrl: input.avatarUrl ?? null,
      status: input.status || 'active',
      lastLogin: input.lastLogin ?? null,
    });
    return this.usersRepo.save(user);
  }

  async touchLastLogin(userId: string, at: Date) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return;
    user.lastLogin = at;
    await this.usersRepo.save(user);
  }

  async update(
    userId: string,
    updates: Partial<{
      email: string;
      firstName: string;
      lastName: string;
      phone: string;
      avatarUrl: string | null;
      status: string;
    }>,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (updates.email !== undefined) {
      const normalizedEmail = updates.email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const existing = await this.findByEmail(normalizedEmail);
        if (existing && existing.id !== user.id) {
          throw new ConflictException('El correo ya está registrado');
        }
        user.email = normalizedEmail;
      }
    }

    if (updates.firstName !== undefined) {
      user.firstName = updates.firstName.trim();
    }
    if (updates.lastName !== undefined) {
      user.lastName = updates.lastName.trim();
    }
    if (updates.phone !== undefined) {
      user.phone = updates.phone.trim();
    }
    if (updates.avatarUrl !== undefined) {
      user.avatarUrl = updates.avatarUrl;
    }
    if (updates.status !== undefined) {
      user.status = updates.status;
    }

    return this.usersRepo.save(user);
  }

  async updatePassword(userId: string, passwordHash: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    user.passwordHash = passwordHash;
    return this.usersRepo.save(user);
  }

  async delete(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    await this.usersRepo.remove(user);
  }
}
