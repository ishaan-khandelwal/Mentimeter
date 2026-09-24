import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDbUrl(): string | undefined {
  let url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (url.includes('pooler') && !url.includes('pgbouncer=true')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}pgbouncer=true&connect_timeout=15`;
  }
  return url;
}

const dbUrl = getDbUrl();

// The base client is memoized on globalThis (survives Next.js dev hot-reload)
// so we never spin up extra connection pools; the retry behavior below is
// re-attached on every import, which is cheap and creates no new connections.
const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

/**
 * Serverless Postgres providers (Neon, etc.) suspend their compute or drop
 * idle connections after a period of inactivity. When that happens mid-flight,
 * Prisma's engine surfaces it as a raw "Error { kind: Closed, cause: None }" —
 * the pooled connection it tried to reuse was already dead. The very next
 * attempt almost always succeeds immediately (Neon just needs to wake up /
 * hand out a fresh connection), so we retry exactly once on that specific
 * class of transient connection error instead of surfacing it as a failure.
 */
function isRetryableConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P1017: server closed the connection. P1001: can't reach db server.
    return err.code === 'P1017' || err.code === 'P1001';
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientRustPanicError) {
    return /closed|connection|econnreset|econnrefused/i.test(err.message);
  }
  return false;
}

export const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      try {
        return await query(args);
      } catch (err) {
        if (!isRetryableConnectionError(err)) throw err;
        console.warn(`[Prisma] Retrying ${model ?? 'raw'}.${operation} after a transient connection error`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return await query(args);
      }
    },
  },
});

export * from '@prisma/client';
