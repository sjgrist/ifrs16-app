import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import type { AuthRequest } from "../middleware/auth";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { data, error } = await getSupabase().from("settings").select("key, value").eq("org_id", orgId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(Object.fromEntries((data || []).map((r) => [r.key, r.value])));
});

router.put("/", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const updates = req.body as Record<string, string>;
  const sb = getSupabase();
  for (const [k, v] of Object.entries(updates)) {
    const { error } = await sb.from("settings")
      .upsert({ org_id: orgId, key: k, value: String(v) }, { onConflict: "org_id,key" });
    if (error) return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true });
});

router.get("/accounts", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const { entity_id } = req.query;
  const sb = getSupabase();
  const query = sb.from("account_codes").select("*").eq("org_id", orgId);
  const { data, error } = entity_id
    ? await query.or(`entity_id.eq.${entity_id},entity_id.is.null`).order("asset_class")
    : await query.order("entity_id").order("asset_class");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put("/accounts", async (req: Request, res: Response) => {
  const orgId = (req as AuthRequest).orgId;
  const d = req.body;
  const sb = getSupabase();
  const entityId = d.entity_id || null;
  const assetClass = d.asset_class || "all";

  // Delete existing row then insert (handles NULL entity_id uniqueness)
  const delQuery = sb.from("account_codes").delete().eq("org_id", orgId).eq("asset_class", assetClass);
  await (entityId ? delQuery.eq("entity_id", entityId) : delQuery.is("entity_id", null));

  const { error } = await sb.from("account_codes").insert({
    org_id: orgId,
    entity_id: entityId,
    asset_class: assetClass,
    rou_asset: d.rou_asset,
    accumulated_depreciation: d.accumulated_depreciation,
    lease_liability_current: d.lease_liability_current,
    lease_liability_non_current: d.lease_liability_non_current,
    interest_expense: d.interest_expense,
    depreciation_expense: d.depreciation_expense,
    cash_accruals: d.cash_accruals,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
