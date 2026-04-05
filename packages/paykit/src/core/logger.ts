import { AsyncLocalStorage } from "node:async_hooks";

import pino from "pino";

import { generateId } from "./utils";

const storage = new AsyncLocalStorage<pino.Logger>();

export interface PayKitInternalLogger extends pino.Logger {
  trace: pino.Logger["trace"] & {
    run: <T>(prefix: string, fn: () => T | Promise<T>) => T | Promise<T>;
  };
}

export function getTraceId(): string | undefined {
  const bindings = storage.getStore()?.bindings();
  return bindings?.traceId as string | undefined;
}

export function createPayKitLogger(userLogger?: pino.Logger): PayKitInternalLogger {
  const base =
    userLogger ??
    pino({
      name: "paykit",
    });

  const handler: ProxyHandler<pino.Logger> = {
    get(target, prop, receiver) {
      // Intercept trace to add .run()
      if (prop === "trace") {
        const current = storage.getStore() ?? target;
        const traceFn = current.trace.bind(current);
        (traceFn as unknown as Record<string, unknown>).run = <T>(
          prefix: string,
          fn: () => T | Promise<T>,
        ): T | Promise<T> => {
          const child = current.child({ traceId: generateId(prefix, 12) });
          return storage.run(child, fn);
        };
        return traceFn;
      }

      const current = storage.getStore() ?? target;
      const value = Reflect.get(current, prop, receiver);
      if (typeof value === "function") {
        return value.bind(current);
      }
      return value;
    },
  };

  return new Proxy(base, handler) as PayKitInternalLogger;
}
