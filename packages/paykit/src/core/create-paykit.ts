import type { PayKitProvider } from "../providers/provider";
import { createCharge } from "../services/charge-service";
import { createCheckout } from "../services/checkout-service";
import { deleteCustomerById, getCustomerById, syncCustomer } from "../services/customer-service";
import {
  attachPaymentMethod,
  detachPaymentMethod,
  listPaymentMethods,
  setDefaultPaymentMethod,
} from "../services/payment-method-service";
import type { PayKitInstance } from "../types/instance";
import type { PayKitOptions, ProviderId } from "../types/options";
import { handleWebhook } from "../webhook/handle-webhook";
import { createScopedInstance } from "./as-customer";
import { createContext } from "./context";

export function createPayKit<const TProviders extends readonly PayKitProvider[]>(
  options: PayKitOptions<TProviders>,
): PayKitInstance<ProviderId<TProviders>> {
  const contextPromise = Promise.resolve(createContext(options));

  return {
    customer: {
      async sync(input) {
        const ctx = await contextPromise;
        return syncCustomer(ctx.database, input);
      },
      async get(input) {
        const ctx = await contextPromise;
        return getCustomerById(ctx.database, input.id);
      },
      async delete(input) {
        const ctx = await contextPromise;
        await deleteCustomerById(ctx.database, input.id);
      },
    },
    charge: {
      async create(input) {
        const ctx = await contextPromise;
        return createCharge(ctx, input);
      },
    },
    checkout: {
      async create(input) {
        const ctx = await contextPromise;
        return createCheckout(ctx, input);
      },
    },
    paymentMethod: {
      async attach(input) {
        const ctx = await contextPromise;
        return attachPaymentMethod(ctx, input);
      },
      async list(input) {
        const ctx = await contextPromise;
        return listPaymentMethods(ctx, input);
      },
      async setDefault(input) {
        const ctx = await contextPromise;
        await setDefaultPaymentMethod(ctx, input);
      },
      async detach(input) {
        const ctx = await contextPromise;
        await detachPaymentMethod(ctx, input);
      },
    },
    async handleWebhook(input) {
      const ctx = await contextPromise;
      return handleWebhook(ctx, input);
    },
    asCustomer(identity) {
      // Scoped methods auto-upsert customer before each operation.
      return {
        charge: {
          async create(input) {
            const ctx = await contextPromise;
            const scoped = createScopedInstance(ctx, identity);
            return scoped.charge.create(input);
          },
        },
        checkout: {
          async create(input) {
            const ctx = await contextPromise;
            const scoped = createScopedInstance(ctx, identity);
            return scoped.checkout.create(input);
          },
        },
        paymentMethod: {
          async attach(input) {
            const ctx = await contextPromise;
            const scoped = createScopedInstance(ctx, identity);
            return scoped.paymentMethod.attach(input);
          },
          async list(input) {
            const ctx = await contextPromise;
            const scoped = createScopedInstance(ctx, identity);
            return scoped.paymentMethod.list(input);
          },
          async setDefault(input) {
            const ctx = await contextPromise;
            const scoped = createScopedInstance(ctx, identity);
            await scoped.paymentMethod.setDefault(input);
          },
          async detach(input) {
            const ctx = await contextPromise;
            const scoped = createScopedInstance(ctx, identity);
            await scoped.paymentMethod.detach(input);
          },
        },
      };
    },
    $context: contextPromise,
  };
}
