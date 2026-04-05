import type { Pool } from "pg";
import type { Logger } from "pino";

import type { StripeProviderConfig } from "../providers/provider";
import type { PayKitEventHandlers } from "./events";
import type { PayKitPlugin } from "./plugin";
import type { PayKitPlansModule } from "./schema";

export interface PayKitOptions {
  database: Pool | string;
  provider: StripeProviderConfig;
  plans?: PayKitPlansModule;
  basePath?: string;
  identify?: (request: Request) => Promise<{
    customerId: string;
    email?: string;
    name?: string;
  }>;
  on?: PayKitEventHandlers;
  plugins?: PayKitPlugin[];
  logger?: Logger;
}
