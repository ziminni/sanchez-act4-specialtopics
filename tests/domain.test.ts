import { describe, it, expect } from "vitest";
import {
  allocate,
  centavos,
  aging,
  rolePermissions,
  manilaDateWindow,
  manilaDate,
} from "../source/shared/domain";
describe("Financial domain acceptance rules", () => {
  it("AT-01 exact payment conserves value", () =>
    expect(allocate(99900, [{ id: 1, balance: 99900 }])).toEqual({
      allocations: [{ invoiceId: 1, amount: 99900 }],
      credit: 0,
    }));
  it("AT-02 partial payment leaves 499 pesos", () => {
    const r = allocate(50000, [{ id: 1, balance: 99900 }]);
    expect(99900 - r.allocations[0].amount).toBe(49900);
  });
  it("AT-03 advance payment retains 2000 pesos", () =>
    expect(allocate(300000, [{ id: 1, balance: 100000 }]).credit).toBe(200000));
  it("AT-04 oldest first leaves September 798 pesos", () => {
    const r = allocate(120000, [
      { id: 1, balance: 99900 },
      { id: 2, balance: 99900 },
    ]);
    expect(r.allocations).toEqual([
      { invoiceId: 1, amount: 99900 },
      { invoiceId: 2, amount: 20100 },
    ]);
    expect(99900 - r.allocations[1].amount).toBe(79800);
  });
  it("parses money without floating point multiplication", () => {
    expect(centavos("999.99")).toBe(99999);
    expect(centavos("0.29")).toBe(29);
    expect(() => centavos("1.001")).toThrow();
    expect(() => centavos("-1")).toThrow();
    expect(() => centavos("1e3")).toThrow();
  });
  it("preserves value across random allocations", () => {
    for (let n = 1; n < 1000; n++) {
      const amount = n * 731;
      const r = allocate(amount, [
        { id: 1, balance: 99900 },
        { id: 2, balance: 123456 },
        { id: 3, balance: 40000 },
      ]);
      expect(
        r.credit + r.allocations.reduce((sum, a) => sum + a.amount, 0),
      ).toBe(amount);
      expect(r.credit).toBeGreaterThanOrEqual(0);
    }
  });
  it("aging boundaries are mutually exclusive", () => {
    expect(aging("2026-10-05", "2026-10-05")).toBe("Current");
    expect(aging("2026-10-04", "2026-10-05")).toBe("1–30");
    expect(aging("2026-09-05", "2026-10-05")).toBe("1–30");
    expect(aging("2026-09-04", "2026-10-05")).toBe("31–60");
    expect(aging("2026-08-05", "2026-10-05")).toBe("61–90");
    expect(aging("2026-07-01", "2026-10-05")).toBe("90+");
  });
  it("AT-10 cashier has no admin permission", () => {
    expect(rolePermissions.Cashier).not.toContain("user.manage");
    expect(rolePermissions.Cashier).not.toContain("backup.restore");
    expect(rolePermissions.Cashier).not.toContain("*");
  });
});

it("Manila report windows include local midnight without shifting the date", () => {
  const window = manilaDateWindow("2026-10-09", "2026-10-09");
  expect(window.start).toBe(Date.parse("2026-10-08T16:00:00Z"));
  expect(window.end).toBe(Date.parse("2026-10-09T16:00:00Z"));
  expect(manilaDate(new Date("2026-10-08T16:00:00Z"))).toBe("2026-10-09");
});
