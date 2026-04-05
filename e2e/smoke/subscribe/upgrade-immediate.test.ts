import { afterAll, beforeAll, describe, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("upgrade-immediate: pro → ultra", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_upgrade",
      email: "upgrade@test.com",
      name: "Upgrade Test",
    });
    customerId = customer.customerId;

    // Setup: subscribe to Pro first
    const beforeSetup = new Date();
    await t.paykit.subscribe({
      customerId,
      planId: "pro",
      successUrl: "https://example.com/success",
    });
    await waitForWebhook(t.database, "subscription.updated", { after: beforeSetup });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("upgrading to a higher tier activates it immediately and ends the old plan", async () => {
    try {
      const beforeUpgrade = new Date();

      await t.paykit.subscribe({
        customerId,
        planId: "ultra",
        successUrl: "https://example.com/success",
      });

      await waitForWebhook(t.database, "subscription.updated", { after: beforeUpgrade });

      // Ultra is active with period dates
      await expectProduct(t.database, customerId, "ultra", {
        status: "active",
        hasPeriodEnd: true,
      });

      // Pro is ended
      await expectProduct(t.database, customerId, "pro", { status: "ended" });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
