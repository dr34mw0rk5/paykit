import crypto from "node:crypto";
import os from "node:os";

import { PostHog } from "posthog-node";

const POSTHOG_KEY = "phc_y3p2bSweenGX17D90noG8YQUyqVSgHqGAY88KvjEKaJ";
const POSTHOG_HOST = "https://us.i.posthog.com";
const FLUSH_TIMEOUT_MS = 1000;

function isEnabled(): boolean {
  return process.env.PAYKIT_TELEMETRY_DISABLED !== "1" && process.env.DO_NOT_TRACK !== "1";
}

function getAnonymousId(): string {
  const raw = `${os.hostname()}:${os.userInfo().username}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function getContext(): Record<string, string> {
  return {
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };
}

let client: PostHog | null = null;
let anonymousId: string | null = null;

function ensureClient(): PostHog | null {
  if (!isEnabled()) return null;

  if (!client) {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
    anonymousId = getAnonymousId();
  }

  return client;
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  const posthog = ensureClient();
  if (!posthog || !anonymousId) return;

  posthog.capture({
    distinctId: anonymousId,
    event,
    properties: {
      ...getContext(),
      ...properties,
    },
  });
}

export function captureError(command: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  capture("cli_error", {
    command,
    error: message,
    stack,
  });
}

export async function flush(): Promise<void> {
  if (!client) return;

  try {
    await Promise.race([
      client.shutdown(),
      new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ]);
  } catch {
    // Never block the CLI on telemetry failures
  }

  client = null;
}
