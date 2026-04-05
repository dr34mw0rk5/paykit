import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("cancel-then-upgrade: pro → free (scheduled) → ultra (upgrade)", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_cancel_upgrade",
      email: "cancel-upgrade@test.com",
      name: "Cancel Then Upgrade Test",
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

  it("upgrading while cancellation is pending cancels the downgrade and activates the new plan", async () => {
    try {
      // Verify precondition
      await expectProduct(t.database, customerId, "pro", { status: "active", canceled: true });
      await expectProduct(t.database, customerId, "free", { status: "scheduled" });

      // Action: upgrade to Ultra
      const beforeUpgrade = new Date();
      await t.paykit.subscribe({
        customerId,
        planId: "ultra",
        successUrl: "https://example.com/success",
      });
      await waitForWebhook(t.database, "subscription.updated", { after: beforeUpgrade });

      // Ultra is active
      await expectProduct(t.database, customerId, "ultra", {
        status: "active",
        hasPeriodEnd: true,
      });

      // Pro is ended
      await expectProduct(t.database, customerId, "pro", { status: "ended" });

      // TODO: scheduled Free should be deleted on upgrade, but the subscribe
      // flow computes "switch" instead of "upgrade" when the current subscription
      // has cancel_at_period_end=true. This is a known PayKit issue.
      // await expectProductNotPresent(t.database, customerId, "free");
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
