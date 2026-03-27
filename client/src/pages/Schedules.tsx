import { useState, useEffect } from "react";
import { api, type Lease, type RollForwardRow } from "../lib/api";
import { useAppStore } from "../lib/store";
import { fmt, fmtDate, downloadBlob } from "../lib/utils";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

export function SchedulesPage() {
  const { toast } = useToast();
  const { entities, loadEntities } = useAppStore();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [rollForward, setRollForward] = useState<RollForwardRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState({
    entity_id: "",
    period_start: new Date().getFullYear() + "-01-01",
    period_end: new Date().getFullYear() + "-12-31",
  });

  useEffect(() => { loadEntities(); }, []);

  useEffect(() => {
    api.leases.list().then(({ leases: ls }) => setLeases(ls)).catch(() => {});
  }, []);

  const loadRollForward = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        period_start: filter.period_start,
        period_end: filter.period_end,
      };
      if (filter.entity_id) params.entity_id = filter.entity_id;
      const rows = await api.schedules.rollforward(params);
      setRollForward(rows);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
    finally { setLoading(false); }
  };

  const exportRollForward = async () => {
    try {
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Roll-Forward");
      ws.addRow(["Entity","Asset","Lessor","Ccy",
        "Opening ROU","Additions","Depreciation","Closing ROU",
        "Opening Liability","Additions","Interest","Payments","Closing Liability"]);
      for (const r of rollForward) {
        ws.addRow([r.entity, r.assetDescription, r.lessorName, r.currency,
          r.openingRou, r.additionsRou, r.depreciationRou, r.closingRou,
          r.openingLiability, r.additionsLiability, r.interestLiability,
          r.paymentsLiability, r.closingLiability]);
      }
      const buf = await wb.xlsx.writeBuffer();
      downloadBlob(new Blob([buf]), `rollforward-${filter.period_end}.xlsx`);
    } catch (e: unknown) { toast((e as Error).message, "error"); }
  };

  // Totals
  const totals = rollForward.reduce((acc, r) => ({
    openingRou: acc.openingRou + r.openingRou,
    additionsRou: acc.additionsRou + r.additionsRou,
    depreciationRou: acc.depreciationRou + r.depreciationRou,
    closingRou: acc.closingRou + r.closingRou,
    openingLiability: acc.openingLiability + r.openingLiability,
    additionsLiability: acc.additionsLiability + r.additionsLiability,
    interestLiability: acc.interestLiability + r.interestLiability,
    paymentsLiability: acc.paymentsLiability + r.paymentsLiability,
    closingLiability: acc.closingLiability + r.closingLiability,
  }), { openingRou: 0, additionsRou: 0, depreciationRou: 0, closingRou: 0,
        openingLiability: 0, additionsLiability: 0, interestLiability: 0,
        paymentsLiability: 0, closingLiability: 0 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedules &amp; Roll-Forward</h1>
        {rollForward.length > 0 && (
          <button onClick={exportRollForward} className="btn-secondary">Export XLSX</button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-4 flex-wrap items-end">
        <div>
          <label className="label">Entity</label>
          <select className="input w-44" value={filter.entity_id}
            onChange={(e) => setFilter((f) => ({ ...f, entity_id: e.target.value }))}>
            <option value="">All entities</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Period Start</label>
          <input type="date" className="input w-40" value={filter.period_start}
            onChange={(e) => setFilter((f) => ({ ...f, period_start: e.target.value }))} />
        </div>
        <div>
          <label className="label">Period End</label>
          <input type="date" className="input w-40" value={filter.period_end}
            onChange={(e) => setFilter((f) => ({ ...f, period_end: e.target.value }))} />
        </div>
        <button onClick={loadRollForward} className="btn-primary" disabled={loading}>
          {loading ? <Spinner className="w-4 h-4" /> : null} Generate
        </button>
      </div>

      {/* Roll-forward table */}
      {rollForward.length > 0 && (
        <>
          {/* ROU Asset */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">
              Right-of-Use Asset Roll-Forward
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="table-header text-left">Entity</th>
                    <th className="table-header text-left">Asset</th>
                    <th className="table-header text-left">Ccy</th>
                    <th className="table-header">Opening ROU</th>
                    <th className="table-header">Additions</th>
                    <th className="table-header">Depreciation</th>
                    <th className="table-header">Closing ROU</th>
                  </tr>
                </thead>
                <tbody>
                  {rollForward.map((r) => (
                    <tr key={r.leaseId} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                      <td className="table-cell-left">{r.entity}</td>
                      <td className="table-cell-left text-xs">{r.assetDescription}</td>
                      <td className="table-cell-left text-xs">{r.currency}</td>
                      <td className="table-cell">{fmt(r.openingRou)}</td>
                      <td className="table-cell text-emerald-600 dark:text-emerald-400">{fmt(r.additionsRou)}</td>
                      <td className="table-cell text-red-500">({fmt(r.depreciationRou)})</td>
                      <td className="table-cell font-semibold">{fmt(r.closingRou)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--bg)] font-semibold">
                    <td className="table-cell-left" colSpan={3}>Total</td>
                    <td className="table-cell">{fmt(totals.openingRou)}</td>
                    <td className="table-cell text-emerald-600 dark:text-emerald-400">{fmt(totals.additionsRou)}</td>
                    <td className="table-cell text-red-500">({fmt(totals.depreciationRou)})</td>
                    <td className="table-cell">{fmt(totals.closingRou)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Lease Liability */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm">
              Lease Liability Roll-Forward
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="table-header text-left">Entity</th>
                    <th className="table-header text-left">Asset</th>
                    <th className="table-header text-left">Ccy</th>
                    <th className="table-header">Opening Liability</th>
                    <th className="table-header">Additions</th>
                    <th className="table-header">Interest</th>
                    <th className="table-header">Payments</th>
                    <th className="table-header">Closing Liability</th>
                  </tr>
                </thead>
                <tbody>
                  {rollForward.map((r) => (
                    <tr key={r.leaseId} className="border-b border-[var(--border)] hover:bg-[var(--bg)]">
                      <td className="table-cell-left">{r.entity}</td>
                      <td className="table-cell-left text-xs">{r.assetDescription}</td>
                      <td className="table-cell-left text-xs">{r.currency}</td>
                      <td className="table-cell">{fmt(r.openingLiability)}</td>
                      <td className="table-cell text-emerald-600 dark:text-emerald-400">{fmt(r.additionsLiability)}</td>
                      <td className="table-cell text-amber-600 dark:text-amber-400">{fmt(r.interestLiability)}</td>
                      <td className="table-cell text-red-500">({fmt(r.paymentsLiability)})</td>
                      <td className="table-cell font-semibold">{fmt(r.closingLiability)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--bg)] font-semibold">
                    <td className="table-cell-left" colSpan={3}>Total</td>
                    <td className="table-cell">{fmt(totals.openingLiability)}</td>
                    <td className="table-cell text-emerald-600 dark:text-emerald-400">{fmt(totals.additionsLiability)}</td>
                    <td className="table-cell text-amber-600 dark:text-amber-400">{fmt(totals.interestLiability)}</td>
                    <td className="table-cell text-red-500">({fmt(totals.paymentsLiability)})</td>
                    <td className="table-cell">{fmt(totals.closingLiability)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {rollForward.length === 0 && !loading && (
        <div className="card p-12 text-center text-[var(--text-muted)] text-sm">
          Select a period and click Generate to build the roll-forward report.
        </div>
      )}
    </div>
  );
}
