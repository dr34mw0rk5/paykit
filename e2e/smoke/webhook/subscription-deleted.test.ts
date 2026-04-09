import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, it } from "vitest";

import { subscription } from "../../../packages/paykit/src/database/schema";
import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  expectSingleActivePlanInGroup,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("subscription-deleted: Stripe cancels subscription directly", () => {
  let t: TestPayKit;
  let customerId: string;
  let providerSubscriptionId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM({
      t,
      customer: {
        id: "test_sub_deleted",
        email: "sub-deleted@test.com",
        name: "Subscription Deleted Test",
      },
    });
    customerId = customer.customerId;

    // Setup: subscribe to Pro
    await t.paykit.subscribe({
      customerId,
      planId: "pro",
      successUrl: "https://example.com/success",
    });

    // Get provider subscription ID from provider_data JSONB
    const subRows = await t.database
      .select({ providerData: subscription.providerData })
      .from(subscription)
      .where(eq(subscription.customerId, customerId))
      .orderBy(desc(subscription.updatedAt))
      .limit(1);
    const providerData = subRows[0]?.providerData as { subscriptionId: string } | null;
    providerSubscriptionId = providerData!.subscriptionId;
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("when Stripe cancels a subscription directly, PayKit ends the product and activates free", async () => {
    try {
      const beforeCancel = new Date();

      // Cancel directly via Stripe API (simulates Stripe dashboard cancellation)
      await t.stripeClient.subscriptions.cancel(providerSubscriptionId);
      await waitForWebhook({
        after: beforeCancel,
        database: t.database,
        eventType: "subscription.deleted",
        timeout: 30_000,
      });

      // Pro should be canceled/ended
      await expectProduct({
        database: t.database,
        customerId,
        planId: "pro",
        expected: { canceled: true, status: "canceled" },
      });

      // Free should be active (default plan activated)
      await expectProduct({
        database: t.database,
        customerId,
        planId: "free",
        expected: {
          status: "active",
          hasPeriodEnd: false,
        },
      });
      await expectSingleActivePlanInGroup({
        database: t.database,
        customerId,
        group: "base",
        planId: "free",
      });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
