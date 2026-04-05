import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import { stripe } from "@paykitjs/stripe";
import { config } from "dotenv";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { createPayKit, feature, plan } from "paykitjs";
import { Pool } from "pg";
import { default as Stripe } from "stripe";

import type { PayKitContext } from "../../packages/paykit/src/core/context";
import type { PayKitDatabase } from "../../packages/paykit/src/database/index";
import { migrateDatabase } from "../../packages/paykit/src/database/index";
import {
  customer,
  invoice,
  product,
  subscription,
  webhookEvent,
} from "../../packages/paykit/src/database/schema";
import { syncPaymentMethodByProviderCustomer } from "../../packages/paykit/src/payment-method/payment-method.service";
import { syncProducts } from "../../packages/paykit/src/product/product-sync.service";

config({ path: path.resolve(import.meta.dirname, "../../.env") });
config({ path: path.resolve(import.meta.dirname, "../../.env.local"), override: true });

const WEBHOOK_PORT = 4567;

const messagesFeature = feature({ id: "messages", type: "metered" });
const dashboardFeature = feature({ id: "dashboard", type: "boolean" });
const adminFeature = feature({ id: "admin", type: "boolean" });

export const freePlan = plan({
  default: true,
  group: "base",
  id: "free",
  name: "Free",
  includes: [messagesFeature({ limit: 100, reset: "month" })],
});

export const proPlan = plan({
  group: "base",
  id: "pro",
  name: "Pro",
  includes: [messagesFeature({ limit: 500, reset: "month" }), dashboardFeature()],
  price: { amount: 20, interval: "month" },
});

export const premiumPlan = plan({
  group: "base",
  id: "premium",
  name: "Premium",
  includes: [messagesFeature({ limit: 1_000, reset: "month" }), dashboardFeature(), adminFeature()],
  price: { amount: 50, interval: "month" },
});

export const ultraPlan = plan({
  group: "base",
  id: "ultra",
  name: "Ultra",
  includes: [
    messagesFeature({ limit: 10_000, reset: "month" }),
    dashboardFeature(),
    adminFeature(),
  ],
  price: { amount: 200, interval: "month" },
});

export interface TestPayKit {
  paykit: ReturnType<typeof createPayKit>;
  database: PayKitDatabase;
  ctx: PayKitContext;
  stripeClient: Stripe;
  testClockId: string;
  dbPath: string;
  server: Server;
  cleanup: () => Promise<void>;
}

// createTestPayKit

export async function createTestPayKit(): Promise<TestPayKit> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    throw new Error("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set");
  }

  const stripeClient = new Stripe(secretKey);

  // 1. Create a fresh test database
  const dbName = `paykit_smoke_${String(Date.now())}`;
  const adminPool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/postgres",
  });
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  await adminPool.end();

  const dbUrl = (process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/postgres").replace(
    /\/[^/]*$/,
    `/${dbName}`,
  );
  const pool = new Pool({ connectionString: dbUrl });

  // 2. Run migrations
  await migrateDatabase(pool);

  // 3. Create test clock
  const clock = await stripeClient.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: `smoke-${String(Date.now())}`,
  });

  // 4. Create PayKit instance with real Stripe
  const stripeProvider = stripe({ secretKey, webhookSecret });
  const paykit = createPayKit({
    database: pool,
    plans: { free: freePlan, pro: proPlan, premium: premiumPlan, ultra: ultraPlan },
    provider: stripeProvider,
  });

  const ctx = await paykit.$context;

  // Override upsertCustomer to attach test clock
  ctx.stripe.upsertCustomer = async (data) => {
    const customer = await stripeClient.customers.create({
      email: data.email,
      metadata: { customerId: data.id, ...data.metadata },
      name: data.name,
      test_clock: clock.id,
    });
    return { providerCustomerId: customer.id };
  };

  // Override createSubscription to use allow_incomplete. The default
  // payment_behavior: "default_incomplete" requires client-side payment
  // confirmation which isn't possible in automated tests.
  ctx.stripe.createSubscription = async (data) => {
    const sub = await stripeClient.subscriptions.create({
      customer: data.providerCustomerId,
      items: [{ price: data.providerPriceId }],
      payment_behavior: "allow_incomplete",
      expand: ["latest_invoice"],
    });

    const firstItem = sub.items.data[0];
    const periodStart = firstItem?.current_period_start ?? null;
    const periodEnd = firstItem?.current_period_end ?? null;
    const latestInvoice = sub.latest_invoice;
    const invoice =
      latestInvoice && typeof latestInvoice !== "string"
        ? {
            currency: latestInvoice.currency,
            hostedUrl: latestInvoice.hosted_invoice_url ?? null,
            periodEndAt: latestInvoice.period_end
              ? new Date(latestInvoice.period_end * 1000)
              : null,
            periodStartAt: latestInvoice.period_start
              ? new Date(latestInvoice.period_start * 1000)
              : null,
            providerInvoiceId: latestInvoice.id,
            status: latestInvoice.status,
            totalAmount: latestInvoice.total,
          }
        : null;

    return {
      invoice,
      paymentUrl: null,
      subscription: {
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at != null ? new Date(sub.canceled_at * 1000) : null,
        currentPeriodEndAt: periodEnd != null ? new Date(periodEnd * 1000) : null,
        currentPeriodStartAt: periodStart != null ? new Date(periodStart * 1000) : null,
        endedAt: sub.ended_at != null ? new Date(sub.ended_at * 1000) : null,
        providerSubscriptionId: sub.id,
        providerSubscriptionScheduleId: null,
        status: sub.status,
      },
    };
  };

  // 5. Start webhook server BEFORE syncing products — product sync
  // creates Stripe products which fires webhooks immediately
  const server = startWebhookServer(paykit);

  // 6. Sync products to Stripe
  await syncProducts(ctx);

  return {
    paykit,
    database: ctx.database,
    ctx,
    stripeClient,
    testClockId: clock.id,
    dbPath: dbUrl,
    server,
    cleanup: async () => {
      // Delete test clock first — Stripe fires cleanup webhooks
      await stripeClient.testHelpers.testClocks.del(clock.id).catch(() => {});
      // Wait for cleanup webhooks to arrive and be processed
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      server.close();
      await pool.end();
      // Drop the test database
      const cleanupPool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://localhost:5432/postgres",
      });
      await cleanupPool.query(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {});
      await cleanupPool.end();
    },
  };
}

/**
 * Creates a PayKit customer and subscribes to Free (triggers Stripe customer
 * creation on the test clock). No payment method attached — first paid
 * subscribe will go through checkout.
 */
export async function createTestCustomer(
  t: TestPayKit,
  input: { id: string; email: string; name: string },
): Promise<{ customerId: string; providerCustomerId: string }> {
  // Create customer in PayKit DB
  await t.paykit.upsertCustomer(input);

  // Subscribe to free plan — this triggers Stripe customer creation via
  // our test clock override and assigns the default free plan
  await t.paykit.subscribe({
    customerId: input.id,
    planId: "free",
    successUrl: "https://example.com/success",
  });

  // Now the provider customer ID is stored in the customer's provider JSONB column
  const row = await t.database.query.customer.findFirst({
    where: eq(customer.id, input.id),
  });
  const providerMap = (row?.provider ?? {}) as Record<string, { id: string }>;
  const providerCustomerId = providerMap.stripe?.id;

  if (!providerCustomerId) {
    throw new Error(`No Stripe provider customer ID found for customer "${input.id}"`);
  }

  return { customerId: input.id, providerCustomerId };
}

/**
 * Creates a PayKit customer with a pre-attached payment method.
 * Subscribe calls will go through the direct path (no checkout).
 */
export async function createTestCustomerWithPM(
  t: TestPayKit,
  input: { id: string; email: string; name: string },
): Promise<{ customerId: string; providerCustomerId: string }> {
  const { customerId, providerCustomerId } = await createTestCustomer(t, input);

  // Attach test payment method to Stripe customer
  const pm = await t.stripeClient.paymentMethods.attach("pm_card_visa", {
    customer: providerCustomerId,
  });
  await t.stripeClient.customers.update(providerCustomerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  // Sync payment method into PayKit DB
  await syncPaymentMethodByProviderCustomer(t.ctx.database, {
    paymentMethod: {
      providerMethodId: pm.id,
      type: pm.type,
      last4: pm.card?.last4,
      expiryMonth: pm.card?.exp_month,
      expiryYear: pm.card?.exp_year,
      isDefault: true,
    },
    providerCustomerId,
    providerId: t.ctx.provider.id,
  });

  return { customerId, providerCustomerId };
}

export async function expectProduct(
  database: PayKitDatabase,
  customerId: string,
  planId: string,
  expected: {
    status: "active" | "canceled" | "ended" | "scheduled";
    canceled?: boolean;
    hasPeriodEnd?: boolean;
  },
): Promise<void> {
  const rows = await database
    .select({
      status: subscription.status,
      canceled: subscription.canceled,
      currentPeriodEndAt: subscription.currentPeriodEndAt,
    })
    .from(subscription)
    .innerJoin(product, eq(product.internalId, subscription.productInternalId))
    .where(
      and(
        eq(subscription.customerId, customerId),
        eq(product.id, planId),
        eq(subscription.status, expected.status),
      ),
    )
    .orderBy(desc(subscription.createdAt))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new Error(
      `Expected product "${planId}" with status "${expected.status}" for customer "${customerId}", but not found`,
    );
  }

  if (expected.canceled !== undefined && row.canceled !== expected.canceled) {
    throw new Error(
      `Expected product "${planId}" canceled=${String(expected.canceled)}, got ${String(row.canceled)}`,
    );
  }

  if (expected.hasPeriodEnd === true && row.currentPeriodEndAt == null) {
    throw new Error(`Expected product "${planId}" to have period end, but it's null`);
  }

  if (expected.hasPeriodEnd === false && row.currentPeriodEndAt != null) {
    throw new Error(
      `Expected product "${planId}" to have no period end, but got ${String(row.currentPeriodEndAt)}`,
    );
  }
}

export async function expectProductNotPresent(
  database: PayKitDatabase,
  customerId: string,
  planId: string,
): Promise<void> {
  const rows = await database
    .select({ status: subscription.status })
    .from(subscription)
    .innerJoin(product, eq(product.internalId, subscription.productInternalId))
    .where(
      and(
        eq(subscription.customerId, customerId),
        eq(product.id, planId),
        sql`${subscription.status} NOT IN ('ended', 'canceled')`,
      ),
    )
    .orderBy(desc(subscription.createdAt))
    .limit(1);
  if (rows.length > 0) {
    const row = rows[0]!;
    throw new Error(
      `Expected product "${planId}" not present, but found with status "${row.status}"`,
    );
  }
}

export async function expectInvoiceCount(
  database: PayKitDatabase,
  customerId: string,
  expected: number,
): Promise<void> {
  const result = await database
    .select({ count: count() })
    .from(invoice)
    .where(eq(invoice.customerId, customerId));
  const actual = result[0]?.count ?? 0;
  if (actual < expected) {
    throw new Error(`Expected at least ${String(expected)} invoices, got ${String(actual)}`);
  }
}

export async function expectSubscription(
  database: PayKitDatabase,
  customerId: string,
  expected: { status?: string; cancelAtPeriodEnd?: boolean },
): Promise<void> {
  const rows = await database
    .select({
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.customerId, customerId))
    .orderBy(desc(subscription.updatedAt))
    .limit(1);
  const row = rows[0];

  if (!row) {
    throw new Error(`No subscription found for customer "${customerId}"`);
  }

  if (expected.status !== undefined && row.status !== expected.status) {
    throw new Error(`Expected subscription status "${expected.status}", got "${row.status}"`);
  }

  if (
    expected.cancelAtPeriodEnd !== undefined &&
    row.cancelAtPeriodEnd !== expected.cancelAtPeriodEnd
  ) {
    throw new Error(
      `Expected cancel_at_period_end=${String(expected.cancelAtPeriodEnd)}, got ${String(row.cancelAtPeriodEnd)}`,
    );
  }
}

/**
 * Fakes a checkout completion. After paykit.subscribe() returns a paymentUrl
 * (checkout session), this:
 * 1. Retrieves the checkout session from Stripe
 * 2. Attaches a test payment method and creates a real subscription
 * 3. Feeds a crafted checkout.completed event to PayKit's webhook handler
 */
export async function fakeCheckoutCompletion(
  t: TestPayKit,
  paymentUrl: string,
  providerCustomerId: string,
): Promise<void> {
  // Extract checkout session ID from the URL
  const url = new URL(paymentUrl);
  const pathParts = url.pathname.split("/");
  const sessionId = pathParts[pathParts.length - 1] ?? "";

  // Retrieve the session to get metadata
  const session = await t.stripeClient.checkout.sessions.retrieve(sessionId);
  const metadata = session.metadata ?? {};

  // Attach test payment method
  const pm = await t.stripeClient.paymentMethods.attach("pm_card_visa", {
    customer: providerCustomerId,
  });
  await t.stripeClient.customers.update(providerCustomerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  // Sync payment method into PayKit DB
  await syncPaymentMethodByProviderCustomer(t.ctx.database, {
    paymentMethod: {
      providerMethodId: pm.id,
      type: pm.type,
      last4: pm.card?.last4,
      expiryMonth: pm.card?.exp_month,
      expiryYear: pm.card?.exp_year,
      isDefault: true,
    },
    providerCustomerId,
    providerId: t.ctx.provider.id,
  });

  // Get the price from the session line items
  const lineItems = await t.stripeClient.checkout.sessions.listLineItems(sessionId);
  const stripePriceId = lineItems.data[0]?.price?.id;
  if (!stripePriceId) {
    throw new Error("No price found on checkout session");
  }

  // Create real subscription via Stripe API
  const sub = await t.stripeClient.subscriptions.create({
    customer: providerCustomerId,
    items: [{ price: stripePriceId }],
    metadata,
    expand: ["latest_invoice"],
  });

  const firstItem = sub.items.data[0];
  const periodStart = firstItem?.current_period_start ?? null;
  const periodEnd = firstItem?.current_period_end ?? null;

  const latestInvoice = sub.latest_invoice;
  const normalizedInvoice =
    latestInvoice && typeof latestInvoice !== "string"
      ? {
          currency: latestInvoice.currency,
          hostedUrl: latestInvoice.hosted_invoice_url ?? null,
          periodEndAt: latestInvoice.period_end ? new Date(latestInvoice.period_end * 1000) : null,
          periodStartAt: latestInvoice.period_start
            ? new Date(latestInvoice.period_start * 1000)
            : null,
          providerInvoiceId: latestInvoice.id,
          status: latestInvoice.status,
          totalAmount: latestInvoice.total,
        }
      : undefined;

  const normalizedSub = {
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at != null ? new Date(sub.canceled_at * 1000) : null,
    currentPeriodEndAt: periodEnd != null ? new Date(periodEnd * 1000) : null,
    currentPeriodStartAt: periodStart != null ? new Date(periodStart * 1000) : null,
    endedAt: sub.ended_at != null ? new Date(sub.ended_at * 1000) : null,
    providerSubscriptionId: sub.id,
    providerSubscriptionScheduleId: null,
    status: sub.status,
  };

  // Expire the original checkout session since we bypassed it
  await t.stripeClient.checkout.sessions.expire(sessionId).catch(() => {});

  // Override handleWebhook to return our crafted checkout.completed event.
  // Use a sentinel in the body to identify our fake request vs real webhooks.
  const fakeId = `fake_${String(Date.now())}`;
  const originalHandleWebhook = t.ctx.stripe.handleWebhook.bind(t.ctx.stripe);
  t.ctx.stripe.handleWebhook = async (data) => {
    // Only intercept our fake request, let real webhooks pass through
    if (!data.body.includes(fakeId)) {
      return originalHandleWebhook(data);
    }
    // Restore after consuming
    t.ctx.stripe.handleWebhook = originalHandleWebhook;

    return [
      {
        name: "checkout.completed" as const,
        payload: {
          checkoutSessionId: session.id,
          invoice: normalizedInvoice,
          metadata,
          mode: "subscription" as const,
          paymentStatus: "paid",
          providerCustomerId,
          providerEventId: `evt_fake_checkout_${String(Date.now())}`,
          providerSubscriptionId: sub.id,
          status: "complete",
          subscription: normalizedSub,
        },
      },
    ];
  };

  // Send a fake webhook request with sentinel so the override can identify it
  const response = await fetch(
    `http://localhost:${String(WEBHOOK_PORT)}/paykit/api/webhook/stripe`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "checkout.session.completed", id: fakeId }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    // Restore handler if our request failed
    t.ctx.stripe.handleWebhook = originalHandleWebhook;
    throw new Error(`Fake checkout webhook failed (${String(response.status)}): ${text}`);
  }
}

function startWebhookServer(paykit: ReturnType<typeof createPayKit>): Server {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks).toString();

    const url = new URL(req.url ?? "/", `http://localhost:${String(WEBHOOK_PORT)}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }

    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
    });

    try {
      const response = await paykit.handler(request);
      res.writeHead(response.status);
      res.end(await response.text());
    } catch (error) {
      res.writeHead(500);
      res.end(error instanceof Error ? error.message : "Internal error");
    }
  });

  server.listen(WEBHOOK_PORT);
  return server;
}

export async function advanceTestClock(
  stripeClient: Stripe,
  testClockId: string,
  toDate: string,
): Promise<void> {
  const frozenTime = Math.floor(new Date(toDate).getTime() / 1000);
  await stripeClient.testHelpers.testClocks.advance(testClockId, {
    frozen_time: frozenTime,
  });

  // Poll until clock is ready
  for (let i = 0; i < 60; i++) {
    const clock = await stripeClient.testHelpers.testClocks.retrieve(testClockId);
    if (clock.status === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Test clock ${testClockId} did not reach 'ready' status`);
}

export async function waitForWebhook(
  database: PayKitDatabase,
  eventType: string,
  options?: { timeout?: number; after?: Date },
): Promise<Record<string, unknown>> {
  const timeout = options?.timeout ?? 15_000;
  const after = options?.after ?? new Date(0);
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const row = await database.query.webhookEvent.findFirst({
      where: and(
        eq(webhookEvent.type, eventType),
        inArray(webhookEvent.status, ["processed", "failed"]),
        gt(webhookEvent.receivedAt, after),
      ),
      orderBy: (we, { desc: d }) => [d(we.receivedAt)],
    });

    if (row) {
      if (row.status === "failed") {
        throw new Error(`Webhook ${eventType} failed: ${String(row.error)}`);
      }
      return row as unknown as Record<string, unknown>;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for webhook: ${eventType}`);
}

/**
 * Manually fires a subscription.updated event for a renewal.
 * Retrieves the current subscription from Stripe and normalizes it.
 */
export async function fakeSubscriptionUpdatedEvent(
  t: TestPayKit,
  providerSubscriptionId: string,
  providerCustomerId: string,
): Promise<void> {
  const sub = await t.stripeClient.subscriptions.retrieve(providerSubscriptionId);
  const firstItem = sub.items.data[0];
  const periodStart = firstItem?.current_period_start ?? null;
  const periodEnd = firstItem?.current_period_end ?? null;

  const providerPriceId = firstItem?.price?.id ?? null;

  const normalizedSub = {
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at != null ? new Date(sub.canceled_at * 1000) : null,
    currentPeriodEndAt: periodEnd != null ? new Date(periodEnd * 1000) : null,
    currentPeriodStartAt: periodStart != null ? new Date(periodStart * 1000) : null,
    endedAt: sub.ended_at != null ? new Date(sub.ended_at * 1000) : null,
    providerPriceId,
    providerSubscriptionId: sub.id,
    providerSubscriptionScheduleId: null,
    status: sub.status,
  };

  const fakeId = `fake_renewed_${String(Date.now())}`;
  const originalHandleWebhook = t.ctx.stripe.handleWebhook.bind(t.ctx.stripe);
  t.ctx.stripe.handleWebhook = async (data) => {
    if (!data.body.includes(fakeId)) {
      return originalHandleWebhook(data);
    }
    t.ctx.stripe.handleWebhook = originalHandleWebhook;
    return [
      {
        name: "subscription.updated" as const,
        actions: [
          {
            type: "subscription.upsert" as const,
            data: { providerCustomerId, subscription: normalizedSub },
          },
        ],
        payload: {
          providerCustomerId,
          providerEventId: `evt_${fakeId}`,
          subscription: normalizedSub,
        },
      },
    ];
  };

  const response = await fetch(
    `http://localhost:${String(WEBHOOK_PORT)}/paykit/api/webhook/stripe`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "customer.subscription.updated", id: fakeId }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Fake subscription.updated webhook failed (${String(response.status)}): ${text}`,
    );
  }
}

/**
 * Manually fires a subscription.deleted event to PayKit's webhook handler.
 * Needed because stripe listen doesn't reliably forward test clock lifecycle events.
 */
export async function fakeSubscriptionDeletedEvent(
  t: TestPayKit,
  providerSubscriptionId: string,
  providerCustomerId: string,
): Promise<void> {
  const fakeId = `fake_deleted_${String(Date.now())}`;
  const originalHandleWebhook = t.ctx.stripe.handleWebhook.bind(t.ctx.stripe);
  t.ctx.stripe.handleWebhook = async (data) => {
    if (!data.body.includes(fakeId)) {
      return originalHandleWebhook(data);
    }
    t.ctx.stripe.handleWebhook = originalHandleWebhook;
    return [
      {
        name: "subscription.deleted" as const,
        actions: [
          {
            type: "subscription.delete" as const,
            data: { providerCustomerId, providerSubscriptionId },
          },
        ],
        payload: {
          providerCustomerId,
          providerEventId: `evt_${fakeId}`,
          providerSubscriptionId,
        },
      },
    ];
  };

  const response = await fetch(
    `http://localhost:${String(WEBHOOK_PORT)}/paykit/api/webhook/stripe`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "customer.subscription.deleted", id: fakeId }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Fake subscription.deleted webhook failed (${String(response.status)}): ${text}`,
    );
  }
}

export async function dumpStateOnFailure(database: PayKitDatabase, dbPath: string): Promise<void> {
  console.error("\n=== SMOKE TEST FAILURE — DB STATE DUMP ===");
  console.error(`Database path: ${dbPath}\n`);

  try {
    const customers = await database
      .select({ id: customer.id, email: customer.email, name: customer.name })
      .from(customer);
    console.error("\n--- paykit_customer ---");
    if (customers.length === 0) {
      console.error("  (empty)");
    } else {
      for (const row of customers) {
        console.error(JSON.stringify(row, null, 2));
      }
    }
  } catch {
    console.error("\n--- paykit_customer --- (query failed)");
  }

  try {
    const subscriptions = await database
      .select({
        id: subscription.id,
        customerId: subscription.customerId,
        status: subscription.status,
        canceled: subscription.canceled,
        startedAt: subscription.startedAt,
        endedAt: subscription.endedAt,
        currentPeriodStartAt: subscription.currentPeriodStartAt,
        currentPeriodEndAt: subscription.currentPeriodEndAt,
        scheduledProductId: subscription.scheduledProductId,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canceledAt: subscription.canceledAt,
        providerData: subscription.providerData,
      })
      .from(subscription)
      .orderBy(desc(subscription.updatedAt));
    console.error("\n--- paykit_subscription ---");
    if (subscriptions.length === 0) {
      console.error("  (empty)");
    } else {
      for (const row of subscriptions) {
        console.error(JSON.stringify(row, null, 2));
      }
    }
  } catch {
    console.error("\n--- paykit_subscription --- (query failed)");
  }

  try {
    const events = await database
      .select({
        type: webhookEvent.type,
        status: webhookEvent.status,
        error: webhookEvent.error,
        traceId: webhookEvent.traceId,
        receivedAt: webhookEvent.receivedAt,
      })
      .from(webhookEvent)
      .orderBy(desc(webhookEvent.receivedAt))
      .limit(10);
    console.error("\n--- paykit_webhook_event ---");
    if (events.length === 0) {
      console.error("  (empty)");
    } else {
      for (const row of events) {
        console.error(JSON.stringify(row, null, 2));
      }
    }
  } catch {
    console.error("\n--- paykit_webhook_event --- (query failed)");
  }

  console.error("\n=== END DUMP ===\n");
}
