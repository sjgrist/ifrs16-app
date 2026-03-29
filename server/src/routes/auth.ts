import { Router, Request, Response } from "express";
import { getSupabase } from "../db";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_EMAIL = "demo@ifrs16app.com";
const DEMO_PASSWORD = "Demo1234!";

const router = Router();

// GET /api/auth/me — current user + org (no 403 if no org, returns null org)
router.get("/me", async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorised" });

  const sb = getSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  const { data: member } = await sb
    .from("org_members")
    .select("org_id, role, organisations(name)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  const org = member
    ? {
        id: (member as Record<string, unknown>).org_id,
        name: ((member as Record<string, unknown>).organisations as { name: string } | null)?.name ?? "",
        role: (member as Record<string, unknown>).role,
      }
    : null;

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email,
      avatar: user.user_metadata?.avatar_url ?? null,
    },
    org,
  });
});

// POST /api/auth/org — create a new organisation (caller becomes admin)
router.post("/org", requireAuth as unknown as (req: Request, res: Response, next: unknown) => void, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Organisation name is required" });

  const sb = getSupabase();

  // Check user isn't already in an org
  const { data: existing } = await sb
    .from("org_members").select("id").eq("user_id", authReq.userId).limit(1).single();
  if (existing) return res.status(409).json({ error: "You are already a member of an organisation" });

  const { data: org, error: orgErr } = await sb
    .from("organisations").insert({ name: name.trim() }).select().single();
  if (orgErr) return res.status(500).json({ error: orgErr.message });

  const { error: memberErr } = await sb.from("org_members").insert({
    org_id: (org as { id: string }).id,
    user_id: authReq.userId,
    role: "admin",
  });
  if (memberErr) return res.status(500).json({ error: memberErr.message });

  res.status(201).json({ org: { id: (org as { id: string }).id, name: (org as { name: string }).name, role: "admin" } });
});

// POST /api/auth/join — join an existing org via invite code (= org UUID)
router.post("/join", requireAuth as unknown as (req: Request, res: Response, next: unknown) => void, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: "Invite code is required" });

  const sb = getSupabase();

  const { data: org, error: orgErr } = await sb
    .from("organisations").select("id, name").eq("id", invite_code).single();
  if (orgErr || !org) return res.status(404).json({ error: "Organisation not found. Check the invite code." });

  // Add to org (ignore conflict — already a member)
  const { error } = await sb.from("org_members").insert({
    org_id: (org as { id: string }).id,
    user_id: authReq.userId,
    role: "member",
  });
  if (error && !error.message.includes("duplicate")) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ org: { id: (org as { id: string }).id, name: (org as { name: string }).name, role: "member" } });
});

// GET /api/auth/members — list org members (admin only)
router.get(
  "/members",
  requireAuth as unknown as (req: Request, res: Response, next: unknown) => void,
  requireAdmin as unknown as (req: Request, res: Response, next: unknown) => void,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const sb = getSupabase();
    const { data, error } = await sb
      .from("org_members").select("id, user_id, role, created_at")
      .eq("org_id", authReq.orgId).order("created_at");
    if (error) return res.status(500).json({ error: error.message });

    // Fetch user emails via admin API
    const members = await Promise.all(
      (data || []).map(async (m) => {
        const row = m as { id: string; user_id: string; role: string; created_at: string };
        try {
          const { data: { user } } = await sb.auth.admin.getUserById(row.user_id);
          return {
            id: row.id,
            user_id: row.user_id,
            role: row.role,
            joined_at: row.created_at,
            email: user?.email ?? "unknown",
            name: user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? user?.email ?? "unknown",
          };
        } catch {
          return { id: row.id, user_id: row.user_id, role: row.role, joined_at: row.created_at, email: "unknown", name: "unknown" };
        }
      })
    );
    res.json(members);
  }
);

// PATCH /api/auth/members/:userId — change role (admin only)
router.patch(
  "/members/:userId",
  requireAuth as unknown as (req: Request, res: Response, next: unknown) => void,
  requireAdmin as unknown as (req: Request, res: Response, next: unknown) => void,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { role } = req.body;
    if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const { error } = await getSupabase()
      .from("org_members").update({ role })
      .eq("org_id", authReq.orgId).eq("user_id", req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  }
);

// DELETE /api/auth/members/:userId — remove member (admin only)
router.delete(
  "/members/:userId",
  requireAuth as unknown as (req: Request, res: Response, next: unknown) => void,
  requireAdmin as unknown as (req: Request, res: Response, next: unknown) => void,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (req.params.userId === authReq.userId) {
      return res.status(400).json({ error: "Cannot remove yourself" });
    }
    const { error } = await getSupabase()
      .from("org_members").delete()
      .eq("org_id", authReq.orgId).eq("user_id", req.params.userId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  }
);

// GET /api/auth/setup-demo — idempotent demo user + org setup (no auth required)
router.get("/setup-demo", async (_req: Request, res: Response) => {
  try {
    const sb = getSupabase();

    // Ensure demo org exists
    await sb.from("organisations")
      .upsert({ id: DEMO_ORG_ID, name: "Demo Organisation" }, { onConflict: "id", ignoreDuplicates: true });

    // Try to find existing demo user
    const { data: { users } } = await sb.auth.admin.listUsers();
    let demoUser = (users || []).find((u) => u.email === DEMO_EMAIL);

    if (!demoUser) {
      const { data, error } = await sb.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Demo User" },
      });
      if (error) return res.status(500).json({ error: error.message });
      demoUser = data.user;
    }

    // Ensure demo user is in demo org
    await sb.from("org_members").upsert(
      { org_id: DEMO_ORG_ID, user_id: demoUser!.id, role: "admin" },
      { onConflict: "org_id,user_id", ignoreDuplicates: true }
    );

    res.json({ ok: true, message: "Demo user ready", email: DEMO_EMAIL, password: DEMO_PASSWORD });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
