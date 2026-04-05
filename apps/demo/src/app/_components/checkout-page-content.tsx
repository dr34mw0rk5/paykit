"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

import { AutumnFeaturesPanel } from "@/app/_components/autumn-features-panel";
import { AutumnSubscribePanel } from "@/app/_components/autumn-subscribe-panel";
import { FeaturesPanel } from "@/app/_components/features-panel";
import { SubscribePanel } from "@/app/_components/subscribe-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

export function CheckoutPageContent() {
  const { data: session, isPending } = authClient.useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const toastShown = useRef(false);

  const activeTab = searchParams.get("tab") === "autumn" ? "autumn" : "paykit";
  const setTab = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (toastShown.current) return;
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toastShown.current = true;
      toast.success("Billing flow completed successfully");
    } else if (checkout === "canceled") {
      toastShown.current = true;
      toast.warning("Billing flow was canceled");
    }
  }, [searchParams]);

  if (isPending || !session) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground text-sm">
            Manage your subscription and billing details.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{session.user.email}</span>
          <Button
            onClick={() => {
              void authClient.signOut();
            }}
            size="sm"
            variant="ghost"
          >
            Sign out
          </Button>
        </div>
      </div>
      <Separator />
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="paykit">PayKit</TabsTrigger>
          <TabsTrigger value="autumn">Autumn</TabsTrigger>
        </TabsList>
        <TabsContent value="paykit" className="flex flex-col gap-8 pt-4">
          <SubscribePanel />
          <Separator />
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Features</h2>
            <FeaturesPanel />
          </section>
        </TabsContent>
        <TabsContent value="autumn" className="flex flex-col gap-8 pt-4">
          <AutumnSubscribePanel />
          <Separator />
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Features</h2>
            <AutumnFeaturesPanel />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
