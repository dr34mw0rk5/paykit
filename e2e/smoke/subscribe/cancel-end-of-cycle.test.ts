import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, it } from "vitest";

import { product, subscription } from "../../../packages/paykit/src/database/schema";
import {
  advanceTestClock,
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  expectProduct,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("cancel-end-of-cycle: pro → free + clock advance", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_cancel_eoc",
      email: "cancel-eoc@test.com",
      name: "Cancel EOC Test",
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

  it("advancing past period end activates the free plan", async () => {
    try {
      // Get period end to advance past
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

      // Poll until Free is active (real subscription.deleted webhook)
      for (let i = 0; i < 60; i++) {
        const rows = await t.database
          .select({ status: subscription.status })
          .from(subscription)
          .innerJoin(product, eq(product.internalId, subscription.productInternalId))
          .where(
            and(
              eq(subscription.customerId, customerId),
              eq(product.id, "free"),
              eq(subscription.status, "active"),
            ),
          );
        if (rows.length > 0) break;
        if (i === 59) throw new Error("Free plan never activated after clock advance");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Pro is canceled/ended
      await expectProduct(t.database, customerId, "pro", { status: "canceled" });

      // Free is active with no period end (no billing cycle)
      await expectProduct(t.database, customerId, "free", {
        status: "active",
        hasPeriodEnd: false,
      });
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
