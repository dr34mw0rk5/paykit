import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectInvoiceCount,
  expectProduct,
  expectSubscription,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("subscribe-paid: free → pro", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_sub_paid",
      email: "sub-paid@test.com",
      name: "Subscribe Paid Test",
    });
    customerId = customer.customerId;
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("subscribing to a paid plan from free creates an active subscription", async () => {
    try {
      const beforeSubscribe = new Date();

      const result = await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      // Direct path (has payment method, no checkout)
      if (result.paymentUrl != null) {
        throw new Error("Expected direct subscription, got checkout URL");
      }

      // Wait for Stripe webhook
      await waitForWebhook(t.database, "subscription.updated", { after: beforeSubscribe });

      // Pro is active with period dates
      await expectProduct(t.database, customerId, "pro", {
        status: "active",
        hasPeriodEnd: true,
      });

      // Free is ended
      await expectProduct(t.database, customerId, "free", { status: "ended" });

      // Subscription exists and is active
      await expectSubscription(t.database, customerId, { status: "active" });

      // At least 1 invoice
      await expectInvoiceCount(t.database, customerId, 1);
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
