import type { Charge, Customer, PaymentMethod } from "./models";

export interface CustomerIdentity {
  id: string;
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutInput<TProviderId extends string = string> {
  providerId: TProviderId;
  amount: number;
  description: string;
  successURL: string;
  cancelURL?: string;
  attachMethod?: boolean;
  metadata?: Record<string, string>;
}

export interface AttachPaymentMethodInput<TProviderId extends string = string> {
  providerId: TProviderId;
  returnURL: string;
}

export interface CreateChargeInput<TProviderId extends string = string> {
  providerId: TProviderId;
  paymentMethodId: string;
  amount: number;
  description: string;
  metadata?: Record<string, string>;
}

export interface RootCheckoutNamespace<TProviderId extends string = string> {
  create(
    input: CreateCheckoutInput<TProviderId> & { customerId: string },
  ): Promise<{ url: string }>;
}

export interface ScopedCheckoutNamespace<TProviderId extends string = string> {
  create(input: CreateCheckoutInput<TProviderId>): Promise<{ url: string }>;
}

export interface RootChargeNamespace<TProviderId extends string = string> {
  create(input: CreateChargeInput<TProviderId> & { customerId: string }): Promise<Charge>;
}

export interface ScopedChargeNamespace<TProviderId extends string = string> {
  create(input: CreateChargeInput<TProviderId>): Promise<Charge>;
}

export interface RootPaymentMethodNamespace<TProviderId extends string = string> {
  attach(
    input: AttachPaymentMethodInput<TProviderId> & { customerId: string },
  ): Promise<{ url: string }>;
  list(input: { customerId: string; providerId: TProviderId }): Promise<PaymentMethod[]>;
  setDefault(input: {
    customerId: string;
    providerId: TProviderId;
    paymentMethodId: string;
  }): Promise<void>;
  detach(input: { customerId: string; providerId: TProviderId; id: string }): Promise<void>;
}

export interface ScopedPaymentMethodNamespace<TProviderId extends string = string> {
  attach(input: AttachPaymentMethodInput<TProviderId>): Promise<{ url: string }>;
  list(input: { providerId: TProviderId }): Promise<PaymentMethod[]>;
  setDefault(input: { providerId: TProviderId; paymentMethodId: string }): Promise<void>;
  detach(input: { providerId: TProviderId; id: string }): Promise<void>;
}

export interface CustomerNamespace {
  sync(input: CustomerIdentity): Promise<Customer>;
  get(input: { id: string }): Promise<Customer | null>;
  delete(input: { id: string }): Promise<void>;
}

export interface ScopedPayKitInstance<TProviderId extends string = string> {
  charge: ScopedChargeNamespace<TProviderId>;
  checkout: ScopedCheckoutNamespace<TProviderId>;
  paymentMethod: ScopedPaymentMethodNamespace<TProviderId>;
}

export interface PayKitInstance<TProviderId extends string = string> {
  customer: CustomerNamespace;
  charge: RootChargeNamespace<TProviderId>;
  checkout: RootCheckoutNamespace<TProviderId>;
  paymentMethod: RootPaymentMethodNamespace<TProviderId>;
  handleWebhook(input: {
    providerId: TProviderId;
    body: string;
    headers: Record<string, string>;
  }): Promise<{ received: true }>;
  asCustomer(identity: CustomerIdentity): ScopedPayKitInstance<TProviderId>;
  $context: Promise<unknown>;
}
