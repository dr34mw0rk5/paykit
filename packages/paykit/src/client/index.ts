import { createFetch } from "@better-fetch/fetch";

import type { clientMethods } from "../api/methods";

export interface PayKitClientOptions {
  baseURL?: string;
}

export function createPayKitClient<Instance>(options?: PayKitClientOptions) {
  const baseURL = options?.baseURL ?? "/paykit/api";
  const isCredentialsSupported =
    typeof globalThis.Request !== "undefined" && "credentials" in Request.prototype;

  const $fetch = createFetch({
    baseURL,
    throw: true,
    ...(isCredentialsSupported ? { credentials: "include" as const } : {}),
  });

  function createProxy(path: string[] = []): unknown {
    return new Proxy(function () {}, {
      get(_, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
        return createProxy([...path, prop]);
      },
      apply: async (_, __, args) => {
        const routePath =
          "/" + path.map((s) => s.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)).join("/");
        const body = (args[0] as Record<string, unknown>) ?? {};

        return $fetch(routePath, {
          method: "POST",
          body,
        });
      },
    });
  }

  return createProxy() as InferClientAPI<Instance>;
}

// --- Type inference utilities ---

type CamelCase<S extends string> = S extends `${infer P1}-${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

type PathToMethod<Path extends string, Fn> = Path extends `/${infer Segment}/${infer Rest}`
  ? { [K in CamelCase<Segment>]: PathToMethod<`/${Rest}`, Fn> }
  : Path extends `/${infer Segment}`
    ? { [K in CamelCase<Segment>]: Fn }
    : never;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

type InferBody<E> = E extends (ctx: infer C) => unknown ? C : never;

type InferReturn<E> = E extends (...args: never[]) => Promise<infer R> ? R : never;

type InferClientAPI<Instance> = Instance extends { $clientApi: infer API }
  ? UnionToIntersection<
      {
        [K in keyof API]: API[K] extends { path: infer P }
          ? P extends string
            ? PathToMethod<P, (body: InferBody<API[K]>) => Promise<InferReturn<API[K]>>>
            : never
          : never;
      }[keyof API]
    >
  : Instance extends { api: infer API }
    ? UnionToIntersection<
        {
          [K in keyof API]: API[K] extends { path: infer P }
            ? P extends string
              ? PathToMethod<P, (body: InferBody<API[K]>) => Promise<InferReturn<API[K]>>>
              : never
            : never;
        }[keyof API]
      >
    : typeof clientMethods extends infer API
      ? UnionToIntersection<
          {
            [K in keyof API]: API[K] extends { path: infer P }
              ? P extends string
                ? PathToMethod<P, (body: InferBody<API[K]>) => Promise<InferReturn<API[K]>>>
                : never
              : never;
          }[keyof API]
        >
      : never;
