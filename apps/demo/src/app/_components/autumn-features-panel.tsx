"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

const featureCatalog = [
  {
    description: "Send an AI message",
    id: "messages",
    name: "Messages",
    type: "metered" as const,
  },
  {
    description: "Access to advanced AI models",
    id: "pro_models",
    name: "Pro Models",
    type: "boolean" as const,
  },
  {
    description: "Dedicated priority support channel",
    id: "priority_support",
    name: "Priority Support",
    type: "boolean" as const,
  },
];

function MeteredFeatureRow({
  featureId,
  name,
  description,
  check,
  onTrack,
  isTracking,
}: {
  description: string;
  featureId: string;
  name: string;
  check: (params: { featureId: string }) => {
    allowed: boolean;
    balance: { remaining: number; granted: number; unlimited: boolean } | null;
  };
  onTrack: (featureId: string, amount: number) => void;
  isTracking: boolean;
}) {
  const result = check({ featureId });
  const balance = result.balance;
  const used = balance ? balance.granted - balance.remaining : 0;
  const percentage = balance && balance.granted > 0 ? (used / balance.granted) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {!result.allowed ? <Badge variant="destructive">limit reached</Badge> : null}
        </div>
        {balance && !balance.unlimited ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {used.toLocaleString()} / {balance.granted.toLocaleString()} used
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">No access</span>
        )}
      </div>
      {balance && !balance.unlimited ? <Progress value={percentage} className="h-1.5" /> : null}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs">{description}</p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={isTracking || !result.allowed}
            onClick={() => onTrack(featureId, 1)}
          >
            +1
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isTracking || !result.allowed}
            onClick={() => onTrack(featureId, 10)}
          >
            +10
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isTracking || !result.allowed}
            onClick={() => onTrack(featureId, 100)}
          >
            +100
          </Button>
        </div>
      </div>
    </div>
  );
}

function BooleanFeatureRow({
  featureId,
  name,
  description,
  check,
}: {
  description: string;
  featureId: string;
  name: string;
  check: (params: { featureId: string }) => { allowed: boolean };
}) {
  const result = check({ featureId });

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{name}</span>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {result.allowed ? (
        <Badge variant="secondary">enabled</Badge>
      ) : (
        <Badge variant="outline">locked</Badge>
      )}
    </div>
  );
}

export function AutumnFeaturesPanel() {
  const { check, isLoading } = useCustomer();
  const autumnQueryClient = useQueryClient();

  const trackUsage = api.autumn.trackUsage.useMutation({
    onSuccess: () => {
      void autumnQueryClient.invalidateQueries({ queryKey: ["autumn"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {featureCatalog.map((feat) => (
          <Skeleton key={feat.id} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {featureCatalog.map((feat) =>
        feat.type === "metered" ? (
          <MeteredFeatureRow
            key={feat.id}
            featureId={feat.id}
            name={feat.name}
            description={feat.description}
            check={check}
            onTrack={(fId, amount) => trackUsage.mutate({ featureId: fId, value: amount })}
            isTracking={trackUsage.isPending}
          />
        ) : (
          <BooleanFeatureRow
            key={feat.id}
            featureId={feat.id}
            name={feat.name}
            description={feat.description}
            check={check}
          />
        ),
      )}
    </div>
  );
}
