import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomer,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  expectSubscription,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("subscribe-paid-checkout: free → pro via checkout (manual)", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    // No payment method — will go through checkout
    const customer = await createTestCustomer(t, {
      id: "test_checkout",
      email: "checkout@test.com",
      name: "Checkout Test",
    });
    customerId = customer.customerId;
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("subscribing without a payment method returns a checkout URL, completing it activates the plan", async () => {
    try {
      const beforeCheckout = new Date();

      const result = await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      // Should return checkout URL (no payment method)
      if (!result.paymentUrl) {
        throw new Error("Expected checkout URL but got direct subscription");
      }

      console.log("\n\n  ▶ Complete checkout at:\n  " + result.paymentUrl + "\n");

      // Wait for checkout.completed webhook (manual completion required)
      await waitForWebhook(t.database, "checkout.completed", {
        after: beforeCheckout,
        timeout: 120_000,
      });

      // Pro is active
      await expectProduct(t.database, customerId, "pro", { status: "active", hasPeriodEnd: true });

      // Free is ended
      await expectProduct(t.database, customerId, "free", { status: "ended" });

      // Subscription exists
      await expectSubscription(t.database, customerId, { status: "active" });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
