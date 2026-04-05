import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { subscription } from "../../../packages/paykit/src/database/schema";
import {
  advanceTestClock,
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("renewal: pro subscription renews after 1 month", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_renewal",
      email: "renewal@test.com",
      name: "Renewal Test",
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

  it("advancing clock 1 month rolls period dates forward", async () => {
    try {
      // Record current period end
      const subRows = await t.database
        .select({ currentPeriodEndAt: subscription.currentPeriodEndAt })
        .from(subscription)
        .where(eq(subscription.customerId, customerId))
        .orderBy(desc(subscription.updatedAt))
        .limit(1);
      const periodEnd = new Date(subRows[0]!.currentPeriodEndAt as unknown as string);

      // Advance clock 1 day past period end
      const advanceTo = new Date(periodEnd.getTime() + 86_400_000);
      await advanceTestClock(t.stripeClient, t.testClockId, advanceTo.toISOString().split("T")[0]!);

      // Poll until period dates change (real subscription.updated webhook)
      let newPeriodEnd = periodEnd;
      for (let i = 0; i < 60; i++) {
        const rows = await t.database
          .select({ currentPeriodEndAt: subscription.currentPeriodEndAt })
          .from(subscription)
          .where(and(eq(subscription.customerId, customerId), eq(subscription.status, "active")))
          .orderBy(desc(subscription.updatedAt))
          .limit(1);
        const row = rows[0];
        if (row?.currentPeriodEndAt) {
          const end = new Date(row.currentPeriodEndAt as unknown as string);
          if (end.getTime() > periodEnd.getTime()) {
            newPeriodEnd = end;
            break;
          }
        }
        if (i === 59) throw new Error("Period dates never rolled forward after clock advance");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Period end moved forward
      expect(newPeriodEnd.getTime()).toBeGreaterThan(periodEnd.getTime());

      // Pro is still active
      await expectProduct(t.database, customerId, "pro", { status: "active" });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
