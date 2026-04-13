import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app.module';
import { ensureRuntimeEnv } from '../config/ensure-env';
import { AccessService } from '../modules/access/services/access.service';
import { UsersService } from '../modules/users/services/users.service';

const SALT_ROUNDS = 10;

async function seedIam() {
  ensureRuntimeEnv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const accessService = app.get(AccessService);
    const usersService = app.get(UsersService);

    await accessService.ensureDefaults();

    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.log(
        'Seed IAM OK. (ADMIN_EMAIL/ADMIN_PASSWORD no definidos; no se creó admin)',
      );
      return;
    }

    const existing = await usersService.findByEmail(adminEmail);
    const user =
      existing ??
      (await usersService.create(
        adminEmail,
        await bcrypt.hash(adminPassword, SALT_ROUNDS),
      ));

    await accessService.assignRoleToUser(user.id, 'admin');

    console.log(`Seed IAM OK. Admin: ${user.email}`);
  } finally {
    await app.close();
  }
}

seedIam().catch((err) => {
  console.error(err);
  process.exit(1);
});
