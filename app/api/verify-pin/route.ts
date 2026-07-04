import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { pin } = (await req.json()) as { pin?: string };
  if (!pin?.trim()) return Response.json({ success: false, error: "PIN is required." }, { status: 400 });

  const rows = await sql`SELECT id, used FROM "PremiumPin" WHERE pin = ${pin.trim()} LIMIT 1`;

  if (rows.length === 0) return Response.json({ success: false, error: "Invalid PIN. Please check and try again." }, { status: 401 });
  if (rows[0].used)      return Response.json({ success: false, error: "This PIN has already been used." }, { status: 401 });

  await sql`UPDATE "PremiumPin" SET used = true, "usedAt" = NOW() WHERE id = ${rows[0].id}`;

  return Response.json({ success: true });
}
