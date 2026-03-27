import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import { buildSchedule, buildRollForward } from "@ifrs16/lib";
import type { LeaseInput } from "@ifrs16/lib";

const router = Router();

// GET /api/schedules/rollforward/summary
router.get("/rollforward/summary", async (req: Request, res: Response) => {
  try {
    const { entity_id, period_start, period_end } = req.query;
    if (!period_start || !period_end)
      return res.status(400).json({ error: "period_start and period_end required" });

    const sb = getSupabase();
    const query = sb.from("leases").select("*, entities(name)");
    const { data: leases, error } = entity_id
      ? await query.eq("entity_id", Number(entity_id))
      : await query;
    if (error) return res.status(500).json({ error: error.message });

    const results = [];
    for (const lease of leases || []) {
      const input = leaseToInput(lease as Record<string, unknown>);
      const schedule = buildSchedule(input);
      const entityName = (lease as Record<string, unknown> & { entities?: { name?: string } }).entities?.name ?? "";
      const rf = buildRollForward(
        entityName, schedule.rows,
        schedule.initialRou, schedule.initialLiability,
        period_start as string, period_end as string,
        (lease as Record<string, unknown>).commencement_date as string
      );
      results.push({
        leaseId: (lease as Record<string, unknown>).id,
        assetDescription: (lease as Record<string, unknown>).asset_description,
        lessorName: (lease as Record<string, unknown>).lessor_name,
        currency: (lease as Record<string, unknown>).currency,
        ...rf,
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
    const sb = getSupabase();
    const leaseId = parseInt(req.params.leaseId);

    const { data: lease, error: leaseErr } = await sb
      .from("leases").select("*").eq("id", leaseId).single();
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
