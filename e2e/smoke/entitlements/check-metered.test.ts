import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("check-metered: metered feature balance and usage reporting", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_check_metered",
      email: "check-metered@test.com",
      name: "Check Metered Test",
    });
    customerId = customer.customerId;

    // Subscribe to Pro (500 messages/month)
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

  it("check returns correct balance, report decrements it", async () => {
    try {
      // Check initial balance
      const initial = await t.paykit.check({ customerId, featureId: "messages" });
      expect(initial.allowed).toBe(true);
      expect(initial.balance).not.toBeNull();
      expect(initial.balance!.remaining).toBe(500);
      expect(initial.balance!.unlimited).toBe(false);

      // Report usage (consume 10)
      const report1 = await t.paykit.report({ customerId, featureId: "messages", amount: 10 });
      expect(report1.success).toBe(true);
      expect(report1.balance!.remaining).toBe(490);

      // Report more usage (consume 50)
      const report2 = await t.paykit.report({ customerId, featureId: "messages", amount: 50 });
      expect(report2.success).toBe(true);
      expect(report2.balance!.remaining).toBe(440);

      // Check reflects the usage
      const afterUsage = await t.paykit.check({ customerId, featureId: "messages" });
      expect(afterUsage.allowed).toBe(true);
      expect(afterUsage.balance!.remaining).toBe(440);

      // Try to consume more than remaining
      const overReport = await t.paykit.report({ customerId, featureId: "messages", amount: 500 });
      expect(overReport.success).toBe(false);

      // Balance unchanged after failed report
      const afterFailed = await t.paykit.check({ customerId, featureId: "messages" });
      expect(afterFailed.balance!.remaining).toBe(440);
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
