import { defineConfig } from "prisma/config";
import { readFileSync } from "fs";
import { join } from "path";

// Prisma CLI only reads `.env`, not `.env.local` — load it manually
function loadEnvLocal() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local missing in production — DATABASE_URL set via platform
  }
}

loadEnvLocal();

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
