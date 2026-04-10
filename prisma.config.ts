import { defineConfig } from "prisma/config";
import { loadSelectedEnv } from "./scripts/env.mjs";
import { getPrismaDatabaseUrl } from "./src/lib/prisma-config";

loadSelectedEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: getPrismaDatabaseUrl(),
  },
});
