import { Router, Request, Response } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { getDb } from "../db";
import { extractLeaseData } from "../services/extraction";
import { buildSchedule } from "@ifrs16/lib";
import type { LeaseInput } from "@ifrs16/lib";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/leases/extract — must be before /:id routes
router.post("/extract", upload.single("pdf"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
    const pdfData = await pdfParse(req.file.buffer);
    const extracted = await extractLeaseData(pdfData.text);
    res.json({ extracted, filename: req.file.originalname });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/leases
router.get("/", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { entity_id, status, search } = req.query;

    const conditions: string[] = ["1=1"];
    const params: Record<string, unknown> = {};

    if (entity_id) { conditions.push("l.entity_id = $entity_id"); params.$entity_id = entity_id; }
    if (status)    { conditions.push("l.status = $status");       params.$status = status; }
    if (search) {
      conditions.push("(l.lessor_name LIKE $search OR l.asset_description LIKE $search OR e.name LIKE $search)");
      params.$search = `%${search}%`;
    }

    const where = conditions.join(" AND ");

    const leases = db.prepare(`
      SELECT l.*, e.name as entity_name
      FROM leases l LEFT JOIN entities e ON l.entity_id = e.id
      WHERE ${where}
      ORDER BY l.commencement_date DESC
    `).all(params) as unknown[];

    res.json({ leases, total: (leases as unknown[]).length });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/leases/:id
router.get("/:id", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const lease = db.prepare(`
      SELECT l.*, e.name as entity_name
      FROM leases l LEFT JOIN entities e ON l.entity_id = e.id
      WHERE l.id = $id
    `).get({ $id: parseInt(req.params.id) });
    if (!lease) return res.status(404).json({ error: "Not found" });
    res.json(lease);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/leases
router.post("/", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;

    const result = db.prepare(`
      INSERT INTO leases (
        entity_id, lessor_name, asset_description, asset_class,
        commencement_date, term_months, extension_option_months, extension_reasonably_certain,
        currency, payment_amount, payment_frequency, payment_timing,
        rent_free_months, initial_direct_costs, lease_incentives_receivable,
        prepaid_payments, residual_value_guarantee, discount_rate, discount_rate_id,
        country, status, notes
      ) VALUES (
        $entity_id,$lessor_name,$asset_description,$asset_class,
        $commencement_date,$term_months,$extension_option_months,$extension_reasonably_certain,
        $currency,$payment_amount,$payment_frequency,$payment_timing,
        $rent_free_months,$initial_direct_costs,$lease_incentives_receivable,
        $prepaid_payments,$residual_value_guarantee,$discount_rate,$discount_rate_id,
        $country,$status,$notes
      )
    `).run({
      $entity_id: d.entity_id,
      $lessor_name: d.lessor_name || "",
      $asset_description: d.asset_description || "",
      $asset_class: d.asset_class || "property",
      $commencement_date: d.commencement_date,
      $term_months: d.term_months,
      $extension_option_months: d.extension_option_months || 0,
      $extension_reasonably_certain: d.extension_reasonably_certain ? 1 : 0,
      $currency: d.currency || "GBP",
      $payment_amount: d.payment_amount,
      $payment_frequency: d.payment_frequency || "monthly",
      $payment_timing: d.payment_timing || "arrears",
      $rent_free_months: d.rent_free_months || 0,
      $initial_direct_costs: d.initial_direct_costs || 0,
      $lease_incentives_receivable: d.lease_incentives_receivable || 0,
      $prepaid_payments: d.prepaid_payments || 0,
      $residual_value_guarantee: d.residual_value_guarantee || 0,
      $discount_rate: d.discount_rate,
      $discount_rate_id: d.discount_rate_id || null,
      $country: d.country || "",
      $status: d.status || "active",
      $notes: d.notes || "",
    });

    const leaseId = Number(result.lastInsertRowid);
    computeAndSaveSchedule(db, leaseId, d);
    res.status(201).json({ id: leaseId });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/leases/:id
router.put("/:id", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    db.prepare(`
      UPDATE leases SET
        entity_id=$entity_id, lessor_name=$lessor_name, asset_description=$asset_description,
        asset_class=$asset_class, commencement_date=$commencement_date, term_months=$term_months,
        extension_option_months=$extension_option_months, extension_reasonably_certain=$extension_reasonably_certain,
        currency=$currency, payment_amount=$payment_amount, payment_frequency=$payment_frequency,
        payment_timing=$payment_timing, rent_free_months=$rent_free_months,
        initial_direct_costs=$initial_direct_costs, lease_incentives_receivable=$lease_incentives_receivable,
        prepaid_payments=$prepaid_payments, residual_value_guarantee=$residual_value_guarantee,
        discount_rate=$discount_rate, discount_rate_id=$discount_rate_id,
        country=$country, status=$status, notes=$notes, updated_at=datetime('now')
      WHERE id=$id
    `).run({ ...prefixDollar(d), $id: parseInt(req.params.id), $extension_reasonably_certain: d.extension_reasonably_certain ? 1 : 0 });

    db.prepare("DELETE FROM schedule_rows WHERE lease_id = $id").run({ $id: parseInt(req.params.id) });
    computeAndSaveSchedule(db, parseInt(req.params.id), d);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/leases/:id
router.delete("/:id", (req: Request, res: Response) => {
  try {
    getDb().prepare("DELETE FROM leases WHERE id = $id").run({ $id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Helper: prefix object keys with $ for node:sqlite named params
function prefixDollar(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [`$${k}`, v]));
}

function computeAndSaveSchedule(db: ReturnType<typeof getDb>, leaseId: number, data: Record<string, unknown>) {
  const input: LeaseInput = {
    commencementDate: data.commencement_date as string,
    termMonths: data.term_months as number,
    paymentAmount: data.payment_amount as number,
    paymentFrequency: (data.payment_frequency as "monthly" | "quarterly" | "annual") || "monthly",
    paymentTiming: (data.payment_timing as "advance" | "arrears") || "arrears",
    annualDiscountRate: data.discount_rate as number,
    initialDirectCosts: (data.initial_direct_costs as number) || 0,
    leaseIncentivesReceivable: (data.lease_incentives_receivable as number) || 0,
    prepaidPayments: (data.prepaid_payments as number) || 0,
    rentFreeMonths: (data.rent_free_months as number) || 0,
    residualValueGuarantee: (data.residual_value_guarantee as number) || 0,
  };

  const schedule = buildSchedule(input);

  // node:sqlite transactions
  db.exec("BEGIN");
  try {
    const insertRow = db.prepare(`
      INSERT OR REPLACE INTO schedule_rows
        (lease_id, period, date, opening_liability, interest_charge, payment,
         closing_liability, rou_depreciation, closing_rou, total_pl_charge)
      VALUES
        ($lease_id,$period,$date,$opening_liability,$interest_charge,$payment,
         $closing_liability,$rou_depreciation,$closing_rou,$total_pl_charge)
    `);

    for (const row of schedule.rows) {
      insertRow.run({
        $lease_id: leaseId,
        $period: row.period,
        $date: row.date,
        $opening_liability: row.openingLiability,
        $interest_charge: row.interestCharge,
        $payment: row.payment,
        $closing_liability: row.closingLiability,
        $rou_depreciation: row.rouDepreciation,
        $closing_rou: row.closingRouValue,
        $total_pl_charge: row.totalPLCharge,
      });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export default router;
