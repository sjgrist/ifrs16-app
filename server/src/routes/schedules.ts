import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import { buildSchedule, buildRollForward } from "@rou-lio/lib";
import type { LeaseInput, AmortisationRow } from "@rou-lio/lib";
import type { AuthRequest } from "../middleware/auth";

const router = Router();

/** Add n months to an ISO date string (YYYY-MM-DD). */
function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Closing liability at a given point in time: the last schedule row
 * with date <= targetDate, or 0 if the lease has fully ended.
 */
function closingLiabilityAtDate(rows: AmortisationRow[], targetDate: string): number {
  const prior = rows.filter((r) => r.date <= targetDate);
  if (prior.length === 0) return 0;
  return prior[prior.length - 1].closingLiability;
}

// GET /api/schedules/rollforward/summary
router.get("/rollforward/summary", async (req: Request, res: Response) => {
  try {
    const { entity_id, entity_ids, period_start, period_end } = req.query;
    if (!period_start || !period_end)
      return res.status(400).json({ error: "period_start and period_end required" });

    const orgId = (req as AuthRequest).orgId;
    const sb = getSupabase();
    let query = sb.from("leases").select("*, entities(name)").eq("org_id", orgId);
    if (entity_ids) {
      const ids = (entity_ids as string).split(",").map(Number).filter((n) => n > 0);
      if (ids.length) query = query.in("entity_id", ids);
    } else if (entity_id) {
      query = query.eq("entity_id", Number(entity_id));
    }
    const { data: leases, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const results = [];
    for (const lease of leases || []) {
      const l = lease as Record<string, unknown>;
      const input = leaseToInput(l);
      const schedule = buildSchedule(input);
      const entityName = (lease as Record<string, unknown> & { entities?: { name?: string } }).entities?.name ?? "";
      const rf = buildRollForward(
        entityName, schedule.rows,
        schedule.initialRou, schedule.initialLiability,
        period_start as string, period_end as string,
        l.commencement_date as string
      );

      // Current / non-current split at period end
      // Current = closing liability now  −  closing liability 12 months from now
      const date12Later = addMonths(period_end as string, 12);
      const liab12 = closingLiabilityAtDate(schedule.rows, date12Later);
      const closingCurrentLiability    = Math.round(Math.max(0, rf.closingLiability - liab12) * 100) / 100;
      const closingNonCurrentLiability = Math.round(Math.max(0, rf.closingLiability - closingCurrentLiability) * 100) / 100;

      results.push({
        leaseId: l.id,
        assetDescription: l.asset_description,
        assetClass: l.asset_class,
        discountRate: l.discount_rate,
        lessorName: l.lessor_name,
        currency: l.currency,
        ...rf,
        closingCurrentLiability,
        closingNonCurrentLiability,
      });
    }
    res.json(results);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/schedules/:leaseId
router.get("/:leaseId", async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthRequest).orgId;
    const sb = getSupabase();
    const leaseId = parseInt(req.params.leaseId);

    const { data: lease, error: leaseErr } = await sb
      .from("leases").select("*").eq("id", leaseId).eq("org_id", orgId).single();
    if (leaseErr) return res.status(404).json({ error: "Lease not found" });

    const { data: dbRows } = await sb
      .from("schedule_rows").select("*").eq("lease_id", leaseId).order("period");

    if (dbRows && dbRows.length > 0) {
      const rows = dbRows.map((r: Record<string, unknown>) => ({
        period: r.period, date: r.date,
        openingLiability: r.opening_liability, interestCharge: r.interest_charge,
        payment: r.payment, closingLiability: r.closing_liability,
        rouDepreciation: r.rou_depreciation, closingRouValue: r.closing_rou,
        totalPLCharge: r.total_pl_charge,
      }));
      return res.json({ leaseId: (lease as Record<string, unknown>).id, rows });
    }

    const schedule = buildSchedule(leaseToInput(lease as Record<string, unknown>));
    res.json({ leaseId: (lease as Record<string, unknown>).id, ...schedule });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

function leaseToInput(lease: Record<string, unknown>): LeaseInput {
  return {
    commencementDate: lease.commencement_date as string,
    termMonths: lease.term_months as number,
    paymentAmount: lease.payment_amount as number,
    paymentFrequency: (lease.payment_frequency as "monthly" | "quarterly" | "annual") || "monthly",
    paymentTiming: (lease.payment_timing as "advance" | "arrears") || "arrears",
    annualDiscountRate: lease.discount_rate as number,
    initialDirectCosts: (lease.initial_direct_costs as number) || 0,
    leaseIncentivesReceivable: (lease.lease_incentives_receivable as number) || 0,
    prepaidPayments: (lease.prepaid_payments as number) || 0,
    rentFreeMonths: (lease.rent_free_months as number) || 0,
    residualValueGuarantee: (lease.residual_value_guarantee as number) || 0,
  };
}

export default router;
