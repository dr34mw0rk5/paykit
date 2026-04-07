import { createRouter } from "better-call";

import type { PayKitContext } from "../core/context";
import {
  customerPortal,
  deleteCustomer,
  getCustomer,
  listCustomersMethod,
  upsertCustomer,
} from "../customer/customer.api";
import { check, report } from "../entitlement/entitlement.api";
import { subscribe } from "../subscription/subscription.api";
import type { PayKitAPI, PayKitClientAPI } from "../types/instance";
import type { PayKitOptions } from "../types/options";
import { receiveWebhook } from "../webhook/webhook.api";
import type { PayKitMethod } from "./define-route";

const methods = {
  subscribe,
  customerPortal,
  upsertCustomer,
  getCustomer,
  deleteCustomer,
  listCustomers: listCustomersMethod,
  check,
  report,
  handleWebhook: receiveWebhook,
} as const;

type MethodMap = Record<string, PayKitMethod<unknown, unknown>>;

export const clientMethods = pickMethods(
  methods as unknown as MethodMap,
  (method) => method.client === true,
);

export const routeEndpoints = Object.fromEntries(
  Object.entries(methods).flatMap(([key, method]) =>
    method.endpoint ? [[key, method.endpoint]] : [],
  ),
);

function pickMethods(source: MethodMap, predicate: (method: MethodMap[string]) => boolean) {
  return Object.fromEntries(
    Object.entries(source).filter(([, method]) => predicate(method)),
  ) as MethodMap;
}

type ContextSource = PayKitContext | Promise<PayKitContext> | (() => Promise<PayKitContext>);

function resolveContext(ctx: ContextSource): Promise<PayKitContext> | PayKitContext {
  return typeof ctx === "function" ? ctx() : ctx;
}

function wrapMethods<TMethods extends MethodMap>(source: TMethods, ctx: ContextSource) {
  const wrapped = Object.fromEntries(
    Object.entries(source).map(([key, method]) => {
      const fn = async (input: unknown) => {
        const resolved = await resolveContext(ctx);
        return method(resolved, input);
      };

      if (method.endpoint) {
        Object.assign(fn, {
          options: method.endpoint.options,
          path: method.endpoint.path,
        });
      }

      return [key, fn];
    }),
  );

  return wrapped as unknown as TMethods;
}

export function getClientApi(ctx: ContextSource) {
  return wrapMethods(clientMethods, ctx) as unknown as PayKitClientAPI;
}

export function getApi<TOptions extends PayKitOptions>(ctx: ContextSource): PayKitAPI<TOptions> {
  return wrapMethods(methods as unknown as MethodMap, ctx) as unknown as PayKitAPI<TOptions>;
}

export function createPayKitRouter(ctx: PayKitContext, options: PayKitOptions) {
  const pluginEndpoints = Object.assign(
    {},
    ...(options.plugins ?? []).map((plugin) => plugin.endpoints ?? {}),
  );

  return createRouter(
    { ...routeEndpoints, ...pluginEndpoints },
    {
      basePath: options.basePath ?? "/paykit/api",
      routerContext: ctx,
      onError(error) {
        ctx.logger.error({ err: error }, "API error");
      },
    },
  );
}
