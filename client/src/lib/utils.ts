import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return (n * 100).toFixed(3) + "%";
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function statusBadge(status: string) {
  switch (status) {
    case "active":   return "badge-green";
    case "expired":  return "badge-gray";
    case "modified": return "badge-yellow";
    case "upcoming": return "badge-blue";
    default:         return "badge-gray";
  }
}

export function assetClassLabel(cls: string) {
  const map: Record<string, string> = {
    property: "Property", vehicle: "Vehicle",
    equipment: "Equipment", other: "Other",
  };
  return map[cls] ?? cls;
}

/** Download a Blob as a file */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Convert journal rows to CSV */
export function journalsToCSV(rows: {
  date: string; accountCode: string; accountDescription: string;
  debit: number; credit: number; leaseRef: string; assetClass: string;
}[]): string {
  const header = "Date,Account Code,Account Description,Debit,Credit,Lease Ref,Asset Class";
  const lines = rows.map((r) =>
    [r.date, r.accountCode, `"${r.accountDescription}"`,
     r.debit.toFixed(2), r.credit.toFixed(2), r.leaseRef, r.assetClass].join(",")
  );
  return [header, ...lines].join("\n");
}
