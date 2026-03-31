import { getAuthToken } from "./authStore";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Entities
export const api = {
  entities: {
    list: () => request<Entity[]>("/entities"),
    create: (d: Partial<Entity>) => request<{ id: number }>("/entities", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: Partial<Entity>) => request("/entities/" + id, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: number) => request("/entities/" + id, { method: "DELETE" }),
  },
  leases: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ leases: Lease[]; total: number }>("/leases" + qs);
    },
    get: (id: number) => request<Lease>("/leases/" + id),
    create: (d: Partial<Lease>) => request<{ id: number }>("/leases", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: Partial<Lease>) => request("/leases/" + id, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: number) => request("/leases/" + id, { method: "DELETE" }),
    extract: async (file: File) => {
      // Extract text client-side to avoid Vercel's 4.5MB serverless body limit
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textParts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textParts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
      }
      const text = textParts.join("\n").slice(0, 15000);
      return request<{ extracted: ExtractedLease; filename: string }>("/leases/extract", {
        method: "POST",
        body: JSON.stringify({ text, filename: file.name }),
      });
    },
    importCsv: (file: File) => {
      const token = getAuthToken();
      const form = new FormData();
      form.append("csv", file);
      return fetch(BASE + "/leases/import-csv", {
        method: "POST", body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        return r.json() as Promise<{ imported: number; errors: { row: number; message: string }[] }>;
      });
    },
  },
  schedules: {
    get: (leaseId: number) => request<ScheduleResponse>("/schedules/" + leaseId),
    rollforward: (params: Record<string, string>) =>
      request<RollForwardRow[]>("/schedules/rollforward/summary?" + new URLSearchParams(params).toString()),
  },
  journals: {
    get: (params: Record<string, string>) =>
      request<JournalResponse>("/journals?" + new URLSearchParams(params).toString()),
  },
  rates: {
    list: () => request<DiscountRate[]>("/rates"),
    create: (d: Partial<DiscountRate>) => request<{ id: number; ibr: number }>("/rates", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: Partial<DiscountRate>) => request("/rates/" + id, { method: "PUT", body: JSON.stringify(d) }),
    delete: (id: number) => request("/rates/" + id, { method: "DELETE" }),
  },
  settings: {
    get: () => request<Record<string, string>>("/settings"),
    update: (d: Record<string, string>) => request("/settings", { method: "PUT", body: JSON.stringify(d) }),
    getAccounts: (entityId?: number) =>
      request<AccountCode[]>("/settings/accounts" + (entityId ? `?entity_id=${entityId}` : "")),
    updateAccount: (d: Partial<AccountCode>) =>
      request("/settings/accounts", { method: "PUT", body: JSON.stringify(d) }),
  },
  fxRates: {
    list: () => request<FxRate[]>("/fxrates"),
    upsert: (d: { from_ccy: string; to_ccy: string; rate: number; rate_date?: string; source?: string }) =>
      request<FxRate>("/fxrates", { method: "POST", body: JSON.stringify(d) }),
    delete: (id: number) => request("/fxrates/" + id, { method: "DELETE" }),
    lookup: (from: string, to: string) =>
      request<{ base: string; date: string; rates: Record<string, number> }>(
        `/fxrates/lookup?from=${from}&to=${encodeURIComponent(to)}`
      ),
  },
  auth: {
    createOrg: (name: string) => request<{ org: OrgInfo }>("/auth/org", { method: "POST", body: JSON.stringify({ name }) }),
    joinOrg: (invite_code: string) => request<{ org: OrgInfo }>("/auth/join", { method: "POST", body: JSON.stringify({ invite_code }) }),
    getMembers: () => request<OrgMember[]>("/auth/members"),
    updateMember: (userId: string, role: string) =>
      request("/auth/members/" + userId, { method: "PATCH", body: JSON.stringify({ role }) }),
    removeMember: (userId: string) => request("/auth/members/" + userId, { method: "DELETE" }),
  },
};

// Types
export interface Entity { id: number; name: string; currency: string; country: string; }
export interface Lease {
  id: number; entity_id: number; entity_name?: string;
  lessor_name: string; asset_description: string; asset_class: string;
  commencement_date: string; term_months: number;
  extension_option_months: number; extension_reasonably_certain: boolean;
  currency: string; payment_amount: number;
  payment_frequency: "monthly" | "quarterly" | "annual";
  payment_timing: "advance" | "arrears";
  rent_free_months: number; initial_direct_costs: number;
  lease_incentives_receivable: number; prepaid_payments: number;
  residual_value_guarantee: number; discount_rate: number;
  discount_rate_id: number | null; country: string;
  status: "active" | "expired" | "modified"; notes: string;
}
export interface ExtractedLease {
  lessor_name: string | null; asset_description: string | null;
  asset_class: string | null; commencement_date: string | null;
  term_months: number | null; extension_option_months: number | null;
  extension_reasonably_certain: boolean | null; currency: string | null;
  payment_amount: number | null; payment_frequency: string | null;
  payment_timing: string | null; rent_free_months: number | null;
  initial_direct_costs: number | null; lease_incentives_receivable: number | null;
  prepaid_payments: number | null; residual_value_guarantee: number | null;
  country: string | null; notes: string | null;
}
export interface ScheduleRow {
  period: number; date: string; openingLiability: number;
  interestCharge: number; payment: number; closingLiability: number;
  rouDepreciation: number; closingRouValue: number; totalPLCharge: number;
}
export interface ScheduleResponse {
  leaseId: number; initialLiability?: number; initialRou?: number;
  foots?: boolean; footingError?: number; rows: ScheduleRow[];
}
export interface RollForwardRow {
  entity: string; leaseId: number; assetDescription: string;
  assetClass: string; discountRate: number;
  lessorName: string; currency: string;
  openingRou: number; additionsRou: number; depreciationRou: number; closingRou: number;
  openingLiability: number; additionsLiability: number;
  interestLiability: number; paymentsLiability: number; closingLiability: number;
  closingCurrentLiability: number;
  closingNonCurrentLiability: number;
}
export interface JournalLine {
  date: string; accountCode: string; accountDescription: string;
  debit: number; credit: number; leaseRef: string; assetClass: string;
  leaseId: number; type: string;
}
export interface JournalResponse {
  journals: JournalLine[]; periodStart: string; periodEnd: string; entityId: string;
}
export interface DiscountRate {
  id: number; label: string; currency: string; tenor_months: number;
  base_rate: number; credit_spread: number; security_adj: number;
  ibr: number; effective_date: string; notes: string;
}
export interface FxRate {
  id: number; org_id: string;
  from_ccy: string; to_ccy: string;
  rate: number; rate_date: string;
  source: string; updated_at: string;
}
export interface OrgInfo { id: string; name: string; role: "admin" | "member"; }
export interface OrgMember {
  id: string; user_id: string; role: "admin" | "member";
  joined_at: string; email: string; name: string;
}
export interface AccountCode {
  id: number; entity_id: number | null; asset_class: string;
  rou_asset: string; accumulated_depreciation: string;
  lease_liability_current: string; lease_liability_non_current: string;
  interest_expense: string; depreciation_expense: string; cash_accruals: string;
}
