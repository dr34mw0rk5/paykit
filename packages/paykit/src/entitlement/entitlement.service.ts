import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import type { PayKitDatabase } from "../database";
import { entitlement, productFeature, subscription } from "../database/schema";

export interface EntitlementBalance {
  limit: number;
  remaining: number;
  resetAt: Date | null;
  unlimited: boolean;
}

export interface CheckResult {
  allowed: boolean;
  balance: EntitlementBalance | null;
}

export interface ReportResult {
  balance: EntitlementBalance | null;
  success: boolean;
}

interface ActiveEntitlementRow {
  balance: number;
  id: string;
  nextResetAt: Date | null;
  originalLimit: number | null;
  resetInterval: string | null;
}

function addResetInterval(date: Date, resetInterval: string): Date {
  const next = new Date(date);
  if (resetInterval === "day") next.setUTCDate(next.getUTCDate() + 1);
  if (resetInterval === "week") next.setUTCDate(next.getUTCDate() + 7);
  if (resetInterval === "month") {
    const day = next.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + 1);
    // Clamp: if day overflowed (e.g. Jan 31 → Mar 3), go to last day of target month
    if (next.getUTCDate() !== day) next.setUTCDate(0);
  }
  if (resetInterval === "year") {
    const day = next.getUTCDate();
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    if (next.getUTCDate() !== day) next.setUTCDate(0);
  }
  return next;
}

function aggregateBalance(rows: ActiveEntitlementRow[]): EntitlementBalance | null {
  if (rows.length === 0) return null;

  const hasUnlimited = rows.some((row) => row.originalLimit === null);
  if (hasUnlimited) {
    return { limit: 0, remaining: 0, resetAt: null, unlimited: true };
  }

  let remaining = 0;
  let limit = 0;
  let resetAt: Date | null = null;

  for (const row of rows) {
    remaining += row.balance;
    limit += row.originalLimit!;
    if (row.nextResetAt) {
      if (!resetAt || row.nextResetAt < resetAt) {
        resetAt = row.nextResetAt;
      }
    }
  }

  return { limit, remaining, resetAt, unlimited: false };
}

/** Fetch all active entitlements for a customer+feature, with product feature metadata. */
async function getActiveEntitlements(
  db: PayKitDatabase,
  customerId: string,
  featureId: string,
): Promise<ActiveEntitlementRow[]> {
  const rows = await db
    .select({
      id: entitlement.id,
      balance: entitlement.balance,
      nextResetAt: entitlement.nextResetAt,
      originalLimit: productFeature.limit,
      resetInterval: productFeature.resetInterval,
    })
    .from(entitlement)
    .innerJoin(subscription, eq(entitlement.subscriptionId, subscription.id))
    .innerJoin(
      productFeature,
      and(
        eq(productFeature.productInternalId, subscription.productInternalId),
        eq(productFeature.featureId, entitlement.featureId),
      ),
    )
    .where(
      and(
        eq(entitlement.customerId, customerId),
        eq(entitlement.featureId, featureId),
        inArray(subscription.status, ["active", "trialing"]),
        or(isNull(subscription.endedAt), sql`${subscription.endedAt} > now()`),
      ),
    );
  return rows as ActiveEntitlementRow[];
}

/** Lazy-reset any stale entitlements and return the refreshed rows. */
async function resetStaleEntitlements(
  db: PayKitDatabase,
  rows: ActiveEntitlementRow[],
): Promise<ActiveEntitlementRow[]> {
  const now = new Date();
  let changed = false;

  for (const row of rows) {
    if (
      row.nextResetAt &&
      row.nextResetAt <= now &&
      row.resetInterval &&
      row.originalLimit != null
    ) {
      const nextReset = addResetInterval(now, row.resetInterval);
      await db
        .update(entitlement)
        .set({
          balance: row.originalLimit,
          nextResetAt: nextReset,
          updatedAt: now,
        })
        .where(and(eq(entitlement.id, row.id), lte(entitlement.nextResetAt, now)));
      row.balance = row.originalLimit;
      row.nextResetAt = nextReset;
      changed = true;
    }
  }

  // If nothing changed, return as-is (avoid re-fetch)
  void changed;
  return rows;
}

// check — read entitlements with lazy reset

export async function checkEntitlement(
  database: PayKitDatabase,
  input: { customerId: string; featureId: string; required?: number },
): Promise<CheckResult> {
  const required = input.required ?? 1;

  const rows = await getActiveEntitlements(database, input.customerId, input.featureId);
  await resetStaleEntitlements(database, rows);

  const balance = aggregateBalance(rows);

  if (!balance) {
    return { allowed: false, balance: null };
  }

  if (balance.unlimited) {
    return { allowed: true, balance };
  }

  return { allowed: balance.remaining >= required, balance };
}

// report — lazy reset + atomic decrement

export async function reportEntitlement(
  database: PayKitDatabase,
  input: { amount?: number; customerId: string; featureId: string },
): Promise<ReportResult> {
  const amount = input.amount ?? 1;

  const rows = await getActiveEntitlements(database, input.customerId, input.featureId);
  await resetStaleEntitlements(database, rows);

  if (rows.length === 0) {
    return { balance: null, success: false };
  }

  const hasUnlimited = rows.some((row) => row.originalLimit === null);
  if (hasUnlimited) {
    return { balance: aggregateBalance(rows), success: true };
  }

  // Find the first entitlement with sufficient balance and decrement atomically.
  // The WHERE balance >= $amount guard prevents over-decrementing under concurrency.
  let deducted = false;
  for (const row of rows) {
    if (row.originalLimit === null || row.balance < amount) continue;

    const result = await database
      .update(entitlement)
      .set({
        balance: sql`${entitlement.balance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(entitlement.id, row.id), sql`${entitlement.balance} >= ${amount}`))
      .returning({ balance: entitlement.balance });

    if (result.length > 0) {
      row.balance = result[0]!.balance!;
      deducted = true;
      break;
    }
  }

  return { balance: aggregateBalance(rows), success: deducted };
}
