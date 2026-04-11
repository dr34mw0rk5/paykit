import { describe, expect, it, vi } from "vitest";

import { reportEntitlement } from "../entitlement.service";

const mockExecute = (rows: unknown[]) => vi.fn().mockResolvedValue({ rows });

describe("entitlement/service", () => {
  it("deducts in a single CTE query when one row has enough balance", async () => {
    const execute = mockExecute([
      {
        hasUnlimited: false,
        totalBalance: 500,
        totalLimit: 500,
        rowCount: 1,
        earliestResetAt: new Date("2024-02-01"),
        deductedId: "ent_1",
        newBalance: 490,
      },
    ]);
    const transaction = vi.fn();
    const database = { execute, transaction } as never;

    const result = await reportEntitlement(database, {
      amount: 10,
      customerId: "customer_123",
      featureId: "messages",
      now: new Date("2024-01-15T00:00:00.000Z"),
    });

    expect(result.success).toBe(true);
    expect(result.balance!.remaining).toBe(490);
    expect(result.balance!.limit).toBe(500);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns success for unlimited features without deducting", async () => {
    const execute = mockExecute([
      {
        hasUnlimited: true,
        totalBalance: 0,
        totalLimit: 0,
        rowCount: 1,
        earliestResetAt: null,
        deductedId: null,
        newBalance: null,
      },
    ]);
    const transaction = vi.fn();
    const database = { execute, transaction } as never;

    const result = await reportEntitlement(database, {
      amount: 10,
      customerId: "customer_123",
      featureId: "messages",
    });

    expect(result.success).toBe(true);
    expect(result.balance!.unlimited).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("fails in a single query when balance is insufficient", async () => {
    const execute = mockExecute([
      {
        hasUnlimited: false,
        totalBalance: 5,
        totalLimit: 500,
        rowCount: 1,
        earliestResetAt: new Date("2024-02-01"),
        deductedId: null,
        newBalance: null,
      },
    ]);
    const transaction = vi.fn();
    const database = { execute, transaction } as never;

    const result = await reportEntitlement(database, {
      amount: 10,
      customerId: "customer_123",
      featureId: "messages",
    });

    expect(result.success).toBe(false);
    expect(result.balance!.remaining).toBe(5);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("falls back to stacked deduction when total suffices but no single row does", async () => {
    const rows = [
      {
        balance: 3,
        id: "ent_1",
        nextResetAt: new Date("2024-02-01"),
        originalLimit: 3,
        resetInterval: "month",
      },
      {
        balance: 4,
        id: "ent_2",
        nextResetAt: new Date("2024-02-01"),
        originalLimit: 4,
        resetInterval: "month",
      },
    ];

    const createSelectForUpdateChain = (result: unknown) => ({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              for: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      }),
    });
    const txMock = {
      select: vi
        .fn()
        .mockImplementation(() => createSelectForUpdateChain(rows.map((r) => ({ ...r })))),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    };
    const execute = mockExecute([
      {
        hasUnlimited: false,
        totalBalance: 7,
        totalLimit: 7,
        rowCount: 2,
        earliestResetAt: new Date("2024-02-01"),
        deductedId: null,
        newBalance: null,
      },
    ]);
    const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock));
    const database = { execute, transaction } as never;

    const result = await reportEntitlement(database, {
      amount: 5,
      customerId: "customer_123",
      featureId: "messages",
      now: new Date("2024-01-15T00:00:00.000Z"),
    });

    expect(result.success).toBe(true);
    expect(result.balance!.remaining).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txMock.select).toHaveBeenCalledTimes(1);
    expect(txMock.update).toHaveBeenCalledTimes(1);
  });
});
