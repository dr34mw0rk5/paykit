import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { auth } from "@/server/auth";
import { paykit, type PayKit } from "@/server/paykit";

export const paykitRouter = createTRPCRouter({
  createCustomer: publicProcedure.mutation(async ({ ctx }) => {
    const session = await auth.api.getSession({ headers: ctx.headers });
    if (!session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    return paykit.upsertCustomer({
      email: session.user.email,
      id: session.user.id,
      name: session.user.name ?? undefined,
    });
  }),

  deleteCustomer: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await auth.api.getSession({ headers: ctx.headers });
      if (!session) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not authenticated",
        });
      }

      return paykit.deleteCustomer({ id: input.id });
    }),

  currentPlans: publicProcedure.query(async ({ ctx }) => {
    const session = await auth.api.getSession({ headers: ctx.headers });
    if (!session) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    await paykit.upsertCustomer({
      email: session.user.email,
      id: session.user.id,
      name: session.user.name ?? undefined,
    });

    const customer = await paykit.getCustomer({ id: session.user.id });
    return customer?.subscriptions ?? [];
  }),

  checkFeature: publicProcedure
    .input(z.object({ featureId: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await auth.api.getSession({ headers: ctx.headers });
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      return paykit.check({
        customerId: session.user.id,
        featureId: input.featureId as PayKit["featureId"],
      });
    }),

  reportUsage: publicProcedure
    .input(z.object({ amount: z.number().int().min(1).optional(), featureId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await auth.api.getSession({ headers: ctx.headers });
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      return paykit.report({
        amount: input.amount,
        customerId: session.user.id,
        featureId: input.featureId as PayKit["featureId"],
      });
    }),
});
