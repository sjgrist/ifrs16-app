import { Request, Response, NextFunction } from "express";
import { getSupabase } from "../db";

export interface AuthRequest extends Request {
  userId: string;
  orgId: string;
  orgRole: "admin" | "member";
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorised" });

  const sb = getSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Invalid token" });

  req.userId = user.id;

  const { data: member } = await sb
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  if (!member) {
    return res.status(403).json({ error: "no_org" });
  }

  req.orgId = (member as { org_id: string; role: string }).org_id;
  req.orgRole = (member as { org_id: string; role: string }).role as "admin" | "member";
  next();
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.orgRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
