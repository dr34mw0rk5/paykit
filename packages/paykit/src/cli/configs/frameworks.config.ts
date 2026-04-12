export const FRAMEWORKS = [
  {
    name: "Next.js",
    id: "next",
    dependency: "next",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "api/paykit/[...slug]/route.ts",
      code: `import { paykitHandler } from "paykitjs/handlers/next";

import { paykit } from "@/lib/paykit";

export const { GET, POST } = paykitHandler(paykit);`,
    },
    configPaths: ["next.config.js", "next.config.ts", "next.config.mjs"],
  },
  {
    name: "Nuxt",
    id: "nuxt",
    dependency: "nuxt",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "server/api/paykit/[...slug].ts",
      code: `import { paykit } from "~/lib/paykit";

export default defineEventHandler((event) => {
  return paykit.handler(toWebRequest(event));
});`,
    },
    configPaths: ["nuxt.config.js", "nuxt.config.ts", "nuxt.config.mjs", "nuxt.config.cjs"],
  },
  {
    name: "SvelteKit",
    id: "sveltekit",
    dependency: "@sveltejs/kit",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "src/routes/api/paykit/[...slug]/+server.ts",
      code: `import { paykit } from "$lib/paykit";

export const GET = ({ request }) => paykit.handler(request);
export const POST = ({ request }) => paykit.handler(request);`,
    },
    configPaths: ["svelte.config.js", "svelte.config.ts", "svelte.config.mjs", "svelte.config.cjs"],
  },
  {
    name: "Solid Start",
    id: "solid-start",
    dependency: "solid-start",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "src/routes/api/paykit/*slug.ts",
      code: `import { paykit } from "~/lib/paykit";

export const GET = ({ request }) => paykit.handler(request);
export const POST = ({ request }) => paykit.handler(request);`,
    },
    configPaths: ["app.config.ts"],
  },
  {
    name: "Tanstack Start",
    id: "tanstack-start",
    dependency: "@tanstack/react-start",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "app/api/paykit.$.ts",
      code: `import { paykit } from "@/lib/paykit";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/paykit/$")({
  server: {
    handlers: {
      GET: ({ request }) => paykit.handler(request),
      POST: ({ request }) => paykit.handler(request),
    },
  },
});`,
    },
    configPaths: null,
  },
  {
    name: "Astro",
    id: "astro",
    dependency: "astro",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "src/pages/api/paykit/[...slug].ts",
      code: `import { paykit } from "@/lib/paykit";
import type { APIRoute } from "astro";

export const ALL: APIRoute = async (ctx) => {
  return paykit.handler(ctx.request);
};`,
    },
    configPaths: ["astro.config.mjs", "astro.config.ts", "astro.config.js", "astro.config.cjs"],
  },
  {
    name: "Remix",
    id: "remix",
    dependency: "@remix-run/server-runtime",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "app/routes/api.paykit.$.ts",
      code: `import { paykit } from "~/lib/paykit";

export const loader = ({ request }) => paykit.handler(request);
export const action = ({ request }) => paykit.handler(request);`,
    },
    configPaths: ["remix.config.js"],
  },
  {
    name: "React Router v7",
    id: "react-router-v7",
    dependency: "react-router",
    authClient: {
      importPath: "paykitjs/client",
    },
    routeHandler: {
      path: "app/routes/api.paykit.$.ts",
      code: `import { paykit } from "~/lib/paykit";

export const loader = ({ request }) => paykit.handler(request);
export const action = ({ request }) => paykit.handler(request);`,
    },
    configPaths: ["react-router.config.ts"],
  },
  {
    name: "Hono",
    id: "hono",
    dependency: "hono",
    authClient: null,
    routeHandler: null,
    configPaths: null,
  },
  {
    name: "Fastify",
    id: "fastify",
    dependency: "fastify",
    authClient: null,
    routeHandler: null,
    configPaths: null,
  },
  {
    name: "Express",
    id: "express",
    dependency: "express",
    authClient: null,
    routeHandler: null,
    configPaths: null,
  },
  {
    name: "Elysia",
    id: "elysia",
    dependency: "elysia",
    authClient: null,
    routeHandler: null,
    configPaths: null,
  },
  {
    name: "Nitro",
    id: "nitro",
    dependency: "nitro",
    authClient: null,
    routeHandler: null,
    configPaths: ["nitro.config.ts"],
  },
] as const satisfies {
  name: string;
  id: string;
  dependency: string;
  authClient: {
    importPath: string;
  } | null;
  routeHandler: {
    path: string;
    code: string;
  } | null;
  configPaths: string[] | null;
}[];

export type Framework = (typeof FRAMEWORKS)[number];
