import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import type { AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { data, error } = await getSupabase().from("entities").select("*").eq("org_id", orgId).order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { name, currency, country } = req.body;
  const { data, error } = await getSupabase()
    .from("entities").insert({ name, currency: currency || "GBP", country: country || "", org_id: orgId })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ id: data.id });
});

router.put("/:id", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { name, currency, country } = req.body;
  const { error } = await getSupabase()
    .from("entities").update({ name, currency, country })
    .eq("id", parseInt(req.params.id)).eq("org_id", orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { error } = await getSupabase()
    .from("entities").delete()
    .eq("id", parseInt(req.params.id)).eq("org_id", orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
