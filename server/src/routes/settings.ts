import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    const rows = getDb().prepare("SELECT key, value FROM settings").all({}) as { key: string; value: string }[];
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.put("/", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const updates = req.body as Record<string, string>;
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ($k,$v)");
    db.exec("BEGIN");
    try {
      for (const [k, v] of Object.entries(updates)) upsert.run({ $k: k, $v: String(v) });
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.get("/accounts", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { entity_id } = req.query;
    const accounts = entity_id
      ? db.prepare("SELECT * FROM account_codes WHERE entity_id=$eid OR entity_id IS NULL ORDER BY asset_class")
          .all({ $eid: entity_id })
      : db.prepare("SELECT * FROM account_codes ORDER BY entity_id, asset_class").all({});
    res.json(accounts);
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

router.put("/accounts", (req: Request, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    db.prepare(`
      INSERT INTO account_codes
        (entity_id,asset_class,rou_asset,accumulated_depreciation,
         lease_liability_current,lease_liability_non_current,
         interest_expense,depreciation_expense,cash_accruals)
      VALUES ($eid,$ac,$ra,$ad,$llc,$llnc,$ie,$de,$ca)
      ON CONFLICT(entity_id,asset_class) DO UPDATE SET
        rou_asset=excluded.rou_asset,accumulated_depreciation=excluded.accumulated_depreciation,
        lease_liability_current=excluded.lease_liability_current,
        lease_liability_non_current=excluded.lease_liability_non_current,
        interest_expense=excluded.interest_expense,depreciation_expense=excluded.depreciation_expense,
        cash_accruals=excluded.cash_accruals
    `).run({
      $eid: d.entity_id || null,$ac: d.asset_class||"all",$ra: d.rou_asset,
      $ad: d.accumulated_depreciation,$llc: d.lease_liability_current,
      $llnc: d.lease_liability_non_current,$ie: d.interest_expense,
      $de: d.depreciation_expense,$ca: d.cash_accruals
    });
    res.json({ ok: true });
  } catch (err: unknown) { res.status(500).json({ error: (err as Error).message }); }
});

export default router;
