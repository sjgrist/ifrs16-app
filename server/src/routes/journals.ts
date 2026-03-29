import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import type { AuthRequest } from "../middleware/auth";
import {
  generateCommencementJournals, generateMonthlyJournals,
  buildSchedule, DEFAULT_ACCOUNT_CODES,
} from "@rou-lio/lib";
import type { AccountCodes, AssetClass, LeaseInput, AmortisationRow } from "@rou-lio/lib";

const router = Router();

// ── Helpers for current / non-current split ───────────────────────────────────

/**
 * Returns the closing liability at the end of a given schedule period.
 *   periodIndex 0  → commencement date (= initialLiability, before period 1)
 *   periodIndex n  → rows[n-1].closingLiability  (rows are 1-indexed by .period)
 *   periodIndex > rows.length → 0 (lease has ended)
 */
function closingLiabilityAt(
  rows: AmortisationRow[],
  periodIndex: number,
  initialLiability: number
): number {
  if (periodIndex <= 0) return initialLiability;
  if (periodIndex > rows.length) return 0;
  return rows[periodIndex - 1].closingLiability;
}

/**
 * Current portion of the lease liability at a given period-end:
 *   = closing liability now  −  closing liability 12 months from now
 * (capped at 0; can't be negative)
 */
function currentPortionAt(
  rows: AmortisationRow[],
  periodIndex: number,
  initialLiability: number
): number {
  const now  = closingLiabilityAt(rows, periodIndex, initialLiability);
  const in12 = closingLiabilityAt(rows, periodIndex + 12, initialLiability);
  return Math.max(0, now - in12);
}

// ─────────────────────────────────────────────────────────────────────────────

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

    const orgId = (req as AuthRequest).orgId;
    const { data: leases, error: leaseErr } = await sb
      .from("leases").select("*")
      .eq("org_id", orgId).eq("entity_id", Number(entity_id)).neq("status", "expired");
    if (leaseErr) return res.status(500).json({ error: leaseErr.message });

    const { data: dbCodes } = await sb
      .from("account_codes").select("*")
      .eq("org_id", orgId).eq("entity_id", Number(entity_id)).eq("asset_class", "all").single();

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

      // Current portion at commencement (period index 0)
      const commCurrentPortion = currentPortionAt(schedule.rows, 0, schedule.initialLiability);

      if ((l.commencement_date as string) >= periodStart && (l.commencement_date as string) <= periodEnd) {
        const cj = generateCommencementJournals(
          l.commencement_date as string, schedule.initialRou, schedule.initialLiability,
          (l.initial_direct_costs as number) || 0, (l.prepaid_payments as number) || 0,
          leaseRef, assetClass, codes,
          commCurrentPortion
        );
        allJournals.push(...cj.map((j) => ({ ...j, leaseId: l.id, type: "commencement" })));
      }

      const periodRows = schedule.rows.filter((r) => r.date >= periodStart && r.date <= periodEnd);
      for (const row of periodRows) {
        // row.period is 1-indexed; opening = periodIndex row.period − 1
        const openingCurrent = currentPortionAt(schedule.rows, row.period - 1, schedule.initialLiability);
        const closingCurrent = currentPortionAt(schedule.rows, row.period,     schedule.initialLiability);
        const mj = generateMonthlyJournals(row, leaseRef, assetClass, codes, {
          opening: openingCurrent,
          closing: closingCurrent,
        });
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
