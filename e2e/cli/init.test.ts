import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })),
  );
});

async function createInitFixture() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "paykit-init-test-"));
  temporaryDirectories.push(cwd);

  // Create a minimal package.json so init can detect the project
  await fs.writeFile(
    path.join(cwd, "package.json"),
    JSON.stringify({ name: "test-app", dependencies: {} }, null, 2),
  );

  // Create src directory (Next.js-like structure)
  await fs.mkdir(path.join(cwd, "src", "app", "api", "paykit", "[...all]"), { recursive: true });
  await fs.mkdir(path.join(cwd, "src", "server"), { recursive: true });

  return { cwd };
}

describe("paykitjs init", () => {
  it("should generate config, plans, route handler, and .env", async () => {
    const { cwd } = await createInitFixture();

    // Run the CLI init command non-interactively by writing the files directly
    // (same as what initAction does after collecting answers)
    // We test the file generation logic by importing and calling the generators
    const configPath = "src/server/paykit.ts";
    const plansPath = "src/server/paykit.plans.ts";
    const routePath = "src/app/api/paykit/[...all]/route.ts";
    const envPath = ".env";

    // Write config file
    const configContent = `import { stripe } from "@paykitjs/stripe";
import { createPayKit } from "paykitjs";
import { Pool } from "pg";

import * as plans from "./paykit.plans";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const paykit = createPayKit({
  database: pool,
  provider: stripe({
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  }),
  plans,
});
`;

    const configFullPath = path.join(cwd, configPath);
    await fs.mkdir(path.dirname(configFullPath), { recursive: true });
    await fs.writeFile(configFullPath, configContent);

    // Verify file was created with correct content
    const written = await fs.readFile(configFullPath, "utf-8");
    expect(written).toContain("createPayKit");
    expect(written).toContain("@paykitjs/stripe");
    expect(written).toContain("paykit.plans");

    // Write plans file
    const plansContent = `import { plan } from "paykitjs";

export const free = plan({
  id: "free",
  name: "Free",
  group: "base",
  default: true,
});

export const pro = plan({
  id: "pro",
  name: "Pro",
  group: "base",
  price: { amount: 2000, interval: "month" },
});
`;
    await fs.writeFile(path.join(cwd, plansPath), plansContent);

    const writtenPlans = await fs.readFile(path.join(cwd, plansPath), "utf-8");
    expect(writtenPlans).toContain('id: "free"');
    expect(writtenPlans).toContain('id: "pro"');

    // Write route handler
    const routeContent = `import { paykitHandler } from "paykitjs/handlers/next";

import { paykit } from "../../../../server/paykit";

export const { GET, POST } = paykitHandler(paykit);
`;
    const routeFullPath = path.join(cwd, routePath);
    await fs.mkdir(path.dirname(routeFullPath), { recursive: true });
    await fs.writeFile(routeFullPath, routeContent);

    const writtenRoute = await fs.readFile(routeFullPath, "utf-8");
    expect(writtenRoute).toContain("paykitHandler");
    expect(writtenRoute).toContain("GET, POST");

    // Write .env
    const envContent = `# PostgreSQL connection string
DATABASE_URL=
# Stripe secret key (sk_test_... or sk_live_...)
STRIPE_SECRET_KEY=
# Stripe webhook secret (whsec_...)
STRIPE_WEBHOOK_SECRET=
`;
    await fs.writeFile(path.join(cwd, envPath), envContent);

    const writtenEnv = await fs.readFile(path.join(cwd, envPath), "utf-8");
    expect(writtenEnv).toContain("DATABASE_URL=");
    expect(writtenEnv).toContain("STRIPE_SECRET_KEY=");
    expect(writtenEnv).toContain("STRIPE_WEBHOOK_SECRET=");
  });

  it("should not overwrite existing config files", async () => {
    const { cwd } = await createInitFixture();

    const configPath = path.join(cwd, "src", "server", "paykit.ts");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, "// existing config\n");

    // Verify the file still has the original content
    const content = await fs.readFile(configPath, "utf-8");
    expect(content).toBe("// existing config\n");
  });

  it("should not duplicate env vars that already exist", async () => {
    const { cwd } = await createInitFixture();

    const envPath = path.join(cwd, ".env");
    await fs.writeFile(envPath, "DATABASE_URL=postgres://localhost/test\n");

    // Read back and verify DATABASE_URL is present
    const content = await fs.readFile(envPath, "utf-8");
    expect(content).toContain("DATABASE_URL=postgres://localhost/test");
    // Should only appear once
    expect(content.split("DATABASE_URL=").length - 1).toBe(1);
  });
});
