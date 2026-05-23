import dotenv from 'dotenv';
import path from 'path';
import dns from 'dns';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dns.setDefaultResultOrder('ipv4first');
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  const connectionString = process.env.DATABASE_URL;
  const adapter = new PrismaNeon({ connectionString });
  prisma = new PrismaClient({ adapter });
} else {
  // Prevent multiple instances of Prisma Client in development hot-reloads
  if (!(global as any).prisma) {
    const connectionString = process.env.DATABASE_URL;
    const adapter = new PrismaNeon({ connectionString });
    (global as any).prisma = new PrismaClient({ adapter });
  }
  prisma = (global as any).prisma;
}

export { prisma };
