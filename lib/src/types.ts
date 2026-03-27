export type PaymentFrequency = "monthly" | "quarterly" | "annual";
export type PaymentTiming = "advance" | "arrears";
export type AssetClass = "property" | "vehicle" | "equipment" | "other";
export type LeaseStatus = "active" | "expired" | "modified";
export type Currency = "GBP" | "EUR" | "USD" | "SEK" | "NOK" | "DKK" | "CHF" | "other";

export interface LeaseInput {
  commencementDate: string; // ISO date YYYY-MM-DD
  termMonths: number;
  paymentAmount: number;
  paymentFrequency: PaymentFrequency;
  paymentTiming: PaymentTiming;
  annualDiscountRate: number; // e.g. 0.05 for 5%
  initialDirectCosts: number;
  leaseIncentivesReceivable: number;
  prepaidPayments: number;
  rentFreeMonths: number;
  residualValueGuarantee: number;
}

export interface AmortisationRow {
  period: number;
  date: string; // ISO date
  openingLiability: number;
  interestCharge: number;
  payment: number;
  closingLiability: number;
  rouDepreciation: number;
  closingRouValue: number;
  totalPLCharge: number;
}

export interface ScheduleResult {
  initialLiability: number;
  initialRou: number;
  rows: AmortisationRow[];
  foots: boolean;
  footingError: number;
}

export interface PVParams {
  paymentAmount: number;
  paymentFrequency: PaymentFrequency;
  paymentTiming: PaymentTiming;
  termMonths: number;
  annualDiscountRate: number;
  rentFreeMonths?: number;
}
