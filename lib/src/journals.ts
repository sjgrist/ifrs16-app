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
  codes: AccountCodes = DEFAULT_ACCOUNT_CODES,
  /** Optional: current portion of the initial liability (due within 12 months) */
  currentPortion?: number
): JournalLine[] {
  const lines: JournalLine[] = [];

  const currPortion    = currentPortion !== undefined ? Math.round(currentPortion * 100) / 100 : 0;
  const nonCurrPortion = Math.round((liabilityAmount - currPortion) * 100) / 100;

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

  if (nonCurrPortion > 0) {
    lines.push({
      date,
      accountCode: codes.leaseLiabilityNonCurrent,
      accountDescription: "Lease liability (non-current)",
      debit: 0,
      credit: nonCurrPortion,
      leaseRef,
      assetClass,
    });
  }

  if (currPortion > 0) {
    lines.push({
      date,
      accountCode: codes.leaseLiabilityCurrent,
      accountDescription: "Lease liability (current)",
      debit: 0,
      credit: currPortion,
      leaseRef,
      assetClass,
    });
  }

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
  codes: AccountCodes = DEFAULT_ACCOUNT_CODES,
  /**
   * Optional: opening and closing current portions for this period.
   * When supplied, interest is credited to non-current and a reclassification
   * entry is generated to achieve the correct current / non-current split.
   * When omitted, interest is credited to current (legacy behaviour).
   */
  currentPortions?: { opening: number; closing: number }
): JournalLine[] {
  const lines: JournalLine[] = [];

  if (currentPortions) {
    // ── Correct split approach ───────────────────────────────────────────────
    // Interest accrual: DR Interest expense / CR Lease liability non-current
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
        accountCode: codes.leaseLiabilityNonCurrent,
        accountDescription: "Lease liability (non-current) – interest accrual",
        debit: 0,
        credit: row.interestCharge,
        leaseRef,
        assetClass,
      });
    }

    // Cash payment: DR Lease liability current / CR Cash
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

    // Reclassification: adjust current / non-current to desired closing split.
    // Before reclass: Current = openingCurrent − payment
    //                 Non-current = openingNonCurrent + interest
    // Required:       Current = closingCurrentPortion
    // Reclass DR non-current / CR current = closing − (opening − payment)
    const reclassAmt = Math.round(
      (currentPortions.closing - currentPortions.opening + row.payment) * 100
    ) / 100;

    if (Math.abs(reclassAmt) > 0.005) {
      const fromAcc = reclassAmt > 0 ? codes.leaseLiabilityNonCurrent : codes.leaseLiabilityCurrent;
      const toAcc   = reclassAmt > 0 ? codes.leaseLiabilityCurrent    : codes.leaseLiabilityNonCurrent;
      const amt     = Math.abs(reclassAmt);
      lines.push({
        date: row.date,
        accountCode: fromAcc,
        accountDescription: "Lease liability reclassification (non-current → current)",
        debit: amt,
        credit: 0,
        leaseRef,
        assetClass,
      });
      lines.push({
        date: row.date,
        accountCode: toAcc,
        accountDescription: "Lease liability reclassification (non-current → current)",
        debit: 0,
        credit: amt,
        leaseRef,
        assetClass,
      });
    }
  } else {
    // ── Legacy approach (no split provided) ─────────────────────────────────
    // Interest accrual: DR Interest expense / CR Lease liability current
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
