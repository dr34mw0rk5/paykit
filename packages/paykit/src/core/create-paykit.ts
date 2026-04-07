import { createPayKitRouter, getApi } from "../api/methods";
import { dryRunSyncProducts } from "../product/product-sync.service";
import type { PayKitAPI, PayKitInstance } from "../types/instance";
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

async function initContext(options: PayKitOptions): Promise<PayKitContext> {
  const ctx = await createContext(options);

  if (process.env.NODE_ENV !== "production") {
    try {
      const results = await dryRunSyncProducts(ctx);
      const outOfSync = results.filter((r) => r.action !== "unchanged");
      if (outOfSync.length > 0) {
        ctx.logger.error(
          `${outOfSync.length} plan(s) out of sync: ${outOfSync.map((r) => r.id).join(", ")}. Run \`paykitjs push\` to update.`,
        );
      }
    } catch {
      ctx.logger.debug("Skipped plan sync check (database may not be initialized yet)");
    }
  }

  return ctx;
}

export function createPayKit<const TOptions extends PayKitOptions>(
  options: TOptions,
): PayKitInstance<TOptions> {
  let contextPromise: Promise<PayKitContext> | undefined;
  const getContext = () => {
    contextPromise ??= initContext(options);
    return contextPromise;
  };

  const api = getApi<TOptions>(getContext) as PayKitAPI<TOptions>;
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
