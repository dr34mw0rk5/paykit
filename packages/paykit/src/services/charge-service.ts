import type { PayKitContext } from "../core/context";
import { PayKitError } from "../core/errors";
import type { Charge } from "../types/models";
import { getCustomerByIdOrThrow, upsertProviderCustomer } from "./customer-service";
import { getPaymentMethodById } from "./payment-method-service";
import { toPublicPayment, upsertPaymentFromWebhook } from "./payment-service";

export interface CreateChargeInput<TProviderId extends string = string> {
  providerId: TProviderId;
  customerId: string;
  paymentMethodId: string;
  amount: number;
  description: string;
  metadata?: Record<string, string>;
}

export async function createCharge<TProviderId extends string>(
  ctx: PayKitContext<TProviderId>,
  input: CreateChargeInput<TProviderId>,
): Promise<Charge> {
  await getCustomerByIdOrThrow(ctx.database, input.customerId);

  const paymentMethod = await getPaymentMethodById(ctx.database, {
    customerId: input.customerId,
    id: input.paymentMethodId,
    providerId: input.providerId,
  });
  if (!paymentMethod) {
    throw new PayKitError("PAYMENT_METHOD_NOT_FOUND");
  }

  const provider = ctx.providers.get(input.providerId);
  if (!provider) {
    throw new PayKitError("PROVIDER_NOT_FOUND");
  }

  const providerCustomer = await upsertProviderCustomer(ctx, {
    customerId: input.customerId,
    providerId: input.providerId,
  });

  const payment = await provider.charge({
    amount: input.amount,
    description: input.description,
    metadata: input.metadata,
    providerCustomerId: providerCustomer.providerCustomerId,
    providerMethodId: paymentMethod.providerMethodId,
  });

  const storedPayment = await upsertPaymentFromWebhook(ctx, {
    payment,
    providerCustomerId: providerCustomer.providerCustomerId,
    providerId: input.providerId,
  });

  return toPublicPayment(storedPayment);
}
