import type { AmortisationRow } from "./types";

export interface RollForwardRow {
  entity: string;
  openingRou: number;
  additionsRou: number;
  depreciationRou: number;
  closingRou: number;
  openingLiability: number;
  additionsLiability: number;
  interestLiability: number;
  paymentsLiability: number;
  closingLiability: number;
}

/**
 * Build a roll-forward summary for a single lease between two dates.
 * periodStart and periodEnd are ISO date strings (YYYY-MM-DD).
 */
export function buildRollForward(
  entity: string,
  rows: AmortisationRow[],
  initialRou: number,
  initialLiability: number,
  periodStart: string,
  periodEnd: string,
  commencementDate: string
): RollForwardRow {
  const inPeriod = rows.filter(
    (r) => r.date >= periodStart && r.date <= periodEnd
  );

  // Rows before period start (to determine opening balances)
  const beforePeriod = rows.filter((r) => r.date < periodStart);

  const openingRou =
    beforePeriod.length === 0
      ? commencementDate >= periodStart
        ? 0
        : initialRou
      : beforePeriod[beforePeriod.length - 1].closingRouValue;

  const openingLiability =
    beforePeriod.length === 0
      ? commencementDate >= periodStart
        ? 0
        : initialLiability
      : beforePeriod[beforePeriod.length - 1].closingLiability;

  // Additions: if commencement is within the period
  const additionsRou =
    commencementDate >= periodStart && commencementDate <= periodEnd
      ? initialRou
      : 0;
  const additionsLiability =
    commencementDate >= periodStart && commencementDate <= periodEnd
      ? initialLiability
      : 0;

  const depreciationRou = inPeriod.reduce(
    (sum, r) => sum + r.rouDepreciation,
    0
  );
  const interestLiability = inPeriod.reduce(
    (sum, r) => sum + r.interestCharge,
    0
  );
  const paymentsLiability = inPeriod.reduce((sum, r) => sum + r.payment, 0);

  const closingRou =
    inPeriod.length > 0
      ? inPeriod[inPeriod.length - 1].closingRouValue
      : openingRou;
  const closingLiability =
    inPeriod.length > 0
      ? inPeriod[inPeriod.length - 1].closingLiability
      : openingLiability;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    entity,
    openingRou: round2(openingRou),
    additionsRou: round2(additionsRou),
    depreciationRou: round2(depreciationRou),
    closingRou: round2(closingRou),
    openingLiability: round2(openingLiability),
    additionsLiability: round2(additionsLiability),
    interestLiability: round2(interestLiability),
    paymentsLiability: round2(paymentsLiability),
    closingLiability: round2(closingLiability),
  };
}
