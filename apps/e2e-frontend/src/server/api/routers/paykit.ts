import * as z from "zod";

import { env } from "@/env";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { paykit } from "@/server/paykit";

const demoCheckoutInputSchema = z.object({
  attachMethod: z.boolean().default(true),
});

const demoCustomer = {
  email: "e2e@example.com",
  id: "e2e-demo-user",
  name: "E2E Demo Customer",
} as const;

export const paykitRouter = createTRPCRouter({
  createCheckout: publicProcedure.input(demoCheckoutInputSchema).mutation(async ({ input }) => {
    const customer = await paykit.customer.sync(demoCustomer);

    const checkout = await paykit.checkout.create({
      amount: 1999,
      attachMethod: input.attachMethod,
      cancelURL: `${env.APP_URL}/checkout/cancel`,
      customerId: customer.id,
      description: "PayKit Stripe E2E checkout",
      metadata: {
        source: "apps/e2e-frontend",
      },
      providerId: "stripe",
      successURL: `${env.APP_URL}/checkout/success`,
    });

    return {
      attachMethod: input.attachMethod,
      ...checkout,
      customerId: customer.id,
    };
  }),
});
