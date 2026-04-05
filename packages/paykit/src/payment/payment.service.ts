import { and, eq, sql } from "drizzle-orm";

import type { PayKitContext } from "../core/context";
import { generateId } from "../core/utils";
import { findCustomerByProviderCustomerId } from "../customer/customer.service";
import type { PayKitDatabase } from "../database";
import { invoice } from "../database/schema";
import type { NormalizedPayment, UpsertPaymentAction } from "../types/events";

export async function syncPaymentByProviderCustomer(
  database: PayKitDatabase,
  input: {
    payment: NormalizedPayment;
    providerCustomerId: string;
    providerId: string;
  },
): Promise<void> {
  const customerRow = await findCustomerByProviderCustomerId(database, {
    providerCustomerId: input.providerCustomerId,
    providerId: input.providerId,
  });
  if (!customerRow) {
    return;
  }

  const providerData = {
    paymentId: input.payment.providerPaymentId,
    methodId: input.payment.providerMethodId ?? null,
  };

  const existing = await database.query.invoice.findFirst({
    where: and(
      eq(invoice.providerId, input.providerId),
      sql`${invoice.providerData}->>'paymentId' = ${input.payment.providerPaymentId}`,
    ),
  });

  if (existing) {
    await database
      .update(invoice)
      .set({
        status: input.payment.status,
        amount: input.payment.amount,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, existing.id));
    return;
  }

  await database.insert(invoice).values({
    id: generateId("inv"),
    customerId: customerRow.id,
    type: "charge",
    status: input.payment.status,
    amount: input.payment.amount,
    currency: input.payment.currency,
    description: input.payment.description ?? null,
    providerId: input.providerId,
    providerData,
  });
}

export async function applyPaymentWebhookAction(
  ctx: PayKitContext,
  action: UpsertPaymentAction,
): Promise<string | null> {
  await syncPaymentByProviderCustomer(ctx.database, {
    payment: action.data.payment,
    providerCustomerId: action.data.providerCustomerId,
    providerId: ctx.provider.id,
  });

  const customerRow = await findCustomerByProviderCustomerId(ctx.database, {
    providerCustomerId: action.data.providerCustomerId,
    providerId: ctx.provider.id,
  });
  return customerRow?.id ?? null;
}
