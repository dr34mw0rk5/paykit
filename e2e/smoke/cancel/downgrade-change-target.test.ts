import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  expectProductNotPresent,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("downgrade-change-target: ultra → pro (scheduled) → free (change target)", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_change_target",
      email: "change-target@test.com",
      name: "Change Target Test",
    });
    customerId = customer.customerId;

    // Setup: subscribe Pro → upgrade Ultra
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

    // Schedule downgrade to Pro
    const b3 = new Date();
    await t.paykit.subscribe({
      customerId,
      planId: "pro",
      successUrl: "https://example.com/success",
    });
    await waitForWebhook(t.database, "subscription.updated", { after: b3 });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("changing the scheduled downgrade target replaces the old scheduled product", async () => {
    try {
      // Verify precondition: Ultra canceling, Pro scheduled
      await expectProduct(t.database, customerId, "ultra", { status: "active", canceled: true });
      await expectProduct(t.database, customerId, "pro", { status: "scheduled" });

      // Action: change downgrade target to Free instead
      const beforeChange = new Date();
      await t.paykit.subscribe({
        customerId,
        planId: "free",
        successUrl: "https://example.com/success",
      });
      await waitForWebhook(t.database, "subscription.updated", { after: beforeChange });

      // Ultra still canceling
      await expectProduct(t.database, customerId, "ultra", { status: "active", canceled: true });

      // Pro scheduled is gone, Free is now scheduled
      await expectProductNotPresent(t.database, customerId, "pro");
      await expectProduct(t.database, customerId, "free", { status: "scheduled" });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
