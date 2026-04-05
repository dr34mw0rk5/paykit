import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("downgrade-scheduled: ultra → pro", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_downgrade",
      email: "downgrade@test.com",
      name: "Downgrade Test",
    });
    customerId = customer.customerId;

    // Setup: subscribe to Pro then upgrade to Ultra
    const b1 = new Date();
    await t.paykit.subscribe({
      customerId,
      planId: "pro",
      successUrl: "https://example.com/success",
    });
    await waitForWebhook(t.database, "subscription.updated", { after: b1 });

    const b2 = new Date();
    await t.paykit.subscribe({
      customerId,
      planId: "ultra",
      successUrl: "https://example.com/success",
    });
    await waitForWebhook(t.database, "subscription.updated", { after: b2 });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("downgrading to a lower tier schedules the change at period end", async () => {
    try {
      const beforeDowngrade = new Date();

      await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      await waitForWebhook(t.database, "subscription.updated", { after: beforeDowngrade });

      // Ultra is still active but marked as canceled
      await expectProduct(t.database, customerId, "ultra", {
        status: "active",
        canceled: true,
      });

      // Pro is scheduled for activation at period end
      await expectProduct(t.database, customerId, "pro", { status: "scheduled" });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
