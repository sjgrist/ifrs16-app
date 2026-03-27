import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    const rates = getDb().prepare("SELECT * FROM discount_rates ORDER BY effective_date DESC").all({});
    res.json(rates);
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.post("/", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    const ibr = (d.base_rate || 0) + (d.credit_spread || 0) - (d.security_adj || 0);
    const r = db.prepare(`
      INSERT INTO discount_rates (label,currency,tenor_months,base_rate,credit_spread,security_adj,ibr,effective_date,notes)
      VALUES ($l,$c,$t,$b,$cs,$sa,$ibr,$ed,$n)
    `).run({ $l: d.label,$c: d.currency,$t: d.tenor_months,$b: d.base_rate||0,
             $cs: d.credit_spread||0,$sa: d.security_adj||0,$ibr: ibr,$ed: d.effective_date,$n: d.notes||"" });
    res.status(201).json({ id: Number(r.lastInsertRowid), ibr });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.put("/:id", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    const ibr = (d.base_rate || 0) + (d.credit_spread || 0) - (d.security_adj || 0);
    db.prepare(`
      UPDATE discount_rates SET label=$l,currency=$c,tenor_months=$t,base_rate=$b,
        credit_spread=$cs,security_adj=$sa,ibr=$ibr,effective_date=$ed,notes=$n WHERE id=$id
    `).run({ $l: d.label,$c: d.currency,$t: d.tenor_months,$b: d.base_rate,
             $cs: d.credit_spread,$sa: d.security_adj,$ibr: ibr,$ed: d.effective_date,
             $n: d.notes||"",$id: parseInt(req.params.id) });
    res.json({ ok: true, ibr });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.delete("/:id", (req: Request, res: Response) => {
  try {
    getDb().prepare("DELETE FROM discount_rates WHERE id = $id").run({ $id: parseInt(req.params.id) });
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
