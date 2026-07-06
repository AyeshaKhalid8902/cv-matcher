import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function randomPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

export async function POST(req: NextRequest) {
  const { email, txnId } = (await req.json()) as { email?: string; txnId?: string };

  if (!email?.trim() || !email.includes("@")) {
    return Response.json({ error: "Valid email required." }, { status: 400 });
  }

  // Check if this email already has a PIN
  const existing = await sql`
    SELECT pin FROM "PremiumPin"
    WHERE "claimedByEmail" = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  if (existing.length > 0) {
    return Response.json({ success: true, pin: existing[0].pin, alreadyHad: true });
  }

  // Generate unique PIN
  let pin = randomPin();
  for (let i = 0; i < 10; i++) {
    const exists = await sql`SELECT 1 FROM "PremiumPin" WHERE pin = ${pin} LIMIT 1`;
    if (exists.length === 0) break;
    pin = randomPin();
  }

  // Save PIN with email and transaction reference
  await sql`
    INSERT INTO "PremiumPin" (pin, used, "createdAt", "claimedByEmail", "txnId")
    VALUES (${pin}, false, NOW(), ${email.trim().toLowerCase()}, ${txnId?.trim() ?? ""})
  `;

  return Response.json({ success: true, pin });
}
