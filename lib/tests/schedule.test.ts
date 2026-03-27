import { describe, it, expect } from "vitest";
import { buildSchedule } from "../src/schedule";
import type { LeaseInput } from "../src/types";

const baseInput: LeaseInput = {
  commencementDate: "2024-01-01",
  termMonths: 12,
  paymentAmount: 1000,
  paymentFrequency: "monthly",
  paymentTiming: "arrears",
  annualDiscountRate: 0.05,
  initialDirectCosts: 0,
  leaseIncentivesReceivable: 0,
  prepaidPayments: 0,
  rentFreeMonths: 0,
  residualValueGuarantee: 0,
};

describe("buildSchedule – footing", () => {
  it("monthly arrears schedule foots to zero", () => {
    const result = buildSchedule(baseInput);
    expect(result.foots).toBe(true);
    expect(result.footingError).toBeLessThanOrEqual(0.01);
  });

  it("monthly advance schedule foots to zero", () => {
    const result = buildSchedule({ ...baseInput, paymentTiming: "advance" });
    expect(result.foots).toBe(true);
  });

  it("quarterly arrears 24-month schedule foots", () => {
    const result = buildSchedule({
      ...baseInput,
      termMonths: 24,
      paymentFrequency: "quarterly",
      paymentAmount: 3000,
    });
    expect(result.foots).toBe(true);
  });

  it("annual payments 36-month schedule foots", () => {
    const result = buildSchedule({
      ...baseInput,
      termMonths: 36,
      paymentFrequency: "annual",
      paymentAmount: 12000,
    });
    expect(result.foots).toBe(true);
  });

  it("60-month monthly with IDC foots", () => {
    const result = buildSchedule({
      ...baseInput,
      termMonths: 60,
      paymentAmount: 2000,
      initialDirectCosts: 5000,
      annualDiscountRate: 0.04,
    });
    expect(result.foots).toBe(true);
  });
});

describe("buildSchedule – initial measurement", () => {
  it("initial ROU includes direct costs", () => {
    const withCosts = buildSchedule({
      ...baseInput,
      initialDirectCosts: 1000,
    });
    const withoutCosts = buildSchedule(baseInput);
    expect(withCosts.initialRou - withoutCosts.initialRou).toBeCloseTo(
      1000,
      1
    );
  });

  it("initial ROU reduced by lease incentives", () => {
    const withIncentive = buildSchedule({
      ...baseInput,
      leaseIncentivesReceivable: 500,
    });
    const base = buildSchedule(baseInput);
    expect(base.initialRou - withIncentive.initialRou).toBeCloseTo(500, 1);
  });

  it("ROU = liability when no adjustments", () => {
    const result = buildSchedule(baseInput);
    expect(result.initialRou).toBeCloseTo(result.initialLiability, 0);
  });
});

describe("buildSchedule – rows", () => {
  it("has correct number of rows", () => {
    const result = buildSchedule({ ...baseInput, termMonths: 24 });
    expect(result.rows).toHaveLength(24);
  });

  it("opening liability of row 1 equals initial liability", () => {
    const result = buildSchedule(baseInput);
    expect(result.rows[0].openingLiability).toBeCloseTo(
      result.initialLiability,
      1
    );
  });

  it("each row: closing = opening + interest - payment", () => {
    const result = buildSchedule({ ...baseInput, termMonths: 24 });
    for (const row of result.rows) {
      const computed = row.openingLiability + row.interestCharge - row.payment;
      expect(Math.abs(computed - row.closingLiability)).toBeLessThanOrEqual(
        0.02
      );
    }
  });

  it("ROU depreciation is constant (straight-line)", () => {
    const result = buildSchedule({ ...baseInput, termMonths: 24 });
    const dep = result.rows[0].rouDepreciation;
    for (const row of result.rows) {
      expect(row.rouDepreciation).toBeCloseTo(dep, 1);
    }
  });

  it("total P&L = interest + depreciation", () => {
    const result = buildSchedule({ ...baseInput, termMonths: 12 });
    for (const row of result.rows) {
      expect(row.totalPLCharge).toBeCloseTo(
        row.interestCharge + row.rouDepreciation,
        1
      );
    }
  });
});

describe("buildSchedule – rent-free periods", () => {
  it("no cash payment in rent-free months", () => {
    const result = buildSchedule({ ...baseInput, termMonths: 24, rentFreeMonths: 3 });
    for (let i = 0; i < 3; i++) {
      // month i+1 is arrears so payment would normally fall at month 1,2,3
      expect(result.rows[i].payment).toBe(0);
    }
  });
});
