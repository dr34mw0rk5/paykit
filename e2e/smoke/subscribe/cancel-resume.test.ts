import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  expectProductNotPresent,
  expectSubscription,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("cancel-resume: pro → free → pro (resume)", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_resume",
      email: "resume@test.com",
      name: "Cancel Resume Test",
    });
    customerId = customer.customerId;

    // Setup: subscribe to Pro, then schedule downgrade to Free
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
      planId: "free",
      successUrl: "https://example.com/success",
    });
    await waitForWebhook(t.database, "subscription.updated", { after: b2 });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("re-subscribing to the current plan cancels the scheduled downgrade", async () => {
    try {
      // Verify precondition: Pro is canceling, Free is scheduled
      await expectProduct(t.database, customerId, "pro", {
        status: "active",
        canceled: true,
      });
      await expectProduct(t.database, customerId, "free", { status: "scheduled" });

      // Action: resume Pro
      const beforeResume = new Date();
      await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      // Wait for resume webhook
      await waitForWebhook(t.database, "subscription.updated", { after: beforeResume });

      // Pro is active and no longer canceled
      await expectProduct(t.database, customerId, "pro", {
        status: "active",
        canceled: false,
      });

      // Scheduled Free is deleted
      await expectProductNotPresent(t.database, customerId, "free");

      // Subscription no longer set to cancel
      await expectSubscription(t.database, customerId, { cancelAtPeriodEnd: false });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
