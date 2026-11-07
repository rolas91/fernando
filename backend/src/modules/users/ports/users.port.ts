import { User } from '../../../entities/user.entity';

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string | null;
  status?: string;
  lastLogin?: Date | null;
};

export interface UsersPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  touchLastLogin(userId: string, at: Date): Promise<void>;
}
