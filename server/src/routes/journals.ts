import { Router, Request, Response } from "express";
import { getDb } from "../db";
import {
  generateCommencementJournals, generateMonthlyJournals,
  buildSchedule, DEFAULT_ACCOUNT_CODES,
} from "@ifrs16/lib";
import type { AccountCodes, AssetClass, LeaseInput } from "@ifrs16/lib";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { entity_id, year, month } = req.query;
    if (!entity_id) return res.status(400).json({ error: "entity_id required" });

    const periodYear = parseInt(year as string) || new Date().getFullYear();
    const periodMonth = month ? parseInt(month as string) : undefined;
    const periodStart = periodMonth
      ? `${periodYear}-${String(periodMonth).padStart(2,"0")}-01`
      : `${periodYear}-01-01`;
    const periodEnd = periodMonth
      ? new Date(periodYear, periodMonth, 0).toISOString().slice(0,10)
      : `${periodYear}-12-31`;

    const leases = db.prepare(
      "SELECT * FROM leases WHERE entity_id=$eid AND status != 'expired'"
    ).all({ $eid: entity_id }) as Array<Record<string, unknown>>;

    const dbCodes = db.prepare(
      "SELECT * FROM account_codes WHERE entity_id=$eid AND asset_class='all'"
    ).get({ $eid: entity_id }) as Record<string, string> | undefined;

    const codes: AccountCodes = dbCodes
      ? { rouAsset: dbCodes.rou_asset, accumulatedDepreciation: dbCodes.accumulated_depreciation,
          leaseLiabilityCurrent: dbCodes.lease_liability_current,
          leaseLiabilityNonCurrent: dbCodes.lease_liability_non_current,
          interestExpense: dbCodes.interest_expense, depreciationExpense: dbCodes.depreciation_expense,
          cashAccruals: dbCodes.cash_accruals }
      : DEFAULT_ACCOUNT_CODES;

    const allJournals: unknown[] = [];

    for (const lease of leases) {
      const input: LeaseInput = {
        commencementDate: lease.commencement_date as string,
        termMonths: lease.term_months as number,
        paymentAmount: lease.payment_amount as number,
        paymentFrequency: (lease.payment_frequency as "monthly"|"quarterly"|"annual") || "monthly",
        paymentTiming: (lease.payment_timing as "advance"|"arrears") || "arrears",
        annualDiscountRate: lease.discount_rate as number,
        initialDirectCosts: (lease.initial_direct_costs as number) || 0,
        leaseIncentivesReceivable: (lease.lease_incentives_receivable as number) || 0,
        prepaidPayments: (lease.prepaid_payments as number) || 0,
        rentFreeMonths: (lease.rent_free_months as number) || 0,
        residualValueGuarantee: (lease.residual_value_guarantee as number) || 0,
      };

      const schedule = buildSchedule(input);
      const leaseRef = `LEASE-${String(lease.id).padStart(4,"0")}`;
      const assetClass = (lease.asset_class as AssetClass) || "property";

      if ((lease.commencement_date as string) >= periodStart && (lease.commencement_date as string) <= periodEnd) {
        const cj = generateCommencementJournals(
          lease.commencement_date as string, schedule.initialRou, schedule.initialLiability,
          (lease.initial_direct_costs as number)||0, (lease.prepaid_payments as number)||0,
          leaseRef, assetClass, codes
        );
        allJournals.push(...cj.map((j) => ({ ...j, leaseId: lease.id, type: "commencement" })));
      }

      const periodRows = schedule.rows.filter((r) => r.date >= periodStart && r.date <= periodEnd);
      for (const row of periodRows) {
        const mj = generateMonthlyJournals(row, leaseRef, assetClass, codes);
        allJournals.push(...mj.map((j) => ({ ...j, leaseId: lease.id, type: "monthly" })));
      }
    }

    (allJournals as Array<Record<string, unknown>>).sort((a, b) =>
      (a.date as string) < (b.date as string) ? -1
      : (a.date as string) > (b.date as string) ? 1
      : (a.accountCode as string).localeCompare(b.accountCode as string)
    );

    res.json({ journals: allJournals, periodStart, periodEnd, entityId: entity_id });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
