import { User } from '../../../entities/user.entity';

// Light Clean: el port devuelve la entidad actual (sin mapping).
// A futuro podés cambiarlo para devolver un modelo de dominio/DTO.
export interface UsersPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(email: string, passwordHash: string): Promise<User>;
}
