import type { Customer } from "../types/models";

export interface CustomerSubscription {
  planId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

export interface CustomerEntitlement {
  featureId: string;
  balance: number;
  limit: number;
  usage: number;
  unlimited: boolean;
  nextResetAt: Date | null;
}

export interface CustomerWithDetails extends Customer {
  subscriptions: CustomerSubscription[];
  entitlements: Record<string, CustomerEntitlement>;
}

export interface ListCustomersResult {
  data: CustomerWithDetails[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}
