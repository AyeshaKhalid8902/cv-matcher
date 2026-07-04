

import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const key = process.env.STRIPE_TEST_SECRET_KEY;

  if (!key || key === "sk_test_YOUR_KEY_HERE") {
    return Response.json(
      { error: "Stripe Test Mode not configured — add STRIPE_TEST_SECRET_KEY to .env.local" },
      { status: 503 }
    );
  }

  try {
    const stripe  = new Stripe(key);
    const base    = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 100, // $1.00 in cents
            product_data: {
              name: "CV Matcher Premium",
              description: "Unlimited AI Cover Letters + Premium Interview Tips",
            },
          },
          quantity: 1,
        },
      ],
      // Metadata flags what this payment unlocks — readable in Stripe dashboard & webhook
      metadata: {
        product:  "cv_matcher_premium",
        features: "interview_tips,cover_letter",
        plan:     "lifetime",
      },
      success_url: `${base}/recommendations?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/recommendations`,
    });

    return Response.json({ url: session.url });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Checkout session creation failed.";
    console.error("[create-checkout]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
