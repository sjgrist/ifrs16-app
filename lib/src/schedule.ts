import type { LeaseInput, ScheduleResult, AmortisationRow } from "./types";
import { presentValue, periodicRate, paymentsPerYear } from "./pv";

const ROUNDING_TOLERANCE = 0.01;

/** Add months to a date, returning ISO date string. */
function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  // Snap to end of month if original was end of month
  return d.toISOString().slice(0, 10);
}

/** Round to 2 decimal places for display; carry full precision internally. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate the initial ROU asset value per IFRS 16.24:
 *   Initial measurement of lease liability
 *   + initial direct costs
 *   + prepaid lease payments (payments made at or before commencement)
 *   - lease incentives received
 */
function initialRou(
  liability: number,
  directCosts: number,
  prepaid: number,
  incentives: number
): number {
  return liability + directCosts + prepaid - incentives;
}

/**
 * Build the full monthly amortisation schedule for a lease.
 *
 * The liability is amortised monthly using the effective interest method
 * regardless of payment frequency (payments are modelled as lump sums in
 * the month they fall due).
 */
export function buildSchedule(input: LeaseInput): ScheduleResult {
  const {
    commencementDate,
    termMonths,
    paymentAmount,
    paymentFrequency,
    paymentTiming,
    annualDiscountRate,
    initialDirectCosts,
    leaseIncentivesReceivable,
    prepaidPayments,
    rentFreeMonths,
    residualValueGuarantee,
  } = input;

  // Step 1: Initial liability = PV of future lease payments
  const initialLiability = presentValue({
    paymentAmount,
    paymentFrequency,
    paymentTiming,
    termMonths,
    annualDiscountRate,
    rentFreeMonths,
  });

  // Add PV of residual value guarantee if any
  const monthlyRate = Math.pow(1 + annualDiscountRate, 1 / 12) - 1;
  const rvgPV =
    residualValueGuarantee > 0
      ? residualValueGuarantee / Math.pow(1 + monthlyRate, termMonths)
      : 0;

  const totalInitialLiability = initialLiability + rvgPV;

  // Step 2: Initial ROU asset
  const rou = initialRou(
    totalInitialLiability,
    initialDirectCosts,
    prepaidPayments,
    leaseIncentivesReceivable
  );

  // Step 3: Build monthly amortisation table
  const freq = paymentsPerYear(paymentFrequency);
  // Months between payments
  const paymentIntervalMonths = Math.round(12 / freq);

  // Payment months relative to commencement (0 = commencement month)
  const paymentMonths = new Set<number>();
  for (let p = 0; p < termMonths / paymentIntervalMonths + 1; p++) {
    const monthOffset =
      paymentTiming === "advance"
        ? p * paymentIntervalMonths
        : (p + 1) * paymentIntervalMonths;
    // Advance: last payment at termMonths-interval (not termMonths itself)
    const limit = paymentTiming === "advance" ? termMonths - paymentIntervalMonths : termMonths;
    if (monthOffset <= limit) {
      paymentMonths.add(monthOffset);
    }
  }

  // Rent-free: no cash payment during first rentFreeMonths
  const rentFreeEndMonth = rentFreeMonths;

  const rows: AmortisationRow[] = [];
  // For advance payments, the first payment occurs at t=0 (commencement).
  // The schedule loop starts at month 1, so opening balance = liability - first payment.
  let liabilityBalance =
    paymentTiming === "advance" && rentFreeMonths === 0
      ? totalInitialLiability - paymentAmount
      : totalInitialLiability;
  let rouBalance = rou;
  const rouDepreciationPerMonth = rou / termMonths;

  for (let m = 1; m <= termMonths; m++) {
    const openingLiability = liabilityBalance;
    const interest = openingLiability * monthlyRate;
    const date = addMonths(commencementDate, m);

    // Cash payment this month?
    const isRentFree = m <= rentFreeEndMonth;
    const hasCashPayment = paymentMonths.has(m) && !isRentFree;
    const cashPayment = hasCashPayment ? paymentAmount : 0;

    // Closing liability (pre-rounding for internal carry)
    const closingLiability = openingLiability + interest - cashPayment;

    // ROU depreciation (straight-line over term)
    const rouDep = rouDepreciationPerMonth;
    const closingRou = rouBalance - rouDep;

    rows.push({
      period: m,
      date,
      openingLiability: r2(openingLiability),
      interestCharge: r2(interest),
      payment: r2(cashPayment),
      closingLiability: r2(Math.max(0, closingLiability)),
      rouDepreciation: r2(rouDep),
      closingRouValue: r2(Math.max(0, closingRou)),
      totalPLCharge: r2(interest + rouDep),
    });

    liabilityBalance = closingLiability;
    rouBalance = closingRou;
  }

  // Add residual value guarantee payment in final month if applicable
  if (residualValueGuarantee > 0 && rows.length > 0) {
    const last = rows[rows.length - 1];
    last.payment = r2(last.payment + residualValueGuarantee);
    last.closingLiability = r2(
      last.closingLiability - residualValueGuarantee
    );
  }

  const finalLiability = liabilityBalance;
  const footingError = Math.abs(finalLiability);
  const foots = footingError <= ROUNDING_TOLERANCE;

  return {
    initialLiability: r2(totalInitialLiability),
    initialRou: r2(rou),
    rows,
    foots,
    footingError: r2(footingError),
  };
}
