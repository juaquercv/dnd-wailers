import { PrismaClient } from '@prisma/client';

/** Single PrismaClient per process (survives `tsx watch` module reloads). */
const globalForPrisma = globalThis as typeof globalThis & { __wailersPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__wailersPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__wailersPrisma = prisma;
