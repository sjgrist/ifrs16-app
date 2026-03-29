import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import type { AuthRequest } from "../middleware/auth";

const router = Router();

// GET /api/fxrates
router.get("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { data, error } = await getSupabase()
    .from("fx_rates").select("*").eq("org_id", orgId)
    .order("from_ccy").order("to_ccy");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/fxrates/lookup?from=GBP&to=EUR,USD,JPY
// Proxy to frankfurter.app — avoids browser CORS; returns rates as-is
router.get("/lookup", async (req: Request, res: Response) => {
  try {
    const from = ((req.query.from as string) || "GBP").toUpperCase();
    const to   = (req.query.to as string || "").toUpperCase();
    const url  = to
      ? `https://api.frankfurter.app/latest?from=${from}&to=${to}`
      : `https://api.frankfurter.app/latest?from=${from}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Frankfurter API ${r.status}`);
    const body = await r.json() as { base: string; date: string; rates: Record<string, number> };
    res.json({ base: body.base, date: body.date, rates: body.rates });
  } catch (e: unknown) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// POST /api/fxrates  — upsert one rate
router.post("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { from_ccy, to_ccy, rate, rate_date, source } = req.body;
  if (!from_ccy || !to_ccy || rate == null)
    return res.status(400).json({ error: "from_ccy, to_ccy and rate are required" });

  const { data, error } = await getSupabase()
    .from("fx_rates")
    .upsert({
      org_id:    orgId,
      from_ccy:  (from_ccy as string).toUpperCase(),
      to_ccy:    (to_ccy as string).toUpperCase(),
      rate:      Number(rate),
      rate_date: rate_date || new Date().toISOString().slice(0, 10),
      source:    source || "manual",
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id,from_ccy,to_ccy" })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/fxrates/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { error } = await getSupabase()
    .from("fx_rates").delete()
    .eq("id", parseInt(req.params.id)).eq("org_id", orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
