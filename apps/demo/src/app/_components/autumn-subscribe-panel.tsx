"use client";

import { useCustomer, useListPlans } from "autumn-js/react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const planCatalog = [
  {
    description: "100 messages / month",
    id: "free",
    name: "Free",
    priceAmount: null,
  },
  {
    description: "2,000 messages, pro models",
    id: "pro",
    name: "Pro",
    priceAmount: 1900,
  },
  {
    description: "10,000 messages, priority support",
    id: "ultra",
    name: "Ultra",
    priceAmount: 4900,
  },
] as const;

function formatPrice(amount: number | null) {
  if (amount == null) return "$0";
  return `$${(amount / 100).toFixed(0)}`;
}

function formatDate(ts: number | null) {
  if (ts == null) return null;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AutumnSubscribePanel() {
  const { data: customer, attach, openCustomerPortal } = useCustomer();
  const { data: plans, isLoading: isLoadingPlans } = useListPlans();
  const [isPending, setIsPending] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const activeSub = customer?.subscriptions?.find((s) =>
    ["active", "trialing", "past_due"].includes(s.status),
  );
  const scheduledSub = customer?.subscriptions?.find((s) => s.status === "scheduled");

  const activePlanId = activeSub?.planId ?? null;

  function getPlanAction(planId: string) {
    if (scheduledSub?.planId === planId) {
      return { disabled: true, label: "Scheduled" };
    }

    if (activePlanId === planId) {
      if (activeSub?.canceledAt || scheduledSub) {
        return { disabled: false, label: "Resubscribe" };
      }
      return { disabled: true, label: "Current plan" };
    }

    const target = planCatalog.find((p) => p.id === planId);
    if (!target) return { disabled: false, label: "Choose plan" };

    if (!activePlanId) {
      return {
        disabled: false,
        label: target.priceAmount == null ? "Get started" : "Subscribe",
      };
    }

    const activeCatalog = planCatalog.find((p) => p.id === activePlanId);
    const activeAmount = activeCatalog?.priceAmount ?? 0;
    const targetAmount = target.priceAmount ?? 0;

    if (targetAmount > activeAmount) return { disabled: false, label: "Upgrade" };
    if (targetAmount < activeAmount) return { disabled: false, label: "Downgrade" };
    return { disabled: false, label: "Switch" };
  }

  async function handleSubscribe(planId: string) {
    setIsPending(true);
    setErrorMessage("");
    try {
      await attach({
        planId,
        successUrl: `${window.location.origin}/?checkout=success`,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Subscribe failed");
    } finally {
      setIsPending(false);
    }
  }

  async function handlePortal() {
    setPortalPending(true);
    try {
      await openCustomerPortal({
        returnUrl: window.location.href,
      });
    } finally {
      setPortalPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Current plan */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Current plan</h2>
          {activeSub ? (
            <Button variant="outline" size="sm" disabled={portalPending} onClick={handlePortal}>
              Manage billing
            </Button>
          ) : null}
        </div>
        {isLoadingPlans ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
        ) : activeSub ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-lg font-semibold">
              {plans?.find((p) => p.id === activeSub.planId)?.name ?? activeSub.planId}
            </span>
            <Badge variant="secondary">{activeSub.status}</Badge>
            {scheduledSub ? <Badge variant="outline">change pending</Badge> : null}
            <span className="text-muted-foreground text-sm">
              {activeSub.currentPeriodEnd
                ? activeSub.canceledAt || scheduledSub
                  ? `Ends ${formatDate(activeSub.currentPeriodEnd)}`
                  : `Renews ${formatDate(activeSub.currentPeriodEnd)}`
                : null}
            </span>
            {scheduledSub ? (
              <span className="text-muted-foreground text-sm">
                &rarr;{" "}
                {plans?.find((p) => p.id === scheduledSub.planId)?.name ?? scheduledSub.planId}{" "}
                {scheduledSub.startedAt
                  ? `on ${formatDate(scheduledSub.startedAt)}`
                  : "at end of period"}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No active plan.</p>
        )}
      </section>

      <Separator />

      {/* Plan cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Choose a plan</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {planCatalog.map((plan) => {
            const isCurrent = activePlanId === plan.id;
            const action = getPlanAction(plan.id);

            return (
              <Card key={plan.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex items-baseline gap-2">
                    {plan.name}
                    {isCurrent ? <Badge variant="secondary">current</Badge> : null}
                  </CardTitle>
                  <CardDescription>
                    <span className="text-foreground text-2xl font-semibold">
                      {formatPrice(plan.priceAmount)}
                    </span>
                    /mo
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <p className="text-muted-foreground flex-1 text-sm">{plan.description}</p>
                  <Button
                    className="w-full"
                    disabled={isPending || action.disabled}
                    onClick={() => void handleSubscribe(plan.id)}
                    variant={action.disabled ? "outline" : "default"}
                    size="sm"
                  >
                    {action.label}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
    </div>
  );
}
