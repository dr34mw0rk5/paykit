import { and, count, desc, eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  invoice,
  paymentMethod,
  product,
  subscription,
} from "../../../packages/paykit/src/database/schema";
import {
  advanceTestClock,
  createTestCustomer,
  createTestPayKit,
  dumpStateOnFailure,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("subscription lifecycle", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomer(t, {
      id: "test_user_1",
      email: "smoke@test.com",
      name: "Smoke Test User",
    });
    customerId = customer.customerId;
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  // Poll until the subscription is active in PayKit's DB
  async function waitForSubscriptionActive(custId: string, timeout = 15_000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const rows = await t.database
        .select({ status: subscription.status })
        .from(subscription)
        .where(eq(subscription.customerId, custId))
        .orderBy(desc(subscription.updatedAt))
        .limit(1);
      const row = rows[0];
      if (row?.status === "active") return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Timed out waiting for subscription to become active");
  }

  // Helper to query customer products
  async function getCustomerProducts() {
    const rows = await t.database
      .select({
        id: subscription.id,
        plan_id: product.id,
        status: subscription.status,
        canceled: subscription.canceled,
        started_at: subscription.startedAt,
        ended_at: subscription.endedAt,
        current_period_start_at: subscription.currentPeriodStartAt,
        current_period_end_at: subscription.currentPeriodEndAt,
        scheduled_product_id: subscription.scheduledProductId,
      })
      .from(subscription)
      .innerJoin(product, eq(product.internalId, subscription.productInternalId))
      .where(eq(subscription.customerId, customerId))
      .orderBy(desc(subscription.createdAt));
    return rows;
  }

  async function getSubscription() {
    const rows = await t.database
      .select()
      .from(subscription)
      .where(and(eq(subscription.customerId, customerId), ne(subscription.status, "canceled")))
      .orderBy(desc(subscription.updatedAt))
      .limit(1);
    return rows[0];
  }

  async function getInvoiceCount() {
    const rows = await t.database
      .select({ count: count() })
      .from(invoice)
      .where(eq(invoice.customerId, customerId));
    return rows[0]?.count ?? 0;
  }

  // Wrap each step to dump state on failure
  async function step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (error) {
      console.error(`\nStep failed: ${name}`);
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  }

  it("full subscription lifecycle", async () => {
    // ─── Step 1: Sign up → Free plan auto-assigned ───
    await step("sign up → free plan", async () => {
      const products = await getCustomerProducts();
      const freeProduct = products.find((p) => p.plan_id === "free");

      expect(freeProduct).toBeDefined();
      expect(freeProduct!.status).toBe("active");
      expect(freeProduct!.current_period_end_at).toBeNull();
    });

    // ─── Step 2: Subscribe to Pro (via checkout) ───
    await step("subscribe to pro (checkout)", async () => {
      const result = await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      // No payment method → should return checkout URL
      expect(result.paymentUrl).not.toBeNull();

      // Log the checkout URL for manual completion
      console.log("\n\n  ▶ Complete checkout at:\n  " + result.paymentUrl + "\n");

      // Wait for checkout.completed webhook after manual completion
      await waitForWebhook(t.database, "checkout.completed", { timeout: 120_000 });

      const products = await getCustomerProducts();
      const pro = products.find((p) => p.plan_id === "pro" && p.status === "active");
      const free = products.find((p) => p.plan_id === "free" && p.status === "ended");

      expect(pro).toBeDefined();
      expect(pro!.current_period_end_at).not.toBeNull();
      expect(free).toBeDefined();

      const invoices = await getInvoiceCount();
      expect(invoices).toBeGreaterThanOrEqual(1);
    });

    // ─── Step 3: Upgrade Pro → Ultra (immediate) ───
    await step("upgrade pro → ultra", async () => {
      await t.paykit.subscribe({
        customerId,
        planId: "ultra",
        successUrl: "https://example.com/success",
      });

      // Wait for subscription update webhook
      await waitForSubscriptionActive(customerId);

      const products = await getCustomerProducts();
      const ultra = products.find((p) => p.plan_id === "ultra" && p.status === "active");
      const pro = products.find(
        (p) => p.plan_id === "pro" && p.status === "ended" && p.ended_at !== null,
      );

      expect(ultra).toBeDefined();
      expect(ultra!.current_period_end_at).not.toBeNull();
      expect(pro).toBeDefined();
    });

    // ─── Step 4: Downgrade Ultra → Pro (scheduled) ───
    await step("downgrade ultra → pro (scheduled)", async () => {
      const beforeDowngrade = new Date();

      await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      await waitForWebhook(t.database, "subscription.updated", { after: beforeDowngrade });

      const products = await getCustomerProducts();
      const ultra = products.find((p) => p.plan_id === "ultra" && p.status === "active");
      const scheduledPro = products.find((p) => p.plan_id === "pro" && p.status === "scheduled");

      expect(ultra).toBeDefined();
      expect(ultra!.canceled).toBe(true);
      expect(scheduledPro).toBeDefined();
    });

    // ─── Step 5: Resume Ultra (cancel the downgrade to Pro) ───
    await step("resume ultra", async () => {
      await t.paykit.subscribe({
        customerId,
        planId: "ultra",
        successUrl: "https://example.com/success",
      });

      const products = await getCustomerProducts();
      const ultra = products.find((p) => p.plan_id === "ultra" && p.status === "active");
      const scheduledPro = products.find((p) => p.plan_id === "pro" && p.status === "scheduled");

      expect(ultra).toBeDefined();
      expect(ultra!.canceled).toBe(false);
      expect(scheduledPro).toBeUndefined();
    });

    // ─── Step 6: Downgrade Ultra → Free + advance clock ───
    await step("downgrade ultra → free + advance clock", async () => {
      const beforeDowngrade = new Date();

      await t.paykit.subscribe({
        customerId,
        planId: "free",
        successUrl: "https://example.com/success",
      });

      await waitForWebhook(t.database, "subscription.updated", { after: beforeDowngrade });

      const products = await getCustomerProducts();
      const ultra = products.find((p) => p.plan_id === "ultra" && p.status === "active");
      const scheduledFree = products.find((p) => p.plan_id === "free" && p.status === "scheduled");

      expect(ultra).toBeDefined();
      expect(ultra!.canceled).toBe(true);
      expect(scheduledFree).toBeDefined();

      // Advance clock past period end — wait for real subscription.deleted
      const sub = await getSubscription();
      expect(sub).toBeDefined();
      const periodEnd = new Date(sub!.currentPeriodEndAt as unknown as string);
      const advanceTo = new Date(periodEnd.getTime() + 86_400_000);
      await advanceTestClock(t.stripeClient, t.testClockId, advanceTo.toISOString().split("T")[0]!);

      // Poll DB until Free is active (real webhooks handle the transition)
      let activeFree: Awaited<ReturnType<typeof getCustomerProducts>>[0] | undefined;
      let canceledUltra: Awaited<ReturnType<typeof getCustomerProducts>>[0] | undefined;
      for (let i = 0; i < 60; i++) {
        const products = await getCustomerProducts();
        canceledUltra = products.find(
          (p) => p.plan_id === "ultra" && (p.status === "canceled" || p.status === "ended"),
        );
        activeFree = products.find((p) => p.plan_id === "free" && p.status === "active");
        if (canceledUltra && activeFree) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      expect(canceledUltra).toBeDefined();
      expect(activeFree).toBeDefined();
      expect(activeFree!.current_period_end_at).toBeNull();
    });

    // ─── Step 7: Upgrade Free → Pro (checkout again) ───
    // After full subscription cancellation, Stripe clears the customer's
    // default payment method. Clear it in PayKit's DB too so it correctly
    // routes through checkout instead of trying direct subscription creation.
    // TODO: PayKit should handle this automatically on subscription.deleted.
    await t.database.delete(paymentMethod).where(eq(paymentMethod.customerId, customerId));

    await step("upgrade free → pro", async () => {
      const beforeCheckout = new Date();

      const result = await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      // After full cancellation, Stripe clears the payment method.
      // Customer must go through checkout again.
      expect(result.paymentUrl).not.toBeNull();
      console.log("\n\n  ▶ Complete checkout at:\n  " + result.paymentUrl + "\n");
      await waitForWebhook(t.database, "checkout.completed", {
        after: beforeCheckout,
        timeout: 120_000,
      });

      const products = await getCustomerProducts();
      const activePro = products.find((p) => p.plan_id === "pro" && p.status === "active");

      expect(activePro).toBeDefined();
      expect(activePro!.current_period_end_at).not.toBeNull();
    });

    // ─── Step 8: Renewal ───
    await step("renewal", async () => {
      const sub = await getSubscription();
      expect(sub).toBeDefined();

      const periodEnd = new Date(sub!.currentPeriodEndAt as unknown as string);

      // Advance clock past period end — Stripe renews the subscription
      // and fires webhooks through stripe listen
      const advanceTo = new Date(periodEnd.getTime() + 86_400_000);
      await advanceTestClock(t.stripeClient, t.testClockId, advanceTo.toISOString().split("T")[0]!);

      // Poll DB until period dates roll forward (real webhooks update them)
      let newPeriodEnd = periodEnd;
      for (let i = 0; i < 30; i++) {
        const updatedSub = await getSubscription();
        if (updatedSub) {
          const end = new Date(updatedSub.currentPeriodEndAt as unknown as string);
          if (end.getTime() > periodEnd.getTime()) {
            newPeriodEnd = end;
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      expect(newPeriodEnd.getTime()).toBeGreaterThan(periodEnd.getTime());
    });
  });
});
