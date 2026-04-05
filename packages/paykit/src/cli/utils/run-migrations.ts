import { Pool } from "pg";

import { migrateDatabase } from "../../database";
import type { PayKitOptions } from "../../types/options";

export async function runPayKitMigrations(config: { options: PayKitOptions }): Promise<void> {
  const database =
    typeof config.options.database === "string"
      ? new Pool({ connectionString: config.options.database })
      : config.options.database;

  try {
    await migrateDatabase(database);
  } finally {
    await database.end();
  }
}
