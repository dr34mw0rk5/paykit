export type {
  CustomerEntitlement,
  CustomerSubscription,
  CustomerWithDetails,
  ListCustomersResult,
} from "../customer/customer.types";
import type { PayKitContext } from "../core/context";
import type { CustomerWithDetails, ListCustomersResult } from "../customer/customer.types";
import type { CheckResult, ReportResult } from "../entitlement/entitlement.service";
import type { Customer } from "./models";
import type { PayKitOptions } from "./options";
import type { FeatureIdFromPlans, PlanIdFromPlans } from "./schema";

type PlanIdFromOptions<TOptions extends PayKitOptions> = [
  PlanIdFromPlans<TOptions["plans"]>,
] extends [never]
  ? string
  : PlanIdFromPlans<TOptions["plans"]>;

type FeatureIdFromOptions<TOptions extends PayKitOptions> = [
  FeatureIdFromPlans<TOptions["plans"]>,
] extends [never]
  ? string
  : FeatureIdFromPlans<TOptions["plans"]>;

export type PayKitClientSubscribeInput<TOptions extends PayKitOptions = PayKitOptions> = {
  planId: PlanIdFromOptions<TOptions>;
  successUrl?: string;
  cancelUrl?: string;
  forceCheckout?: boolean;
};

export type PayKitSubscribeInput<TOptions extends PayKitOptions = PayKitOptions> =
  PayKitClientSubscribeInput<TOptions> & {
    customerId: string;
    successUrl: string;
  };

export interface PayKitSubscribeResult {
  invoice?: {
    currency: string;
    hostedUrl: string | null;
    providerInvoiceId: string;
    status: string | null;
    totalAmount: number;
  };
  paymentUrl: string | null;
  requiredAction?: {
    clientSecret?: string;
    paymentIntentId?: string;
    type: string;
  } | null;
}

export interface PayKitCustomerInput {
  id: string;
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface PayKitClientCustomerPortalInput {
  returnUrl?: string;
}

export interface PayKitCustomerPortalInput extends PayKitClientCustomerPortalInput {
  customerId: string;
  returnUrl: string;
}

export interface PayKitListCustomersInput {
  limit?: number;
  offset?: number;
  planIds?: string[];
}

export type PayKitCheckInput<TOptions extends PayKitOptions = PayKitOptions> = {
  customerId: string;
  featureId: FeatureIdFromOptions<TOptions>;
  required?: number;
};

export type PayKitClientCheckInput<TOptions extends PayKitOptions = PayKitOptions> = Omit<
  PayKitCheckInput<TOptions>,
  "customerId"
>;

export type PayKitReportInput<TOptions extends PayKitOptions = PayKitOptions> = {
  customerId: string;
  featureId: FeatureIdFromOptions<TOptions>;
  amount?: number;
};

export type PayKitClientReportInput<TOptions extends PayKitOptions = PayKitOptions> = Omit<
  PayKitReportInput<TOptions>,
  "customerId"
>;

export interface PayKitWebhookInput {
  body: string;
  headers: Record<string, string>;
}

export declare const payKitClientApiBrand: unique symbol;

type PayKitMethod<TInput, TResult> = (input: TInput) => Promise<TResult>;

type PayKitClientMethod<TPath extends string, TInput, TResult> = ((
  input: TInput,
) => Promise<TResult>) & {
  path: TPath;
  options: unknown;
};

export interface PayKitClientApiCarrier<TClientApi> {
  readonly [payKitClientApiBrand]?: TClientApi;
}

export interface PayKitClientAPI<TOptions extends PayKitOptions = PayKitOptions> {
  subscribe: PayKitClientMethod<
    "/subscribe",
    PayKitClientSubscribeInput<TOptions>,
    PayKitSubscribeResult
  >;
  customerPortal: PayKitClientMethod<
    "/customer-portal",
    PayKitClientCustomerPortalInput,
    { url: string }
  >;
  check: PayKitClientMethod<"/check", PayKitClientCheckInput<TOptions>, CheckResult>;
  report: PayKitClientMethod<"/report", PayKitClientReportInput<TOptions>, ReportResult>;
}

export interface PayKitAPI<TOptions extends PayKitOptions = PayKitOptions> {
  subscribe: PayKitMethod<PayKitSubscribeInput<TOptions>, PayKitSubscribeResult>;
  customerPortal: PayKitMethod<PayKitCustomerPortalInput, { url: string }>;
  upsertCustomer: PayKitMethod<PayKitCustomerInput, Customer>;
  getCustomer: PayKitMethod<{ id: string }, CustomerWithDetails | null>;
  deleteCustomer: PayKitMethod<{ id: string }, { success: true }>;
  listCustomers: PayKitMethod<PayKitListCustomersInput | undefined, ListCustomersResult>;
  check: PayKitMethod<PayKitCheckInput<TOptions>, CheckResult>;
  report: PayKitMethod<PayKitReportInput<TOptions>, ReportResult>;
  handleWebhook: PayKitMethod<PayKitWebhookInput, { received: true }>;
}

export interface PayKitInstance<TOptions extends PayKitOptions = PayKitOptions>
  extends PayKitAPI<TOptions>, PayKitClientApiCarrier<PayKitClientAPI<TOptions>> {
  options: TOptions;
  handler: (request: Request) => Promise<Response>;
  $context: Promise<PayKitContext>;
  $infer: {
    planId: PlanIdFromOptions<TOptions>;
    featureId: FeatureIdFromOptions<TOptions>;
  };
}
