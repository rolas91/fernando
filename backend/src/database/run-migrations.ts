import { AppDataSource } from './data-source';

async function main() {
  await AppDataSource.initialize();
  try {
    const migrations = await AppDataSource.runMigrations({
      transaction: 'all',
    });

    console.log(
      `Migrations applied: ${migrations.map((m) => m.name).join(', ') || '(none)'}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
