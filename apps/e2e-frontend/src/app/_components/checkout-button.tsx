"use client";

import { useEffect, useState } from "react";

import { api } from "@/trpc/react";

export function CheckoutButton() {
  const [attachMethod, setAttachMethod] = useState(true);
  const createCheckout = api.paykit.createCheckout.useMutation();

  useEffect(() => {
    if (!createCheckout.data?.url) {
      return;
    }

    window.location.assign(createCheckout.data.url);
  }, [createCheckout.data?.url]);

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-white">Checkout test</h2>
        <p className="text-sm text-white/70">
          This button calls the app&apos;s tRPC mutation, which syncs a demo customer and starts a
          real hosted Stripe Checkout session through PayKit.
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
        <input
          checked={attachMethod}
          className="size-4 rounded border-white/20 bg-slate-950 text-white"
          onChange={(event) => setAttachMethod(event.target.checked)}
          type="checkbox"
        />
        Save the payment method for future off-session charges
      </label>

      <button
        type="button"
        className="rounded-full bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
        disabled={createCheckout.isPending}
        onClick={() => createCheckout.mutate({ attachMethod })}
      >
        {createCheckout.isPending ? "Starting Stripe Checkout..." : "Start Stripe Checkout"}
      </button>

      {createCheckout.error ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {createCheckout.error.message}
        </p>
      ) : null}

      {createCheckout.data ? (
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
          <p>
            Redirecting <span className="font-medium">{createCheckout.data.customerId}</span> to
            Stripe Checkout with payment-method saving{" "}
            <span className="font-medium">
              {createCheckout.data.attachMethod ? "enabled" : "disabled"}
            </span>
            .
          </p>
          <a
            className="inline-flex break-all text-emerald-100 underline underline-offset-4"
            href={createCheckout.data.url}
            rel="noreferrer"
            target="_blank"
          >
            Open checkout manually
          </a>
        </div>
      ) : null}
    </div>
  );
}
