import { createPayKitRouter, getApi, getClientApi } from "../api/methods";
import type { PayKitAPI, PayKitClientAPI, PayKitInstance } from "../types/instance";
import type { PayKitOptions } from "../types/options";
import { createContext, type PayKitContext } from "./context";

const payKitInstanceSymbol = Symbol.for("paykit.instance");

export function isPayKitInstance(value: unknown): value is PayKitInstance {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as Record<PropertyKey, unknown>)[payKitInstanceSymbol] === true
  );
}

export function createPayKit<const TOptions extends PayKitOptions>(
  options: TOptions,
): PayKitInstance<TOptions> {
  let contextPromise: Promise<PayKitContext> | undefined;
  const getContext = () => {
    contextPromise ??= createContext(options);
    return contextPromise;
  };

  const api = getApi<TOptions>(getContext()) as PayKitAPI<TOptions>;
  const clientApi = getClientApi(getContext()) as PayKitClientAPI<TOptions>;

  const paykit: PayKitInstance<TOptions> = {
    options,

    async handler(request: Request) {
      const ctx = await getContext();
      const basePath = options.basePath ?? "/paykit";

      // Rewrite GET /paykit/* → /paykit/api/dash (dashboard SPA)
      // But not /paykit/api/* (those are real API routes)
      const url = new URL(request.url);
      if (
        request.method === "GET" &&
        (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) &&
        !url.pathname.startsWith(`${basePath}/api`)
      ) {
        url.pathname = `${basePath}/api/dash`;
        request = new Request(url, request);
      }

      const router = createPayKitRouter(ctx, options);
      return router.handler(request);
    },

    api,
    $clientApi: clientApi,
    ...api,

    get $context() {
      return getContext();
    },

    $infer: undefined as never,
  };

  Object.defineProperty(paykit, payKitInstanceSymbol, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  return paykit;
}
