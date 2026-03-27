import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import {
  generateCommencementJournals, generateMonthlyJournals,
  buildSchedule, DEFAULT_ACCOUNT_CODES,
} from "@ifrs16/lib";
import type { AccountCodes, AssetClass, LeaseInput } from "@ifrs16/lib";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const sb = getSupabase();
    const { entity_id, year, month } = req.query;
    if (!entity_id) return res.status(400).json({ error: "entity_id required" });

    const periodYear = parseInt(year as string) || new Date().getFullYear();
    const periodMonth = month ? parseInt(month as string) : undefined;
    const periodStart = periodMonth
      ? `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`
      : `${periodYear}-01-01`;
    const periodEnd = periodMonth
      ? new Date(periodYear, periodMonth, 0).toISOString().slice(0, 10)
      : `${periodYear}-12-31`;

    const { data: leases, error: leaseErr } = await sb
      .from("leases").select("*")
      .eq("entity_id", Number(entity_id)).neq("status", "expired");
    if (leaseErr) return res.status(500).json({ error: leaseErr.message });

    const { data: dbCodes } = await sb
      .from("account_codes").select("*")
      .eq("entity_id", Number(entity_id)).eq("asset_class", "all").single();

    const codes: AccountCodes = dbCodes
      ? {
          rouAsset: (dbCodes as Record<string, string>).rou_asset,
          accumulatedDepreciation: (dbCodes as Record<string, string>).accumulated_depreciation,
          leaseLiabilityCurrent: (dbCodes as Record<string, string>).lease_liability_current,
          leaseLiabilityNonCurrent: (dbCodes as Record<string, string>).lease_liability_non_current,
          interestExpense: (dbCodes as Record<string, string>).interest_expense,
          depreciationExpense: (dbCodes as Record<string, string>).depreciation_expense,
          cashAccruals: (dbCodes as Record<string, string>).cash_accruals,
        }
      : DEFAULT_ACCOUNT_CODES;

    const allJournals: unknown[] = [];

    for (const lease of leases || []) {
      const l = lease as Record<string, unknown>;
      const input: LeaseInput = {
        commencementDate: l.commencement_date as string,
        termMonths: l.term_months as number,
        paymentAmount: l.payment_amount as number,
        paymentFrequency: (l.payment_frequency as "monthly" | "quarterly" | "annual") || "monthly",
        paymentTiming: (l.payment_timing as "advance" | "arrears") || "arrears",
        annualDiscountRate: l.discount_rate as number,
        initialDirectCosts: (l.initial_direct_costs as number) || 0,
        leaseIncentivesReceivable: (l.lease_incentives_receivable as number) || 0,
        prepaidPayments: (l.prepaid_payments as number) || 0,
        rentFreeMonths: (l.rent_free_months as number) || 0,
        residualValueGuarantee: (l.residual_value_guarantee as number) || 0,
      };

      const schedule = buildSchedule(input);
      const leaseRef = `LEASE-${String(l.id).padStart(4, "0")}`;
      const assetClass = (l.asset_class as AssetClass) || "property";

      if ((l.commencement_date as string) >= periodStart && (l.commencement_date as string) <= periodEnd) {
        const cj = generateCommencementJournals(
          l.commencement_date as string, schedule.initialRou, schedule.initialLiability,
          (l.initial_direct_costs as number) || 0, (l.prepaid_payments as number) || 0,
          leaseRef, assetClass, codes
        );
        allJournals.push(...cj.map((j) => ({ ...j, leaseId: l.id, type: "commencement" })));
      }

      const periodRows = schedule.rows.filter((r) => r.date >= periodStart && r.date <= periodEnd);
      for (const row of periodRows) {
        const mj = generateMonthlyJournals(row, leaseRef, assetClass, codes);
        allJournals.push(...mj.map((j) => ({ ...j, leaseId: l.id, type: "monthly" })));
      }
    }

    (allJournals as Array<Record<string, unknown>>).sort((a, b) =>
      (a.date as string) < (b.date as string) ? -1
      : (a.date as string) > (b.date as string) ? 1
      : (a.accountCode as string).localeCompare(b.accountCode as string)
    );

    res.json({ journals: allJournals, periodStart, periodEnd, entityId: entity_id });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
