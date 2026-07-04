import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function randomPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.APP_CRON_KEY}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { count = 1 } = (await req.json().catch(() => ({}))) as { count?: number };
  const pins: string[] = [];

  for (let i = 0; i < Math.min(count, 50); i++) {
    let pin = randomPin();
    let attempts = 0;
    while (attempts < 10) {
      const exists = await sql`SELECT 1 FROM "PremiumPin" WHERE pin = ${pin} LIMIT 1`;
      if (exists.length === 0) break;
      pin = randomPin();
      attempts++;
    }
    await sql`INSERT INTO "PremiumPin" (pin, used, "createdAt") VALUES (${pin}, false, NOW())`;
    pins.push(pin);
  }

  return Response.json({ success: true, pins });
}
