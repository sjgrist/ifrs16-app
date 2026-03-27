import type { AmortisationRow, AssetClass } from "./types";

export interface JournalLine {
  date: string;
  accountCode: string;
  accountDescription: string;
  debit: number;
  credit: number;
  leaseRef: string;
  assetClass: AssetClass;
}

export interface AccountCodes {
  rouAsset: string;
  accumulatedDepreciation: string;
  leaseLiabilityCurrent: string;
  leaseLiabilityNonCurrent: string;
  interestExpense: string;
  depreciationExpense: string;
  cashAccruals: string;
}

export const DEFAULT_ACCOUNT_CODES: AccountCodes = {
  rouAsset: "01-1600",
  accumulatedDepreciation: "01-1610",
  leaseLiabilityCurrent: "01-2300",
  leaseLiabilityNonCurrent: "01-2310",
  interestExpense: "01-7100",
  depreciationExpense: "01-7200",
  cashAccruals: "01-2100",
};

export function generateCommencementJournals(
  date: string,
  rouAmount: number,
  liabilityAmount: number,
  directCosts: number,
  prepaidPayments: number,
  leaseRef: string,
  assetClass: AssetClass,
  codes: AccountCodes = DEFAULT_ACCOUNT_CODES
): JournalLine[] {
  const lines: JournalLine[] = [];

  // DR ROU asset / CR Lease liability (initial measurement)
  lines.push({
    date,
    accountCode: codes.rouAsset,
    accountDescription: "Right-of-use asset",
    debit: rouAmount,
    credit: 0,
    leaseRef,
    assetClass,
  });
  lines.push({
    date,
    accountCode: codes.leaseLiabilityNonCurrent,
    accountDescription: "Lease liability (non-current)",
    debit: 0,
    credit: liabilityAmount,
    leaseRef,
    assetClass,
  });

  // Initial direct costs / prepaid
  if (directCosts + prepaidPayments > 0) {
    lines.push({
      date,
      accountCode: codes.leaseLiabilityCurrent,
      accountDescription: "Lease liability (current) – IDC/prepaid",
      debit: directCosts + prepaidPayments,
      credit: 0,
      leaseRef,
      assetClass,
    });
    lines.push({
      date,
      accountCode: codes.cashAccruals,
      accountDescription: "Cash / Accruals",
      debit: 0,
      credit: directCosts + prepaidPayments,
      leaseRef,
      assetClass,
    });
  }

  return lines;
}

export function generateMonthlyJournals(
  row: AmortisationRow,
  leaseRef: string,
  assetClass: AssetClass,
  codes: AccountCodes = DEFAULT_ACCOUNT_CODES
): JournalLine[] {
  const lines: JournalLine[] = [];

  // Interest accrual: DR Interest expense / CR Lease liability
  if (row.interestCharge > 0) {
    lines.push({
      date: row.date,
      accountCode: codes.interestExpense,
      accountDescription: "Interest expense – IFRS 16",
      debit: row.interestCharge,
      credit: 0,
      leaseRef,
      assetClass,
    });
    lines.push({
      date: row.date,
      accountCode: codes.leaseLiabilityCurrent,
      accountDescription: "Lease liability (current) – interest",
      debit: 0,
      credit: row.interestCharge,
      leaseRef,
      assetClass,
    });
  }

  // Cash payment: DR Lease liability / CR Cash
  if (row.payment > 0) {
    lines.push({
      date: row.date,
      accountCode: codes.leaseLiabilityCurrent,
      accountDescription: "Lease liability (current) – payment",
      debit: row.payment,
      credit: 0,
      leaseRef,
      assetClass,
    });
    lines.push({
      date: row.date,
      accountCode: codes.cashAccruals,
      accountDescription: "Cash / Accruals",
      debit: 0,
      credit: row.payment,
      leaseRef,
      assetClass,
    });
  }

  // Depreciation: DR Depreciation expense / CR Accumulated depreciation
  if (row.rouDepreciation > 0) {
    lines.push({
      date: row.date,
      accountCode: codes.depreciationExpense,
      accountDescription: "Depreciation expense – ROU asset",
      debit: row.rouDepreciation,
      credit: 0,
      leaseRef,
      assetClass,
    });
    lines.push({
      date: row.date,
      accountCode: codes.accumulatedDepreciation,
      accountDescription: "Accumulated depreciation – ROU asset",
      debit: 0,
      credit: row.rouDepreciation,
      leaseRef,
      assetClass,
    });
  }

  return lines;
}
