import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { buildSchedule, buildRollForward } from "@ifrs16/lib";
import type { LeaseInput } from "@ifrs16/lib";

const router = Router();

// GET /api/schedules/rollforward/summary — must be before /:leaseId
router.get("/rollforward/summary", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { entity_id, period_start, period_end } = req.query;
    if (!period_start || !period_end)
      return res.status(400).json({ error: "period_start and period_end required" });

    const leases = entity_id
      ? db.prepare("SELECT l.*,e.name as entity_name FROM leases l LEFT JOIN entities e ON l.entity_id=e.id WHERE l.entity_id=$eid")
          .all({ $eid: entity_id }) as Record<string, unknown>[]
      : db.prepare("SELECT l.*,e.name as entity_name FROM leases l LEFT JOIN entities e ON l.entity_id=e.id").all({}) as Record<string, unknown>[];

    const results = [];
    for (const lease of leases) {
      const input = leaseToInput(lease);
      const schedule = buildSchedule(input);
      const rf = buildRollForward(
        lease.entity_name as string, schedule.rows,
        schedule.initialRou, schedule.initialLiability,
        period_start as string, period_end as string,
        lease.commencement_date as string
      );
      results.push({ leaseId: lease.id, assetDescription: lease.asset_description,
        lessorName: lease.lessor_name, currency: lease.currency, ...rf });
    }
    res.json(results);
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

// GET /api/schedules/:leaseId
router.get("/:leaseId", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const lease = db.prepare("SELECT * FROM leases WHERE id=$id").get({ $id: parseInt(req.params.leaseId) }) as Record<string, unknown> | undefined;
    if (!lease) return res.status(404).json({ error: "Lease not found" });

    const dbRows = db.prepare("SELECT * FROM schedule_rows WHERE lease_id=$id ORDER BY period")
      .all({ $id: parseInt(req.params.leaseId) }) as Array<Record<string, unknown>>;

    if (dbRows.length) {
      const rows = dbRows.map((r) => ({
        period: r.period, date: r.date,
        openingLiability: r.opening_liability, interestCharge: r.interest_charge,
        payment: r.payment, closingLiability: r.closing_liability,
        rouDepreciation: r.rou_depreciation, closingRouValue: r.closing_rou,
        totalPLCharge: r.total_pl_charge,
      }));
      return res.json({ leaseId: lease.id, rows });
    }

    const schedule = buildSchedule(leaseToInput(lease));
    res.json({ leaseId: lease.id, ...schedule });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

function leaseToInput(lease: Record<string, unknown>): LeaseInput {
  return {
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
}

export default router;
