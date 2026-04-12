import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PayKitContext } from "../../core/context";
import type { Customer } from "../../types/models";
import {
  getCustomerWithDetails,
  listCustomers,
  syncCustomerWithDefaults,
} from "../customer.service";

function createCustomerRow(overrides: Partial<Customer> = {}): Customer {
  const now = new Date("2024-01-01T00:00:00.000Z");

  return {
    createdAt: now,
    deletedAt: null,
    email: null,
    id: "customer_123",
    metadata: null,
    name: null,
    provider: {},
    updatedAt: now,
    ...overrides,
  };
}

function createUpdateChain(result: unknown) {
  const returning = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  return { returning, set, where };
}

const createSelectChain = (result: unknown, terminalMethod: "orderBy" | "where") => {
  const chain: Record<string, unknown> = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where =
    terminalMethod === "where" ? vi.fn().mockResolvedValue(result) : vi.fn().mockReturnValue(chain);
  chain.orderBy = terminalMethod === "orderBy" ? vi.fn().mockResolvedValue(result) : vi.fn();

  return chain;
};

describe("customer/service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provisions and stores a provider customer during testing-mode sync", async () => {
    const syncedCustomer = createCustomerRow({
      email: "test@example.com",
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    });
    const syncUpdate = createUpdateChain([syncedCustomer]);
    const providerUpdate = createUpdateChain(undefined);
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(createCustomerRow())
      .mockResolvedValueOnce(syncedCustomer)
      .mockResolvedValueOnce(syncedCustomer);
    const stripe = {
      advanceTestClock: vi.fn(),
      attachPaymentMethod: vi.fn(),
      cancelSubscription: vi.fn(),
      createInvoice: vi.fn(),
      createPortalSession: vi.fn(),
      createSubscription: vi.fn(),
      createSubscriptionCheckout: vi.fn(),
      deleteCustomer: vi.fn(),
      detachPaymentMethod: vi.fn(),
      getTestClock: vi.fn(),
      handleWebhook: vi.fn(),
      listActiveSubscriptions: vi.fn(),
      resumeSubscription: vi.fn(),
      scheduleSubscriptionChange: vi.fn(),
      syncProduct: vi.fn(),
      updateSubscription: vi.fn(),
      upsertCustomer: vi.fn().mockResolvedValue({
        providerCustomer: {
          frozenTime: "2024-01-01T00:00:00.000Z",
          id: "cus_123",
          testClockId: "clock_123",
        },
      }),
    };
    const ctx = {
      database: {
        query: {
          customer: {
            findFirst,
          },
        },
        update: vi
          .fn()
          .mockReturnValueOnce({ set: syncUpdate.set })
          .mockReturnValueOnce({ set: providerUpdate.set }),
      },
      logger: {
        warn: vi.fn(),
      },
      options: {
        provider: {
          id: "stripe",
          kind: "stripe",
          secretKey: "sk_test_123",
          webhookSecret: "whsec_123",
        },
        testing: { enabled: true },
      },
      plans: { plans: [] },
      provider: {
        id: "stripe",
        kind: "stripe",
        secretKey: "sk_test_123",
        webhookSecret: "whsec_123",
      },
      stripe,
    } as unknown as PayKitContext;

    const customer = await syncCustomerWithDefaults(ctx, {
      email: "test@example.com",
      id: "customer_123",
    });

    expect(customer).toEqual(syncedCustomer);
    expect(stripe.upsertCustomer).toHaveBeenCalledWith({
      createTestClock: true,
      email: "test@example.com",
      id: "customer_123",
      metadata: undefined,
      name: undefined,
    });
    expect(providerUpdate.set).toHaveBeenCalledWith({
      provider: {
        stripe: {
          frozenTime: expect.any(String),
          id: "cus_123",
          testClockId: "clock_123",
        },
      },
      updatedAt: expect.any(Date),
    });
  });

  it("aggregates stacked feature entitlements when loading a customer", async () => {
    const subSelect = createSelectChain(
      [
        {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2024-02-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2024-01-01T00:00:00.000Z"),
          planGroup: "default",
          planId: "pro",
          status: "active",
        },
      ],
      "orderBy",
    );
    const entSelect = createSelectChain(
      [
        {
          balance: 3,
          featureId: "feature_api_calls",
          limit: 5,
          nextResetAt: new Date("2024-02-01T00:00:00.000Z"),
        },
        {
          balance: 4,
          featureId: "feature_api_calls",
          limit: 10,
          nextResetAt: new Date("2024-01-15T00:00:00.000Z"),
        },
      ],
      "where",
    );
    const ctx = {
      database: {
        query: {
          customer: {
            findFirst: vi.fn().mockResolvedValue(createCustomerRow()),
          },
        },
        select: vi.fn().mockReturnValueOnce(subSelect).mockReturnValueOnce(entSelect),
      },
      logger: {
        warn: vi.fn(),
      },
    } as unknown as PayKitContext;

    const customer = await getCustomerWithDetails(ctx, "customer_123");

    expect(customer?.entitlements.feature_api_calls).toEqual({
      balance: 7,
      featureId: "feature_api_calls",
      limit: 15,
      nextResetAt: new Date("2024-01-15T00:00:00.000Z"),
      unlimited: false,
      usage: 8,
    });
  });

  it("aggregates stacked feature entitlements when listing customers", async () => {
    const countSelect = createSelectChain([{ count: 1 }], "where");
    const subSelect = createSelectChain(
      [
        {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date("2024-02-01T00:00:00.000Z"),
          currentPeriodStart: new Date("2024-01-01T00:00:00.000Z"),
          customerId: "customer_123",
          planId: "pro",
          status: "active",
        },
      ],
      "orderBy",
    );
    const entSelect = createSelectChain(
      [
        {
          balance: 2,
          customerId: "customer_123",
          featureId: "feature_api_calls",
          limit: 4,
          nextResetAt: new Date("2024-03-01T00:00:00.000Z"),
        },
        {
          balance: 5,
          customerId: "customer_123",
          featureId: "feature_api_calls",
          limit: 6,
          nextResetAt: new Date("2024-02-15T00:00:00.000Z"),
        },
      ],
      "where",
    );
    const customerRow = createCustomerRow();
    const ctx = {
      database: {
        query: {
          customer: {
            findMany: vi.fn().mockResolvedValue([customerRow]),
          },
        },
        select: vi
          .fn()
          .mockReturnValueOnce(countSelect)
          .mockReturnValueOnce(subSelect)
          .mockReturnValueOnce(entSelect),
      },
    } as unknown as PayKitContext;

    const result = await listCustomers(ctx);

    expect(result.data[0]?.entitlements.feature_api_calls).toEqual({
      balance: 7,
      featureId: "feature_api_calls",
      limit: 10,
      nextResetAt: new Date("2024-02-15T00:00:00.000Z"),
      unlimited: false,
      usage: 3,
    });
  });
});
