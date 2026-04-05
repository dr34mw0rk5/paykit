import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PostHog } from "posthog-node";

const POSTHOG_KEY = "phc_y3p2bSweenGX17D90noG8YQUyqVSgHqGAY88KvjEKaJ";
const POSTHOG_HOST = "https://us.i.posthog.com";
const CONFIG_DIR = path.join(os.homedir(), ".paykit");
const TELEMETRY_FILE = path.join(CONFIG_DIR, "telemetry.json");
const FLUSH_TIMEOUT_MS = 1000;

interface TelemetryConfig {
  enabled: boolean;
  notified: boolean;
}

function readConfig(): TelemetryConfig {
  try {
    const raw = fs.readFileSync(TELEMETRY_FILE, "utf-8");
    return JSON.parse(raw) as TelemetryConfig;
  } catch {
    return { enabled: true, notified: false };
  }
}

function writeConfig(config: TelemetryConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(config, null, 2));
}

function isDisabledByEnv(): boolean {
  return process.env.PAYKIT_TELEMETRY_DISABLED === "1" || process.env.DO_NOT_TRACK === "1";
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

function isEnabled(): boolean {
  if (isDisabledByEnv()) return false;
  return readConfig().enabled;
}

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

function showFirstRunNotice(): void {
  const config = readConfig();
  if (config.notified) return;

  console.log(
    "\n  PayKit collects anonymous usage data to improve the CLI." +
      "\n  Run `paykitjs telemetry disable` to opt out.\n",
  );

  writeConfig({ ...config, notified: true });
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  const posthog = ensureClient();
  if (!posthog || !anonymousId) return;

  showFirstRunNotice();

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

export function setEnabled(enabled: boolean): void {
  const config = readConfig();
  writeConfig({ ...config, enabled, notified: true });
}
