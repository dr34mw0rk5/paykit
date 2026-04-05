import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("check-boolean: boolean feature access", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_check_bool",
      email: "check-bool@test.com",
      name: "Check Boolean Test",
    });
    customerId = customer.customerId;
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("boolean feature is accessible on Pro but not on Free", async () => {
    try {
      // On Free — dashboard feature not included
      const freeCheck = await t.paykit.check({ customerId, featureId: "dashboard" });
      expect(freeCheck.allowed).toBe(false);

      // Subscribe to Pro (includes dashboard)
      const b1 = new Date();
      await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });
      await waitForWebhook(t.database, "subscription.updated", { after: b1 });

      // On Pro — dashboard accessible
      const proCheck = await t.paykit.check({ customerId, featureId: "dashboard" });
      expect(proCheck.allowed).toBe(true);
      expect(proCheck.balance?.unlimited).toBe(true);
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
