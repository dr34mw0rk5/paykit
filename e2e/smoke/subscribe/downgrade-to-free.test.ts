import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  expectSubscription,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("downgrade-to-free: pro → free", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_downgrade_free",
      email: "downgrade-free@test.com",
      name: "Downgrade to Free Test",
    });
    customerId = customer.customerId;

    // Setup: subscribe to Pro
    const b1 = new Date();
    await t.paykit.subscribe({
      customerId,
      planId: "pro",
      successUrl: "https://example.com/success",
    });
    await waitForWebhook(t.database, "subscription.updated", { after: b1 });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("downgrading to free schedules cancellation at period end", async () => {
    try {
      const beforeDowngrade = new Date();

      await t.paykit.subscribe({
        customerId,
        planId: "free",
        successUrl: "https://example.com/success",
      });

      await waitForWebhook(t.database, "subscription.updated", { after: beforeDowngrade });

      // Pro is still active but canceled
      await expectProduct(t.database, customerId, "pro", {
        status: "active",
        canceled: true,
      });

      // Free is scheduled
      await expectProduct(t.database, customerId, "free", { status: "scheduled" });

      // Subscription is set to cancel at period end
      await expectSubscription(t.database, customerId, { cancelAtPeriodEnd: true });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
