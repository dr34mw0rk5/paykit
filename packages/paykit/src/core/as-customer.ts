import { createCharge } from "../services/charge-service";
import { createCheckout } from "../services/checkout-service";
import { syncCustomer } from "../services/customer-service";
import {
  attachPaymentMethod,
  detachPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
} from "../services/payment-method-service";
import type { CustomerIdentity, ScopedPayKitInstance } from "../types/instance";
import type { PayKitContext } from "./context";

async function resolveCustomerId<TProviderId extends string>(
  ctx: PayKitContext<TProviderId>,
  identity: CustomerIdentity,
): Promise<string> {
  const customer = await syncCustomer(ctx.database, identity);
  return customer.id;
}

export function createScopedInstance<TProviderId extends string>(
  ctx: PayKitContext<TProviderId>,
  identity: CustomerIdentity,
): ScopedPayKitInstance<TProviderId> {
  return {
    charge: {
      async create(input) {
        const customerId = await resolveCustomerId(ctx, identity);
        return createCharge(ctx, { ...input, customerId });
      },
    },
    checkout: {
      async create(input) {
        const customerId = await resolveCustomerId(ctx, identity);
        return createCheckout(ctx, { ...input, customerId });
      },
    },
    paymentMethod: {
      async attach(input) {
        const customerId = await resolveCustomerId(ctx, identity);
        return attachPaymentMethod(ctx, { ...input, customerId });
      },
      async list(input) {
        const customerId = await resolveCustomerId(ctx, identity);
        return listPaymentMethods(ctx, { ...input, customerId });
      },
      async setDefault(input) {
        const customerId = await resolveCustomerId(ctx, identity);
        await setDefaultPaymentMethod(ctx, { ...input, customerId });
      },
      async detach(input) {
        const customerId = await resolveCustomerId(ctx, identity);
        await detachPaymentMethod(ctx, { ...input, customerId });
      },
    },
  };
}
