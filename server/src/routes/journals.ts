import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import type { AuthRequest } from "../middleware/auth";
import {
  generateCommencementJournals, generateMonthlyJournals,
  buildSchedule, DEFAULT_ACCOUNT_CODES,
} from "@rou-lio/lib";
import type { AccountCodes, AssetClass, LeaseInput, AmortisationRow } from "@rou-lio/lib";

const router = Router();

function closingLiabilityAt(
  rows: AmortisationRow[],
  periodIndex: number,
  initialLiability: number
): number {
  if (periodIndex <= 0) return initialLiability;
  if (periodIndex > rows.length) return 0;
  return rows[periodIndex - 1].closingLiability;
}

function currentPortionAt(
  rows: AmortisationRow[],
  periodIndex: number,
  initialLiability: number
): number {
  const now  = closingLiabilityAt(rows, periodIndex, initialLiability);
  const in12 = closingLiabilityAt(rows, periodIndex + 12, initialLiability);
  return Math.max(0, now - in12);
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const sb = getSupabase();
    const orgId = (req as AuthRequest).orgId;
    const { entity_id, entity_ids, year, month, reporting_currency } = req.query;

    const periodYear = parseInt(year as string) || new Date().getFullYear();
    const periodMonth = month ? parseInt(month as string) : undefined;
    const periodStart = periodMonth
      ? `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`
      : `${periodYear}-01-01`;
    const periodEnd = periodMonth
      ? new Date(periodYear, periodMonth, 0).toISOString().slice(0, 10)
      : `${periodYear}-12-31`;

    const rptCurrency = (reporting_currency as string) || "GBP";

    // Resolve which entity IDs to process
    let entityIds: number[];
    if (entity_ids) {
      entityIds = (entity_ids as string).split(",").map(Number).filter(Boolean);
    } else if (entity_id) {
      entityIds = [Number(entity_id)];
    } else {
      const { data: allEntities } = await sb
        .from("entities").select("id").eq("org_id", orgId);
      entityIds = (allEntities || []).map((e: { id: number }) => e.id);
    }

    if (entityIds.length === 0) {
      return res.json({ journals: [], periodStart, periodEnd, reportingCurrency: rptCurrency });
    }

    // Fetch entity metadata (name, currency) in one query
    const { data: entitiesData } = await sb
      .from("entities").select("id, name, currency")
      .in("id", entityIds).eq("org_id", orgId);
    const entityMap = new Map(
      (entitiesData || []).map((e: { id: number; name: string; currency: string }) => [e.id, e])
    );

    // Fetch stored FX rates for all non-reporting currencies in one query
    const uniqueCurrencies = [
      ...new Set(
        (entitiesData || [])
          .map((e: { currency: string }) => e.currency)
          .filter((c: string) => c && c !== rptCurrency)
      ),
    ];
    const fxRateMap = new Map<string, number>();
    if (uniqueCurrencies.length > 0) {
      const { data: fxRows } = await sb
        .from("fx_rates").select("from_ccy, rate")
        .eq("org_id", orgId).eq("to_ccy", rptCurrency)
        .in("from_ccy", uniqueCurrencies);
      for (const fx of fxRows || []) {
        fxRateMap.set(
          (fx as { from_ccy: string; rate: number }).from_ccy,
          (fx as { from_ccy: string; rate: number }).rate
        );
      }
    }

    const allJournals: unknown[] = [];

    for (const entityId of entityIds) {
      const entity = entityMap.get(entityId);
      if (!entity) continue;

      const entityCurrency: string = (entity as { currency: string }).currency || "GBP";
      const fxRate: number | null =
        entityCurrency === rptCurrency ? 1 : (fxRateMap.get(entityCurrency) ?? null);

      const { data: leases, error: leaseErr } = await sb
        .from("leases").select("*")
        .eq("org_id", orgId).eq("entity_id", entityId).neq("status", "expired");
      if (leaseErr) return res.status(500).json({ error: leaseErr.message });

      // Account codes: try entity-specific first, fall back to org default
      const { data: dbCodes } = await sb
        .from("account_codes").select("*")
        .eq("org_id", orgId).eq("entity_id", entityId).eq("asset_class", "all")
        .maybeSingle();

      let codes: AccountCodes;
      if (dbCodes) {
        const c = dbCodes as Record<string, string>;
        codes = {
          rouAsset: c.rou_asset,
          accumulatedDepreciation: c.accumulated_depreciation,
          leaseLiabilityCurrent: c.lease_liability_current,
          leaseLiabilityNonCurrent: c.lease_liability_non_current,
          interestExpense: c.interest_expense,
          depreciationExpense: c.depreciation_expense,
          cashAccruals: c.cash_accruals,
        };
      } else {
        // Fall back to org-wide default (entity_id IS NULL)
        const { data: orgCodes } = await sb
          .from("account_codes").select("*")
          .eq("org_id", orgId).is("entity_id", null).eq("asset_class", "all")
          .maybeSingle();
        if (orgCodes) {
          const c = orgCodes as Record<string, string>;
          codes = {
            rouAsset: c.rou_asset,
            accumulatedDepreciation: c.accumulated_depreciation,
            leaseLiabilityCurrent: c.lease_liability_current,
            leaseLiabilityNonCurrent: c.lease_liability_non_current,
            interestExpense: c.interest_expense,
            depreciationExpense: c.depreciation_expense,
            cashAccruals: c.cash_accruals,
          };
        } else {
          codes = DEFAULT_ACCOUNT_CODES;
        }
      }

      const tag = (j: Record<string, unknown>) => ({
        ...j,
        entityId,
        entityName: (entity as { name: string }).name,
        currency: entityCurrency,
        debitRpt: fxRate !== null && (j.debit as number) ? +((j.debit as number) * fxRate).toFixed(2) : null,
        creditRpt: fxRate !== null && (j.credit as number) ? +((j.credit as number) * fxRate).toFixed(2) : null,
      });

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
        const commCurrentPortion = currentPortionAt(schedule.rows, 0, schedule.initialLiability);

        if ((l.commencement_date as string) >= periodStart && (l.commencement_date as string) <= periodEnd) {
          const cj = generateCommencementJournals(
            l.commencement_date as string, schedule.initialRou, schedule.initialLiability,
            (l.initial_direct_costs as number) || 0, (l.prepaid_payments as number) || 0,
            leaseRef, assetClass, codes, commCurrentPortion
          );
          allJournals.push(
            ...cj.map((j) => tag({ ...j, leaseId: l.id, type: "commencement" }))
          );
        }

        const periodRows = schedule.rows.filter((r) => r.date >= periodStart && r.date <= periodEnd);
        for (const row of periodRows) {
          const openingCurrent = currentPortionAt(schedule.rows, row.period - 1, schedule.initialLiability);
          const closingCurrent = currentPortionAt(schedule.rows, row.period, schedule.initialLiability);
          const mj = generateMonthlyJournals(row, leaseRef, assetClass, codes, {
            opening: openingCurrent,
            closing: closingCurrent,
          });
          allJournals.push(
            ...mj.map((j) => tag({ ...j, leaseId: l.id, type: "monthly" }))
          );
        }
      }
    }

    // Sort: entity name → date → account code
    (allJournals as Array<Record<string, unknown>>).sort((a, b) => {
      const ec = (a.entityName as string).localeCompare(b.entityName as string);
      if (ec !== 0) return ec;
      const dc = (a.date as string) < (b.date as string) ? -1 : (a.date as string) > (b.date as string) ? 1 : 0;
      if (dc !== 0) return dc;
      return (a.accountCode as string).localeCompare(b.accountCode as string);
    });

    res.json({ journals: allJournals, periodStart, periodEnd, reportingCurrency: rptCurrency });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
