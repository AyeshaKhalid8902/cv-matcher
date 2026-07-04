import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key) {
    return Response.json({ success: false, error: "Stripe Test Mode not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return Response.json({ success: false, error: "No session_id provided." }, { status: 400 });
  }

  try {
    const stripe  = new Stripe(key);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid    = session.payment_status === "paid";

    if (paid) {
      console.log(
        `[verify-payment] ✓ Premium unlocked | session: ${sessionId} | metadata:`,
        session.metadata
      );
    }

    return Response.json({
      success:  paid,
      metadata: paid ? session.metadata : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Verification failed.";
    console.error("[verify-payment] ✗", msg);
    return Response.json({ success: false, error: msg }, { status: 500 });
  }
}
