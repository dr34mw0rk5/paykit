import * as z from "zod";

import { returnUrl } from "../api/define-route";
import type { PayKitSubscribeResult } from "../types/instance";
import type { StoredSubscription } from "../types/models";

export const subscribeBodySchema = z.object({
  planId: z.string(),
  forceCheckout: z.boolean().optional(),
  successUrl: returnUrl(),
  cancelUrl: returnUrl().optional(),
});

export type SubscribeBody = z.infer<typeof subscribeBodySchema>;

export type SubscribeInput = SubscribeBody & {
  customerId: string;
};

export type SubscribeResult = PayKitSubscribeResult;

export interface SubscriptionWithCatalog extends StoredSubscription {
  planId: string;
  planGroup: string;
  planIsDefault: boolean;
  planName: string;
  priceAmount: number | null;
  priceInterval: string | null;
  providerPriceId: string | null;
}
