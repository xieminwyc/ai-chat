export function getPrismaDatabaseUrl(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = processEnv.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Prisma config.");
  }

  return databaseUrl;
}
