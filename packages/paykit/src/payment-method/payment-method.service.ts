import { and, eq, isNull, sql } from "drizzle-orm";

import type { PayKitContext } from "../core/context";
import { generateId } from "../core/utils";
import { findCustomerByProviderCustomerId } from "../customer/customer.service";
import type { PayKitDatabase } from "../database";
import { paymentMethod } from "../database/schema";
import type {
  DeletePaymentMethodAction,
  NormalizedPaymentMethod,
  UpsertPaymentMethodAction,
} from "../types/events";

export async function getDefaultPaymentMethod(
  database: PayKitDatabase,
  input: { customerId: string; providerId: string },
) {
  return (
    (await database.query.paymentMethod.findFirst({
      orderBy(fields, operators) {
        return [operators.desc(fields.isDefault), operators.desc(fields.createdAt)];
      },
      where: and(
        eq(paymentMethod.customerId, input.customerId),
        eq(paymentMethod.providerId, input.providerId),
        isNull(paymentMethod.deletedAt),
      ),
    })) ?? null
  );
}

export async function syncPaymentMethodByProviderCustomer(
  database: PayKitDatabase,
  input: {
    paymentMethod: NormalizedPaymentMethod;
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

  const now = new Date();
  const providerData = {
    methodId: input.paymentMethod.providerMethodId,
    type: input.paymentMethod.type,
    last4: input.paymentMethod.last4 ?? null,
    expiryMonth: input.paymentMethod.expiryMonth ?? null,
    expiryYear: input.paymentMethod.expiryYear ?? null,
  };

  const existingRow = await database.query.paymentMethod.findFirst({
    where: and(
      eq(paymentMethod.providerId, input.providerId),
      sql`${paymentMethod.providerData}->>'methodId' = ${input.paymentMethod.providerMethodId}`,
      isNull(paymentMethod.deletedAt),
    ),
  });

  if (input.paymentMethod.isDefault) {
    await database
      .update(paymentMethod)
      .set({ isDefault: false, updatedAt: now })
      .where(
        and(
          eq(paymentMethod.customerId, customerRow.id),
          eq(paymentMethod.providerId, input.providerId),
        ),
      );
  }

  if (existingRow) {
    await database
      .update(paymentMethod)
      .set({
        customerId: customerRow.id,
        deletedAt: null,
        isDefault: input.paymentMethod.isDefault ?? existingRow.isDefault,
        providerData,
        updatedAt: now,
      })
      .where(eq(paymentMethod.id, existingRow.id));
    return;
  }

  await database.insert(paymentMethod).values({
    customerId: customerRow.id,
    deletedAt: null,
    id: generateId("pm"),
    isDefault: input.paymentMethod.isDefault ?? false,
    providerId: input.providerId,
    providerData,
  });
}

export async function deletePaymentMethodByProviderId(
  database: PayKitDatabase,
  input: {
    providerId: string;
    providerMethodId: string;
  },
): Promise<void> {
  await database
    .update(paymentMethod)
    .set({
      deletedAt: new Date(),
      isDefault: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentMethod.providerId, input.providerId),
        sql`${paymentMethod.providerData}->>'methodId' = ${input.providerMethodId}`,
      ),
    );
}

export async function applyPaymentMethodWebhookAction(
  ctx: PayKitContext,
  action: UpsertPaymentMethodAction | DeletePaymentMethodAction,
): Promise<string | null> {
  if (action.type === "payment_method.upsert") {
    await syncPaymentMethodByProviderCustomer(ctx.database, {
      paymentMethod: action.data.paymentMethod,
      providerCustomerId: action.data.providerCustomerId,
      providerId: ctx.provider.id,
    });

    const customerRow = await findCustomerByProviderCustomerId(ctx.database, {
      providerCustomerId: action.data.providerCustomerId,
      providerId: ctx.provider.id,
    });
    return customerRow?.id ?? null;
  }

  await deletePaymentMethodByProviderId(ctx.database, {
    providerId: ctx.provider.id,
    providerMethodId: action.data.providerMethodId,
  });
  return null;
}
