import { Router, Request, Response } from "express";
import { getSupabase } from "../db";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await getSupabase().from("entities").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/", async (req: Request, res: Response) => {
  const { name, currency, country } = req.body;
  const { data, error } = await getSupabase()
    .from("entities").insert({ name, currency: currency || "GBP", country: country || "" })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ id: data.id });
});

router.put("/:id", async (req: Request, res: Response) => {
  const { name, currency, country } = req.body;
  const { error } = await getSupabase()
    .from("entities").update({ name, currency, country }).eq("id", parseInt(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { error } = await getSupabase().from("entities").delete().eq("id", parseInt(req.params.id));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
