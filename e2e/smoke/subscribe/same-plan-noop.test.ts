import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoice, product, subscription } from "../../../packages/paykit/src/database/schema";
import {
  createTestCustomerWithPM,
  createTestPayKit,
  dumpStateOnFailure,
  type TestPayKit,
  waitForWebhook,
} from "../setup";

describe("same-plan-noop: pro → pro", () => {
  let t: TestPayKit;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestPayKit();
    const customer = await createTestCustomerWithPM(t, {
      id: "test_noop",
      email: "noop@test.com",
      name: "Noop Test",
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

  it("subscribing to the current plan with no pending changes is a noop", async () => {
    try {
      // Snapshot current state
      const beforeRows = await t.database
        .select({ id: subscription.id, updatedAt: subscription.updatedAt })
        .from(subscription)
        .innerJoin(product, eq(product.internalId, subscription.productInternalId))
        .where(
          and(
            eq(subscription.customerId, customerId),
            eq(product.id, "pro"),
            eq(subscription.status, "active"),
          ),
        );
      const beforeRow = beforeRows[0];
      expect(beforeRow).toBeDefined();

      const invoicesBeforeRows = await t.database
        .select({ count: count() })
        .from(invoice)
        .where(eq(invoice.customerId, customerId));
      const invoiceCountBefore = invoicesBeforeRows[0]?.count ?? 0;

      // Action: subscribe to same plan
      await t.paykit.subscribe({
        customerId,
        planId: "pro",
        successUrl: "https://example.com/success",
      });

      // Same product ID (no new row created)
      const afterRows = await t.database
        .select({ id: subscription.id, updatedAt: subscription.updatedAt })
        .from(subscription)
        .innerJoin(product, eq(product.internalId, subscription.productInternalId))
        .where(
          and(
            eq(subscription.customerId, customerId),
            eq(product.id, "pro"),
            eq(subscription.status, "active"),
          ),
        );
      const afterRow = afterRows[0];
      expect(afterRow!.id).toBe(beforeRow!.id);

      // No new invoices
      const invoicesAfterRows = await t.database
        .select({ count: count() })
        .from(invoice)
        .where(eq(invoice.customerId, customerId));
      const invoiceCountAfter = invoicesAfterRows[0]?.count ?? 0;
      expect(invoiceCountAfter).toBe(invoiceCountBefore);
    } catch (error) {
      await dumpStateOnFailure(t.database, t.dbPath);
      throw error;
    }
  });
});
