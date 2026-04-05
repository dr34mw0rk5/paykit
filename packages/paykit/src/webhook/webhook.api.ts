import { definePayKitMethod } from "../api/define-route";
import { PayKitError, PAYKIT_ERROR_CODES } from "../core/errors";
import { handleWebhook } from "./webhook.service";

function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/** Applies an incoming provider webhook payload. */
export const receiveWebhook = definePayKitMethod(
  {
    route: {
      disableBody: true,
      method: "POST",
      path: "/webhook/:providerId",
      requireHeaders: true,
      requireRequest: true,
      resolveInput: async (ctx) => ({
        body: await ctx.request!.text(),
        headers: headersToRecord(ctx.headers ?? new Headers()),
      }),
    },
  },
  async (ctx) => {
    const providerId = ctx.params.providerId;
    if (providerId && providerId !== ctx.paykit.provider.id) {
      throw PayKitError.from(
        "BAD_REQUEST",
        PAYKIT_ERROR_CODES.PROVIDER_WEBHOOK_INVALID,
        "Webhook provider does not match this PayKit instance",
      );
    }

    return handleWebhook(ctx.paykit, ctx.input);
  },
);
