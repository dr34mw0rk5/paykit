import path from "node:path";

import * as p from "@clack/prompts";
import { Command } from "commander";
import picocolors from "picocolors";

import {
  checkProvider,
  createPool,
  formatProductDiffs,
  loadCliDeps,
  loadProductDiffs,
} from "../utils/shared";
import { printUpdateNotification, startUpdateCheck } from "../utils/update-check";

async function pushAction(options: { config?: string; cwd: string; yes?: boolean }): Promise<void> {
  const cwd = path.resolve(options.cwd);
  const s = p.spinner();

  const updateCheck = startUpdateCheck();
  s.start("Connecting");

  const deps = await loadCliDeps();

  deps.capture("cli_command", { command: "push" });

  const pm = deps.detectPackageManager(cwd);
  const config = await deps.getPayKitConfig({ configPath: options.config, cwd });
  const database = createPool(deps, config.options.database);

  try {
    if (!config.options.provider) {
      s.stop("");
      p.log.error(`Config\n  ${picocolors.red("✖")} No provider configured`);
      p.cancel("Push failed");
      process.exit(1);
    }

    const connStr = deps.getConnectionString(database as never);
    const [providerResult, pendingMigrations] = await Promise.all([
      checkProvider(config.options.provider),
      deps.getPendingMigrationCount(database),
    ]);

    if (!providerResult.account.ok) {
      s.stop("");
      p.log.error(`Provider\n  ${picocolors.red("✖")} ${providerResult.account.message}`);
      p.cancel("Push failed");
      process.exit(1);
    }

    // Apply pending migrations before checking products
    if (pendingMigrations > 0) {
      s.message("Applying migrations");
      await deps.migrateDatabase(database);
    }

    // Dry-run product sync
    s.message("Checking products");
    const { ctx, diffs } = await loadProductDiffs(config, deps);
    const hasChanges = diffs.some((d) => d.action !== "unchanged");

    s.stop("");

    // Render all sections
    const migrationStatus =
      pendingMigrations > 0
        ? `${picocolors.green("✔")} Migrated (${String(pendingMigrations)} applied)`
        : `${picocolors.green("✔")} Schema up to date`;

    p.log.info(`Database\n  ${picocolors.green("✔")} ${connStr}\n  ${migrationStatus}`);

    p.log.info(
      `Provider\n  ${picocolors.green("✔")} ${providerResult.account.displayName} (${providerResult.account.mode})`,
    );

    if (diffs.length > 0) {
      const planLines = formatProductDiffs(diffs, ctx.plans.plans, deps);
      p.log.info(`Products\n${planLines.join("\n")}`);
    }

    if (!hasChanges && pendingMigrations === 0) {
      p.outro("Nothing to do");
      await printUpdateNotification(updateCheck, deps.getInstallCommand(pm, ["paykitjs@latest"]));
      return;
    }

    if (pendingMigrations > 0 && !hasChanges) {
      p.outro("Done");
      await printUpdateNotification(updateCheck, deps.getInstallCommand(pm, ["paykitjs@latest"]));
      return;
    }

    // Confirmation prompt
    const changeCount = diffs.filter((d) => d.action !== "unchanged").length;
    if (!options.yes) {
      const shouldContinue = await p.confirm({
        message: `Push ${String(changeCount)} product change${changeCount === 1 ? "" : "s"}?`,
      });
      if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.cancel("Aborted");
        process.exit(0);
      }
    }

    // Execute product sync
    const results = await deps.syncProducts(ctx);
    const syncedCount = results.filter((r) => r.action !== "unchanged").length;

    p.outro(
      `Done ${picocolors.dim("·")} synced ${String(syncedCount)} product${syncedCount === 1 ? "" : "s"}`,
    );
    await printUpdateNotification(updateCheck, deps.getInstallCommand(pm, ["paykitjs@latest"]));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(message);
    p.cancel("Push failed");
    process.exit(1);
  } finally {
    await database.end();
  }
}

export const pushCommand = new Command("push")
  .description("Apply migrations and sync products to database and payment provider")
  .option(
    "-c, --cwd <cwd>",
    "the working directory. defaults to the current directory.",
    process.cwd(),
  )
  .option("--config <config>", "the path to the PayKit configuration file to load.")
  .option("-y, --yes", "skip confirmation prompt")
  .action(pushAction);
