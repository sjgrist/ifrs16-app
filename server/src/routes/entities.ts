import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    const entities = getDb().prepare("SELECT * FROM entities ORDER BY name").all({});
    res.json(entities);
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.post("/", (req: Request, res: Response) => {
  try {
    const { name, currency, country } = req.body;
    const r = getDb().prepare("INSERT INTO entities (name, currency, country) VALUES ($n,$c,$co)")
      .run({ $n: name, $c: currency || "GBP", $co: country || "" });
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.put("/:id", (req: Request, res: Response) => {
  try {
    const { name, currency, country } = req.body;
    getDb().prepare("UPDATE entities SET name=$n,currency=$c,country=$co WHERE id=$id")
      .run({ $n: name, $c: currency, $co: country, $id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.delete("/:id", (req: Request, res: Response) => {
  try {
    getDb().prepare("DELETE FROM entities WHERE id = $id").run({ $id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
