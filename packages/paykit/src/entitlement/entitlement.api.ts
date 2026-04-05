import * as z from "zod";

import { definePayKitMethod } from "../api/define-route";
import { checkEntitlement, reportEntitlement } from "./entitlement.service";

const entitlementCheckSchema = z.object({
  featureId: z.string(),
  required: z.number().positive().optional(),
});

const entitlementReportSchema = z.object({
  featureId: z.string(),
  amount: z.number().positive().optional(),
});

export const check = definePayKitMethod(
  {
    input: entitlementCheckSchema,
    requireCustomer: true,
    route: {
      client: true,
      method: "POST",
      path: "/check",
    },
  },
  async (ctx) =>
    checkEntitlement(ctx.paykit.database, {
      customerId: ctx.customer.id,
      featureId: ctx.input.featureId,
      required: ctx.input.required,
    }),
);

export const report = definePayKitMethod(
  {
    input: entitlementReportSchema,
    requireCustomer: true,
    route: {
      client: true,
      method: "POST",
      path: "/report",
    },
  },
  async (ctx) =>
    reportEntitlement(ctx.paykit.database, {
      amount: ctx.input.amount,
      customerId: ctx.customer.id,
      featureId: ctx.input.featureId,
    }),
);
