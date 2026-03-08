import { Elysia } from "elysia";
import { PayKitError } from "paykitjs";
import * as z from "zod";

import { env } from "@/env";
import { paykit } from "@/server/paykit";

const metadataSchema = z.record(z.string()).optional();

const checkoutRequestSchema = z.object({
  amount: z.number().int().positive(),
  attachMethod: z.boolean().default(true),
  cancelURL: z.string().url().optional(),
  customer: z.object({
    email: z.string().email().optional(),
    id: z.string().min(1),
    metadata: metadataSchema,
    name: z.string().min(1).optional(),
  }),
  description: z.string().min(1),
  metadata: metadataSchema,
  providerId: z.literal("stripe").default("stripe"),
  successURL: z.string().url().optional(),
});

const chargeRequestSchema = z.object({
  amount: z.number().int().positive(),
  customerId: z.string().min(1),
  description: z.string().min(1),
  metadata: metadataSchema,
  paymentMethodId: z.string().min(1),
  providerId: z.literal("stripe").default("stripe"),
});

function getDefaultCheckoutURLs() {
  return {
    cancelURL: `${env.APP_URL}/checkout/cancel`,
    successURL: `${env.APP_URL}/checkout/success`,
  };
}

export const elysiaRest = new Elysia({
  prefix: "/api/rest/paykit",
})
  .post(
    "/checkout",
    async ({ body }) => {
      const defaults = getDefaultCheckoutURLs();
      const customer = await paykit.customer.sync(body.customer);

      const checkout = await paykit.checkout.create({
        amount: body.amount,
        attachMethod: body.attachMethod,
        cancelURL: body.cancelURL ?? defaults.cancelURL,
        customerId: customer.id,
        description: body.description,
        metadata: body.metadata,
        providerId: body.providerId,
        successURL: body.successURL ?? defaults.successURL,
      });

      return {
        attachMethod: body.attachMethod,
        customerId: customer.id,
        providerId: body.providerId,
        url: checkout.url,
      };
    },
    {
      body: checkoutRequestSchema,
    },
  )
  .post(
    "/charge",
    ({ body }) =>
      paykit.charge.create({
        amount: body.amount,
        customerId: body.customerId,
        description: body.description,
        metadata: body.metadata,
        paymentMethodId: body.paymentMethodId,
        providerId: body.providerId,
      }),
    {
      body: chargeRequestSchema,
    },
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        code: "BAD_REQUEST",
        message: error.message,
      };
    }

    if (error instanceof PayKitError) {
      set.status = 400;
      return {
        code: error.code,
        message: error.message,
      };
    }

    set.status = 500;
    return {
      code: "INTERNAL_SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unexpected server error",
    };
  });
