import { describe, it, expect } from "vitest";
import { presentValue, periodicRate, paymentsPerYear } from "../src/pv";

describe("paymentsPerYear", () => {
  it("monthly = 12", () => expect(paymentsPerYear("monthly")).toBe(12));
  it("quarterly = 4", () => expect(paymentsPerYear("quarterly")).toBe(4));
  it("annual = 1", () => expect(paymentsPerYear("annual")).toBe(1));
});

describe("periodicRate", () => {
  it("monthly effective rate from 5% annual", () => {
    const r = periodicRate(0.05, "monthly");
    expect(r).toBeCloseTo(0.004074, 5);
  });
  it("annual rate at annual frequency = annual rate", () => {
    const r = periodicRate(0.05, "annual");
    expect(r).toBeCloseTo(0.05, 6);
  });
});

describe("presentValue – arrears", () => {
  it("simple 12-month monthly annuity in arrears at 5%", () => {
    const pv = presentValue({
      paymentAmount: 1000,
      paymentFrequency: "monthly",
      paymentTiming: "arrears",
      termMonths: 12,
      annualDiscountRate: 0.05,
    });
    // Standard annuity: 1000 * [1-(1.004074)^-12]/0.004074 ≈ 11,680
    expect(pv).toBeGreaterThan(11600);
    expect(pv).toBeLessThan(11800);
  });

  it("zero rate – PV equals sum of payments", () => {
    const pv = presentValue({
      paymentAmount: 1000,
      paymentFrequency: "monthly",
      paymentTiming: "arrears",
      termMonths: 12,
      annualDiscountRate: 0,
    });
    expect(pv).toBeCloseTo(12000, 0);
  });

  it("quarterly payments in arrears", () => {
    const pv = presentValue({
      paymentAmount: 3000,
      paymentFrequency: "quarterly",
      paymentTiming: "arrears",
      termMonths: 12,
      annualDiscountRate: 0.06,
    });
    // 4 quarterly payments at ~1.47% per quarter
    expect(pv).toBeGreaterThan(11000);
    expect(pv).toBeLessThan(12000);
  });

  it("annual payment in arrears", () => {
    const pv = presentValue({
      paymentAmount: 12000,
      paymentFrequency: "annual",
      paymentTiming: "arrears",
      termMonths: 36,
      annualDiscountRate: 0.05,
    });
    // PV of 3 annual payments of 12000 at 5%
    const expected =
      12000 / 1.05 + 12000 / 1.05 ** 2 + 12000 / 1.05 ** 3;
    expect(pv).toBeCloseTo(expected, 1);
  });
});

describe("presentValue – advance", () => {
  it("monthly annuity due is greater than ordinary annuity", () => {
    const arrears = presentValue({
      paymentAmount: 1000,
      paymentFrequency: "monthly",
      paymentTiming: "arrears",
      termMonths: 24,
      annualDiscountRate: 0.05,
    });
    const advance = presentValue({
      paymentAmount: 1000,
      paymentFrequency: "monthly",
      paymentTiming: "advance",
      termMonths: 24,
      annualDiscountRate: 0.05,
    });
    expect(advance).toBeGreaterThan(arrears);
  });

  it("zero rate advance – PV equals sum of payments", () => {
    const pv = presentValue({
      paymentAmount: 500,
      paymentFrequency: "monthly",
      paymentTiming: "advance",
      termMonths: 12,
      annualDiscountRate: 0,
    });
    expect(pv).toBeCloseTo(6000, 0);
  });
});

describe("presentValue – rent-free", () => {
  it("3-month rent-free reduces PV vs no rent-free", () => {
    const base = presentValue({
      paymentAmount: 1000,
      paymentFrequency: "monthly",
      paymentTiming: "arrears",
      termMonths: 12,
      annualDiscountRate: 0.05,
    });
    const withFree = presentValue({
      paymentAmount: 1000,
      paymentFrequency: "monthly",
      paymentTiming: "arrears",
      termMonths: 12,
      annualDiscountRate: 0.05,
      rentFreeMonths: 3,
    });
    expect(withFree).toBeLessThan(base);
    expect(base - withFree).toBeGreaterThan(2900);
  });
});
