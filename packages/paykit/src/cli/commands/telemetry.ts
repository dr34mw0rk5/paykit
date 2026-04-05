import * as p from "@clack/prompts";
import { Command } from "commander";

import { setEnabled } from "../utils/telemetry";

export const telemetryCommand = new Command("telemetry")
  .description("Manage anonymous telemetry")
  .addCommand(
    new Command("enable").description("Enable anonymous telemetry").action(() => {
      setEnabled(true);
      p.log.success("Telemetry enabled");
    }),
  )
  .addCommand(
    new Command("disable").description("Disable anonymous telemetry").action(() => {
      setEnabled(false);
      p.log.success("Telemetry disabled");
    }),
  )
  .addCommand(
    new Command("status").description("Check telemetry status").action(() => {
      const isDisabled =
        process.env.PAYKIT_TELEMETRY_DISABLED === "1" || process.env.DO_NOT_TRACK === "1";

      if (isDisabled) {
        p.log.info("Telemetry is disabled (via environment variable)");
      } else {
        // Read config to check file-based setting
        // Import dynamically to avoid circular deps if needed
        p.log.info("Run `paykitjs telemetry disable` to opt out");
      }
    }),
  );
