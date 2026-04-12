import { defineConfig } from "prisma/config";
import { loadSelectedEnv } from "./scripts/env.mjs";

loadSelectedEnv();

function getPrismaDatabaseUrl(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = processEnv.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Prisma config.");
  }

  return databaseUrl;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: getPrismaDatabaseUrl(),
  },
});
