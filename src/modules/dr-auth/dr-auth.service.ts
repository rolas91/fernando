import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserProfile } from '../../entities/user-profile.entity';

type Role = 'admin' | 'manager' | 'scheduler' | 'viewer';
type JwtVerifyPayload = { sub: string; role?: Role };
type AccessPayload = { userId: string; role: Role };

@Injectable()
export class DrAuthService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly usersRepo: Repository<UserProfile>,
    private readonly jwtService: JwtService,
  ) {}

  private mapUser(user: UserProfile) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: (user.role as Role) || 'viewer',
      phone: user.phone || '',
      avatarUrl: user.avatarUrl || '',
      status: user.status || 'active',
      lastLogin: user.lastLogin?.toISOString() || null,
    };
  }

  verifyAccessToken(token: string): AccessPayload | null {
    try {
      const payload: JwtVerifyPayload =
        this.jwtService.verify<JwtVerifyPayload>(token);
      return { userId: payload.sub, role: payload.role || 'viewer' };
    } catch {
      return null;
    }
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    let isValid = false;
    const hash = user.passwordHash || '';
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      isValid = await bcrypt.compare(password, hash);
    } else {
      isValid = hash === password;
    }

    if (!isValid) return { success: false, error: 'Invalid email or password' };

    user.lastLogin = new Date();
    await this.usersRepo.save(user);

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { success: true, token, user: this.mapUser(user) };
  }

  async verify(token: string) {
    try {
      const payload: JwtVerifyPayload =
        this.jwtService.verify<JwtVerifyPayload>(token);
      const user = await this.usersRepo.findOne({ where: { id: payload.sub } });
      if (!user) return { success: false, error: 'User not found' };
      return { success: true, user: this.mapUser(user) };
    } catch {
      return { success: false, error: 'Invalid token' };
    }
  }

  async register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: Role;
    phone?: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) return { success: false, error: 'Email already exists' };

    const hashed = await bcrypt.hash(input.password, 10);
    const user = this.usersRepo.create({
      id: crypto.randomUUID(),
      email,
      passwordHash: hashed,
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      role: input.role || 'viewer',
      phone: input.phone || '',
      status: 'active',
      lastLogin: new Date(),
    });
    await this.usersRepo.save(user);

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { success: true, token, user: this.mapUser(user) };
  }

  async listUsers() {
    const users = await this.usersRepo.find({
      order: { createdAt: 'ASC' },
    });
    return { success: true, users: users.map((u) => this.mapUser(u)) };
  }

  async createUser(input: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    role: Role;
    password: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const exists = await this.usersRepo.findOne({ where: { email } });
    if (exists) return { success: false, error: 'Email already exists' };

    const user = this.usersRepo.create({
      id: crypto.randomUUID(),
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      firstName: input.firstName || '',
      lastName: input.lastName || '',
      phone: input.phone || '',
      role: input.role || 'viewer',
      status: 'active',
      lastLogin: null,
    });
    await this.usersRepo.save(user);
    return { success: true, user: this.mapUser(user) };
  }

  async updateUser(
    userId: string,
    input: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      role: Role;
      status: 'active' | 'inactive' | 'archived';
    }>,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };

    if (input.email && input.email.toLowerCase() !== user.email) {
      const exists = await this.usersRepo.findOne({
        where: { email: input.email.toLowerCase() },
      });
      if (exists) return { success: false, error: 'Email already exists' };
      user.email = input.email.toLowerCase();
    }

    if (input.firstName !== undefined) user.firstName = input.firstName;
    if (input.lastName !== undefined) user.lastName = input.lastName;
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.role !== undefined) user.role = input.role;
    if (input.status !== undefined) user.status = input.status;

    await this.usersRepo.save(user);
    return { success: true, user: this.mapUser(user) };
  }

  async deleteUser(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };
    await this.usersRepo.remove(user);
    return { success: true };
  }

  async resetPassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.save(user);
    return { success: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };

    const hash = user.passwordHash || '';
    const valid =
      hash.startsWith('$2a$') || hash.startsWith('$2b$')
        ? await bcrypt.compare(currentPassword, hash)
        : hash === currentPassword;

    if (!valid) return { success: false, error: 'Current password is invalid' };

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.save(user);
    return { success: true };
  }

  async updateProfile(
    userId: string,
    updates: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      avatarUrl: string;
      status: string;
    }>,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) return { success: false, error: 'User not found' };
    if (updates.firstName !== undefined) user.firstName = updates.firstName;
    if (updates.lastName !== undefined) user.lastName = updates.lastName;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.avatarUrl !== undefined) user.avatarUrl = updates.avatarUrl;
    if (updates.status !== undefined) user.status = updates.status;
    await this.usersRepo.save(user);
    return { success: true, user: this.mapUser(user) };
  }
}
