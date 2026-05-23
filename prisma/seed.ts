import "dotenv/config";
import { prisma } from '../src/lib/db';

async function main() {
  console.log('Seeding database...');

  // 1. Create default game configurations
  const configs = [
    { key: 'winner_share', value: '70', description: 'Percentage of entry fee allocated to the winner pool (0-100)' },
    { key: 'admin_share', value: '20', description: 'Percentage of entry fee allocated to the admin/owner pool (0-100)' },
    { key: 'app_share', value: '10', description: 'Percentage of entry fee allocated to the platform/app pool (0-100)' },
    { key: 'default_entry_fee', value: '100', description: 'Default entry fee in coins for joining a spin wheel' },
  ];

  for (const config of configs) {
    await prisma.gameConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }
  console.log('Default game configurations upserted.');

  // 2. Create sample users (1 Admin + 5 Players)
  const users = [
    { username: 'admin', role: 'ADMIN', coins: 5000.0 },
    { username: 'alex', role: 'USER', coins: 1000.0 },
    { username: 'bella', role: 'USER', coins: 1000.0 },
    { username: 'charlie', role: 'USER', coins: 1000.0 },
    { username: 'david', role: 'USER', coins: 1000.0 },
    { username: 'emma', role: 'USER', coins: 1000.0 },
  ];

  for (const user of users) {
    const dbUser = await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: user,
    });
    
    // Check if they already have an initial transaction recorded
    const existingTx = await prisma.coinTransaction.findFirst({
      where: { userId: dbUser.id, type: 'INITIAL_CREDIT' },
    });

    if (!existingTx) {
      await prisma.coinTransaction.create({
        data: {
          userId: dbUser.id,
          amount: user.coins,
          type: 'INITIAL_CREDIT',
          description: `Initial wallet credit of ${user.coins} coins`,
        },
      });
    }
  }

  console.log('Sample users and initial credit transactions created.');
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
