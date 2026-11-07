import { AppDataSource } from './data-source';

async function main() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.undoLastMigration({ transaction: 'all' });

    console.log('Last migration reverted');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
