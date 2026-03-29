import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import type { AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { data, error } = await getSupabase()
    .from("discount_rates").select("*").eq("org_id", orgId)
    .order("effective_date", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const d = req.body;
  const ibr = (d.base_rate || 0) + (d.credit_spread || 0) - (d.security_adj || 0);
  const { data, error } = await getSupabase()
    .from("discount_rates").insert({
      org_id: orgId,
      label: d.label, currency: d.currency, tenor_months: d.tenor_months,
      base_rate: d.base_rate || 0, credit_spread: d.credit_spread || 0,
      security_adj: d.security_adj || 0, ibr,
      effective_date: d.effective_date, notes: d.notes || "",
    }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ id: data.id, ibr });
});

router.put("/:id", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const d = req.body;
  const ibr = (d.base_rate || 0) + (d.credit_spread || 0) - (d.security_adj || 0);
  const { error } = await getSupabase()
    .from("discount_rates").update({
      label: d.label, currency: d.currency, tenor_months: d.tenor_months,
      base_rate: d.base_rate, credit_spread: d.credit_spread,
      security_adj: d.security_adj, ibr,
      effective_date: d.effective_date, notes: d.notes || "",
    }).eq("id", parseInt(req.params.id)).eq("org_id", orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, ibr });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { error } = await getSupabase()
    .from("discount_rates").delete()
    .eq("id", parseInt(req.params.id)).eq("org_id", orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
