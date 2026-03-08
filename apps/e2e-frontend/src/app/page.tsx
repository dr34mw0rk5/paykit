import { CheckoutButton } from "@/app/_components/checkout-button";
import { HydrateClient } from "@/trpc/server";

const checkoutExample = `curl -X POST http://localhost:3000/api/rest/paykit/checkout \\
  -H "content-type: application/json" \\
  -d '{
    "customer": {
      "id": "api-demo-user",
      "email": "api-demo@example.com",
      "name": "API Demo Customer"
    },
    "amount": 1999,
    "description": "REST checkout",
    "attachMethod": true
  }'`;

const chargeExample = `curl -X POST http://localhost:3000/api/rest/paykit/charge \\
  -H "content-type: application/json" \\
  -d '{
    "customerId": "api-demo-user",
    "paymentMethodId": "pm_your_saved_method",
    "amount": 1999,
    "description": "REST charge"
  }'`;

export default function Home() {
  return (
    <HydrateClient>
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-white">
        <div className="flex w-full max-w-4xl flex-col gap-8">
          <div className="space-y-3">
            <p className="text-sm tracking-[0.3em] text-white/50 uppercase">PayKit E2E frontend</p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Trigger checkout through tRPC or REST
            </h1>
            <p className="max-w-2xl text-base text-white/70">
              Use this page to exercise the Next.js demo app against Stripe in test mode through the
              existing tRPC flow or the new local-only REST API.
            </p>
          </div>

          <CheckoutButton />

          <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">REST API</h2>
              <p className="text-sm text-white/70">
                The app also exposes a local-only Elysia API under{" "}
                <code className="rounded bg-white/10 px-2 py-1 text-xs">/api/rest/paykit</code> for
                checkout and direct-charge testing.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-[0.2em] text-white/60 uppercase">
                  Checkout
                </h3>
                <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs text-white/80">
                  <code>{checkoutExample}</code>
                </pre>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold tracking-[0.2em] text-white/60 uppercase">
                  Charge
                </h3>
                <p className="text-sm text-white/60">
                  Run this after saving a payment method for the same customer. Use the local PayKit
                  payment method ID.
                </p>
                <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs text-white/80">
                  <code>{chargeExample}</code>
                </pre>
              </div>
            </div>
          </section>
        </div>
      </main>
    </HydrateClient>
  );
}
