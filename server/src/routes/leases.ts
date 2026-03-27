import { Router, Request, Response } from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import { getSupabase } from "../db";
import { extractLeaseData } from "../services/extraction";
import { buildSchedule } from "@ifrs16/lib";
import type { LeaseInput } from "@ifrs16/lib";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/leases/extract
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
router.get("/", async (req: Request, res: Response) => {
  try {
    const { entity_id, status, search } = req.query;
    const sb = getSupabase();

    let query = sb.from("leases").select("*, entities(name)");

    if (entity_id) query = query.eq("entity_id", Number(entity_id));
    if (status)    query = query.eq("status", status as string);
    if (search) {
      query = query.or(
        `lessor_name.ilike.%${search}%,asset_description.ilike.%${search}%`
      );
    }

    const { data, error } = await query.order("commencement_date", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const leases = (data || []).map((l: Record<string, unknown> & { entities?: { name?: string } }) => ({
      ...l,
      entity_name: l.entities?.name ?? null,
      entities: undefined,
    }));

    res.json({ leases, total: leases.length });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/leases/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { data, error } = await getSupabase()
      .from("leases").select("*, entities(name)").eq("id", parseInt(req.params.id)).single();
    if (error) return res.status(404).json({ error: "Not found" });
    const lease = { ...data, entity_name: (data as Record<string, unknown> & { entities?: { name?: string } }).entities?.name ?? null, entities: undefined };
    res.json(lease);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/leases
router.post("/", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const sb = getSupabase();

    const { data: lease, error } = await sb.from("leases").insert({
      entity_id: d.entity_id,
      lessor_name: d.lessor_name || "",
      asset_description: d.asset_description || "",
      asset_class: d.asset_class || "property",
      commencement_date: d.commencement_date,
      term_months: d.term_months,
      extension_option_months: d.extension_option_months || 0,
      extension_reasonably_certain: d.extension_reasonably_certain ? 1 : 0,
      currency: d.currency || "GBP",
      payment_amount: d.payment_amount,
      payment_frequency: d.payment_frequency || "monthly",
      payment_timing: d.payment_timing || "arrears",
      rent_free_months: d.rent_free_months || 0,
      initial_direct_costs: d.initial_direct_costs || 0,
      lease_incentives_receivable: d.lease_incentives_receivable || 0,
      prepaid_payments: d.prepaid_payments || 0,
      residual_value_guarantee: d.residual_value_guarantee || 0,
      discount_rate: d.discount_rate,
      discount_rate_id: d.discount_rate_id || null,
      country: d.country || "",
      status: d.status || "active",
      notes: d.notes || "",
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    await computeAndSaveSchedule(sb, (lease as Record<string, unknown>).id as number, d);
    res.status(201).json({ id: (lease as Record<string, unknown>).id });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PUT /api/leases/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const d = req.body;
    const id = parseInt(req.params.id);
    const sb = getSupabase();

    const { error } = await sb.from("leases").update({
      entity_id: d.entity_id,
      lessor_name: d.lessor_name || "",
      asset_description: d.asset_description || "",
      asset_class: d.asset_class || "property",
      commencement_date: d.commencement_date,
      term_months: d.term_months,
      extension_option_months: d.extension_option_months || 0,
      extension_reasonably_certain: d.extension_reasonably_certain ? 1 : 0,
      currency: d.currency || "GBP",
      payment_amount: d.payment_amount,
      payment_frequency: d.payment_frequency || "monthly",
      payment_timing: d.payment_timing || "arrears",
      rent_free_months: d.rent_free_months || 0,
      initial_direct_costs: d.initial_direct_costs || 0,
      lease_incentives_receivable: d.lease_incentives_receivable || 0,
      prepaid_payments: d.prepaid_payments || 0,
      residual_value_guarantee: d.residual_value_guarantee || 0,
      discount_rate: d.discount_rate,
      discount_rate_id: d.discount_rate_id || null,
      country: d.country || "",
      status: d.status || "active",
      notes: d.notes || "",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) return res.status(500).json({ error: error.message });
    await computeAndSaveSchedule(sb, id, d);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/leases/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const { error } = await getSupabase()
    .from("leases").delete().eq("id", parseInt(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

async function computeAndSaveSchedule(
  sb: ReturnType<typeof getSupabase>,
  leaseId: number,
  data: Record<string, unknown>
) {
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

  await sb.from("schedule_rows").delete().eq("lease_id", leaseId);
  await sb.from("schedule_rows").insert(
    schedule.rows.map((r) => ({
      lease_id: leaseId,
      period: r.period,
      date: r.date,
      opening_liability: r.openingLiability,
      interest_charge: r.interestCharge,
      payment: r.payment,
      closing_liability: r.closingLiability,
      rou_depreciation: r.rouDepreciation,
      closing_rou: r.closingRouValue,
      total_pl_charge: r.totalPLCharge,
    }))
  );
}

export default router;
