import type { PVParams, PaymentFrequency } from "./types";

/** Number of payments per year for a given frequency */
export function paymentsPerYear(freq: PaymentFrequency): number {
  return freq === "monthly" ? 12 : freq === "quarterly" ? 4 : 1;
}

/** Periodic rate given annual rate and payment frequency */
export function periodicRate(
  annualRate: number,
  freq: PaymentFrequency
): number {
  const n = paymentsPerYear(freq);
  // Effective periodic rate from effective annual rate
  return Math.pow(1 + annualRate, 1 / n) - 1;
}

/**
 * Present value of an annuity.
 *
 * For payments-in-advance (annuity due): PV = PMT * [(1 - (1+r)^-n) / r] * (1+r)
 * For payments-in-arrears (ordinary annuity): PV = PMT * [(1 - (1+r)^-n) / r]
 *
 * Handles rent-free periods by excluding those payments from the PV.
 */
export function presentValue(params: PVParams): number {
  const {
    paymentAmount,
    paymentFrequency,
    paymentTiming,
    termMonths,
    annualDiscountRate,
    rentFreeMonths = 0,
  } = params;

  const freq = paymentsPerYear(paymentFrequency);
  // Convert term in months to number of payment periods
  const totalPeriods = Math.round((termMonths / 12) * freq);
  // Number of rent-free periods (round to nearest payment period)
  const freePeriods = Math.round((rentFreeMonths / 12) * freq);
  const r = periodicRate(annualDiscountRate, paymentFrequency);

  if (r === 0) {
    const payingPeriods = totalPeriods - freePeriods;
    return paymentAmount * payingPeriods;
  }

  let pv = 0;

  for (let i = 1; i <= totalPeriods; i++) {
    // In advance: first payment at t=0, then t=1..n-1
    // In arrears: payments at t=1..n
    const t = paymentTiming === "advance" ? i - 1 : i;

    // Skip rent-free periods (first freePeriods payment slots)
    const isRentFree =
      paymentTiming === "advance" ? t < freePeriods : t <= freePeriods;

    if (!isRentFree) {
      pv += paymentAmount / Math.pow(1 + r, t);
    }
  }

  return pv;
}
