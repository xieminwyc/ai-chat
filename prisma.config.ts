import { defineConfig, env } from "prisma/config";
import { loadSelectedEnv } from "./scripts/env.mjs";

loadSelectedEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
