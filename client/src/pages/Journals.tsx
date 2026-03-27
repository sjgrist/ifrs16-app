import { useState, useEffect } from "react";
import { api, type JournalLine } from "../lib/api";
import { useAppStore } from "../lib/store";
import { fmt, downloadBlob, journalsToCSV } from "../lib/utils";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

export function JournalsPage() {
  const { toast } = useToast();
  const { entities, loadEntities } = useAppStore();
  const [journals, setJournals] = useState<JournalLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({
    entity_id: "",
    year: String(new Date().getFullYear()),
    month: "",
  });

  useEffect(() => { loadEntities(); }, []);

  const load = async () => {
    if (!filter.entity_id) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { entity_id: filter.entity_id, year: filter.year };
      if (filter.month) params.month = filter.month;
      const { journals: jls } = await api.journals.get(params);
      setJournals(jls);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };

  const exportCSV = () => {
    const csv = journalsToCSV(journals);
    downloadBlob(new Blob([csv], { type: "text/csv" }), `journals-${filter.year}${filter.month ? "-" + filter.month : ""}.csv`);
  };

  const exportXlsx = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Journals");
      ws.addRow(["Date","Account Code","Account Description","Debit","Credit","Lease Ref","Asset Class"]);
      for (const j of journals) {
        ws.addRow([j.date, j.accountCode, j.accountDescription,
          j.debit || "", j.credit || "", j.leaseRef, j.assetClass]);
      }
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf]), `journals-${filter.year}.xlsx`);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  // Group by date
  const grouped = journals.reduce<Record<string, JournalLine[]>>((acc, j) => {
    (acc[j.date] = acc[j.date] || []).push(j);
    return acc;
  }, {});

  const totalDebit = journals.reduce((s, j) => s + j.debit, 0);
  const totalCredit = journals.reduce((s, j) => s + j.credit, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Journal Entries</h1>
        {journals.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary">Export CSV</button>
            <button onClick={exportXlsx} className="btn-secondary">Export XLSX</button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Entity *</label>
          <select className="input w-48" value={filter.entity_id}
            onChange={(e) => setFilter((f) => ({ ...f, entity_id: e.target.value }))}>
            <option value="">Select entity…</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <input type="number" className="input w-24" value={filter.year}
            onChange={(e) => setFilter((f) => ({ ...f, year: e.target.value }))} />
        </div>
        <div>
          <label className="label">Month (optional)</label>
          <select className="input w-36" value={filter.month}
            onChange={(e) => setFilter((f) => ({ ...f, month: e.target.value }))}>
            <option value="">Full year</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {new Date(2000, i).toLocaleString("en-GB", { month: "long" })}
              </option>
            ))}
          </select>
        </div>
        <button onClick={load} disabled={!filter.entity_id || loading} className="btn-primary">
          {loading ? <Spinner className="w-4 h-4" /> : null} Generate
        </button>
      </div>

      {/* Balance check */}
      {journals.length > 0 && (
        <div className={`card p-3 flex items-center gap-4 text-sm ${
          Math.abs(totalDebit - totalCredit) < 0.01 ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" : "border-red-300 bg-red-50 dark:bg-red-900/20"
        }`}>
          <span className="font-medium">Total Dr: {fmt(totalDebit)}</span>
          <span className="font-medium">Total Cr: {fmt(totalCredit)}</span>
          <span className={Math.abs(totalDebit - totalCredit) < 0.01
            ? "text-emerald-600 dark:text-emerald-400 font-semibold"
            : "text-red-600 dark:text-red-400 font-semibold"}>
            {Math.abs(totalDebit - totalCredit) < 0.01 ? "✓ Balanced" : `⚠ Diff: ${fmt(totalDebit - totalCredit)}`}
          </span>
        </div>
      )}

      {/* Journal table */}
      {loading ? (
        <div className="card p-12 text-center"><Spinner className="w-6 h-6 mx-auto" /></div>
      ) : Object.keys(grouped).length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="table-header text-left">Date</th>
                  <th className="table-header text-left">Account</th>
                  <th className="table-header text-left">Description</th>
                  <th className="table-header">Debit</th>
                  <th className="table-header">Credit</th>
                  <th className="table-header text-left">Ref</th>
                  <th className="table-header text-left">Class</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([date, lines]) => (
                  lines.map((j, i) => (
                    <tr key={`${date}-${i}`} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                      <td className="table-cell-left font-mono text-xs">{i === 0 ? date : ""}</td>
                      <td className="table-cell-left font-mono text-xs text-[var(--text-muted)]">{j.accountCode}</td>
                      <td className="table-cell-left">{j.accountDescription}</td>
                      <td className="table-cell">{j.debit ? fmt(j.debit) : ""}</td>
                      <td className="table-cell text-[var(--text-muted)]">{j.credit ? fmt(j.credit) : ""}</td>
                      <td className="table-cell-left font-mono text-xs">{j.leaseRef}</td>
                      <td className="table-cell-left text-xs capitalize">{j.assetClass}</td>
                    </tr>
                  ))
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--bg)] font-semibold border-t-2 border-[var(--border)]">
                  <td colSpan={3} className="table-cell-left">Total</td>
                  <td className="table-cell">{fmt(totalDebit)}</td>
                  <td className="table-cell">{fmt(totalCredit)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : !loading && filter.entity_id && (
        <div className="card p-12 text-center text-[var(--text-muted)] text-sm">
          No journals for the selected period.
        </div>
      )}
    </div>
  );
}
