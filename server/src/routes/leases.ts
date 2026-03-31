import { Router, Request, Response } from "express";
import multer from "multer";
import { getSupabase } from "../db";
import { extractLeaseData } from "../services/extraction";
import { buildSchedule } from "@rou-lio/lib";
import type { LeaseInput } from "@rou-lio/lib";
import type { AuthRequest } from "../middleware/auth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/leases/import-csv
router.post("/import-csv", upload.single("csv"), async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthRequest).orgId;
    if (!req.file) return res.status(400).json({ error: "No CSV uploaded" });
    const text = req.file.buffer.toString("utf-8");
    const rows = parseCsv(text);
    if (rows.length === 0) return res.status(400).json({ error: "CSV is empty or has no data rows" });

    const sb = getSupabase();
    const imported: number[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // 1-indexed, +1 for header

      // Validate required fields
      if (!r.commencement_date) { errors.push({ row: rowNum, message: "commencement_date is required" }); continue; }
      const termMonths = Number(r.term_months);
      if (!termMonths || termMonths <= 0) { errors.push({ row: rowNum, message: "term_months must be a positive number" }); continue; }
      const paymentAmount = Number(r.payment_amount);
      if (!paymentAmount || paymentAmount <= 0) { errors.push({ row: rowNum, message: "payment_amount must be a positive number" }); continue; }
      const discountRate = Number(r.discount_rate);
      if (!discountRate || discountRate <= 0) { errors.push({ row: rowNum, message: "discount_rate must be a positive number" }); continue; }

      const d: Record<string, unknown> = {
        org_id: orgId,
        entity_id: r.entity_id ? Number(r.entity_id) : null,
        lessor_name: r.lessor_name || "",
        asset_description: r.asset_description || "",
        asset_class: r.asset_class || "property",
        commencement_date: r.commencement_date,
        term_months: termMonths,
        extension_option_months: Number(r.extension_option_months) || 0,
        extension_reasonably_certain: r.extension_reasonably_certain === "true" || r.extension_reasonably_certain === "1" ? 1 : 0,
        currency: r.currency || "GBP",
        payment_amount: paymentAmount,
        payment_frequency: r.payment_frequency || "monthly",
        payment_timing: r.payment_timing || "arrears",
        rent_free_months: Number(r.rent_free_months) || 0,
        initial_direct_costs: Number(r.initial_direct_costs) || 0,
        lease_incentives_receivable: Number(r.lease_incentives_receivable) || 0,
        prepaid_payments: Number(r.prepaid_payments) || 0,
        residual_value_guarantee: Number(r.residual_value_guarantee) || 0,
        discount_rate: discountRate,
        discount_rate_id: r.discount_rate_id ? Number(r.discount_rate_id) : null,
        country: r.country || "",
        status: r.status || "active",
        notes: r.notes || "",
      };

      try {
        const { data: lease, error: insertError } = await sb.from("leases").insert(d).select().single();
        if (insertError) { errors.push({ row: rowNum, message: insertError.message }); continue; }
        await computeAndSaveSchedule(sb, (lease as Record<string, unknown>).id as number, d);
        imported.push((lease as Record<string, unknown>).id as number);
      } catch (e: unknown) {
        errors.push({ row: rowNum, message: (e as Error).message });
      }
    }

    res.json({ imported: imported.length, errors });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/leases/extract
router.post("/extract", async (req: Request, res: Response) => {
  try {
    const { text, filename } = req.body as { text?: string; filename?: string };
    if (!text) return res.status(400).json({ error: "No text provided" });
    const extracted = await extractLeaseData(text);
    res.json({ extracted, filename: filename ?? "document.pdf" });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/leases
router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = (req as AuthRequest).orgId;
    const { entity_id, entity_ids, status, search } = req.query;
    const sb = getSupabase();

    let query = sb.from("leases").select("*, entities(name)").eq("org_id", orgId);

    if (entity_ids) {
      const ids = (entity_ids as string).split(",").map(Number).filter((n) => n > 0);
      if (ids.length) query = query.in("entity_id", ids);
    } else if (entity_id) {
      query = query.eq("entity_id", Number(entity_id));
    }
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
    const orgId = (req as AuthRequest).orgId;
    const { data, error } = await getSupabase()
      .from("leases").select("*, entities(name)").eq("id", parseInt(req.params.id)).eq("org_id", orgId).single();
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
    const orgId = (req as AuthRequest).orgId;
    const d = req.body;
    const sb = getSupabase();

    const { data: lease, error } = await sb.from("leases").insert({
      org_id: orgId,
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
    const orgId = (req as AuthRequest).orgId;
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
    }).eq("id", id).eq("org_id", orgId);

    if (error) return res.status(500).json({ error: error.message });
    await computeAndSaveSchedule(sb, id, d);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/leases/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { error } = await getSupabase()
    .from("leases").delete().eq("id", parseInt(req.params.id)).eq("org_id", orgId);
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

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });
}

export default router;
